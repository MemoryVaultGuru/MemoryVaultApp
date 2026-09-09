/**
 * Export use case (architecture-guide.md, section 16).
 *
 * A vault leaves as **one document**, zipped, with the extension `.vault`
 * (RN-PRT-009). It is built from the Vault aggregate and its notes; the bodies
 * come from the ContentStore through the CURRENT ContentRef of each one, and
 * they are copied and never processed.
 *
 * Nothing derived is written (RN-PRT-010): no title, no slug, no numeric
 * prefix. What used to derive them was the materialised tree, and it is gone
 * with the file names it existed to invent.
 *
 * Deleted notes do not enter the export (RN-PRT-006).
 */

import { DomainError, err, Instant, ok, ulid, type Result } from '@memorysmith/kernel';
import {
  archiveNameOf,
  buildVaultDocument,
  type ExportInput,
  type VaultDocument,
} from '../domain/VaultDocumentBuilder.js';

/** What the Knowledge context hands over for an export. */
export interface ExportSource {
  load(vaultId: string): Promise<ExportInput | null>;
}

/** Where the archive lands, and how the caller reaches it. */
export interface ArchiveStore {
  put(key: string, archive: Buffer): Promise<void>;
  /**
   * A short-lived URL for that one object. `filename` is what the browser
   * saves it as: the identifier addresses the object, the name of the vault
   * is what the person recognizes in their downloads folder.
   */
  presign(key: string, expiresInSeconds: number, filename: string): Promise<string>;
}

export interface ExportJob {
  readonly exportId: string;
  readonly vaultId: string;
  readonly status: 'ready';
  readonly downloadUrl: string;
  readonly expiresAt: string;
  readonly noteCount: number;
  readonly bytes: number;
}

const URL_TTL_SECONDS = 900;

export class ExportVault {
  constructor(
    private readonly source: ExportSource,
    private readonly archives: ArchiveStore,
    private readonly zip: (files: Array<{ path: string; content: string }>, now: Date) => Buffer,
    private readonly subscriptionId: string,
    /**
     * Turns the document into the bytes of the one entry of the archive, and
     * validates it against the published schema on the way. It is injected
     * because the schema lives in the contracts package, which neither the
     * domain nor this layer may import (RN-PRT-011).
     */
    private readonly serialize: (document: VaultDocument) => { entry: string; content: string },
    private readonly specVersion: string,
  ) {}

  async execute(input: { vaultId: string; now: Instant }): Promise<Result<ExportJob, DomainError>> {
    const source = await this.source.load(input.vaultId);
    if (!source) return err(DomainError.notFound('Vault not found'));

    // Validated against the published schema before it is written: the export
    // writes nothing the schema does not describe, which is what makes the
    // format a specification rather than whatever this function happened to
    // produce (RN-PRT-011).
    const document = buildVaultDocument(source, input.now.toISOString(), this.specVersion);
    const written = this.serialize(document);
    const archive = this.zip(
      [{ path: written.entry, content: written.content }],
      new Date(input.now.epochMillis),
    );

    const exportId = ulid();
    // The archive lives under the same subscription prefix as everything else.
    const key = `s/${this.subscriptionId}/exports/${exportId}.vault`;
    await this.archives.put(key, archive);

    const expiresAt = Instant.fromEpochMillis(input.now.epochMillis + URL_TTL_SECONDS * 1000);

    return ok({
      exportId,
      vaultId: input.vaultId,
      status: 'ready',
      downloadUrl: await this.archives.presign(
        key,
        URL_TTL_SECONDS,
        archiveNameOf(source.vaultName),
      ),
      // The moment the link stops working, which is the only expiry there is:
      // saying anything else here would promise a window that is not real.
      expiresAt: expiresAt.ok ? expiresAt.value.toISOString() : input.now.toISOString(),
      noteCount: source.notes.length,
      bytes: archive.length,
    });
  }
}
