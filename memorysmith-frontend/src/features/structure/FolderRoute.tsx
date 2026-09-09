import { useEffect } from 'react';
import { Navigate, useOutletContext, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { NotePage } from '../note/NotePage';
import { FolderPage } from './FolderPage';
import { FoldersIndexPage } from './FoldersIndexPage';
import { folderTrail, folderTrailForNote, noteAt } from './trail';
import { noteAddress } from '../../shared/api/note-address';
import { rememberNote } from '../../shared/store/last-note';
import type { VaultOutletContext } from './VaultLayout';

/**
 * The `root/*` namespace holds the whole vault content, so folder and note
 * names can never collide with reserved pages: an empty path is the vault root
 * listing, a full match on folder slugs is a folder page, and a last segment
 * carrying an identifier is a note.
 *
 * **What decides is the shape of the last segment, not the structure.** A note
 * is addressed by `<label>--<noteId>`, and the identifier is the only part
 * that is read (RN-DSC-055): a stale label or a folder trail that is no longer
 * right still lands on the note, and the address is corrected in place rather
 * than answered with a not-found line.
 */
export function FolderRoute() {
  const { t } = useTranslation();
  const { '*': splat = '', vaultSlug = '' } = useParams();
  const { structure } = useOutletContext<VaultOutletContext>();
  const path = splat.replace(/\/+$/, '');
  const noteId = noteAt(structure.folders, path);

  // Opening a note is what "where the reading stopped" means, and only a note
  // is remembered: a folder listing is a step on the way to one, and resuming
  // into it would put somebody back in the middle of the navigation they were
  // trying to skip. What is remembered is the canonical address, so a retitle
  // between two visits changes nothing about coming back.
  const trail = noteId ? folderTrailForNote(structure.folders, noteId) : [];
  const folder = trail[trail.length - 1];
  const note = folder?.notes.find((each) => each.id === noteId);
  const canonical =
    noteId && folder ? noteAddress(vaultSlug, folder.slugPath, note?.title ?? null, noteId) : null;

  useEffect(() => {
    if (canonical) rememberNote(vaultSlug, canonical.split('/root/')[1] ?? '');
  }, [vaultSlug, canonical]);

  if (!path) return <FoldersIndexPage />;
  if (folderTrail(structure.folders, path).length) return <FolderPage />;
  if (noteId) {
    // A note that was retitled or moved keeps its identifier, so its old
    // address still resolves and the page corrects the label and the trail in
    // place — no round trip and no redirect anybody has to notice
    // (RN-DSC-045, RN-DSC-057).
    if (canonical && canonical !== `/vaults/${vaultSlug}/root/${path}`) {
      return <Navigate to={canonical} replace />;
    }
    return <NotePage noteId={noteId} />;
  }
  return <p className="status">{t('common.notFound')}</p>;
}
