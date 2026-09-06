import { useOutletContext, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { canWrite, putGuidance } from '../../shared/api/source';
import { WritableContent } from '../../shared/components/WritableContent';
import { VaultBreadcrumb } from '../structure/VaultBreadcrumb';
import type { VaultOutletContext } from '../structure/VaultLayout';

export function GuidancePanel() {
  const { t } = useTranslation();
  const { vaultSlug = '' } = useParams();
  const { structure } = useOutletContext<VaultOutletContext>();

  return (
    <article className="content-pane">
      <VaultBreadcrumb items={[{ label: t('structure.guidance') }]} />
      <p className="content-kicker">{t('structure.guidance')}</p>
      {structure.guidance ? (
        <WritableContent
          raw={structure.guidance}
          vaultSlug={vaultSlug}
          baseRevision={structure.guidanceRevision}
          writable={canWrite(structure.effectiveRole)}
          write={({ raw, baseRevision, keepalive }) =>
            putGuidance(vaultSlug, raw, baseRevision, { keepalive: keepalive ?? false })
          }
          invalidates={['vault-structure', vaultSlug]}
        />
      ) : (
        <p className="status">{t('common.notFound')}</p>
      )}
    </article>
  );
}
