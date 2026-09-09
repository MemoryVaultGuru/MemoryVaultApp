/**
 * Aggregate to DTO. The wire shape is the contract package, so the frontend
 * and the backend cannot drift: both import the same schemas.
 */

import type { Role } from '@memorysmith/kernel';
import type {
  ContentDto,
  FolderDto,
  NoteDto,
  NoteSummaryDto,
  VaultDetailDto,
  VaultSummaryDto,
} from '@memorysmith/contracts';
import type { Note } from '../../../domain/note/Note.js';
import type { Vault } from '../../../domain/vault/Vault.js';
import type { Folder } from '../../../domain/vault/Folder.js';

export function folderToDto(folder: Folder, vault: Vault): FolderDto {
  return {
    folderId: folder.id.value,
    parentFolderId: folder.parentFolderId?.value ?? null,
    name: folder.name.value,
    slug: folder.slug.value,
    description: folder.description.value,
    position: folder.position.value,
    hasTemplate: folder.hasTemplate,
    noteCount: vault.noteCountOf(folder.id),
  };
}

export function vaultToSummary(vault: Vault, role: Role): VaultSummaryDto {
  return {
    vaultId: vault.id.value,
    name: vault.name.value,
    slug: vault.slug.value,
    description: vault.description.value,
    noteCount: vault.noteCount,
    hasGuidance: vault.hasGuidance,
    updatedAt: vault.updatedAt.toISOString(),
    effectiveRole: role.name,
  };
}

export function vaultToDetail(vault: Vault, role: Role, guidance: string | null): VaultDetailDto {
  return {
    ...vaultToSummary(vault, role),
    // The tree in the DEFINED order, which is signal and not decoration (PP9).
    folders: vault.folders.inOrder().map((folder) => folderToDto(folder, vault)),
    guidance:
      guidance !== null && vault.guidanceRef
        ? { content: guidance, revision: vault.guidanceRef.toJSON() }
        : null,
  };
}

export function noteToSummary(note: Note): NoteSummaryDto {
  return {
    noteId: note.id.value,
    vaultId: note.vaultId.value,
    folderId: note.folderId.value,
    title: note.title,
    position: note.position.value,
    bytes: note.bodyRef.bytes,
    updatedAt: note.updatedBy.at.toISOString(),
    updatedBy: note.updatedBy.toJSON(),
  };
}

export function noteToDto(note: Note, content: string): NoteDto {
  return {
    ...noteToSummary(note),
    content,
    // The revision the caller must echo back as baseRevision (RN-AGT-005).
    revision: note.bodyRef.toJSON(),
    createdBy: note.createdBy.toJSON(),
    deletedAt: note.deletedAt?.toISOString() ?? null,
  };
}

export function contentToDto(content: string, revision: NoteDto['revision']): ContentDto {
  return { content, revision };
}
