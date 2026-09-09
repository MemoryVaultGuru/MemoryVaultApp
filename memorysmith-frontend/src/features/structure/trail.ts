import type { FolderNode } from '../../shared/types/api';
import { noteIdOf } from '../../shared/api/note-address';

// Folder chain from the vault root down to the folder at slugPath, or [] when
// no folder matches.
export function folderTrail(folders: FolderNode[], slugPath: string): FolderNode[] {
  for (const folder of folders) {
    if (folder.slugPath === slugPath) return [folder];
    const nested = folderTrail(folder.children, slugPath);
    if (nested.length) return [folder, ...nested];
  }
  return [];
}

/**
 * The identifier of the note a `root/*` path names, or null when it names
 * anything else: the vault root, a folder, or something that is no longer
 * there.
 *
 * **It answers from the shape of the last segment**, not from the structure.
 * A note is addressed by `<label>--<noteId>`, and the identifier is the only
 * part that is read (RN-DSC-055), so a stale label, a wrong folder trail or no
 * label at all still names the note. Asking the structure was what made a
 * remembered address break the moment a note was retitled.
 *
 * Two callers need exactly this question and they must not answer it apart.
 * `FolderRoute` asks it to decide what to render, and resuming a reading asks
 * it before navigating.
 */
export function noteAt(folders: FolderNode[], path: string): string | null {
  if (!path || folderTrail(folders, path).length) return null;
  const cut = path.lastIndexOf('/');
  return noteIdOf(cut >= 0 ? path.slice(cut + 1) : path);
}

// Folder chain from the vault root down to the folder holding the note, or []
// when the note is not in the tree.
export function folderTrailForNote(folders: FolderNode[], noteId: string): FolderNode[] {
  for (const folder of folders) {
    if (folder.notes.some((note) => note.id === noteId)) return [folder];
    const nested = folderTrailForNote(folder.children, noteId);
    if (nested.length) return [folder, ...nested];
  }
  return [];
}
