import type { CSSProperties, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * The shape of what is coming, in the position it will occupy.
 *
 * A skeleton is not decoration and it is not a spinner in another shape. It is
 * the interface answering *"this is what is coming, and where"* while it
 * fetches, and it only does that if it occupies the size and the position of
 * the content that will replace it — otherwise it trades one layout shift for
 * two. So the primitive is a plain block with an explicit size, and each
 * surface composes its own frame out of it.
 *
 * **It belongs to `isPending` and to nothing else.** A skeleton over a request
 * that has already failed is worse than the line of text it replaced: a page
 * that looks alive and is dead. `queryState` is what tells the three apart,
 * and every caller here goes through it.
 *
 * **It must not talk over the screen reader.** The visible text used to say
 * "Loading"; a shape says nothing, so the region carries `aria-busy` and keeps
 * the word for assistive technology instead of dropping it along with the
 * line.
 */
export function SkeletonRegion({ children }: { children: ReactNode }) {
  const { t } = useTranslation();

  return (
    <div className="skeleton-region" aria-busy="true" aria-live="polite">
      <span className="visually-hidden">{t('common.loading')}</span>
      {children}
    </div>
  );
}

interface BarProps {
  /** Width as CSS, so a caller can say `60%` or `8rem` and mean it. */
  width?: string;
  height?: string;
  /** A rounder block, for a chip, an avatar or a symbol. */
  round?: boolean;
}

export function SkeletonBar({ width = '100%', height = '1rem', round = false }: BarProps) {
  const style: CSSProperties = { width, height };
  return <span className={round ? 'skeleton skeleton-round' : 'skeleton'} style={style} />;
}

/**
 * A run of prose. The lines are of different lengths on purpose, because a
 * block of identical bars reads as a table and not as a paragraph, and the
 * last one is short the way a last line is.
 */
export function SkeletonText({ lines = 3 }: { lines?: number }) {
  const widths = ['96%', '88%', '92%', '84%', '90%'];
  return (
    <span className="skeleton-text">
      {Array.from({ length: lines }, (_, index) => (
        <SkeletonBar
          key={index}
          width={index === lines - 1 ? '58%' : (widths[index % widths.length] ?? '90%')}
        />
      ))}
    </span>
  );
}
