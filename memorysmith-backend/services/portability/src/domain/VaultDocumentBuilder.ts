/**
 * A vault as one document (software-vision.md §12, RN-PRT-009).
 *
 * **This is where file names used to come back into existence**, and they do
 * not any more. The export was a tree of `.md` files: the guidance became
 * `GUIDANCE.md`, the template `TEMPLATE.md`, the slug of a note a file name,
 * the order a numeric prefix, and the annotated tree a `STRUCTURE.md` that
 * nothing could read back. Every one of those was a **derivation**, and a
 * derivation on the way out is a second source of truth for what the vault
 * says — which is exactly what this cycle exists to end.
 *
 * So the document stores what the vault holds and nothing else: the note
 * bodies byte for byte, the positions as written, the identifiers as they are.
 * The title of a note is read from its body wherever it is needed (RN-PRT-010),
 * and the link destinations are never touched — which used to be a rewrite,
 * correct while a link addressed a file and corruption now that it addresses a
 * title (RN-PRT-004).
 *
 * Deleted notes do not enter the export (RN-PRT-006).
 */

/**
 * The shape is declared here and VALIDATED at the edge, against the schema the
 * contracts package publishes: `domain/` imports only the kernel, and a zod
 * schema is not the kernel. The composition root is what serialises a document
 * through that schema, so what reaches the archive is what the specification
 * of the format describes and nothing else (RN-PRT-011).
 */
export const VAULT_DOCUMENT_VERSION = '1.0';

export interface VaultDocument {
  readonly documentVersion: string;
  readonly specVersion: string;
  readonly exportedAt: string;
  readonly vault: {
    readonly name: string;
    readonly description: string;
    readonly guidance: string | null;
  };
  readonly folders: ReadonlyArray<{
    readonly folderId: string;
    readonly parentFolderId: string | null;
    readonly name: string;
    readonly description: string;
    readonly position: string;
    readonly template: string | null;
  }>;
  readonly notes: ReadonlyArray<{
    readonly noteId: string;
    readonly folderId: string;
    readonly position: string;
    readonly createdAt: string;
    readonly updatedAt: string;
    readonly body: string;
  }>;
}

/** What the Knowledge context hands over, with nothing computed. */
export interface ExportFolder {
  readonly folderId: string;
  readonly parentFolderId: string | null;
  readonly name: string;
  readonly description: string;
  readonly position: string;
  readonly templateContent: string | null;
}

export interface ExportNote {
  readonly noteId: string;
  readonly folderId: string;
  readonly position: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly content: string;
}

export interface ExportInput {
  readonly vaultName: string;
  readonly vaultDescription: string;
  readonly guidance: string | null;
  readonly folders: ExportFolder[];
  readonly notes: ExportNote[];
}

export function buildVaultDocument(
  input: ExportInput,
  now: string,
  specVersion: string,
): VaultDocument {
  return {
    documentVersion: VAULT_DOCUMENT_VERSION,
    specVersion,
    exportedAt: now,
    vault: {
      name: input.vaultName,
      description: input.vaultDescription,
      guidance: input.guidance,
    },
    folders: input.folders.map((folder) => ({
      folderId: folder.folderId,
      parentFolderId: folder.parentFolderId,
      name: folder.name,
      description: folder.description,
      position: folder.position,
      template: folder.templateContent,
    })),
    notes: input.notes.map((note) => ({
      noteId: note.noteId,
      folderId: note.folderId,
      position: note.position,
      createdAt: note.createdAt,
      updatedAt: note.updatedAt,
      // Byte for byte. Nothing here reads it and nothing here rewrites it.
      body: note.content,
    })),
  };
}

/** The name the archive is saved as, safe on every file system. */
export function archiveNameOf(vaultName: string): string {
  const safe = vaultName.replace(/[\\/:*?"<>|]/g, '-').trim();
  return `${safe.length > 0 ? safe : 'vault'}.vault`;
}
