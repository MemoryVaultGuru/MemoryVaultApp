/**
 * AWS adapters of the Discovery projections, over mv-discovery
 * (architecture-guide.md, sections 11.1 and 11.3):
 *
 *   OUT#{from}#{to}         outgoing edge         IN#{to}#{from}   backlink
 *   PENDING#{title}#{from}  link waiting for its target to exist
 *   ALIAS#{title}#{from}#{to}  an edge that exists because an ALIAS matched,
 *                              and that a note carrying that title takes away
 *   FACET#{noteId}         the portrait of one note
 *   STAT#{facet}#{value}   one counter PER VALUE, never one item per vault
 *   FDEF#{facet}           inferred kind, distinct count, discarded flag
 *   TEXT#{noteId}          the searchable portrait of one note
 *   STRUCT / SFOLDER#{id}  the local projection of the vault shape
 *
 * A counter item per value, and not a single statistics item, for the same
 * reason the META rule exists: fifty notes written in parallel increment
 * different items instead of queuing behind one (PE8).
 *
 * The content index is the TEXT# item, and it is deliberately not an inverted
 * index. CHUNK# items held one embedded vector each and were removed in 0.2.0:
 * they cost 14 KB apiece, ten times the note itself, and scoring them meant
 * reading all of them on every query. TEXT# costs about what the note costs,
 * and the vault ceiling of 2.000 notes (RN-KNW-010) keeps the scan bounded.
 */

import { resolveTarget, vaultNames } from '../domain/LinkResolver.js';
import {
  BatchWriteCommand,
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  TransactWriteCommand,
  UpdateCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import type { SubscriptionId } from '@memorysmith/kernel';
import type {
  BrokenLink,
  ContentIndex,
  IndexedNote,
  FacetIndex,
  FacetStats,
  GraphNode,
  LinkGraph,
  LinkTarget,
  NoteRef,
  ResolvedTarget,
  VaultGraph,
} from '../domain/ports.js';
import { GRAPH_LIMITS } from '../domain/ports.js';
import { facetDelta, valuesOf, type FacetSnapshot } from '../domain/FacetExtractor.js';
import type { StructureProjection, VaultStructure } from '../application/projections.js';

type Item = Record<string, unknown>;

const MAX_DISTINCT_VALUES = 40;

/** What a single TransactWriteItems carries, per the DynamoDB service limit. */
const MAX_TRANSACTION_ITEMS = 100;

/** Splits a list into batches of at most `size`, keeping the order. */
function chunk<T>(items: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let at = 0; at < items.length; at += size) batches.push(items.slice(at, at + size));
  return batches;
}

/** Every key starts with the subscription, like everywhere else (PE2). */
function partition(subscriptionId: SubscriptionId, vaultId: string): string {
  return `S#${subscriptionId.value}#VAULT#${vaultId}`;
}

export class DynamoLinkGraph implements LinkGraph {
  constructor(
    private readonly subscriptionId: SubscriptionId,
    private readonly db: DynamoDBDocumentClient,
    private readonly tableName: string,
  ) {}

  private pk(vaultId: string): string {
    return partition(this.subscriptionId, vaultId);
  }

  /**
   * Every page, not the first one. A Query answers at most 1 MB, and a vault
   * with a few thousand notes passes that easily: stopping at the first page
   * would silently hide half the graph, and the caller would have no way to
   * tell a small vault from a truncated answer.
   */
  private async query(vaultId: string, prefix: string): Promise<Item[]> {
    const items: Item[] = [];
    let startKey: Record<string, unknown> | undefined;
    do {
      const response: {
        Items?: Record<string, unknown>[] | undefined;
        LastEvaluatedKey?: Record<string, unknown> | undefined;
      } = await this.db.send(
        new QueryCommand({
          TableName: this.tableName,
          KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
          ExpressionAttributeValues: { ':pk': this.pk(vaultId), ':prefix': prefix },
          ...(startKey ? { ExclusiveStartKey: startKey } : {}),
        }),
      );
      items.push(...((response.Items ?? []) as Item[]));
      startKey = response.LastEvaluatedKey;
    } while (startKey);
    return items;
  }

  private async put(items: Item[]): Promise<void> {
    for (let index = 0; index < items.length; index += 25) {
      await this.db.send(
        new BatchWriteCommand({
          RequestItems: {
            [this.tableName]: items
              .slice(index, index + 25)
              .map((item) => ({ PutRequest: { Item: item } })),
          },
        }),
      );
    }
  }

  private async remove(vaultId: string, sortKeys: string[]): Promise<void> {
    for (let index = 0; index < sortKeys.length; index += 25) {
      await this.db.send(
        new BatchWriteCommand({
          RequestItems: {
            [this.tableName]: sortKeys.slice(index, index + 25).map((sk) => ({
              DeleteRequest: { Key: { PK: this.pk(vaultId), SK: sk } },
            })),
          },
        }),
      );
    }
  }

  async replaceOutgoing(vaultId: string, note: NoteRef, links: LinkTarget[]): Promise<void> {
    await this.db.send(
      new PutCommand({
        TableName: this.tableName,
        Item: { PK: this.pk(vaultId), SK: `NOTE#${note.noteId}`, entity: 'GNOTE', ...note },
      }),
    );

    const existing = await this.query(vaultId, `OUT#${note.noteId}#`);
    const pending = await this.query(vaultId, 'PENDING#');
    const aliasEdges = await this.query(vaultId, 'ALIAS#');
    await this.remove(vaultId, [
      ...existing.map((item) => String(item['SK'])),
      ...existing.map((item) => `IN#${String(item['toNoteId'])}#${note.noteId}`),
      ...pending
        .filter((item) => String(item['fromNoteId']) === note.noteId)
        .map((item) => String(item['SK'])),
      ...aliasEdges
        .filter((item) => String(item['fromNoteId']) === note.noteId)
        .map((item) => String(item['SK'])),
    ]);

    const names = this.namesOf(await this.query(vaultId, 'NOTE#'));
    const writes: Item[] = [];

    for (const link of links) {
      const answer = resolveTarget(link.title, names);
      if (answer.kind === 'note') {
        // Every note whose title matches becomes an edge (RN-DSC-042), so a
        // target carried by two notes writes two.
        for (const targetId of answer.noteIds) {
          if (targetId === note.noteId) continue;
          writes.push(...this.edgeItems(vaultId, note.noteId, targetId));
          // An edge that exists because an ALIAS matched is marked, because a
          // note written later under that title takes it away (RN-DSC-053).
          if (answer.by === 'alias') {
            writes.push({
              PK: this.pk(vaultId),
              SK: `ALIAS#${link.title}#${note.noteId}#${targetId}`,
              entity: 'ALIASEDGE',
              fromNoteId: note.noteId,
              toNoteId: targetId,
              title: link.title,
            });
          }
        }
      } else if (answer.kind === 'pending') {
        writes.push({
          PK: this.pk(vaultId),
          SK: `PENDING#${link.title}#${note.noteId}`,
          entity: 'PENDING',
          fromNoteId: note.noteId,
          title: link.title,
        });
      }
      // An attachment renders and is never an edge (RN-DSC-044).
    }
    await this.put(writes);
  }

  /** The edge, written in BOTH directions so a backlink is a Query. */
  private edgeItems(vaultId: string, fromNoteId: string, toNoteId: string): Item[] {
    return [
      {
        PK: this.pk(vaultId),
        SK: `OUT#${fromNoteId}#${toNoteId}`,
        entity: 'EDGE',
        fromNoteId,
        toNoteId,
      },
      {
        PK: this.pk(vaultId),
        SK: `IN#${toNoteId}#${fromNoteId}`,
        entity: 'EDGE',
        fromNoteId,
        toNoteId,
      },
    ];
  }

  /** What the vault answers to, out of the note items it already holds. */
  private namesOf(items: Item[]) {
    return vaultNames(
      items.map((item) => ({
        noteId: String(item['noteId']),
        title: item['title'] === undefined ? null : String(item['title']),
        aliases: Array.isArray(item['aliases']) ? (item['aliases'] as string[]) : [],
      })),
    );
  }

  async removeNote(vaultId: string, noteId: string): Promise<void> {
    const noteItem = await this.db.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { PK: this.pk(vaultId), SK: `NOTE#${noteId}` },
      }),
    );
    const title = noteItem.Item?.['title'] === undefined ? null : String(noteItem.Item['title']);

    const outgoing = await this.query(vaultId, `OUT#${noteId}#`);
    const incoming = await this.query(vaultId, `IN#${noteId}#`);

    await this.remove(vaultId, [
      `NOTE#${noteId}`,
      ...outgoing.map((item) => String(item['SK'])),
      ...outgoing.map((item) => `IN#${String(item['toNoteId'])}#${noteId}`),
      ...incoming.map((item) => String(item['SK'])),
      ...incoming.map((item) => `OUT#${String(item['fromNoteId'])}#${noteId}`),
    ]);

    if (title) {
      // The backlinks that pointed here go back to pending (RN-DSC-005) —
      // unless somebody's alias answers that title, in which case the link
      // lands there, which is the other half of resolution not being
      // monotonic (RN-DSC-053).
      const names = this.namesOf(await this.query(vaultId, 'NOTE#'));
      const answer = resolveTarget(title, names);
      const writes: Item[] = [];

      for (const item of incoming) {
        const from = String(item['fromNoteId']);
        if (answer.kind === 'note') {
          for (const toNoteId of answer.noteIds) {
            if (toNoteId === from) continue;
            writes.push(...this.edgeItems(vaultId, from, toNoteId), {
              PK: this.pk(vaultId),
              SK: `ALIAS#${title}#${from}#${toNoteId}`,
              entity: 'ALIASEDGE',
              fromNoteId: from,
              toNoteId,
              title,
            });
          }
        } else {
          writes.push({
            PK: this.pk(vaultId),
            SK: `PENDING#${title}#${from}`,
            entity: 'PENDING',
            fromNoteId: from,
            title,
          });
        }
      }
      await this.put(writes);
    }
  }

  async resolvePending(vaultId: string, note: NoteRef): Promise<number> {
    if (note.title.length > 0) await this.takeBackFromAliases(vaultId, note);

    const waiting =
      note.title.length === 0 ? [] : await this.query(vaultId, `PENDING#${note.title}#`);
    if (waiting.length === 0) return 0;

    await this.put(
      waiting.flatMap((item) => {
        const from = String(item['fromNoteId']);
        if (from === note.noteId) return [];
        return [
          {
            PK: this.pk(vaultId),
            SK: `OUT#${from}#${note.noteId}`,
            entity: 'EDGE',
            fromNoteId: from,
            toNoteId: note.noteId,
          },
          {
            PK: this.pk(vaultId),
            SK: `IN#${note.noteId}#${from}`,
            entity: 'EDGE',
            fromNoteId: from,
            toNoteId: note.noteId,
          },
        ];
      }),
    );
    await this.remove(
      vaultId,
      waiting.map((item) => String(item['SK'])),
    );
    return waiting.length;
  }

  /**
   * The edges somebody's alias was holding for this title, moved to the note
   * that owns it (RN-DSC-053).
   *
   * This is the invalidation path resolution stopped being monotonic for: the
   * edge disappears from a note nobody touched, whose own bytes did not
   * change, so nothing but this rewrites it.
   */
  private async takeBackFromAliases(vaultId: string, note: NoteRef): Promise<void> {
    const held = await this.query(vaultId, `ALIAS#${note.title}#`);
    if (held.length === 0) return;

    await this.remove(vaultId, [
      ...held.map((item) => String(item['SK'])),
      ...held.map((item) => `OUT#${String(item['fromNoteId'])}#${String(item['toNoteId'])}`),
      ...held.map((item) => `IN#${String(item['toNoteId'])}#${String(item['fromNoteId'])}`),
    ]);

    await this.put(
      held.flatMap((item) => {
        const from = String(item['fromNoteId']);
        return from === note.noteId ? [] : this.edgeItems(vaultId, from, note.noteId);
      }),
    );
  }

  async resolveTarget(vaultId: string, target: string): Promise<ResolvedTarget> {
    const items = await this.query(vaultId, 'NOTE#');
    const answer = resolveTarget(target, this.namesOf(items));
    const byId = new Map(items.map((item) => [String(item['noteId']), item]));
    return {
      target: answer.target,
      kind: answer.kind,
      by: answer.by,
      notes: answer.noteIds.flatMap((noteId) => {
        const item = byId.get(noteId);
        return item
          ? [
              {
                noteId,
                title: item['title'] === undefined ? '' : String(item['title']),
                aliases: Array.isArray(item['aliases']) ? (item['aliases'] as string[]) : [],
                folderId: String(item['folderId']),
              },
            ]
          : [];
      }),
    };
  }

  async dependencyTree(
    vaultId: string,
    rootNoteId: string,
    depth: number,
  ): Promise<GraphNode | null> {
    const notes = new Map(
      (await this.query(vaultId, 'NOTE#')).map((item) => [
        String(item['noteId']),
        {
          noteId: String(item['noteId']),
          title: item['title'] === undefined ? '' : String(item['title']),
          aliases: Array.isArray(item['aliases']) ? (item['aliases'] as string[]) : [],
          folderId: String(item['folderId']),
        },
      ]),
    );
    const root = notes.get(rootNoteId);
    if (!root) return null;

    const seen = new Set([rootNoteId]);
    let budget = GRAPH_LIMITS.maxNodes;

    const walk = async (note: NoteRef, level: number): Promise<GraphNode> => {
      if (level >= depth || budget <= 0) return { note, depth: level, children: [] };
      const edges = await this.query(vaultId, `OUT#${note.noteId}#`);
      const children: GraphNode[] = [];
      for (const edge of edges) {
        const targetId = String(edge['toNoteId']);
        if (seen.has(targetId) || budget <= 0) continue;
        const target = notes.get(targetId);
        if (!target) continue;
        seen.add(targetId);
        budget -= 1;
        children.push(await walk(target, level + 1));
      }
      return { note, depth: level, children };
    };

    return walk(root, 0);
  }

  async backlinks(vaultId: string, noteId: string): Promise<NoteRef[]> {
    const incoming = await this.query(vaultId, `IN#${noteId}#`);
    const notes = new Map(
      (await this.query(vaultId, 'NOTE#')).map((item) => [String(item['noteId']), item]),
    );
    return incoming
      .map((edge) => notes.get(String(edge['fromNoteId'])))
      .filter((item): item is Item => item !== undefined)
      .map((item) => ({
        noteId: String(item['noteId']),
        title: item['title'] === undefined ? '' : String(item['title']),
        aliases: Array.isArray(item['aliases']) ? (item['aliases'] as string[]) : [],
        folderId: String(item['folderId']),
      }));
  }

  async broken(vaultId: string): Promise<BrokenLink[]> {
    const pending = await this.query(vaultId, 'PENDING#');
    const notes = new Map(
      (await this.query(vaultId, 'NOTE#')).map((item) => [String(item['noteId']), item]),
    );
    return pending
      .map((item) => {
        const from = notes.get(String(item['fromNoteId']));
        return from
          ? {
              fromNote: {
                noteId: String(from['noteId']),
                title: from['title'] === undefined ? '' : String(from['title']),
                aliases: Array.isArray(from['aliases']) ? (from['aliases'] as string[]) : [],
                folderId: String(from['folderId']),
              },
              targetTitle: String(item['title']),
            }
          : null;
      })
      .filter((link) => link !== null) as BrokenLink[];
  }

  async orphans(vaultId: string, allNotes: NoteRef[]): Promise<NoteRef[]> {
    const edges = await this.query(vaultId, 'OUT#');
    const linked = new Set(
      edges.flatMap((edge) => [String(edge['fromNoteId']), String(edge['toNoteId'])]),
    );
    return allNotes.filter((note) => !linked.has(note.noteId));
  }

  /**
   * Three prefix queries in ONE partition, which is the whole reason the
   * projection is keyed by vault: the graph of a vault is a scan of its own
   * partition and never reaches another one.
   */
  async wholeGraph(vaultId: string): Promise<VaultGraph> {
    const noteItems = await this.query(vaultId, 'NOTE#');
    const truncated = noteItems.length > GRAPH_LIMITS.maxVaultNodes;
    const kept = truncated ? noteItems.slice(0, GRAPH_LIMITS.maxVaultNodes) : noteItems;

    const nodes: NoteRef[] = kept.map((item) => ({
      noteId: String(item['noteId']),
      title: item['title'] === undefined ? '' : String(item['title']),
      aliases: Array.isArray(item['aliases']) ? (item['aliases'] as string[]) : [],
      folderId: String(item['folderId']),
    }));
    const indexOf = new Map(nodes.map((note, index) => [note.noteId, index]));

    // An edge with either end outside the ceiling is dropped: it would index
    // past the end of `nodes`, and a dangling index is worse than a lost edge.
    const edges: Array<[number, number]> = [];
    for (const item of await this.query(vaultId, 'OUT#')) {
      const from = indexOf.get(String(item['fromNoteId']));
      const to = indexOf.get(String(item['toNoteId']));
      if (from !== undefined && to !== undefined) edges.push([from, to]);
    }

    const pending: Array<{ from: number; targetTitle: string }> = [];
    for (const item of await this.query(vaultId, 'PENDING#')) {
      const from = indexOf.get(String(item['fromNoteId']));
      if (from !== undefined) pending.push({ from, targetTitle: String(item['title']) });
    }

    return { nodes, edges, pending, truncated };
  }

  /*
   * The three below exist for the reprojection (#102) and for nothing else.
   *
   * A projection is derived and rebuildable from zero (PE5), and the one in
   * this table was built by a rule that retired: rebuilding it means forgetting
   * every edge, restating what the vault answers to, and letting the ordinary
   * write path decide the edges again. They are not on the LinkGraph port,
   * because the projector never needs them and a port is what a caller needs.
   */

  /** Every edge the vault holds right now, for the before and after of a run. */
  async currentEdges(vaultId: string): Promise<Array<{ from: string; to: string }>> {
    return (await this.query(vaultId, 'OUT#')).map((item) => ({
      from: String(item['fromNoteId']),
      to: String(item['toNoteId']),
    }));
  }

  /**
   * Every edge, backlink, pending link and alias edge of the vault, forgotten.
   *
   * The NOTE# items stay: they are what the vault answers to, and the seeding
   * below restates them before a single edge is resolved. Deleting them here
   * would make the first note of the rebuild resolve against an empty vault.
   */
  async forgetLinks(vaultId: string): Promise<void> {
    for (const prefix of ['OUT#', 'IN#', 'PENDING#', 'ALIAS#']) {
      const items = await this.query(vaultId, prefix);
      await this.remove(
        vaultId,
        items.map((item) => String(item['SK'])),
      );
    }
  }

  /**
   * What the vault answers to, restated from the notes themselves, and the
   * note items of whatever is no longer there taken away.
   *
   * It runs before the edges are rebuilt so that every note resolves against
   * the whole vault rather than against however much of it had been written by
   * the time its turn came.
   */
  async seedNotes(vaultId: string, notes: readonly NoteRef[]): Promise<void> {
    const live = new Set(notes.map((note) => note.noteId));
    const stale = (await this.query(vaultId, 'NOTE#'))
      .map((item) => String(item['SK']))
      .filter((sk) => !live.has(sk.slice('NOTE#'.length)));
    await this.remove(vaultId, stale);
    await this.put(
      notes.map((note) => ({
        PK: this.pk(vaultId),
        SK: `NOTE#${note.noteId}`,
        entity: 'GNOTE',
        ...note,
      })),
    );
  }
}

export class DynamoFacetIndex implements FacetIndex {
  constructor(
    private readonly subscriptionId: SubscriptionId,
    private readonly db: DynamoDBDocumentClient,
    private readonly tableName: string,
  ) {}

  private pk(vaultId: string): string {
    return partition(this.subscriptionId, vaultId);
  }

  async replaceFacets(
    vaultId: string,
    noteId: string,
    facets: FacetSnapshot | null,
  ): Promise<void> {
    const previous = await this.db.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { PK: this.pk(vaultId), SK: `FACET#${noteId}` },
      }),
    );
    const before = (previous.Item?.['facets'] as FacetSnapshot | undefined) ?? null;
    const changes = facetDelta(before, facets);

    const portrait =
      facets === null
        ? {
            Delete: {
              TableName: this.tableName,
              Key: { PK: this.pk(vaultId), SK: `FACET#${noteId}` },
            },
          }
        : {
            Put: {
              TableName: this.tableName,
              Item: {
                PK: this.pk(vaultId),
                SK: `FACET#${noteId}`,
                entity: 'FACET',
                noteId,
                facets,
              },
            },
          };

    const counters = changes.map((change) => ({
      Update: {
        TableName: this.tableName,
        Key: { PK: this.pk(vaultId), SK: `STAT#${change.facet}#${change.value}` },
        UpdateExpression: 'ADD #count :delta SET #kind = :kind, facet = :facet, #value = :value',
        ExpressionAttributeNames: { '#count': 'count', '#kind': 'kind', '#value': 'value' },
        ExpressionAttributeValues: {
          ':delta': change.delta,
          ':kind': change.kind,
          ':facet': change.facet,
          ':value': change.value,
        },
      },
    }));

    // The new portrait travels with the counters it moved, in the same shape
    // as the folder counters of section 10.3. A note whose frontmatter holds
    // more distinct values than one transaction carries used to have the tail
    // of its counters dropped without a word: the portrait was right and the
    // panel counting it was quietly short, forever, because the next write of
    // that note computes its delta against the portrait and finds nothing
    // owing. Every delta is applied now, in as many transactions as it takes.
    const [first, ...rest] = chunk(counters, MAX_TRANSACTION_ITEMS - 1);
    await this.db.send(
      new TransactWriteCommand({ TransactItems: [portrait, ...(first ?? [])] as never }),
    );
    for (const batch of rest) {
      await this.db.send(new TransactWriteCommand({ TransactItems: batch as never }));
    }

    for (const facet of new Set(changes.map((change) => change.facet))) {
      await this.enforceCardinality(vaultId, facet);
    }
  }

  /** The cardinality ceiling is the free-text detector (RN-DSC-024). */
  private async enforceCardinality(vaultId: string, facet: string): Promise<void> {
    const response = await this.db.send(
      new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
        ExpressionAttributeValues: { ':pk': this.pk(vaultId), ':prefix': `STAT#${facet}#` },
      }),
    );
    const values = (response.Items ?? []) as Item[];
    if (values.length <= MAX_DISTINCT_VALUES) return;

    for (const item of values) {
      await this.db.send(
        new DeleteCommand({
          TableName: this.tableName,
          Key: { PK: this.pk(vaultId), SK: String(item['SK']) },
        }),
      );
    }
    await this.db.send(
      new UpdateCommand({
        TableName: this.tableName,
        Key: { PK: this.pk(vaultId), SK: `FDEF#${facet}` },
        UpdateExpression: 'SET discarded = :yes, facet = :facet',
        ExpressionAttributeValues: { ':yes': true, ':facet': facet },
      }),
    );
  }

  /**
   * The portrait of every note, the same items `vaultFacetStats` counts, read
   * per note instead of aggregated. One prefix query in the partition the
   * graph already reads, which is why the graph can be colored by an attribute
   * without a second projection existing anywhere.
   */
  async vaultNoteFacets(vaultId: string): Promise<Map<string, Record<string, string[]>>> {
    const portraits = await this.query(vaultId, 'FACET#');
    return new Map(
      portraits.map((item) => [
        String(item['noteId']),
        valuesOf((item['facets'] as FacetSnapshot | undefined) ?? {}),
      ]),
    );
  }

  async vaultFacetStats(vaultId: string): Promise<FacetStats> {
    const [stats, definitions, portraits] = await Promise.all([
      this.query(vaultId, 'STAT#'),
      this.query(vaultId, 'FDEF#'),
      this.query(vaultId, 'FACET#'),
    ]);

    const grouped = new Map<
      string,
      { kind: string; values: Array<{ value: string; count: number }> }
    >();
    for (const item of stats) {
      const facet = String(item['facet']);
      const entry = grouped.get(facet) ?? { kind: String(item['kind'] ?? 'enum'), values: [] };
      entry.values.push({ value: String(item['value']), count: Number(item['count'] ?? 0) });
      grouped.set(facet, entry);
    }

    return {
      noteCount: portraits.length,
      facets: [
        ...[...grouped.entries()].map(([facet, entry]) => ({
          facet,
          kind: entry.kind as FacetStats['facets'][number]['kind'],
          values: entry.values.sort((left, right) => right.count - left.count),
          discarded: false,
        })),
        ...definitions
          .filter((item) => item['discarded'] === true)
          .map((item) => ({
            facet: String(item['facet']),
            kind: 'enum' as const,
            values: [],
            discarded: true,
          })),
      ],
    };
  }

  /**
   * Every page, for the same reason the link graph walks every page: a Query
   * answers at most 1 MB, and the portrait of a note is not a small item. A
   * first-page answer would drop the facets of the notes the paging cut off,
   * and the graph would show an attribute on some of the notes that carry it,
   * which is worse than showing it on none.
   */
  private async query(vaultId: string, prefix: string): Promise<Item[]> {
    const items: Item[] = [];
    let startKey: Record<string, unknown> | undefined;
    do {
      const response: {
        Items?: Record<string, unknown>[] | undefined;
        LastEvaluatedKey?: Record<string, unknown> | undefined;
      } = await this.db.send(
        new QueryCommand({
          TableName: this.tableName,
          KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
          ExpressionAttributeValues: { ':pk': this.pk(vaultId), ':prefix': prefix },
          ...(startKey ? { ExclusiveStartKey: startKey } : {}),
        }),
      );
      items.push(...((response.Items ?? []) as Item[]));
      startKey = response.LastEvaluatedKey;
    } while (startKey);
    return items;
  }
}

/** The local projection of the vault shape, so the prefix costs no query. */
export class DynamoStructureProjection implements StructureProjection {
  constructor(
    private readonly subscriptionId: SubscriptionId,
    private readonly db: DynamoDBDocumentClient,
    private readonly tableName: string,
  ) {}

  private pk(vaultId: string): string {
    return partition(this.subscriptionId, vaultId);
  }

  async get(vaultId: string): Promise<VaultStructure | null> {
    const response = await this.db.send(
      new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
        ExpressionAttributeValues: { ':pk': this.pk(vaultId), ':prefix': 'S' },
      }),
    );
    const items = (response.Items ?? []) as Item[];
    const meta = items.find((item) => item['SK'] === 'STRUCT');
    if (!meta) return null;

    return {
      vaultId,
      vaultName: String(meta['vaultName'] ?? ''),
      folders: new Map(
        items
          .filter((item) => String(item['SK']).startsWith('SFOLDER#'))
          .map((item) => [
            String(item['folderId']),
            {
              name: String(item['name']),
              description: String(item['description']),
              parentFolderId: item['parentFolderId'] ? String(item['parentFolderId']) : null,
            },
          ]),
      ),
    };
  }

  async upsertVault(vaultId: string, name: string): Promise<void> {
    await this.db.send(
      new UpdateCommand({
        TableName: this.tableName,
        Key: { PK: this.pk(vaultId), SK: 'STRUCT' },
        UpdateExpression: 'SET vaultName = :name, entity = :entity',
        ExpressionAttributeValues: { ':name': name, ':entity': 'STRUCT' },
      }),
    );
  }

  async upsertFolder(
    vaultId: string,
    folder: { folderId: string; name: string; description: string; parentFolderId: string | null },
  ): Promise<void> {
    await this.db.send(
      new PutCommand({
        TableName: this.tableName,
        Item: {
          PK: this.pk(vaultId),
          SK: `SFOLDER#${folder.folderId}`,
          entity: 'SFOLDER',
          ...folder,
        },
      }),
    );
  }

  async removeFolders(vaultId: string, folderIds: string[]): Promise<void> {
    for (const folderId of folderIds) {
      await this.db.send(
        new DeleteCommand({
          TableName: this.tableName,
          Key: { PK: this.pk(vaultId), SK: `SFOLDER#${folderId}` },
        }),
      );
    }
  }
}

/**
 * The content index over `mv-discovery`, one item per note:
 *
 *   TEXT#{noteId}   the searchable portrait: title, folder, headings, the body
 *                   normalized for matching and the body as written for the excerpt
 *
 * The whole vault is read on every search. That is affordable because the
 * product caps a vault at 2.000 notes (RN-KNW-010), roughly 8 MB, and it is
 * far simpler than an inverted index that would need to stay in step with
 * every write.
 *
 * `scanVault` walks EVERY page. The search this one replaced answered from the
 * first megabyte and dropped the rest without a word, which in a vault of 8 MB
 * meant deciding over an eighth of it. A partial scan that claims to be whole
 * is worse than no search, so the loop below is not an optimization detail: it
 * is the correctness of the feature.
 */
export class DynamoContentIndex implements ContentIndex {
  constructor(
    private readonly subscriptionId: SubscriptionId,
    private readonly db: DynamoDBDocumentClient,
    private readonly tableName: string,
  ) {}

  private pk(vaultId: string): string {
    return partition(this.subscriptionId, vaultId);
  }

  async replaceNote(vaultId: string, note: IndexedNote): Promise<void> {
    await this.db.send(
      new PutCommand({
        TableName: this.tableName,
        Item: {
          PK: this.pk(vaultId),
          SK: `TEXT#${note.noteId}`,
          entity: 'text',
          noteId: note.noteId,
          title: note.title,
          folderId: note.folderId,
          folderName: note.folderName,
          sections: note.sections,
          normalized: note.normalized,
          original: note.original,
          facets: note.facets,
          aliases: note.aliases ?? [],
          facetKinds: note.facetKinds ?? {},
        },
      }),
    );
  }

  async removeNote(vaultId: string, noteId: string): Promise<void> {
    await this.db.send(
      new DeleteCommand({
        TableName: this.tableName,
        Key: { PK: this.pk(vaultId), SK: `TEXT#${noteId}` },
      }),
    );
  }

  async scanVault(vaultId: string): Promise<IndexedNote[]> {
    const notes: IndexedNote[] = [];
    let startKey: Record<string, unknown> | undefined;

    do {
      const response: {
        Items?: Record<string, unknown>[] | undefined;
        LastEvaluatedKey?: Record<string, unknown> | undefined;
      } = await this.db.send(
        new QueryCommand({
          TableName: this.tableName,
          KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
          ExpressionAttributeValues: { ':pk': this.pk(vaultId), ':prefix': 'TEXT#' },
          ...(startKey ? { ExclusiveStartKey: startKey } : {}),
        }),
      );

      for (const item of (response.Items ?? []) as Item[]) {
        notes.push({
          noteId: String(item['noteId']),
          title: String(item['title'] ?? ''),
          folderId: String(item['folderId'] ?? ''),
          folderName: String(item['folderName'] ?? ''),
          sections: (item['sections'] as string[]) ?? [],
          normalized: String(item['normalized'] ?? ''),
          original: String(item['original'] ?? ''),
          facets: (item['facets'] as Record<string, string[]>) ?? {},
          // Absent on an item written before these were carried: the
          // search answers without them until the projection is rebuilt.
          aliases: (item['aliases'] as string[]) ?? [],
          facetKinds: (item['facetKinds'] as Record<string, string>) ?? {},
        });
      }
      startKey = response.LastEvaluatedKey;
    } while (startKey);

    return notes;
  }
}
