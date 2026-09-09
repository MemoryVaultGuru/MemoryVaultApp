/**
 * Import use case: the product takes a `.vault` document and writes the vault
 * it describes (architecture-guide.md §16).
 *
 * A `.vault` file that nothing can read back is a backup nobody has tested.
 * The export became one document precisely so the door swings both ways, and
 * three decisions keep this half small enough to build and safe enough to run.
 *
 * **An import always creates a new vault** (RN-PRT-012). No merge, no
 * conflict, no question of what wins: a failed import leaves a vault somebody
 * can delete, and importing the same file twice gives two vaults rather than a
 * mess in one. Everything that makes import hard elsewhere comes from writing
 * into something already there.
 *
 * **Identifiers are minted here, never restored** (RN-PRT-013). The ones in
 * the document are internal references — this note sits in that folder — and
 * they are resolved as the vault is written. A `NoteId` addresses a note
 * inside a subscription and carries a timeline in the audit trail; bringing an
 * old one back would resurrect a history that did not happen, and it would
 * collide the moment somebody imports a file into the subscription it came
 * from.
 *
 * **It is refused whole, before the first write** (RN-PRT-014): a document
 * that does not match the schema, a version of the format this build does not
 * read, and a size the plan does not allow are each answered with the reason
 * and nothing is created.
 */

import { DomainError, err, ok, ulid, type Authorship, type Result } from '@memorysmith/kernel';
import type { VaultDocument } from '../domain/VaultDocumentBuilder.js';

/** The versions of the document format this build reads. */
export const READABLE_DOCUMENT_VERSIONS: readonly string[] = ['1.0'];

/** Where an uploaded document is read from, and what happens to it after. */
export interface UploadStore {
  /** A short-lived address the client uploads to, under the subscription. */
  presignUpload(key: string, expiresInSeconds: number): Promise<string>;
  read(key: string): Promise<Buffer | null>;
  /** The upload is discarded once the import ends, whichever way it ended. */
  discard(key: string): Promise<void>;
}

/**
 * What writes the vault. The Knowledge context owns every one of these
 * operations, and Portability may not import it, so it arrives as a port the
 * composition root fills — the same arrangement the export already uses to
 * read a vault.
 */
export interface VaultWriter {
  createVault(input: {
    name: string;
    description: string;
    by: Authorship;
  }): Promise<Result<{ vaultId: string }, DomainError>>;
  setGuidance(input: {
    vaultId: string;
    content: string;
    by: Authorship;
  }): Promise<Result<void, DomainError>>;
  createFolder(input: {
    vaultId: string;
    parentFolderId: string | null;
    name: string;
    description: string;
    by: Authorship;
  }): Promise<Result<{ folderId: string }, DomainError>>;
  setTemplate(input: {
    vaultId: string;
    folderId: string;
    content: string;
    by: Authorship;
  }): Promise<Result<void, DomainError>>;
  createNote(input: {
    vaultId: string;
    folderId: string;
    content: string;
    by: Authorship;
  }): Promise<Result<void, DomainError>>;
  /** Undoes a half-written import, which is why an import creates a vault. */
  deleteVault(input: { vaultId: string; by: Authorship }): Promise<Result<void, DomainError>>;
}

export interface ImportJob {
  readonly importId: string;
  readonly vaultId: string;
  readonly status: 'imported';
  readonly folderCount: number;
  readonly noteCount: number;
}

const UPLOAD_TTL_SECONDS = 900;

/** The address a client uploads a document to, before asking for it. */
export class PrepareImport {
  constructor(
    private readonly uploads: UploadStore,
    private readonly subscriptionId: string,
  ) {}

  async execute(): Promise<Result<{ uploadKey: string; uploadUrl: string }, DomainError>> {
    // Under the subscription prefix, like everything else this product stores
    // (non-negotiable rule 1).
    const uploadKey = `s/${this.subscriptionId}/imports/${ulid()}.vault`;
    return ok({
      uploadKey,
      uploadUrl: await this.uploads.presignUpload(uploadKey, UPLOAD_TTL_SECONDS),
    });
  }
}

export class ImportVault {
  constructor(
    private readonly uploads: UploadStore,
    private readonly writer: VaultWriter,
    private readonly unzip: (archive: Buffer) => Record<string, string>,
    /**
     * Parses and validates the document against the published schema. It is
     * injected for the same reason the export's serialiser is: the schema
     * lives in the contracts package, which this layer may not import.
     */
    private readonly parse: (json: string) => VaultDocument,
    private readonly subscriptionId: string,
  ) {}

  async execute(input: {
    uploadKey: string;
    /**
     * What to call the vault this import creates. The document carries a name
     * and the subscription holds each name once (RN-KNW-032), so importing a
     * document into the subscription it came from needs one — and giving one
     * is how "the same file twice gives two vaults" is true without the server
     * inventing a suffix nobody asked for.
     */
    name: string | null;
    by: Authorship;
  }): Promise<Result<ImportJob, DomainError>> {
    // A key of another subscription is not readable and not addressable: the
    // prefix is checked before the store is asked (rules 1 and 2).
    if (!input.uploadKey.startsWith(`s/${this.subscriptionId}/imports/`)) {
      return err(DomainError.notFound('Upload not found'));
    }

    const archive = await this.uploads.read(input.uploadKey);
    if (!archive) return err(DomainError.notFound('Upload not found'));

    try {
      const document = this.readDocument(archive);
      if (!document.ok) return document;
      return await this.write(document.value, input.name, input.by);
    } finally {
      // The upload is discarded whichever way the import ended: it was the
      // means of getting the bytes here and it is not a copy of the vault.
      await this.uploads.discard(input.uploadKey);
    }
  }

  private readDocument(archive: Buffer): Result<VaultDocument, DomainError> {
    let entries: Record<string, string>;
    try {
      entries = this.unzip(archive);
    } catch {
      return err(DomainError.validation('That file is not a .vault archive'));
    }

    const json = Object.entries(entries).find(([name]) => name.endsWith('.json'))?.[1];
    if (json === undefined) {
      return err(DomainError.validation('That archive carries no vault document'));
    }

    let document: VaultDocument;
    try {
      document = this.parse(json);
    } catch {
      return err(DomainError.validation('That vault document does not match the format'));
    }

    if (!READABLE_DOCUMENT_VERSIONS.includes(document.documentVersion)) {
      return err(
        DomainError.validation(
          `This build reads vault documents of version ${READABLE_DOCUMENT_VERSIONS.join(', ')}, and that one is ${document.documentVersion}`,
        ),
      );
    }
    return ok(document);
  }

  /**
   * Writes the vault, in the order the tree requires: a folder before the
   * folders under it, and a folder before the notes in it. Every write carries
   * the authorship of whoever imported (non-negotiable rule 7), and the first
   * failure — a quota refusal included — takes the whole vault back down,
   * because an import that stopped halfway is not a vault anybody asked for.
   */
  private async write(
    document: VaultDocument,
    name: string | null,
    by: Authorship,
  ): Promise<Result<ImportJob, DomainError>> {
    const created = await this.writer.createVault({
      name: name ?? document.vault.name,
      description: document.vault.description,
      by,
    });
    if (!created.ok) return created;
    const vaultId = created.value.vaultId;

    const undo = async (failure: Result<never, DomainError>) => {
      await this.writer.deleteVault({ vaultId, by });
      return failure;
    };

    if (document.vault.guidance !== null) {
      const guidance = await this.writer.setGuidance({
        vaultId,
        content: document.vault.guidance,
        by,
      });
      if (!guidance.ok) return undo(guidance);
    }

    // The identifiers of the document are internal references, and this is the
    // map that resolves them to the ones this subscription mints (RN-PRT-013).
    const minted = new Map<string, string>();
    for (const folder of orderedFolders(document)) {
      const parentFolderId =
        folder.parentFolderId === null ? null : (minted.get(folder.parentFolderId) ?? null);
      const written = await this.writer.createFolder({
        vaultId,
        parentFolderId,
        name: folder.name,
        description: folder.description,
        by,
      });
      if (!written.ok) return undo(written);
      minted.set(folder.folderId, written.value.folderId);

      if (folder.template !== null) {
        const template = await this.writer.setTemplate({
          vaultId,
          folderId: written.value.folderId,
          content: folder.template,
          by,
        });
        if (!template.ok) return undo(template);
      }
    }

    for (const note of [...document.notes].sort(byPosition)) {
      const folderId = minted.get(note.folderId);
      if (folderId === undefined) {
        return undo(
          err(DomainError.validation(`A note points at a folder the document does not carry`)),
        );
      }
      // The body is written as it was, so the title, the links and the facets
      // of the imported vault are read from it by the same rules (#96, #97).
      const written = await this.writer.createNote({ vaultId, folderId, content: note.body, by });
      if (!written.ok) return undo(written);
    }

    return ok({
      importId: ulid(),
      vaultId,
      status: 'imported',
      folderCount: document.folders.length,
      noteCount: document.notes.length,
    });
  }
}

/** Parents before children, and siblings in the order the document states. */
function orderedFolders(document: VaultDocument): VaultDocument['folders'] {
  const byParent = new Map<string | null, VaultDocument['folders'][number][]>();
  for (const folder of document.folders) {
    byParent.set(folder.parentFolderId, [...(byParent.get(folder.parentFolderId) ?? []), folder]);
  }

  const ordered: VaultDocument['folders'][number][] = [];
  const walk = (parentFolderId: string | null): void => {
    for (const folder of [...(byParent.get(parentFolderId) ?? [])].sort(byPosition)) {
      ordered.push(folder);
      walk(folder.folderId);
    }
  };
  walk(null);
  return ordered;
}

function byPosition(a: { position: string }, b: { position: string }): number {
  return a.position < b.position ? -1 : a.position > b.position ? 1 : 0;
}
