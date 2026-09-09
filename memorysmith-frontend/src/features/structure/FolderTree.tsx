import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { FolderNode } from '../../shared/types/api';

interface FolderTreeProps {
  vaultSlug: string;
  folders: FolderNode[];
}

// The tree follows the route: whatever opened the current page (a link in the
// center pane, a breadcrumb, a pasted URL), every folder on the active path
// expands and the active item scrolls into view. Manual toggles still work;
// entering a folder's subtree just forces it open again.
function TreeNote({
  vaultSlug,
  folder,
  note,
}: {
  vaultSlug: string;
  folder: FolderNode;
  note: FolderNode['notes'][number];
}) {
  const { t } = useTranslation();
  const { '*': path } = useParams();
  const active = path === `${folder.slugPath}/${note.slug}`;
  const ref = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    if (active) ref.current?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  return (
    <li>
      <Link
        ref={ref}
        className={`tree-note${active ? ' active' : ''}`}
        to={`/vaults/${vaultSlug}/root/${folder.slugPath}/${note.slug}`}
      >
        {note.title ?? t('note.untitled')}
      </Link>
    </li>
  );
}

function FolderItem({ vaultSlug, folder }: { vaultSlug: string; folder: FolderNode }) {
  const { '*': folderPath } = useParams();
  const isActive = folderPath === folder.slugPath;
  const onActivePath = isActive || (folderPath?.startsWith(`${folder.slugPath}/`) ?? false);
  const [open, setOpen] = useState(onActivePath);
  const linkRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    if (onActivePath) setOpen(true);
  }, [onActivePath]);

  useEffect(() => {
    if (isActive) linkRef.current?.scrollIntoView({ block: 'nearest' });
  }, [isActive]);

  return (
    <li>
      <div className={`tree-folder${isActive ? ' active' : ''}`}>
        <button
          type="button"
          className="tree-toggle"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? '▾' : '▸'}
        </button>
        <Link
          ref={linkRef}
          to={`/vaults/${vaultSlug}/root/${folder.slugPath}`}
          title={folder.description}
        >
          {folder.name}
        </Link>
        <span className="tree-count">{folder.noteCount > 0 ? folder.noteCount : ''}</span>
      </div>
      {open && (
        <ul className="tree-children">
          {folder.children.map((child) => (
            <FolderItem key={child.id} vaultSlug={vaultSlug} folder={child} />
          ))}
          {folder.notes.map((note) => (
            <TreeNote key={note.id} vaultSlug={vaultSlug} folder={folder} note={note} />
          ))}
        </ul>
      )}
    </li>
  );
}

// The tree opens at the vault content root, mirroring the /root namespace of
// the URL and the reserved crumb of the trail.
export function FolderTree({ vaultSlug, folders }: FolderTreeProps) {
  const { t } = useTranslation();
  const { '*': splat } = useParams();
  return (
    <ul className="tree-root">
      <li>
        <div className={`tree-folder${splat === '' ? ' active' : ''}`}>
          <Link to={`/vaults/${vaultSlug}/root`}>{t('structure.root')}</Link>
        </div>
        <ul className="tree-children">
          {folders.map((folder) => (
            <FolderItem key={folder.id} vaultSlug={vaultSlug} folder={folder} />
          ))}
        </ul>
      </li>
    </ul>
  );
}
