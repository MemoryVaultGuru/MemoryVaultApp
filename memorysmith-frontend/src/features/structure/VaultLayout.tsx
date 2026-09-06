import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, NavLink, Outlet, useLocation, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getVaultStructure } from '../../shared/api/source';
import type { VaultStructure } from '../../shared/types/api';
import { BrandMark } from '../../shared/components/BrandMark';
import { GraphIcon, MenuIcon, PanelLeftCloseIcon } from '../../shared/components/icons';
import { SearchBox } from '../search/SearchBox';
import { ExportVaultButton } from '../portability/ExportVaultButton';
import { FolderTree } from './FolderTree';
import { FolderTreeSkeleton, NoteSkeleton } from '../../shared/components/skeletons';
import { SkeletonBar } from '../../shared/components/Skeleton';
import { queryState } from '../../shared/api/query-state';
import { messageKeyOf } from '../../shared/api/error-mapper';

export interface VaultOutletContext {
  structure: VaultStructure;
}

export function VaultLayout() {
  const { t } = useTranslation();
  const { vaultSlug = '' } = useParams();
  const { pathname } = useLocation();
  /**
   * The sidebar is a permanent column on a wide screen and a drawer on a narrow
   * one. Only the narrow case needs state, and the CSS decides which case is
   * live: below the breakpoint the aside is off canvas until this flag opens it,
   * above it the flag is inert and the column is simply there.
   */
  const [navOpen, setNavOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  // A drawer that survives navigation would cover the page the person just
  // asked for, which on a phone is the whole screen.
  useEffect(() => {
    setNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!navOpen) return;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setNavOpen(false);
    };
    // While the drawer is up it is the only thing that scrolls.
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener('keydown', onKey);
    };
  }, [navOpen]);

  const query = useQuery({
    queryKey: ['vault-structure', vaultSlug],
    queryFn: () => getVaultStructure(vaultSlug),
  });
  const { data } = query;

  if (queryState(query) === 'error') {
    return <p className="status">{t(messageKeyOf(query.error))}</p>;
  }

  /**
   * The frame of this screen is known before the request leaves, so it is
   * drawn immediately and never withheld: the sidebar, the brand, the search
   * box, the navigation and the content column are all here from the first
   * paint, and only the parts the query fills are placeholders. Withholding
   * the whole layout for a structure query was the largest single wait in the
   * product, and it made the frame arrive with a jump every time.
   */

  return (
    <div className={`vault-layout${navOpen ? ' nav-open' : ''}`}>
      {/* Shown by CSS only where the sidebar is a drawer. */}
      <button
        type="button"
        className="vault-nav-toggle"
        aria-label={t('structure.openNavigation')}
        aria-expanded={navOpen}
        aria-controls="vault-sidebar"
        onClick={() => setNavOpen(true)}
      >
        <MenuIcon />
        <span>{data ? data.vault.name : <SkeletonBar width="8rem" height="1rem" />}</span>
      </button>
      <div
        className="vault-nav-scrim"
        hidden={!navOpen}
        onClick={() => setNavOpen(false)}
        aria-hidden="true"
      />
      <aside className="vault-sidebar" id="vault-sidebar">
        {/* The drawer covers the app header, so it carries the brand itself.
            Shown by CSS only where the sidebar is a drawer. */}
        <div className="vault-nav-head">
          <span className="brand">
            <BrandMark />
          </span>
          <button
            type="button"
            className="vault-nav-close"
            aria-label={t('structure.closeNavigation')}
            ref={closeRef}
            onClick={() => setNavOpen(false)}
          >
            <PanelLeftCloseIcon />
          </button>
        </div>
        <Link to="/" className="back-link">
          ← {t('structure.backToVaults')}
        </Link>
        <Link
          to={`/vaults/${vaultSlug}`}
          className="vault-title-link"
          title={t('structure.heading')}
        >
          <h2>{data ? data.vault.name : <SkeletonBar width="10rem" height="1.4rem" />}</h2>
        </Link>
        {data ? (
          <SearchBox vaultSlug={vaultSlug} structure={data} />
        ) : (
          <SkeletonBar height="2.2rem" />
        )}
        <nav className="vault-nav">
          <NavLink to={`/vaults/${vaultSlug}/graph`} className="vault-nav-link">
            <GraphIcon /> {t('graph.navLabel')}
          </NavLink>
          <ExportVaultButton vaultSlug={vaultSlug} />
        </nav>
        <p className="sidebar-caption">{t('structure.content')}</p>
        {data ? (
          <FolderTree vaultSlug={vaultSlug} folders={data.folders} />
        ) : (
          <FolderTreeSkeleton />
        )}
      </aside>
      <section className="vault-content">
        {data ? (
          <Outlet context={{ structure: data } satisfies VaultOutletContext} />
        ) : (
          <NoteSkeleton />
        )}
      </section>
    </div>
  );
}
