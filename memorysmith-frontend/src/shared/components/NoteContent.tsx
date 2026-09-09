import { splitEmbeds } from '../api/transclusion';
import { resolveWikilinks } from '../api/markdown';
import { wikilinkUrl } from '../api/source';
import { Markdown } from './Markdown';
import { Transclusion } from './Transclusion';

/**
 * A reading surface that expands embeds. Text runs and transcluded blocks
 * alternate, and each run resolves its own wikilinks, which keeps this the
 * only place that knows an embed is not an image.
 */
export function NoteContent({ body, vaultSlug }: { body: string; vaultSlug: string }) {
  const segments = splitEmbeds(body);

  return (
    <>
      {segments.map((segment, index) =>
        segment.kind === 'text' ? (
          <Markdown key={index}>
            {resolveWikilinks(segment.text, (title) => wikilinkUrl(vaultSlug, title))}
          </Markdown>
        ) : (
          <Transclusion
            key={index}
            vaultSlug={vaultSlug}
            target={segment.target}
            anchor={segment.anchor}
          />
        ),
      )}
    </>
  );
}
