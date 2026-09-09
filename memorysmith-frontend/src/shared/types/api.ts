// DTO shapes mirror the future internal API (architecture-guide.md §14.1).
// The seed adapter fills them today; the HTTP client will fill them tomorrow.

export interface VaultSummary {
  id: string;
  slug: string;
  name: string;
  description: string;
  noteCount: number;
  /** ISO instant of the last write in the vault, formatted at the edge. */
  updatedAt: string;
}

export interface NoteSummary {
  id: string;
  /**
   * The address of the note in this interface, computed here from the title.
   * It is a client-side convenience and not a property of the note: the API
   * carries none, and #98 replaces it with the identifier of the note.
   */
  slug: string;
  /** `null` when the content of the note states no title a link could name. */
  title: string | null;
  folderId: string;
}

export interface FolderNode {
  id: string;
  parentId: string | null;
  name: string;
  slug: string;
  slugPath: string;
  description: string;
  position: number;
  hasTemplate: boolean;
  noteCount: number;
  notes: NoteSummary[];
  children: FolderNode[];
}

export interface VaultStructure {
  vault: VaultSummary;
  guidance: string | null;
  /** The revision of the guidance slot, null when nothing is written yet. */
  guidanceRevision: string | null;
  /** min(papel de assinatura, teto do vault), owner acima dos dois. */
  effectiveRole: string;
  folders: FolderNode[];
}

export interface NoteDetail {
  id: string;
  vaultSlug: string;
  slug: string;
  /** `null` when the content of the note states no title a link could name. */
  title: string | null;
  folderNames: string[];
  frontmatter: Record<string, string>;
  /** Which of those the vault wrote as a list; they are drawn as chips. */
  listProperties: string[];
  body: string;
  raw: string;
  /** The revision a write has to echo back (RN-AGT-005). */
  revision: string;
}

/**
 * One hit of a vault search. The identifier is the note's, which the caller
 * resolves against the structure it has already loaded; the excerpt is the
 * passage around the match, cut from the text as the author wrote it, and the
 * section is the heading it fell under when it fell under one.
 */
export interface SearchHit {
  noteId: string;
  section: string | null;
  excerpt: string;
  score: number;
}

export interface TemplateDetail {
  folderId: string;
  body: string;
  /** The revision a write has to echo back (RN-KNW-034). */
  revision: string;
}
