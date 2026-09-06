import { SkeletonBar, SkeletonRegion, SkeletonText } from './Skeleton';

/**
 * One placeholder per surface, matched to the frame the real content occupies.
 *
 * They live together rather than beside each component because the point of
 * them is consistency: the same primitive, the same rhythm, and one place to
 * look when a real surface changes shape and its placeholder stops matching.
 * A generic grey box used everywhere would be the failure this file exists to
 * avoid, and so would six hand-rolled ones.
 */

/** A vault card in the catalogue. */
export function VaultCardSkeleton() {
  return (
    <div className="vault-card vault-card-skeleton" aria-hidden="true">
      <SkeletonBar width="70%" height="1.4rem" />
      <SkeletonText lines={2} />
      <SkeletonBar width="55%" height="0.8rem" />
    </div>
  );
}

/** The catalogue strip, which used to be simply empty while it loaded. */
export function VaultCatalogueSkeleton({ cards = 3 }: { cards?: number }) {
  return (
    <SkeletonRegion>
      <div className="card-row-skeleton">
        {Array.from({ length: cards }, (_, index) => (
          <VaultCardSkeleton key={index} />
        ))}
      </div>
    </SkeletonRegion>
  );
}

/** The KPI tiles and the facet charts of the overview. */
export function DashboardSkeleton() {
  return (
    <SkeletonRegion>
      <div className="stat-row">
        {Array.from({ length: 4 }, (_, index) => (
          <div className="stat-tile" key={index}>
            <SkeletonBar width="3.5rem" height="2rem" />
            <SkeletonBar width="5rem" height="0.8rem" />
          </div>
        ))}
      </div>
      <div className="chart-row-skeleton">
        {Array.from({ length: 3 }, (_, index) => (
          <div className="chart-card" key={index}>
            <SkeletonBar width="40%" height="1.1rem" />
            {Array.from({ length: 4 }, (_, bar) => (
              <div className="hbar-row" key={bar}>
                <SkeletonBar width="5rem" height="0.8rem" />
                <SkeletonBar height="0.7rem" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </SkeletonRegion>
  );
}

/** The tree in the sidebar. The frame around it is never withheld. */
export function FolderTreeSkeleton() {
  const indents = [0, 1, 1, 0, 1, 2, 1, 0];
  return (
    <SkeletonRegion>
      <div className="tree-skeleton">
        {indents.map((depth, index) => (
          <div className="tree-skeleton-row" key={index} style={{ paddingLeft: `${depth}rem` }}>
            <SkeletonBar width={`${70 - depth * 12}%`} height="0.9rem" />
          </div>
        ))}
      </div>
    </SkeletonRegion>
  );
}

/** A note: its title, its properties and its body. */
export function NoteSkeleton() {
  return (
    <SkeletonRegion>
      <article className="content-pane">
        <SkeletonBar width="30%" height="0.8rem" />
        <SkeletonBar width="65%" height="2rem" />
        <SkeletonText lines={4} />
        <SkeletonBar width="45%" height="1.2rem" />
        <SkeletonText lines={5} />
      </article>
    </SkeletonRegion>
  );
}

/** The body of one template card, inside a box that is already drawn. */
export function TemplateSkeleton() {
  return (
    <SkeletonRegion>
      <SkeletonText lines={3} />
    </SkeletonRegion>
  );
}

/** An embedded block, mid-paragraph, inside otherwise rendered prose. */
export function TransclusionSkeleton() {
  return (
    <SkeletonRegion>
      <figure className="embed embed-skeleton">
        <div className="embed-body">
          <SkeletonText lines={2} />
        </div>
        <figcaption className="embed-source">
          <SkeletonBar width="8rem" height="0.8rem" />
        </figcaption>
      </figure>
    </SkeletonRegion>
  );
}

/** The graph canvas, which is one large area and not a list of anything. */
export function GraphSkeleton() {
  return (
    <SkeletonRegion>
      <div className="graph-skeleton" />
    </SkeletonRegion>
  );
}

/**
 * The application, while the session resolves. It replaces 60vh of nothing —
 * the first thing every page load and every deep link used to show.
 */
export function AppSkeleton() {
  return (
    <SkeletonRegion>
      <div className="app-skeleton">
        <header className="app-skeleton-bar">
          <SkeletonBar width="2rem" height="2rem" round />
          <SkeletonBar width="12rem" height="1.2rem" />
        </header>
        <div className="app-skeleton-body">
          <SkeletonText lines={3} />
        </div>
      </div>
    </SkeletonRegion>
  );
}
