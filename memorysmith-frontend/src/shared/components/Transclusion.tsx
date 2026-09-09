import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getNote, resolveNoteUrl, wikilinkUrl } from '../api/source';
import { noteIdOf } from '../api/note-address';
import { demoteEmbeds, blockOf, isBlockAnchor, sectionOf } from '../api/transclusion';
import { resolveWikilinks } from '../api/markdown';
import { Markdown } from './Markdown';
import { TransclusionSkeleton } from './skeletons';

/**
 * One transcluded block: the content of another note, shown in place.
 *
 * It always says where it came from. A passage pasted without provenance is
 * indistinguishable from what the author wrote, and this product rests on
 * knowing who asserted what.
 */
export function Transclusion({
  vaultSlug,
  target,
  anchor,
}: {
  vaultSlug: string;
  target: string;
  anchor: string | null;
}) {
  const { t } = useTranslation();
  const title = target.normalize('NFC');
  // A transclusion expands ONE note, so it expands what a wikilink would
  // navigate to: an ambiguous target is a choice a reader makes and not a
  // passage the page can inline on their behalf.
  const url = resolveNoteUrl(vaultSlug, title);
  const noteId = url ? (noteIdOf(url.split('/').pop() ?? '') ?? '') : '';

  const { data, isPending, isError } = useQuery({
    queryKey: ['note', vaultSlug, noteId],
    queryFn: () => getNote(vaultSlug, noteId),
    enabled: url !== null,
  });

  // The same pending marker a wikilink uses. A vault is read most while it is
  // still being written, so a target that does not exist yet is an expected
  // state and never an error that stops the page.
  if (url === null || isError) {
    return (
      <p className="embed-pending">
        <span className="wikilink-pending" title={t('note.pendingLink')}>
          {target}
        </span>
      </p>
    );
  }

  if (isPending) return <TransclusionSkeleton />;

  const whole = data.body;
  // The caption names the note the content came from, and a note may have no
  // addressable title (RN-KNW-036).
  const sourceLabel = data.title ?? t('note.untitled');
  // `#^id` addresses a BLOCK and `#Section` a heading. The two are told apart
  // by the marker and not by trying one and falling back to the other, or a
  // section named `^x` and a block called `x` would answer for each other.
  const cut = !anchor
    ? whole
    : isBlockAnchor(anchor)
      ? blockOf(whole, anchor.slice(1))
      : sectionOf(whole, anchor);

  return (
    <figure className="embed">
      <div className="embed-body">
        {cut === null ? (
          <p className="embed-missing">{t('note.embedSectionMissing', { section: anchor })}</p>
        ) : (
          /**
           * Resolved, like every other reading surface. Without this every
           * `[[link]]` inside transcluded content reached the page with its
           * brackets — and the sharpest case is the one the one-level rule
           * creates itself: `demoteEmbeds` turns an embed found in embedded
           * content into a wikilink, and 13.2 says that embed is drawn as A
           * LINK to its target. Raw text is not a link, so the rule was
           * implemented halfway.
           */
          <Markdown>
            {resolveWikilinks(demoteEmbeds(cut), (each) => wikilinkUrl(vaultSlug, each))}
          </Markdown>
        )}
      </div>
      <figcaption className="embed-source">
        <Link to={url}>{anchor ? `${sourceLabel} › ${anchor}` : sourceLabel}</Link>
      </figcaption>
    </figure>
  );
}
