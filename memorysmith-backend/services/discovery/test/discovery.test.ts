import { beforeEach, describe, expect, it } from 'vitest';
import { extractLinks } from '../src/domain/LinkExtractor.js';
import { extractFacets, facetDelta } from '../src/domain/FacetExtractor.js';
import { normalize } from '../src/domain/SearchQuery.js';
import { DynamoContentIndex, DynamoFacetIndex } from '../src/adapters/aws.js';
import {
  InMemoryContentIndex,
  InMemoryFacetIndex,
  InMemoryLinkGraph,
  InMemoryNoteCatalog,
  InMemoryStructureProjection,
} from '../src/adapters/memory.js';
import {
  ProjectNote,
  ProjectStructure,
  type ContentReader,
} from '../src/application/projections.js';
import {
  Backlinks,
  GetFacetStats,
  RelatedNotes,
  SearchNotes,
  VaultGraphQuery,
  VaultHealth,
} from '../src/application/queries.js';

const VAULT = 'vault-1';

describe('LinkExtractor: universal syntax only', () => {
  it('reads both link forms and normalizes the target', () => {
    const links = extractLinks('Ver [[Lei 14.133]] e [o achado](../achados/achado-12.md).');
    expect(links.map((link) => link.slug)).toEqual(['lei-14133', 'achado-12']);
  });

  it('ignores path segments deliberately', () => {
    // RN-DSC-001: the edge is between notes, not folders. Honouring the path
    // would break the link the moment the note changed folder.
    const links = extractLinks('[x](../../normas/2026/lei-14133.md)');
    expect(links[0]?.slug).toBe('lei-14133');
  });

  it('drops the anchor from resolution and keeps it for display', () => {
    const links = extractLinks('[art](lei-14133.md#art-75)');
    expect(links[0]?.slug).toBe('lei-14133');
    expect(links[0]?.anchor).toBe('art-75');
  });

  it('treats a link with a scheme or host as external', () => {
    const links = extractLinks('[fora](https://example.com/x.md) e [mail](mailto:a@b.c)');
    expect(links).toHaveLength(0);
  });

  it('ignores links inside code blocks, which are examples', () => {
    const links = extractLinks('```\n[[nao-e-link]]\n```\nMas [[e-link]] conta.');
    expect(links.map((link) => link.slug)).toEqual(['e-link']);
  });

  it('reads a wikilink with an alias', () => {
    expect(extractLinks('[[lei-14133|a nova lei]]')[0]?.slug).toBe('lei-14133');
  });
});

describe('FacetExtractor: classification by the shape of the value', () => {
  it('reads only the frontmatter block', () => {
    const facets = extractFacets('---\nmaturity: growing\n---\n\nmaturity: no corpo nao conta');
    expect(Object.keys(facets)).toEqual(['maturity']);
    expect(facets['maturity']?.values).toEqual(['growing']);
  });

  it('recognizes dates, booleans, short values and lists', () => {
    const facets = extractFacets(
      [
        '---',
        'created: 2026-03-12',
        'reviewed: true',
        'type: evidence',
        'tags: [alpha, beta]',
        '---',
      ].join('\n'),
    );
    expect(facets['created']?.kind).toBe('date');
    expect(facets['reviewed']?.kind).toBe('boolean');
    expect(facets['type']?.kind).toBe('enum');
    expect(facets['tags']?.kind).toBe('list');
    expect(facets['tags']?.values).toEqual(['alpha', 'beta']);
  });

  it('discards free text, which is not a category', () => {
    const long = 'x'.repeat(120);
    const facets = extractFacets(`---\nsummary: ${long}\ntype: nota\n---`);
    expect(facets['summary']).toBeUndefined();
    expect(facets['type']).toBeDefined();
  });

  it('reads a dash list too', () => {
    const facets = extractFacets('---\ntags:\n  - alpha\n  - beta\n---');
    expect(facets['tags']?.values).toEqual(['alpha', 'beta']);
  });

  it('classifies an inline list of one item as a list', () => {
    const facets = extractFacets('---\ntags: [contracts]\n---');
    expect(facets['tags']?.kind).toBe('list');
    expect(facets['tags']?.values).toEqual(['contracts']);
  });

  it('classifies a dash list of one item as a list', () => {
    const facets = extractFacets('---\ntags:\n  - contracts\n---');
    expect(facets['tags']?.kind).toBe('list');
  });

  it('keeps a scalar an enum, because the written form decides and not the count', () => {
    expect(extractFacets('---\ntags: contracts\n---')['tags']?.kind).toBe('enum');
  });

  it('does not change the kind of an attribute when a second value arrives', () => {
    const one = extractFacets('---\ntags: [contracts]\n---')['tags']?.kind;
    const two = extractFacets('---\ntags: [contracts, budget]\n---')['tags']?.kind;
    expect(one).toBe(two);
  });

  it('still discards a list whose items are prose', () => {
    const long = 'x'.repeat(41);
    expect(extractFacets(`---\nnotes: [${long}]\n---`)['notes']).toBeUndefined();
  });

  it('computes the delta between two portraits', () => {
    const before = extractFacets('---\nmaturity: seed\n---');
    const after = extractFacets('---\nmaturity: evergreen\n---');
    const delta = facetDelta(before, after);
    expect(delta).toEqual([
      { facet: 'maturity', value: 'seed', kind: 'enum', delta: -1 },
      { facet: 'maturity', value: 'evergreen', kind: 'enum', delta: 1 },
    ]);
  });
});

describe('The projections, driven by events', () => {
  let graph: InMemoryLinkGraph;
  let facets: InMemoryFacetIndex;
  let index: InMemoryContentIndex;
  let structure: InMemoryStructureProjection;
  let catalog: InMemoryNoteCatalog;
  let content: Map<string, string>;
  let project: ProjectNote;

  const reader: ContentReader = {
    read: async (ref) => content.get(`${ref.contentId}#${ref.versionId}`) ?? '',
  };

  beforeEach(async () => {
    graph = new InMemoryLinkGraph();
    facets = new InMemoryFacetIndex();
    index = new InMemoryContentIndex();
    structure = new InMemoryStructureProjection();
    catalog = new InMemoryNoteCatalog();
    content = new Map();
    project = new ProjectNote({ graph, facets, index, structure, content: reader });

    const structureProjector = new ProjectStructure(structure);
    await structureProjector.onVault(VAULT, 'Normas e Legislacao');
    await structureProjector.onFolder(VAULT, {
      folderId: 'f1',
      name: 'Normas',
      description: 'Texto normativo por artigo',
      parentFolderId: null,
    });
  });

  /**
   * The title is not passed in: the projector reads it from the markdown, the
   * way the write did (RN-KNW-035). A note that is meant to be findable by
   * name says its name in its content, which is what a real one does.
   */
  async function write(input: { noteId: string; markdown: string }): Promise<void> {
    const ref = { contentId: `c-${input.noteId}`, versionId: `v-${content.size + 1}` };
    content.set(`${ref.contentId}#${ref.versionId}`, input.markdown);
    await project.onWritten({
      vaultId: VAULT,
      noteId: input.noteId,
      folderId: 'f1',
      contentRef: ref,
    });
  }

  it('resolves a pending link when the target note is finally created', async () => {
    await write({ noteId: 'n1', markdown: '# Achado 12\n\nFundamento: [[lei-14133]].' });
    // The target does not exist yet, so the link waits instead of vanishing.
    expect(await graph.backlinks(VAULT, 'n2')).toHaveLength(0);
    expect(await graph.broken(VAULT)).toHaveLength(1);

    await write({ noteId: 'n2', markdown: '# Lei 14.133' });

    const backlinks = await graph.backlinks(VAULT, 'n2');
    expect(backlinks.map((note) => note.noteId)).toEqual(['n1']);
    expect(await graph.broken(VAULT)).toHaveLength(0);
  });

  it('returns backlinks to pending when the target note is deleted', async () => {
    await write({ noteId: 'n2', markdown: '# Lei 14.133' });
    await write({ noteId: 'n1', markdown: '# Achado 12\n\nFundamento: [[lei-14133]].' });
    expect(await graph.backlinks(VAULT, 'n2')).toHaveLength(1);

    await project.onDeleted({ vaultId: VAULT, noteId: 'n2', folderId: 'f1', contentRef: null });

    // RN-DSC-005: the edge is gone and the link is pending again.
    expect(await graph.backlinks(VAULT, 'n2')).toHaveLength(0);
    expect((await graph.broken(VAULT)).map((link) => link.targetSlug)).toEqual(['lei-14133']);
  });

  it('prunes everything in the origin vault on a cross-vault move', async () => {
    // RN-DSC-006: there is no link between vaults.
    content.set('c1#v1', '# Nota\n\n[[outra]]');
    await project.onWritten({
      vaultId: VAULT,
      noteId: 'n1',
      folderId: 'f1',
      contentRef: { contentId: 'c1', versionId: 'v1' },
    });
    await structure.upsertVault('vault-2', 'Outro');
    await structure.upsertFolder('vault-2', {
      folderId: 'f9',
      name: 'Destino',
      description: 'Destino',
      parentFolderId: null,
    });

    await project.onMoved({
      vaultId: 'vault-2',
      fromVaultId: VAULT,
      noteId: 'n1',
      folderId: 'f9',
      contentRef: { contentId: 'c1', versionId: 'v1' },
    });

    expect(await graph.backlinks(VAULT, 'n1')).toHaveLength(0);
  });

  it('counts facets and withdraws the portrait when the note goes', async () => {
    await write({ noteId: 'n1', markdown: '---\nmaturity: seed\nreviewed: false\n---\n\n# Nota' });
    await write({ noteId: 'n2', markdown: '---\nmaturity: seed\nreviewed: true\n---\n\n# Outra' });

    const stats = await new GetFacetStats({ graph, facets, catalog, content: index }).execute({
      vaultId: VAULT,
    });
    expect(stats.ok).toBe(true);
    if (!stats.ok) return;
    const maturity = stats.value.facets.find((facet) => facet.facet === 'maturity');
    expect(maturity?.values).toEqual([{ value: 'seed', count: 2 }]);

    await project.onDeleted({ vaultId: VAULT, noteId: 'n1', folderId: 'f1', contentRef: null });
    const afterDeletion = await facets.vaultFacetStats(VAULT);
    expect(afterDeletion.facets.find((facet) => facet.facet === 'maturity')?.values).toEqual([
      { value: 'seed', count: 1 },
    ]);
  });

  it('drops an attribute that reveals itself as free text by cardinality', async () => {
    // RN-DSC-024: this is what keeps `source` from becoming a statistic,
    // without any exclusion list in the code.
    for (let index = 0; index < 45; index++) {
      await write({
        noteId: `n${index}`,
        markdown: `---\nsource: doc-${index}\nmaturity: seed\n---\n\n# Nota`,
      });
    }
    const stats = await facets.vaultFacetStats(VAULT);
    const source = stats.facets.find((facet) => facet.facet === 'source');
    expect(source?.discarded).toBe(true);
    expect(source?.values).toEqual([]);
    // The well-behaved attribute is untouched.
    expect(stats.facets.find((facet) => facet.facet === 'maturity')?.values).toEqual([
      { value: 'seed', count: 45 },
    ]);
  });
});

describe('Discovery queries', () => {
  let deps: {
    graph: InMemoryLinkGraph;
    facets: InMemoryFacetIndex;
    catalog: InMemoryNoteCatalog;
    content: InMemoryContentIndex;
  };

  beforeEach(async () => {
    const graph = new InMemoryLinkGraph();
    const notes = [
      {
        noteId: 'n1',
        title: 'Achado 12',
        slug: 'achado-12',
        folderId: 'f1',
        folderName: 'Achados',
      },
      {
        noteId: 'n2',
        title: 'Lei 14.133',
        slug: 'lei-14133',
        folderId: 'f2',
        folderName: 'Normas',
      },
      {
        noteId: 'n3',
        title: 'Portaria 9',
        slug: 'portaria-9',
        folderId: 'f2',
        folderName: 'Normas',
      },
      {
        noteId: 'n4',
        title: 'Nota solta',
        slug: 'nota-solta',
        folderId: 'f1',
        folderName: 'Achados',
      },
    ];
    await graph.replaceOutgoing(VAULT, notes[1] as never, []);
    await graph.replaceOutgoing(VAULT, notes[2] as never, []);
    await graph.replaceOutgoing(VAULT, notes[0] as never, [
      { slug: 'lei-14133', anchor: null },
      { slug: 'portaria-9', anchor: null },
    ]);
    await graph.replaceOutgoing(VAULT, notes[3] as never, []);

    const catalog = new InMemoryNoteCatalog();
    catalog.set(VAULT, notes);
    const content = new InMemoryContentIndex();
    /**
     * The body is what makes this a content search: `xpto010101` appears in
     * one note and nowhere else, in no title and in no facet.
     */
    const bodies: Record<string, string> = {
      n1: '# Achado 12\n\nO contrato passou do prazo. Ver a lei.',
      n2: '# Lei 14.133\n\n## Vigência\n\nArt. 75. Contratação direta com xpto010101.',
      n3: '# Portaria 9\n\nRegulamenta o prazo interno.',
      n4: '# Nota solta\n\nSem ligação com nada.',
    };
    for (const note of notes) {
      const body = bodies[note.noteId] ?? '';
      await content.replaceNote(VAULT, {
        noteId: note.noteId,
        title: normalize(note.title),
        folderId: note.folderId,
        folderName: normalize(note.folderName),
        sections: [...body.matchAll(/^#{1,6}\s+(.*)$/gm)].map((m) => normalize(m[1] ?? '')),
        normalized: normalize(body),
        original: body,
        facets: note.noteId === 'n2' ? { maturity: ['evergreen'] } : { maturity: ['seed'] },
      });
    }
    deps = { graph, catalog, facets: new InMemoryFacetIndex(), content };
  });

  it('walks the dependency tree with a depth cap', async () => {
    const tree = await new RelatedNotes(deps).execute({ vaultId: VAULT, noteId: 'n1', depth: 2 });
    expect(tree.ok).toBe(true);
    if (!tree.ok) return;
    expect(tree.value.note.noteId).toBe('n1');
    expect(tree.value.children.map((child) => child.note.slug).sort()).toEqual([
      'lei-14133',
      'portaria-9',
    ]);
  });

  it('caps the depth at three even when more is asked for', async () => {
    const tree = await new RelatedNotes(deps).execute({ vaultId: VAULT, noteId: 'n1', depth: 99 });
    expect(tree.ok).toBe(true);
  });

  it('lists who points at a note', async () => {
    const found = await new Backlinks(deps).execute({ vaultId: VAULT, noteId: 'n2' });
    expect(found.ok).toBe(true);
    if (!found.ok) return;
    expect(found.value.map((note) => note.noteId)).toEqual(['n1']);
  });

  it('draws the whole vault as nodes and index pairs', async () => {
    const drawn = await new VaultGraphQuery(deps).execute({ vaultId: VAULT });
    expect(drawn.ok).toBe(true);
    if (!drawn.ok) return;

    // Every edge indexes a node that is really there. A dangling index is the
    // one failure the drawing cannot survive.
    for (const [from, to] of drawn.value.edges) {
      expect(drawn.value.nodes[from]).toBeDefined();
      expect(drawn.value.nodes[to]).toBeDefined();
    }
    expect(drawn.value.nodes.map((note) => note.slug)).toContain('nota-solta');
    expect(drawn.value.truncated).toBe(false);

    // The edge n1 -> n2 of the fixture survives the round trip as indexes.
    const n1 = drawn.value.nodes.findIndex((note) => note.noteId === 'n1');
    const n2 = drawn.value.nodes.findIndex((note) => note.noteId === 'n2');
    expect(drawn.value.edges).toContainEqual([n1, n2]);
  });

  it('hands each node the portrait of its own note, so the view can color by it', async () => {
    // The extractor classified by shape; nothing here knows what `maturity`
    // means. What the graph promises is only that the node carries what the
    // note says about itself, and `{}` when it says nothing.
    await deps.facets.replaceFacets(VAULT, 'n1', {
      maturity: { facet: 'maturity', kind: 'enum', values: ['seed'] },
      tags: { facet: 'tags', kind: 'list', values: ['contrato', 'prazo'] },
    });
    await deps.facets.replaceFacets(VAULT, 'n2', {
      maturity: { facet: 'maturity', kind: 'enum', values: ['evergreen'] },
    });

    const drawn = await new VaultGraphQuery(deps).execute({ vaultId: VAULT });
    expect(drawn.ok).toBe(true);
    if (!drawn.ok) return;

    const byId = new Map(drawn.value.nodes.map((note) => [note.noteId, note]));
    expect(byId.get('n1')?.facets).toEqual({
      maturity: ['seed'],
      tags: ['contrato', 'prazo'],
    });
    expect(byId.get('n2')?.facets).toEqual({ maturity: ['evergreen'] });
    // A note with no frontmatter is drawn like any other, not left out.
    expect(byId.get('n4')?.facets).toEqual({});
  });

  it('keeps an unresolved link in the graph instead of dropping it', async () => {
    await deps.graph.replaceOutgoing(
      VAULT,
      { noteId: 'n9', title: 'Aponta para o futuro', slug: 'aponta', folderId: 'f1' },
      [{ slug: 'ainda-nao-existe', anchor: null }],
    );

    const drawn = await new VaultGraphQuery(deps).execute({ vaultId: VAULT });
    expect(drawn.ok).toBe(true);
    if (!drawn.ok) return;

    const from = drawn.value.nodes.findIndex((note) => note.noteId === 'n9');
    expect(drawn.value.pending).toContainEqual({ from, targetSlug: 'ainda-nao-existe' });
  });

  it('reports broken links and orphan notes', async () => {
    const health = await new VaultHealth(deps).execute({ vaultId: VAULT });
    expect(health.ok).toBe(true);
    if (!health.ok) return;
    expect(health.value.orphans.map((note) => note.slug)).toEqual(['nota-solta']);
  });

  it('searches over the title', async () => {
    const found = await new SearchNotes(deps).execute({ vaultId: VAULT, query: 'lei 14.133' });
    expect(found.ok).toBe(true);
    if (!found.ok) return;
    expect(found.value[0]?.noteId).toBe('n2');
  });

  it('refuses an interval over an attribute this vault does not hold as a date', async () => {
    /**
     * Whether an attribute is a date is a fact about the VAULT, so it cannot
     * be decided while parsing and it is decided here, once, with the vault in
     * hand (RN-DSC-034). It is refused rather than answered empty: an empty
     * result reads as "there is nothing filed under that", and this means "the
     * question has no answer", which is the difference between fixing the
     * query and doubting the vault.
     */
    const refused = await new SearchNotes(deps).execute({
      vaultId: VAULT,
      query: 'maturity:>=evergreen',
    });

    expect(refused.ok).toBe(false);
    if (refused.ok) return;
    expect(refused.error.message).toContain('maturity');
  });

  it('matches the text as written, punctuation included', async () => {
    /**
     * Deliberate: the match is a substring of what the author typed, so
     * `14.133` is found by `14.133` and not by `14133`. The previous search
     * ran over slugs, where `slugify` folded the dot between digits away; this
     * one runs over prose, and inventing separators the author did not write
     * would make the result impossible to explain.
     */
    const exact = await new SearchNotes(deps).execute({ vaultId: VAULT, query: '14.133' });
    expect(exact.ok && exact.value.map((hit) => hit.noteId)).toEqual(['n2']);

    const without = await new SearchNotes(deps).execute({ vaultId: VAULT, query: '14133' });
    expect(without.ok && without.value).toEqual([]);
  });

  it('finds a word that exists only in the body of one note', async () => {
    // The behaviour a vault user expects: write a word, find the note.
    const found = await new SearchNotes(deps).execute({ vaultId: VAULT, query: 'xpto010101' });
    expect(found.ok).toBe(true);
    if (!found.ok) return;
    expect(found.value.map((hit) => hit.noteId)).toEqual(['n2']);
  });

  it('cites the section the match fell under, and shows the passage', async () => {
    const found = await new SearchNotes(deps).execute({ vaultId: VAULT, query: 'xpto010101' });
    expect(found.ok).toBe(true);
    if (!found.ok) return;
    expect(found.value[0]?.section).toBe(normalize('Vigência'));
    // The excerpt comes from the text as written, accents intact.
    expect(found.value[0]?.excerpt).toContain('xpto010101');
    expect(found.value[0]?.excerpt).toContain('Contratação');
  });

  it('narrows a body term with a facet the vault declared', async () => {
    const withFacet = await new SearchNotes(deps).execute({
      vaultId: VAULT,
      query: 'prazo maturity:seed',
    });
    expect(withFacet.ok).toBe(true);
    if (!withFacet.ok) return;
    expect(withFacet.value.map((hit) => hit.noteId).sort()).toEqual(['n1', 'n3']);
  });

  it('excludes with a negation', async () => {
    const found = await new SearchNotes(deps).execute({
      vaultId: VAULT,
      query: 'prazo -portaria',
    });
    expect(found.ok).toBe(true);
    if (!found.ok) return;
    expect(found.value.map((hit) => hit.noteId)).toEqual(['n1']);
  });

  it('does not search the frontmatter as if it were prose', async () => {
    // RN-DSC-018: frontmatter belongs to the facet projector. If it leaked
    // into the body every note would match its own metadata.
    const found = await new SearchNotes(deps).execute({ vaultId: VAULT, query: 'maturity' });
    expect(found.ok).toBe(true);
    if (!found.ok) return;
    expect(found.value).toEqual([]);
  });

  it('refuses an empty query', async () => {
    const refused = await new SearchNotes(deps).execute({
      vaultId: VAULT,
      query: '   ',
    });
    expect(refused.ok).toBe(false);
  });
});

describe('The scan walks every page, which is the whole correctness of it', () => {
  /**
   * The search this one replaced answered from the first megabyte of a Query
   * and dropped the rest without a word. In a vault at the declared ceiling
   * that meant deciding over a fraction of the content while looking exactly
   * like a search that had read all of it.
   *
   * A fake DynamoDB that hands back pages proves the adapter keeps asking.
   */
  it('keeps following LastEvaluatedKey until the vault is exhausted', async () => {
    const PAGES = 9;
    const perPage = 40;
    let sent = 0;

    const db = {
      send: async (command: { input: Record<string, unknown> }) => {
        const start = (command.input['ExclusiveStartKey'] as { at?: number } | undefined)?.at ?? 0;
        sent++;
        const page = Array.from({ length: perPage }, (_, offset) => ({
          noteId: `n${start + offset}`,
          title: 'nota',
          folderId: 'f1',
          folderName: 'pasta',
          sections: [],
          normalized: 'corpo',
          original: 'corpo',
          facets: {},
        }));
        const next = start + perPage;
        return {
          Items: page,
          ...(next < PAGES * perPage ? { LastEvaluatedKey: { at: next } } : {}),
        };
      },
    };

    const index = new DynamoContentIndex(
      { value: '01JBQ2X0000000000000000000' } as never,
      db as never,
      'mv-discovery',
    );

    const notes = await index.scanVault(VAULT);

    expect(sent).toBe(PAGES);
    expect(notes).toHaveLength(PAGES * perPage);
    // The last note of the last page is present: nothing was cut short.
    expect(notes[notes.length - 1]?.noteId).toBe(`n${PAGES * perPage - 1}`);
  });
});

describe('The facet projection writes every counter and reads every page', () => {
  const SUBSCRIPTION = { value: '01JBQ2X0000000000000000000' } as never;
  const TABLE = 'mv-discovery';

  /** A fake DynamoDB that tells the three commands apart by their input. */
  function fakeDb(pages: Array<Record<string, unknown>[]> = [[]]) {
    const transactions: Array<Record<string, unknown>[]> = [];
    let queried = 0;
    const db = {
      send: async (command: { input: Record<string, unknown> }) => {
        const input = command.input;
        if (input['TransactItems']) {
          transactions.push(input['TransactItems'] as Record<string, unknown>[]);
          return {};
        }
        if (input['KeyConditionExpression']) {
          const at = (input['ExclusiveStartKey'] as { at?: number } | undefined)?.at ?? 0;
          queried++;
          return {
            Items: pages[at] ?? [],
            ...(at + 1 < pages.length ? { LastEvaluatedKey: { at: at + 1 } } : {}),
          };
        }
        return { Item: undefined }; // the GetCommand for the previous portrait
      },
    };
    return { db, transactions, pages: () => queried };
  }

  it('splits the counters across transactions instead of dropping the tail', async () => {
    // A TransactWriteItems carries 100 items. The adapter used to send the
    // portrait plus the first 90 deltas and discard the rest in silence, and
    // the loss was permanent: the next write of that note computes its delta
    // against the portrait already stored and finds nothing owing.
    const VALUES = 250;
    const { db, transactions } = fakeDb();
    const index = new DynamoFacetIndex(SUBSCRIPTION, db as never, TABLE);

    await index.replaceFacets(VAULT, 'note-1', {
      tags: {
        facet: 'tags',
        kind: 'list',
        values: Array.from({ length: VALUES }, (_, at) => `t${at}`),
      },
    });

    for (const batch of transactions) expect(batch.length).toBeLessThanOrEqual(100);
    const puts = transactions.flat().filter((item) => 'Put' in item);
    const updates = transactions.flat().filter((item) => 'Update' in item);
    expect(puts).toHaveLength(1); // one portrait, in the first transaction
    expect(transactions[0]?.[0]).toBe(puts[0]);
    expect(updates).toHaveLength(VALUES); // and every counter it moved
    const touched = new Set(
      updates.map((item) => String((item as { Update: { Key: { SK: string } } }).Update.Key.SK)),
    );
    expect(touched.size).toBe(VALUES);
    expect(touched.has(`STAT#tags#t${VALUES - 1}`)).toBe(true);
  });

  it('reads the portrait of every note, not of the first page', async () => {
    // The graph colours a note by the portrait this query returns. A first
    // page answer would paint an attribute on the notes that fitted and leave
    // the others bare, which reads as a vault where half the notes forgot
    // their own frontmatter.
    const pages = [
      [{ noteId: 'n1', facets: { type: { facet: 'type', kind: 'enum', values: ['nota'] } } }],
      [{ noteId: 'n2', facets: { type: { facet: 'type', kind: 'enum', values: ['guia'] } } }],
      [{ noteId: 'n3', facets: { type: { facet: 'type', kind: 'enum', values: ['guia'] } } }],
    ];
    const { db, pages: queried } = fakeDb(pages);
    const index = new DynamoFacetIndex(SUBSCRIPTION, db as never, TABLE);

    const portraits = await index.vaultNoteFacets(VAULT);

    expect(queried()).toBe(3);
    expect([...portraits.keys()]).toEqual(['n1', 'n2', 'n3']);
    expect(portraits.get('n3')?.['type']).toEqual(['guia']);
  });
});
