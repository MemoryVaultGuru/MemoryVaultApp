/**
 * The ports svc-agent talks to. They are written in the vocabulary of the
 * PRODUCT, never of MCP: no tool name, no JSON-RPC, no protocol version
 * appears below (RN-AGT-008). Swapping protocol tomorrow is swapping the
 * adapter above these, and the domain does not notice.
 *
 * In the modular monolith the implementations call the use cases in process;
 * in the six-deployable shape they call the internal API over HTTP with IAM
 * auth. Either way this file is unchanged (architecture-guide.md, section 24).
 */

export interface AgentCaller {
  /** The human who authorized the connector; always present. */
  readonly userId: string;
  /** How to call that human, when the token says. Identity is not ours. */
  readonly email?: string | undefined;
  /** The CIMD client_id of the connector, which becomes the AgentIdentity. */
  readonly clientId: string;
  readonly clientName: string;
  /** Fixed at consent and unchanged for the life of the token (RN-SUB-014). */
  readonly subscriptionId: string;
}

export interface VaultListing {
  readonly vaultId: string;
  readonly name: string;
  readonly description: string;
  readonly noteCount: number;
}

/**
 * The title is what the chain read out of the content, and it is `null` when
 * the note has none a link could name (RN-KNW-036). It is reported rather than
 * shown as an empty string, which is what an agent needs in order to say so.
 */
export interface NoteListing {
  readonly noteId: string;
  readonly title: string | null;
  readonly folderId: string;
  readonly position: string;
}

export interface NoteContent {
  readonly noteId: string;
  readonly title: string | null;
  readonly content: string;
  readonly revision: string;
  readonly updatedAt: string;
}

export interface SearchHit {
  readonly noteId: string;
  readonly title: string;
  readonly section: string | null;
  readonly excerpt: string;
  readonly score: number;
}

export interface RelatedNode {
  readonly noteId: string;
  readonly title: string;
  readonly depth: number;
  readonly children: RelatedNode[];
}

export interface HistoryEntry {
  readonly occurredAt: string;
  readonly type: string;
  readonly userId: string;
  readonly agentName: string | null;
  readonly revision: string | null;
}

export interface FolderListing {
  readonly folderId: string;
  readonly parentFolderId: string | null;
  readonly name: string;
  readonly slug: string;
  readonly description: string;
}

/** Everything a tool can ask of the Knowledge context. */
export interface KnowledgeGateway {
  listVaults(caller: AgentCaller): Promise<VaultListing[]>;
  createVault(
    caller: AgentCaller,
    input: { name: string; description: string },
  ): Promise<VaultListing>;
  /** Soft delete: the vault leaves the listings and no byte is destroyed. */
  deleteVault(caller: AgentCaller, vaultId: string): Promise<void>;
  /** The revision the write is based on, null when the slot is still empty. */
  setGuidance(
    caller: AgentCaller,
    vaultId: string,
    content: string,
    baseRevision: string | null,
  ): Promise<void>;
  /** The guidance with its revision, which is what a write has to echo back. */
  guidance(
    caller: AgentCaller,
    vaultId: string,
  ): Promise<{ content: string; revision: string } | null>;
  createFolder(
    caller: AgentCaller,
    input: { vaultId: string; name: string; description: string; parentFolderId?: string },
  ): Promise<FolderListing>;
  /** The policy is explicit or it is not: there is no implicit default. */
  deleteFolder(
    caller: AgentCaller,
    input: { vaultId: string; folderId: string; policy: string },
  ): Promise<{ removedFolderIds: string[] }>;
  setTemplate(
    caller: AgentCaller,
    input: { vaultId: string; folderId: string; content: string; baseRevision: string | null },
  ): Promise<void>;
  deleteNote(caller: AgentCaller, vaultId: string, noteId: string): Promise<void>;
  vaultContext(caller: AgentCaller, vaultId: string): Promise<string>;
  template(
    caller: AgentCaller,
    vaultId: string,
    folderId: string,
  ): Promise<{ content: string; folderName: string; revision: string } | null>;
  listNotes(caller: AgentCaller, vaultId: string, folderId?: string): Promise<NoteListing[]>;
  readNote(caller: AgentCaller, vaultId: string, noteId: string): Promise<NoteContent>;
  createNote(
    caller: AgentCaller,
    input: { vaultId: string; folderId: string; content: string },
  ): Promise<NoteContent>;
  updateNote(
    caller: AgentCaller,
    input: { vaultId: string; noteId: string; content: string; baseRevision: string },
  ): Promise<NoteContent>;
  searchNotes(caller: AgentCaller, vaultId: string, query: string): Promise<SearchHit[]>;
}

export interface DiscoveryGateway {
  relatedNotes(
    caller: AgentCaller,
    input: { vaultId: string; noteId: string; depth?: number },
  ): Promise<RelatedNode>;
  backlinks(caller: AgentCaller, vaultId: string, noteId: string): Promise<NoteListing[]>;
}

export interface AuditGateway {
  noteHistory(caller: AgentCaller, vaultId: string, noteId: string): Promise<HistoryEntry[]>;
  revisionAt(
    caller: AgentCaller,
    input: { vaultId: string; noteId: string; asOf: string },
  ): Promise<NoteContent>;
}

/**
 * The error a gateway raises. The tool adapter turns it into an MCP error with
 * actionable text, and a missing-argument error carries the template along
 * when that is what the caller needs next (RN-AGT-003).
 */
export class GatewayError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'GatewayError';
  }
}
