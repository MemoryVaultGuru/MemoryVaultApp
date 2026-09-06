// The dashboard over real vaults.
//
// It charts the attributes the vaults actually declare, not a fixed set: see
// live-stats.ts for why a hardcoded `maturity` chart cannot be a product
// feature. A vault whose notes carry no frontmatter simply has no charts, and
// the tiles above still say what it holds.

import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { loadLiveStats, type LiveFacet } from '../../shared/api/live-stats';
import { messageKeyOf } from '../../shared/api/error-mapper';
import { queryState } from '../../shared/api/query-state';

const nf = new Intl.NumberFormat();

/** Values beyond this fold into a single "other" bar, which is named. */
const VALUES_PER_FACET = 8;
/** Only the richest facets get a chart; the rest are counted, not drawn. */
const FACETS_CHARTED = 4;

function FacetChart({ facet }: { facet: LiveFacet }) {
  const { t } = useTranslation();
  const top = facet.values.slice(0, VALUES_PER_FACET);
  const rest = facet.values.slice(VALUES_PER_FACET);
  const restTotal = rest.reduce((sum, each) => sum + each.count, 0);
  const bars = restTotal > 0 ? [...top, { value: '__other__', count: restTotal }] : top;
  const max = Math.max(...bars.map((bar) => bar.count));

  return (
    <div className="chart-card">
      <h2>{facet.facet}</h2>
      {bars.map((bar) => (
        <div key={bar.value} className="hbar-row">
          <span className="hbar-label">
            {bar.value === '__other__' ? t('dashboard.otherTypes') : bar.value}
          </span>
          <div className="hbar-track">
            <div
              className="hbar-seg"
              style={{
                width: `${max > 0 ? (bar.count / max) * 100 : 0}%`,
                background: bar.value === '__other__' ? 'var(--cat-other)' : 'var(--accent)',
              }}
            />
          </div>
          <span className="hbar-total">{nf.format(bar.count)}</span>
        </div>
      ))}
    </div>
  );
}

export function LiveDashboard() {
  const { t } = useTranslation();
  const query = useQuery({ queryKey: ['live-stats'], queryFn: loadLiveStats });
  const state = queryState(query);

  // Three states, told apart. `isLoading || !data` said "Loading…" forever
  // over a request that had already failed, because with `retry: false` an
  // errored query is neither loading nor holding data.
  if (state === 'error') {
    return <p className="status">{t(messageKeyOf(query.error))}</p>;
  }
  // `!data` is the same condition `pending` already carries, written again so
  // the compiler can see it. Everything below reads an answer that exists.
  const data = query.data;
  if (state === 'pending' || !data) return <p className="status">{t('common.loading')}</p>;

  const charted = data.facets.slice(0, FACETS_CHARTED);
  const notCharted = data.facets.length - charted.length;

  return (
    <>
      <h2 className="dashboard-section-heading">{t('dashboard.heading')}</h2>

      <div className="stat-row">
        <div className="stat-tile">
          <span className="stat-value">{nf.format(data.vaults)}</span>
          <span className="stat-label">{t('dashboard.kpiVaults')}</span>
        </div>
        <div className="stat-tile">
          <span className="stat-value">{nf.format(data.notes)}</span>
          <span className="stat-label">{t('dashboard.kpiNotes')}</span>
        </div>
        <div className="stat-tile">
          <span className="stat-value">{nf.format(data.pendingLinks)}</span>
          <span className="stat-label">{t('dashboard.kpiPending')}</span>
        </div>
        <div className="stat-tile">
          <span className="stat-value">{nf.format(data.orphans)}</span>
          <span className="stat-label">{t('dashboard.kpiOrphans')}</span>
        </div>
      </div>

      {charted.length > 0 ? (
        <div className="chart-row">
          {charted.map((facet) => (
            <FacetChart key={facet.facet} facet={facet} />
          ))}
        </div>
      ) : (
        <p className="status">{t('dashboard.noFacets')}</p>
      )}

      {/* What was left out is said out loud, never dropped in silence. */}
      {notCharted > 0 && (
        <p className="dashboard-footnote">{t('dashboard.moreFacets', { count: notCharted })}</p>
      )}
      {data.unavailable > 0 && (
        <p className="dashboard-footnote">
          {t('dashboard.unavailableVaults', { count: data.unavailable })}
        </p>
      )}
      {data.discarded.length > 0 && (
        <p className="dashboard-footnote">
          {t('dashboard.discardedFacets', {
            count: data.discarded.length,
            names: data.discarded.join(', '),
          })}
        </p>
      )}
    </>
  );
}
