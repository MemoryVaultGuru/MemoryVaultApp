/**
 * Discovery reads. Everything here answers from a projection: no query walks
 * notes, and none of them reaches the Knowledge context (RN-DSC-017).
 */

import { DomainError, err, ok, type Result } from '@memorysmith/kernel';
import {
  GRAPH_LIMITS,
  type AnnotatedVaultGraph,
  type ContentIndex,
  type FacetIndex,
  type FacetStats,
  type GraphNode,
  type IndexedNote,
  type LinkGraph,
  type NoteCatalog,
  type NoteRef,
  type ResolvedTarget,
  type ScoredNote,
  type BrokenLink,
} from '../domain/ports.js';
import {
  QuerySyntaxError,
  comparedFacets,
  excerptAround,
  firstTerm,
  matches,
  parseQuery,
  score,
  type Candidate,
} from '../domain/SearchQuery.js';

export interface QueryDependencies {
  readonly graph: LinkGraph;
  readonly facets: FacetIndex;
  readonly catalog: NoteCatalog;
  readonly content: ContentIndex;
}

function candidateOf(note: IndexedNote): Candidate {
  return {
    title: note.title,
    folder: note.folderName,
    content: note.normalized,
    sections: note.sections,
    // Both default rather than being required: an index written before these
    // were carried answers without them, and a search that stops working
    // while a projection is rebuilt is worse than one that finds a little
    // less for a few minutes.
    aliases: note.aliases ?? [],
    facets: note.facets,
    facetKinds: note.facetKinds ?? {},
  };
}

/**
 * The heading the match fell under: the last one that opens before it. A hit
 * that cites no section is one that landed above the first heading, and saying
 * null is more honest than naming a section it did not come from.
 */
function sectionOf(note: IndexedNote, needle: string): string | null {
  const at = note.normalized.indexOf(needle);
  if (at === -1) return null;

  let found: string | null = null;
  let cursor = 0;
  for (const section of note.sections) {
    const position = note.normalized.indexOf(section, cursor);
    if (position === -1 || position > at) break;
    found = section;
    cursor = position + section.length;
  }
  return found;
}

export class RelatedNotes {
  constructor(private readonly deps: QueryDependencies) {}

  async execute(input: {
    vaultId: string;
    noteId: string;
    depth?: number | undefined;
  }): Promise<Result<GraphNode, DomainError>> {
    // Without a ceiling a dense vault returns the whole vault and drowns the
    // agent (RN-DSC-007).
    const depth = Math.min(Math.max(input.depth ?? 2, 1), GRAPH_LIMITS.maxDepth);
    const tree = await this.deps.graph.dependencyTree(input.vaultId, input.noteId, depth);
    return tree ? ok(tree) : err(DomainError.notFound('Note not found'));
  }
}

export class Backlinks {
  constructor(private readonly deps: QueryDependencies) {}

  async execute(input: {
    vaultId: string;
    noteId: string;
  }): Promise<Result<NoteRef[], DomainError>> {
    return ok(await this.deps.graph.backlinks(input.vaultId, input.noteId));
  }
}

/**
 * What a link target names, for the interface that has to show it.
 *
 * A wikilink that resolves to exactly one note navigates to that note; when it
 * resolves to none or to several, the target itself gets an address, and this
 * is what answers it (RN-DSC-046). The comparison is the one §5.2 fixes —
 * NFC, case-exact — so the URL and the wikilink cannot disagree about which
 * note is which.
 */
export class ResolveLinkTarget {
  constructor(private readonly deps: QueryDependencies) {}

  async execute(input: {
    vaultId: string;
    target: string;
  }): Promise<Result<ResolvedTarget, DomainError>> {
    const target = input.target.trim();
    if (target.length === 0) return err(DomainError.validation('A link target cannot be empty'));
    return ok(await this.deps.graph.resolveTarget(input.vaultId, target));
  }
}

export class VaultHealth {
  constructor(private readonly deps: QueryDependencies) {}

  async execute(input: {
    vaultId: string;
  }): Promise<Result<{ broken: BrokenLink[]; orphans: NoteRef[] }, DomainError>> {
    const notes = await this.deps.catalog.listNotes(input.vaultId);
    return ok({
      broken: await this.deps.graph.broken(input.vaultId),
      orphans: await this.deps.graph.orphans(input.vaultId, notes),
    });
  }
}

/**
 * The shape of the whole vault, which the graph view draws. It reads one
 * projection and nothing else: Discovery never asks Knowledge for a note
 * (RN-DSC-017), and the notes it names are the ones its own projection knows.
 */
export class VaultGraphQuery {
  constructor(private readonly deps: QueryDependencies) {}

  async execute(input: { vaultId: string }): Promise<Result<AnnotatedVaultGraph, DomainError>> {
    // Two prefix queries in the same partition, in parallel: the shape of the
    // vault, and what each note says about itself. The second is what lets the
    // view color by an attribute; a note with no frontmatter carries `{}` and
    // is drawn as any other.
    const [graph, portraits] = await Promise.all([
      this.deps.graph.wholeGraph(input.vaultId),
      this.deps.facets.vaultNoteFacets(input.vaultId),
    ]);

    return ok({
      ...graph,
      nodes: graph.nodes.map((note) => ({
        ...note,
        facets: portraits.get(note.noteId) ?? {},
      })),
    });
  }
}

export class SearchNotes {
  constructor(private readonly deps: QueryDependencies) {}

  /**
   * The search reads the content index of the vault and evaluates the query
   * against every note in it. A hit always cites the note it came from, and
   * the section when the match fell under a heading (RN-DSC-010).
   *
   * Scanning the whole vault is a deliberate choice, not a shortcut. The vault
   * ceiling is 2.000 notes (RN-KNW-010), which is about 8 MB, and at that size
   * a scan is cheaper and far simpler than an inverted index that would have
   * to be kept in step with every write. What the scan may never do is stop
   * early: `scanVault` walks every page, and the test below proves it.
   */
  async execute(input: {
    vaultId: string;
    query: string;
    k?: number | undefined;
  }): Promise<Result<ScoredNote[], DomainError>> {
    let tree;
    try {
      tree = parseQuery(input.query);
    } catch (error) {
      if (error instanceof QuerySyntaxError) return err(DomainError.validation(error.message));
      throw error;
    }

    const notes = await this.deps.content.scanVault(input.vaultId);

    /**
     * An interval only means something over a date, and whether an attribute
     * IS a date is a fact about this vault rather than about the query string
     * — so it is checked here, once, with the vault in hand (RN-DSC-034).
     *
     * It is refused rather than answered empty. An empty result reads as
     * "there is nothing filed under that", and `maturity:>=evergreen` does
     * not mean that: it means the question has no answer, and being told so
     * is the difference between fixing the query and doubting the vault.
     */
    const dated = new Set(
      notes.flatMap((note) =>
        Object.entries(note.facetKinds ?? {})
          .filter(([, kind]) => kind === 'date')
          .map(([facet]) => facet),
      ),
    );
    const undatable = [...new Set(comparedFacets(tree))].filter((facet) => !dated.has(facet));
    if (undatable.length > 0) {
      return err(
        DomainError.validation(
          `An interval only works over a date. In this vault, ${undatable.join(' and ')} ` +
            `${undatable.length === 1 ? 'is' : 'are'} not one.`,
        ),
      );
    }

    const needle = firstTerm(tree);

    const hits = notes
      .map((note) => ({ note, candidate: candidateOf(note) }))
      .filter(({ candidate }) => matches(tree, candidate))
      .map(({ note, candidate }) => ({
        noteId: note.noteId,
        section: needle ? sectionOf(note, needle) : null,
        excerpt: needle ? excerptAround(note.original, note.normalized, needle) : note.title,
        score: score(tree, candidate),
      }))
      .sort((left, right) => right.score - left.score)
      .slice(0, input.k ?? 10);

    return ok(hits);
  }
}

/** The curation panel: one Query over the counters, no note is touched. */
export class GetFacetStats {
  constructor(private readonly deps: QueryDependencies) {}

  async execute(input: { vaultId: string }): Promise<Result<FacetStats, DomainError>> {
    return ok(await this.deps.facets.vaultFacetStats(input.vaultId));
  }
}
