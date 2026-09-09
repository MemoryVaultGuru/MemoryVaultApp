import { useQuery } from '@tanstack/react-query';
import { ImportVaultButton } from '../portability/ImportVaultButton';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { listVaults } from '../../shared/api/source';
import { LiveDashboard } from './LiveDashboard';
import { CardCarousel } from '../../shared/components/CardCarousel';
import { VaultCatalogueSkeleton } from '../../shared/components/skeletons';
import { messageKeyOf } from '../../shared/api/error-mapper';
import { queryState } from '../../shared/api/query-state';

/**
 * The locale drives the format, never a literal in the code: the same instant
 * reads 3 Sep 2026 for one reader and 3 de set. de 2026 for another.
 */
function formatDate(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(iso));
}

/**
 * The vault catalogue, and under it what the vaults themselves declare. There
 * used to be a second overview here, charting a fixed set of frontmatter
 * attributes that only the bundled seed guaranteed; the product never imposed
 * that convention, and the seed is gone (live-stats.ts).
 */
export function DashboardPage() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === 'pt_BR' ? 'pt-BR' : 'en-US';
  const query = useQuery({ queryKey: ['vaults'], queryFn: listVaults });
  const vaults = query.data;
  const state = queryState(query);

  return (
    <section className="page dashboard">
      <div className="dashboard-heading-row">
        <h2 className="dashboard-section-heading">{t('dashboard.selectVault')}</h2>
        {/* An import makes a NEW vault, so it belongs where the vaults are
            listed and not inside one of them (RN-PRT-012). */}
        <ImportVaultButton />
      </div>
      {state === 'error' && <p className="status">{t(messageKeyOf(query.error))}</p>}
      {state === 'pending' && <VaultCatalogueSkeleton />}
      <CardCarousel prevLabel={t('dashboard.prevVaults')} nextLabel={t('dashboard.nextVaults')}>
        {vaults?.map((vault) => (
          <Link key={vault.id} to={`/vaults/${vault.slug}`} className="vault-card">
            <h2>{vault.name}</h2>
            <p>{vault.description}</p>
            <footer>
              <span>
                {t('vaults.noteCount', { count: vault.noteCount })}
                {' · '}
                {t('vaults.updatedAt', { date: formatDate(vault.updatedAt, locale) })}
              </span>
              <span className="vault-open">{t('vaults.open')} →</span>
            </footer>
          </Link>
        ))}
      </CardCarousel>

      <LiveDashboard />
    </section>
  );
}
