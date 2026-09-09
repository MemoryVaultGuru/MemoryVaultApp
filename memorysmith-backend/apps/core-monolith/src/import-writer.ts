/**
 * What an import writes with: the Knowledge use cases, behind the port
 * Portability declares.
 *
 * It lives HERE, in the composition root, for the reason `note-catalog.ts`
 * does: writing a vault belongs to the Knowledge context, Portability may not
 * import it, and joining the two is exactly what a composition root is for.
 *
 * Every call carries the `Authorship` of whoever imported (non-negotiable rule
 * 7), and every one of them goes through the ordinary use case — the quota,
 * the limits and the events of an import are the ones of any other write, and
 * an import that bypassed them would be a second way into the vault.
 */

import type { Authorship, DomainError, Result } from '@memorysmith/kernel';
import { FolderId, ok, VaultId, type SubscriptionId } from '@memorysmith/kernel';
import type { VaultWriter } from '@memorysmith/svc-portability/application/import';
import type {
  CreateVault,
  DeleteVault,
  PutGuidance,
} from '@memorysmith/svc-knowledge/application/vaults';
import type { CreateFolder, PutTemplate } from '@memorysmith/svc-knowledge/application/folders';
import type { CreateNote } from '@memorysmith/svc-knowledge/application/notes';
import type { RequestContext } from '@memorysmith/svc-knowledge/domain';

export interface KnowledgeWriteUseCases {
  readonly createVault: CreateVault;
  readonly putGuidance: PutGuidance;
  readonly createFolder: CreateFolder;
  readonly putTemplate: PutTemplate;
  readonly createNote: CreateNote;
  readonly deleteVault: DeleteVault;
}

export class KnowledgeVaultWriter implements VaultWriter {
  constructor(
    private readonly useCases: KnowledgeWriteUseCases,
    private readonly ctx: RequestContext,
    private readonly subscriptionId: SubscriptionId,
  ) {}

  async createVault(input: {
    name: string;
    description: string;
    by: Authorship;
  }): Promise<Result<{ vaultId: string }, DomainError>> {
    const created = await this.useCases.createVault.execute({
      ctx: this.ctx,
      name: input.name,
      description: input.description,
      subscriptionId: this.subscriptionId,
      by: input.by,
    });
    return created.ok ? ok({ vaultId: created.value.id.value }) : created;
  }

  async setGuidance(input: {
    vaultId: string;
    content: string;
    by: Authorship;
  }): Promise<Result<void, DomainError>> {
    const vaultId = VaultId.create(input.vaultId);
    if (!vaultId.ok) return vaultId;
    const written = await this.useCases.putGuidance.execute({
      ctx: this.ctx,
      vaultId: vaultId.value,
      content: input.content,
      // The vault was created by this import moments ago, so there is nothing
      // to conflict with: the slot is empty and this write says so.
      baseRevision: null,
      by: input.by,
    });
    return written.ok ? ok() : written;
  }

  async createFolder(input: {
    vaultId: string;
    parentFolderId: string | null;
    name: string;
    description: string;
    by: Authorship;
  }): Promise<Result<{ folderId: string }, DomainError>> {
    const vaultId = VaultId.create(input.vaultId);
    if (!vaultId.ok) return vaultId;
    const parent = input.parentFolderId === null ? null : FolderId.create(input.parentFolderId);
    if (parent && !parent.ok) return parent;

    const created = await this.useCases.createFolder.execute({
      ctx: this.ctx,
      vaultId: vaultId.value,
      parentFolderId: parent?.ok ? parent.value : null,
      name: input.name,
      description: input.description,
      afterFolderId: null,
      by: input.by,
    });
    return created.ok ? ok({ folderId: created.value.id.value }) : created;
  }

  async setTemplate(input: {
    vaultId: string;
    folderId: string;
    content: string;
    by: Authorship;
  }): Promise<Result<void, DomainError>> {
    const vaultId = VaultId.create(input.vaultId);
    if (!vaultId.ok) return vaultId;
    const folderId = FolderId.create(input.folderId);
    if (!folderId.ok) return folderId;

    const written = await this.useCases.putTemplate.execute({
      ctx: this.ctx,
      vaultId: vaultId.value,
      folderId: folderId.value,
      content: input.content,
      baseRevision: null,
      by: input.by,
    });
    return written.ok ? ok() : written;
  }

  async createNote(input: {
    vaultId: string;
    folderId: string;
    content: string;
    by: Authorship;
  }): Promise<Result<void, DomainError>> {
    const vaultId = VaultId.create(input.vaultId);
    if (!vaultId.ok) return vaultId;
    const folderId = FolderId.create(input.folderId);
    if (!folderId.ok) return folderId;

    const created = await this.useCases.createNote.execute({
      ctx: this.ctx,
      vaultId: vaultId.value,
      folderId: folderId.value,
      // The body as the document carries it. The title, the links and the
      // facets of the imported vault are read from these bytes by the same
      // rules that read any other note.
      content: input.content,
      afterNoteId: null,
      by: input.by,
    });
    return created.ok ? ok() : created;
  }

  async deleteVault(input: {
    vaultId: string;
    by: Authorship;
  }): Promise<Result<void, DomainError>> {
    const vaultId = VaultId.create(input.vaultId);
    if (!vaultId.ok) return vaultId;
    const deleted = await this.useCases.deleteVault.execute({
      ctx: this.ctx,
      vaultId: vaultId.value,
      by: input.by,
    });
    return deleted.ok ? ok() : deleted;
  }
}
