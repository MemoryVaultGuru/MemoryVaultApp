/**
 * What the Knowledge context hands over for an export. It lives HERE, in the
 * composition root, for the same reason the note catalogue does: the vault and
 * its notes belong to Knowledge, and having Portability query them directly
 * would invert the one-way arrow between the contexts (architecture-guide.md,
 * section 3.1).
 *
 * Deleted notes never reach here: `listByVault` already leaves them out, which
 * is what RN-PRT-006 asks for.
 */

import { slugify, VaultId } from '@memorysmith/kernel';
import type {
  ContentStore,
  NoteRepository,
  VaultRepository,
} from '@memorysmith/svc-knowledge/domain';
import type { ExportSource } from '@memorysmith/svc-portability/application';
import type { ExportInput } from '@memorysmith/svc-portability/domain';

/**
 * How many blobs are read from the object store at once. One at a time makes
 * a six-hundred-note vault take longer than the request is allowed to live;
 * all at once opens six hundred sockets and gets throttled. This is the middle.
 */
const READ_CONCURRENCY = 24;

async function mapWithConcurrency<T, U>(
  items: T[],
  limit: number,
  map: (item: T) => Promise<U>,
): Promise<U[]> {
  const results: U[] = new Array<U>(items.length);
  let next = 0;

  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (let index = next++; index < items.length; index = next++) {
      results[index] = await map(items[index] as T);
    }
  });

  await Promise.all(workers);
  return results;
}

interface KnowledgeSide {
  readonly vaults: VaultRepository;
  readonly notes: NoteRepository;
  readonly content: ContentStore;
}

export class KnowledgeExportSource implements ExportSource {
  constructor(private readonly knowledge: KnowledgeSide) {}

  async load(vaultId: string): Promise<ExportInput | null> {
    const parsed = VaultId.create(vaultId);
    if (!parsed.ok) return null;

    const vault = await this.knowledge.vaults.findById(parsed.value);
    // A vault of another subscription never even reaches here: the key the
    // repository builds carries the subscription of the token (RN-SUB-004).
    if (!vault) return null;

    const folders = vault.folders.all();
    const notes = await this.knowledge.notes.listByVault(parsed.value);

    const [guidance, templates, bodies] = await Promise.all([
      vault.guidanceRef ? this.knowledge.content.read(vault.guidanceRef) : Promise.resolve(null),
      mapWithConcurrency(folders, READ_CONCURRENCY, async (folder) =>
        folder.templateRef ? this.knowledge.content.read(folder.templateRef) : null,
      ),
      mapWithConcurrency(notes, READ_CONCURRENCY, (note) =>
        this.knowledge.content.read(note.bodyRef),
      ),
    ]);

    return {
      vaultName: vault.name.value,
      guidance,
      folders: folders.map((folder, index) => ({
        folderId: folder.id.value,
        parentFolderId: folder.parentFolderId?.value ?? null,
        name: folder.name.value,
        description: folder.description.value,
        position: folder.position.value,
        templateContent: templates[index] ?? null,
      })),
      notes: notes.map((note, index) => ({
        noteId: note.id.value,
        folderId: note.folderId.value,
        title: note.title ?? '',
        // The file name of the export, and nothing else: a note carries no
        // slug any more, and two notes may carry one title (RN-KNW-037). The
        // numeric prefix the tree already writes is what keeps two files of
        // one title apart, and a note with no title falls back to its
        // identifier. The whole tree goes away in #101, where a vault leaves
        // as one document.
        slug: (note.title ? slugify(note.title) : '') || note.id.value.toLowerCase(),
        position: note.position.value,
        content: bodies[index] ?? '',
      })),
    };
  }
}
