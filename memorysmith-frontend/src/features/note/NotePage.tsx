import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useOutletContext, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getNote } from '../../shared/api/source';
import { WritableContent } from '../../shared/components/WritableContent';
import { NoteSkeleton } from '../../shared/components/skeletons';
import { canWrite, updateNote } from '../../shared/api/source';

import {
  PropertyValue,
  orderedProperties,
  propertyLabel,
  propertyType,
} from '../../shared/components/PropertyValue';
import { CheckIcon, CopyIcon } from '../../shared/components/icons';
import { folderTrailForNote } from '../structure/trail';
import { VaultBreadcrumb, folderCrumbs } from '../structure/VaultBreadcrumb';
import type { VaultOutletContext } from '../structure/VaultLayout';

export function NotePage({ noteSlug }: { noteSlug: string }) {
  const { t } = useTranslation();
  const { vaultSlug = '' } = useParams();
  const { structure } = useOutletContext<VaultOutletContext>();
  const [copied, setCopied] = useState(false);
  const { data, isPending, isError } = useQuery({
    queryKey: ['note', vaultSlug, noteSlug],
    queryFn: () => getNote(vaultSlug, noteSlug),
  });

  async function copyNote() {
    if (!data) return;
    // The async clipboard API can stay pending forever in embedded or
    // automated contexts, so race it against a short timeout and fall back
    // to the legacy path when it does not settle.
    const viaApi = navigator.clipboard
      ?.writeText(data.raw)
      .then(() => true)
      .catch(() => false);
    const done = await Promise.race([
      viaApi ?? Promise.resolve(false),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 350)),
    ]);
    if (!done) {
      const scratch = document.createElement('textarea');
      scratch.value = data.raw;
      scratch.style.position = 'fixed';
      scratch.style.opacity = '0';
      document.body.appendChild(scratch);
      scratch.select();
      document.execCommand('copy');
      scratch.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (isPending) return <NoteSkeleton />;
  if (isError || !data) return <p className="status">{t('common.notFound')}</p>;

  // The reserved keys first, in the order of the specification, then what the
  // vault invented, in the order the note wrote it (RN-DSC-051). `title` is
  // drawn above as the title of the note and never as a property.
  const properties = orderedProperties(
    Object.entries(data.frontmatter).filter(([, value]) => value !== ''),
  );
  const lists = new Set(data.listProperties);

  return (
    <article className="content-pane">
      <div className="note-header">
        <div>
          <VaultBreadcrumb
            items={[
              { label: t('structure.root'), to: `/vaults/${vaultSlug}/root` },
              ...folderCrumbs(vaultSlug, folderTrailForNote(structure.folders, noteSlug)),
              { label: data.title ?? t('note.untitled') },
            ]}
          />
          {/* A note whose content states no title says so, rather than
              drawing an empty heading (RN-KNW-036). */}
          <h1 className={data.title === null ? 'note-untitled' : undefined}>
            {data.title ?? t('note.untitled')}
          </h1>
        </div>
        <button
          type="button"
          className={`copy-button${copied ? ' copied' : ''}`}
          onClick={() => void copyNote()}
          title={copied ? t('note.copied') : t('note.copyHint')}
          aria-label={t('note.copy')}
        >
          {copied ? <CheckIcon /> : <CopyIcon />}
        </button>
      </div>

      {properties.length > 0 && (
        <details className="properties-box" open>
          <summary>{t('note.properties')}</summary>
          <div className="metadata-container">
            {properties.map(([key, value]) => (
              <div
                className="metadata-property"
                data-property-type={propertyType(value, lists.has(key))}
                key={key}
              >
                <span className="metadata-property-key">{propertyLabel(key, t)}</span>
                <span className="metadata-property-value">
                  <PropertyValue value={value} list={lists.has(key)} vaultSlug={vaultSlug} />
                </span>
              </div>
            ))}
          </div>
        </details>
      )}

      <WritableContent
        raw={data.raw}
        vaultSlug={vaultSlug}
        baseRevision={data.revision}
        writable={canWrite(structure.effectiveRole)}
        write={({ raw, baseRevision, keepalive }) =>
          updateNote(
            vaultSlug,
            data.id,
            { content: raw, baseRevision: baseRevision ?? '' },
            { keepalive: keepalive ?? false },
          )
        }
        invalidates={['note', vaultSlug, noteSlug]}
      />
    </article>
  );
}
