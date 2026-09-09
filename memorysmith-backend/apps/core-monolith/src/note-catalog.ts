/**
 * The note catalogue Discovery reads for lexical search and for the orphan
 * report. It lives HERE, in the composition root, and not inside Discovery:
 * the list of notes belongs to the Knowledge context, and having Discovery
 * query it directly would invert the one-way arrow that makes the projections
 * rebuildable (architecture-guide.md, section 3.1).
 */

import type { NoteCatalog, NoteRef } from '@memorysmith/svc-discovery/domain';
import { VaultId } from '@memorysmith/kernel';

interface KnowledgeSide {
  readonly vaults: {
    findById(id: VaultId): Promise<{ folders: { get(id: never): unknown } } | null>;
  };
  readonly notes: {
    listByVault(vault: VaultId): Promise<
      Array<{
        id: { value: string };
        title: string | null;
        folderId: { value: string };
      }>
    >;
  };
}

export class KnowledgeNoteCatalog implements NoteCatalog {
  constructor(private readonly knowledge: KnowledgeSide) {}

  async listNotes(vaultId: string): Promise<Array<NoteRef & { folderName: string }>> {
    const parsed = VaultId.create(vaultId);
    if (!parsed.ok) return [];

    const vault = await this.knowledge.vaults.findById(parsed.value);
    if (!vault) return [];

    const notes = await this.knowledge.notes.listByVault(parsed.value);
    return notes.map((note) => ({
      noteId: note.id.value,
      title: note.title ?? '',
      // The aliases live in the body, which this catalogue does not read: it
      // answers what Knowledge holds, and the frontmatter is Discovery's to
      // read through its own projection (RN-DSC-052).
      aliases: [],
      folderId: note.folderId.value,
      folderName: '',
    }));
  }
}
