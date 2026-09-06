import { useEffect } from 'react';
import { useOutletContext, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { NotePage } from '../note/NotePage';
import { FolderPage } from './FolderPage';
import { FoldersIndexPage } from './FoldersIndexPage';
import { folderTrail, noteAt } from './trail';
import { rememberNote } from '../../shared/store/last-note';
import type { VaultOutletContext } from './VaultLayout';

// The root/* namespace holds the whole vault content, so folder and note
// names can never collide with reserved pages: an empty path is the vault
// root listing, a full match on folder slugs is a folder page, and one extra
// trailing segment is a note inside the matched folder.
export function FolderRoute() {
  const { t } = useTranslation();
  const { '*': splat = '', vaultSlug = '' } = useParams();
  const { structure } = useOutletContext<VaultOutletContext>();
  const path = splat.replace(/\/+$/, '');
  const noteSlug = noteAt(structure.folders, path);

  // Opening a note is what "where the reading stopped" means, and only a note
  // is remembered: a folder listing is a step on the way to one, and resuming
  // into it would put somebody back in the middle of the navigation they were
  // trying to skip.
  useEffect(() => {
    if (noteSlug) rememberNote(vaultSlug, path);
  }, [vaultSlug, path, noteSlug]);

  if (!path) return <FoldersIndexPage />;
  if (folderTrail(structure.folders, path).length) return <FolderPage />;
  if (noteSlug) return <NotePage noteSlug={noteSlug} />;
  return <p className="status">{t('common.notFound')}</p>;
}
