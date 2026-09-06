import type { FolderNode } from '../../shared/types/api';

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
 * The slug of the note a `root/*` path names, or null when it names anything
 * else: the vault root, a folder, or something that is no longer there.
 *
 * Two callers need exactly this question and they must not answer it apart.
 * `FolderRoute` asks it to decide what to render, and resuming a reading asks
 * it before navigating: a remembered note that has since been deleted, moved
 * or renamed has to land on the tree, never on the not-found line.
 */
export function noteAt(folders: FolderNode[], path: string): string | null {
  if (!path || folderTrail(folders, path).length) return null;

  const cut = path.lastIndexOf('/');
  const folderPath = cut >= 0 ? path.slice(0, cut) : '';
  const noteSlug = cut >= 0 ? path.slice(cut + 1) : path;
  const chain = folderPath ? folderTrail(folders, folderPath) : [];
  const folder = chain[chain.length - 1];
  return folder?.notes.some((note) => note.slug === noteSlug) ? noteSlug : null;
}

// Folder chain from the vault root down to the folder holding the note with
// noteSlug, or [] when the note is not in the tree.
export function folderTrailForNote(folders: FolderNode[], noteSlug: string): FolderNode[] {
  for (const folder of folders) {
    if (folder.notes.some((note) => note.slug === noteSlug)) return [folder];
    const nested = folderTrailForNote(folder.children, noteSlug);
    if (nested.length) return [folder, ...nested];
  }
  return [];
}
