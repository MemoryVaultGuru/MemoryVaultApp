/**
 * Ports of the Discovery context (architecture-guide.md, section 11.4).
 *
 * The domain here knows Edge, Depth and Facet, and never knows AWS. Every
 * projection is DERIVED (PE5): deleting and rebuilding it from the notes is a
 * supported operation, and it is the recovery plan for all of them.
 */

import type { FacetKind, FacetSnapshot } from './FacetExtractor.js';

export interface NoteRef {
  readonly noteId: string;
  readonly title: string;
  readonly slug: string;
  readonly folderId: string;
}

export interface LinkTarget {
  readonly slug: string;
  readonly anchor: string | null;
}

export interface GraphNode {
  readonly note: NoteRef;
  readonly depth: number;
  readonly children: GraphNode[];
}

export interface BrokenLink {
  readonly fromNote: NoteRef;
  readonly targetSlug: string;
}

/** Depth is capped at 3 and the traversal at 200 nodes (RN-DSC-007). */
export const GRAPH_LIMITS = { maxDepth: 3, maxNodes: 200, maxVaultNodes: 2000 } as const;

/**
 * The whole link graph of one vault, which is what the projection already is:
 * the notes it knows and the edges between them. It is a different question
 * from the dependency tree, which walks OUT from one note under a depth
 * ceiling; here there is no root and no depth, only the shape of the vault.
 *
 * Edges are index pairs into `nodes` because a graph of any size repeats the
 * same identifiers on both ends, and an index costs two bytes where a ULID
 * costs twenty-six.
 */
export interface VaultGraph {
  readonly nodes: NoteRef[];
  readonly edges: Array<[number, number]>;
  /** Links whose target does not exist yet, kept so the UI can show them. */
  readonly pending: Array<{ from: number; targetSlug: string }>;
  /**
   * Whether `maxVaultNodes` cut the graph short. Never truncate in silence:
   * a partial graph that claims to be whole is worse than no graph.
   */
  readonly truncated: boolean;
}

/**
 * A node of the graph as the VIEW reads it: the note, plus the portrait the
 * facet projection already keeps of it. The portrait is what lets a reader
 * color the graph by an attribute the vault itself declares, and it costs one
 * more prefix query in the SAME partition the graph already read.
 *
 * The backend still does not interpret the note (PP4): these values were
 * classified by SHAPE by the FacetExtractor, and which of them means anything
 * is a decision of whoever authored the vault.
 */
export interface GraphNoteRef extends NoteRef {
  readonly facets: Record<string, string[]>;
}

export interface AnnotatedVaultGraph {
  readonly nodes: GraphNoteRef[];
  readonly edges: Array<[number, number]>;
  /** Links whose target does not exist yet, kept so the UI can show them. */
  readonly pending: Array<{ from: number; targetSlug: string }>;
  /**
   * Whether `maxVaultNodes` cut the graph short. Never truncate in silence:
   * a partial graph that claims to be whole is worse than no graph.
   */
  readonly truncated: boolean;
}

export interface LinkGraph {
  /** Replaces every outgoing edge of a note, resolving what it can. */
  replaceOutgoing(vaultId: string, note: NoteRef, links: LinkTarget[]): Promise<void>;
  /** Removes the note from the graph and returns its backlinks to pending. */
  removeNote(vaultId: string, noteId: string): Promise<void>;
  /** Resolves the pending links that were waiting for this slug to exist. */
  resolvePending(vaultId: string, note: NoteRef): Promise<number>;
  dependencyTree(vaultId: string, rootNoteId: string, depth: number): Promise<GraphNode | null>;
  backlinks(vaultId: string, noteId: string): Promise<NoteRef[]>;
  broken(vaultId: string): Promise<BrokenLink[]>;
  /** Every note and every edge of the vault, for the graph view. */
  wholeGraph(vaultId: string): Promise<VaultGraph>;
  orphans(vaultId: string, allNotes: NoteRef[]): Promise<NoteRef[]>;
}

/**
 * One search hit. `section` names the heading the match fell under, when the
 * match came from the body and a heading precedes it.
 */
export interface ScoredNote {
  readonly noteId: string;
  readonly section: string | null;
  readonly excerpt: string;
  readonly score: number;
}

/**
 * The searchable portrait of one note: everything the query language needs to
 * decide, already normalized, so the scan never normalizes on the hot path.
 *
 * The body is kept twice, normalized for matching and original for the
 * excerpt, because showing the reader a lowercased and unaccented passage
 * would be showing them a note nobody wrote.
 */
export interface IndexedNote {
  readonly noteId: string;
  readonly title: string;
  readonly folderId: string;
  readonly folderName: string;
  readonly sections: string[];
  readonly normalized: string;
  readonly original: string;
  readonly facets: Record<string, string[]>;
  /**
   * The other spellings of the title, from the reserved `aliases` key
   * (RN-DSC-032). Optional because an index written before this existed
   * answers without it, and a search must not stop working while the
   * projection is being rebuilt.
   */
  readonly aliases?: string[];
  /** The kind of each facet, so a date can be matched by prefix. */
  readonly facetKinds?: Record<string, string>;
}

/**
 * The content index, one per subscription like every other projection.
 *
 * `scanVault` MUST walk every page. The search that this one replaced answered
 * from the first megabyte and silently ignored the rest, which is the failure
 * mode this port exists to make impossible to repeat: a partial scan that
 * claims to be whole is worse than no search.
 */
export interface ContentIndex {
  replaceNote(vaultId: string, note: IndexedNote): Promise<void>;
  removeNote(vaultId: string, noteId: string): Promise<void>;
  scanVault(vaultId: string): Promise<IndexedNote[]>;
}

export interface FacetStats {
  readonly facets: Array<{
    facet: string;
    kind: FacetKind;
    values: Array<{ value: string; count: number }>;
    discarded: boolean;
  }>;
  readonly noteCount: number;
}

export interface FacetIndex {
  /** null means the note was deleted and its portrait must be withdrawn. */
  replaceFacets(vaultId: string, noteId: string, facets: FacetSnapshot | null): Promise<void>;
  vaultFacetStats(vaultId: string): Promise<FacetStats>;
  /**
   * The portrait of every note of the vault, keyed by note. The statistics
   * above answer "how many notes say X"; this answers "what does THIS note
   * say", which is the question the graph view asks in order to color a node.
   */
  vaultNoteFacets(vaultId: string): Promise<Map<string, Record<string, string[]>>>;
}

/** Lexical search lives here too: title and folder, no index of its own. */
export interface NoteCatalog {
  listNotes(vaultId: string): Promise<Array<NoteRef & { folderName: string }>>;
}
