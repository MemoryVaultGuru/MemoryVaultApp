/**
 * The note catalogue Discovery reads for lexical search and for the orphan
 * report. It lives HERE, in the composition root, and not inside Discovery:
 * the list of notes belongs to the Knowledge context, and having Discovery
 * query it directly would invert the one-way arrow that makes the projections
 * rebuildable (architecture-guide.md, section 3.1).
 */

import type { NoteCatalog, NoteRef } from '@memorysmith/svc-discovery/domain';
import { slugify, VaultId } from '@memorysmith/kernel';

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
      // Discovery still keys a link by slug, and it stops doing so in #97,
      // where a link resolves against the title itself. Until then the slug is
      // computed here, from the title the chain read, so the graph of the
      // branch keeps the edges it had.
      slug: slugify(note.title ?? ''),
      folderId: note.folderId.value,
      folderName: '',
    }));
  }
}
