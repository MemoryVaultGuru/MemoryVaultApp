import { useQuery } from '@tanstack/react-query';
import { Link, useOutletContext, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { canWrite, getTemplate, putTemplate, resolveNoteUrl } from '../../shared/api/source';
import { WritableContent } from '../../shared/components/WritableContent';
import type { VaultOutletContext } from './VaultLayout';
import { folderTrail } from './trail';
import { VaultBreadcrumb, folderCrumbs } from './VaultBreadcrumb';

export function FolderPage() {
  const { t } = useTranslation();
  const { vaultSlug = '', '*': slugPath = '' } = useParams();
  const { structure } = useOutletContext<VaultOutletContext>();
  const chain = folderTrail(structure.folders, slugPath);
  const folder = chain[chain.length - 1] ?? null;

  const { data: template } = useQuery({
    queryKey: ['template', vaultSlug, folder?.id],
    queryFn: () => getTemplate(vaultSlug, folder?.id ?? ''),
    enabled: Boolean(folder?.hasTemplate),
  });

  if (!folder) return <p className="status">{t('common.notFound')}</p>;

  return (
    <article className="content-pane">
      <VaultBreadcrumb
        items={[
          { label: t('structure.root'), to: `/vaults/${vaultSlug}/root` },
          ...folderCrumbs(vaultSlug, chain),
        ]}
      />
      <h1>{folder.name}</h1>
      <p className="folder-description">{folder.description}</p>

      {folder.hasTemplate && template && (
        <details className="template-box">
          <summary>{t('folder.template')}</summary>
          <p className="hint">{t('folder.templateHint')}</p>
          <WritableContent
            raw={template.body}
            vaultSlug={vaultSlug}
            baseRevision={template.revision}
            writable={canWrite(structure.effectiveRole)}
            write={({ raw, baseRevision, keepalive }) =>
              putTemplate(vaultSlug, folder.id, raw, baseRevision, {
                keepalive: keepalive ?? false,
              })
            }
            invalidates={['template', vaultSlug, folder.id]}
          />
        </details>
      )}

      <h2>{t('folder.notesHeading')}</h2>
      {folder.notes.length === 0 && folder.children.length === 0 && <p>{t('folder.empty')}</p>}
      <ul className="note-list">
        {folder.children.map((child) => (
          <li key={child.id}>
            <Link to={`/vaults/${vaultSlug}/root/${child.slugPath}`} className="note-list-folder">
              {child.name}/
            </Link>
            <span className="note-list-desc">{child.description}</span>
          </li>
        ))}
        {folder.notes.map((note) => (
          <li key={note.id}>
            <Link to={resolveNoteUrl(vaultSlug, note.slug) ?? '#'}>{note.title}</Link>
          </li>
        ))}
      </ul>
    </article>
  );
}
