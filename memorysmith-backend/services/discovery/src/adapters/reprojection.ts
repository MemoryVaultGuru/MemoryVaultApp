/**
 * Rebuilding the link projection of every vault, after 0.6.0 is deployed
 * (#102).
 *
 * Every projection of this service is derived and rebuildable from zero (PE5),
 * and this is that answer for the link graph — the same answer `StorageRecount`
 * is for the storage counter, and it exists for the same reason: the one in the
 * table was built by a rule that has just retired. A link resolved against a
 * slug that folded case, accents and punctuation; it now resolves against the
 * title a note states, exactly, and against the aliases it declares. Every
 * edge in the table is an assertion the current rule never made.
 *
 * So it is not repaired, it is rebuilt: the edges are forgotten, what the vault
 * answers to is restated from the notes, and the ordinary write path resolves
 * every target again. An edge then exists because the new rule says so, and
 * not because an old projection said so.
 *
 * **The check after a run is not equality.** Any note carrying `aliases:`
 * starts answering targets that no title matched (RN-DSC-052), which under the
 * retired rule resolved to nothing at all. So the expectation is that NO EDGE
 * IS LOST, and that every edge gained is one an alias explains — which is why
 * the report below names each gained edge together with the target that
 * produced it and whether a title or an alias answered.
 *
 * WHY THIS IS NOT A ROUTE, and why it reads the table rather than the API: a
 * platform session carries no subscription, so no repository can be built
 * under it (PE12, RN-SUB-016) and rebuilding every account cannot be an
 * authenticated operation at all. It also writes nothing a person authored —
 * a projection has no author — so unlike the retitling migration it owes
 * nothing to the audit trail. It runs as maintenance, against the tables,
 * under IAM.
 */

import { ScanCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { noteTitle, SubscriptionId } from '@memorysmith/kernel';

import { extractLinks } from '../domain/LinkExtractor.js';
import { extractFrontmatterAliases } from '../domain/Aliases.js';
import { resolveTarget, vaultNames } from '../domain/LinkResolver.js';
import type { NoteRef } from '../domain/ports.js';
import type { ContentReader } from '../application/projections.js';
import type { DynamoLinkGraph } from './aws.js';

/** `S#{subscriptionId}#VAULT#{vaultId}`, which is where a note item lives. */
const VAULT_PARTITION = /^S#([^#]+)#VAULT#(.+)$/;

export interface ReprojectionDependencies {
  readonly db: DynamoDBDocumentClient;
  readonly knowledgeTable: string;
  /** Every projection is built per subscription, like every repository (PE2). */
  readonly graphFor: (subscriptionId: SubscriptionId) => DynamoLinkGraph;
  readonly contentFor: (subscriptionId: SubscriptionId) => ContentReader;
}

/** One note, as the rebuild reads it: what it answers to and what it points at. */
export interface ReadNote extends NoteRef {
  readonly targets: readonly string[];
}

/** An edge, and the target that produced it. */
export interface PlannedEdge {
  readonly from: string;
  readonly to: string;
  readonly target: string;
  readonly by: 'title' | 'alias';
}

/** What one vault held, what it will hold, and the difference between them. */
export interface VaultPlan {
  readonly subscriptionId: string;
  readonly vaultId: string;
  readonly notes: readonly ReadNote[];
  readonly before: number;
  readonly after: readonly PlannedEdge[];
  /** Edges the new rule finds and the old projection did not hold. */
  readonly gained: readonly PlannedEdge[];
  /** Edges the old projection held and the new rule does not find. */
  readonly lost: ReadonlyArray<{ from: string; to: string }>;
  readonly pending: number;
}

const edgeKey = (edge: { from: string; to: string }): string => `${edge.from} -> ${edge.to}`;

/**
 * The subscription a note item belongs to, read off the partition it sits in.
 *
 * `fromClaim` is the only door into the type and it is named after where the
 * value legitimately comes from — never a path, a query or a body. This is
 * neither: it is the key the product itself wrote, read back the way every
 * repository reads its own items back, and it is the only thing this job could
 * possibly trust, since no session is involved at all.
 */
function subscriptionOf(raw: string): SubscriptionId {
  const parsed = SubscriptionId.fromClaim(raw);
  if (!parsed.ok) throw new Error(`Not a subscription identifier: ${raw}`);
  return parsed.value;
}

export class LinkReprojection {
  constructor(private readonly deps: ReprojectionDependencies) {}

  /**
   * What every vault will hold, worked out without writing anything.
   *
   * The after-state is computed here with the same two functions the adapter
   * resolves with, so the report and the write cannot disagree about what the
   * rule says: what differs is only who performs it.
   */
  async plan(): Promise<VaultPlan[]> {
    const plans: VaultPlan[] = [];
    for (const [partition, notes] of await this.liveNotes()) {
      const match = VAULT_PARTITION.exec(partition);
      if (!match) continue;
      const subscriptionId = subscriptionOf(match[1] ?? '');
      const vaultId = match[2] ?? '';

      const read = await this.readNotes(subscriptionId, notes);
      const after = resolveAll(read);
      const before = await this.deps.graphFor(subscriptionId).currentEdges(vaultId);

      const held = new Set(before.map(edgeKey));
      const found = new Set(after.edges.map(edgeKey));
      plans.push({
        subscriptionId: subscriptionId.value,
        vaultId,
        notes: read,
        before: before.length,
        after: after.edges,
        gained: after.edges.filter((edge) => !held.has(edgeKey(edge))),
        lost: before.filter((edge) => !found.has(edgeKey(edge))),
        pending: after.pending,
      });
    }
    return plans;
  }

  /**
   * Writes one vault's plan: the edges are forgotten, what the vault answers to
   * is restated, and every note is re-resolved by the ordinary write path.
   *
   * The last step is deliberately the product's own code and not a shortcut
   * that writes the computed edges directly. A rebuild that took its own path
   * to the table would be a second implementation of the projection, and the
   * day the two disagreed the rebuild would be the one nobody tested.
   */
  async apply(plan: VaultPlan): Promise<void> {
    const graph = this.deps.graphFor(subscriptionOf(plan.subscriptionId));
    // The note item carries what the vault ANSWERS to and nothing else: the
    // targets belong to this plan, not to the projection.
    const refs = plan.notes.map(({ noteId, title, aliases, folderId }): NoteRef => ({
      noteId,
      title,
      aliases,
      folderId,
    }));
    await graph.forgetLinks(plan.vaultId);
    await graph.seedNotes(plan.vaultId, refs);
    for (const note of plan.notes) {
      const { targets, ...ref } = note;
      await graph.replaceOutgoing(
        plan.vaultId,
        ref,
        targets.map((title) => ({ title, anchor: null })),
      );
    }
  }

  /**
   * Every live note of every vault, by the partition it sits in.
   *
   * A Scan, deliberately, and for the reason the recount scans: there is no
   * index that lists vaults, and inventing one to serve a maintenance job would
   * put a cost on every write to save a job that runs by hand. It projects the
   * four attributes it reads.
   */
  private async liveNotes(): Promise<Map<string, Array<Record<string, unknown>>>> {
    const byPartition = new Map<string, Array<Record<string, unknown>>>();
    let startKey: Record<string, unknown> | undefined;

    do {
      const page = await this.deps.db.send(
        new ScanCommand({
          TableName: this.deps.knowledgeTable,
          FilterExpression: '#entity = :note',
          ExpressionAttributeNames: { '#entity': 'entity' },
          ExpressionAttributeValues: { ':note': 'NOTE' },
          ProjectionExpression: 'PK, noteId, folderId, bodyRef, deletedAt',
          ...(startKey ? { ExclusiveStartKey: startKey } : {}),
        }),
      );
      for (const item of page.Items ?? []) {
        // A deleted note takes no part in the graph, exactly as its delete
        // event took it out (RN-DSC-013).
        if (item['deletedAt']) continue;
        const partition = String(item['PK'] ?? '');
        byPartition.set(partition, [...(byPartition.get(partition) ?? []), item]);
      }
      startKey = page.LastEvaluatedKey;
    } while (startKey);

    return byPartition;
  }

  /** What each note is called, answers to and points at, read from its bytes. */
  private async readNotes(
    subscriptionId: SubscriptionId,
    items: ReadonlyArray<Record<string, unknown>>,
  ): Promise<ReadNote[]> {
    const content = this.deps.contentFor(subscriptionId);
    const notes: ReadNote[] = [];
    for (const item of items) {
      const ref = item['bodyRef'] as { contentId?: string; versionId?: string } | undefined;
      const markdown =
        ref?.contentId && ref.versionId
          ? await content.read({ contentId: ref.contentId, versionId: ref.versionId })
          : '';
      notes.push({
        noteId: String(item['noteId']),
        folderId: String(item['folderId']),
        title: noteTitle(markdown) ?? '',
        aliases: extractFrontmatterAliases(markdown),
        targets: extractLinks(markdown).map((link) => link.title),
      });
    }
    return notes;
  }
}

/**
 * Every edge the current rule finds in a vault, and how many targets found
 * none. It is exported because it is where the whole difference between the
 * two rules lands, and the difference is what the report is about.
 */
export function resolveAll(notes: readonly ReadNote[]): { edges: PlannedEdge[]; pending: number } {
  const names = vaultNames(notes.map((note) => ({ ...note, title: note.title || null })));
  const edges: PlannedEdge[] = [];
  let pending = 0;

  for (const note of notes) {
    for (const target of note.targets) {
      const answer = resolveTarget(target, names);
      if (answer.kind === 'pending') {
        pending += 1;
        continue;
      }
      if (answer.kind !== 'note' || answer.by === null) continue;
      // Every note whose title matches is an edge (RN-DSC-042), and a note
      // never links to itself.
      for (const to of answer.noteIds) {
        if (to === note.noteId) continue;
        edges.push({ from: note.noteId, to, target, by: answer.by });
      }
    }
  }
  return { edges, pending };
}
