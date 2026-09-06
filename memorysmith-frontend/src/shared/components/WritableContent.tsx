import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect } from 'react';
import { splitEmbeds } from '../api/transclusion';
import { resolveWikilinks } from '../api/markdown';
import { taskBoxes, toggleTaskAt } from '../api/tasklist';
import { resolveNoteUrl } from '../api/source';
import { Markdown } from './Markdown';
import { Transclusion } from './Transclusion';
import { useGroupedWrite, type TaskWriter } from './TaskListWriter';
import { useWriteStatus } from '../store/write-status';

/**
 * A reading surface whose task boxes can be ticked, when the effective role in
 * this vault allows writing.
 *
 * Three surfaces render the same kind of thing, a Content Slot: the note, the
 * guidance and the template of a folder. A box alive in one and dead in the
 * others would be visible arbitrariness, so the behaviour lives here, once.
 *
 * The text written back is the ORIGINAL one, and not what is on screen: the
 * screen shows wikilinks resolved and embeds expanded, and writing that back
 * would hand the vault a document nobody typed.
 */
export function WritableContent({
  raw,
  vaultSlug,
  baseRevision,
  writable,
  write,
  invalidates,
}: {
  raw: string;
  vaultSlug: string;
  baseRevision: string | null;
  writable: boolean;
  write: TaskWriter;
  invalidates: unknown[];
}) {
  const client = useQueryClient();

  /**
   * What the screen holds is no longer what the server holds, either because
   * this write landed or because somebody else's did. Both answers are the
   * same: read it again.
   */
  const reload = useCallback(() => {
    void client.invalidateQueries({ queryKey: invalidates });
  }, [client, invalidates]);

  /**
   * The status belongs to the document being read. Leaving it clears the
   * frame, so a message never outlives what it was about — a "saved" left
   * hanging over another note is a claim about that other note.
   */
  useEffect(() => () => useWriteStatus.getState().clear(), []);

  const { text, toggle } = useGroupedWrite({
    raw,
    baseRevision,
    write,
    onWritten: reload,
    onConflict: reload,
  });

  const onToggleTask = useCallback(
    (ordinal: number) => {
      const next = toggleTaskAt(text, ordinal);
      if (next !== null) toggle(next);
    },
    [text, toggle],
  );

  // Frontmatter is shown as properties, not as prose, so the reading surface
  // starts after it. Everything below counts task items from there.
  const split = text.startsWith('---') ? text.indexOf('\n---', 3) + 4 : 0;
  const body = text.slice(split);

  const segments = splitEmbeds(body).map((segment) =>
    segment.kind === 'text'
      ? {
          ...segment,
          rendered: resolveWikilinks(segment.text, (slug) => resolveNoteUrl(vaultSlug, slug)),
        }
      : segment,
  );

  /**
   * Whether a click can be mapped back to the bytes at all.
   *
   * The ordinal is counted over the text the PARSER saw, which is the one with
   * the wikilinks already resolved, and it is applied to the text a write
   * sends, which is the original. Those two agree on how many boxes there are
   * and in what order, almost always — and `- [[x]]` is where they do not,
   * because resolving it produces `- [x](/url)`, which is a task box to any
   * GFM reader. Counting on one side and writing on the other would then
   * toggle a different item, silently, which is the worst defect this surface
   * can have. When the two disagree the boxes are read-only: not writing is
   * always better than writing the wrong one.
   */
  const mappable =
    taskBoxes(body).length ===
    segments.reduce(
      (total, segment) => total + ('rendered' in segment ? taskBoxes(segment.rendered).length : 0),
      0,
    );

  // The ordinal a click carries is of the WHOLE document, and each rendered
  // run only knows its own. The count carried across the runs is what bridges
  // the two, and it has to include anything above the body.
  let seen = taskBoxes(text.slice(0, split)).length;

  return (
    <>
      {/* What happened to the write is said in the frame of the screen, by
          `WriteStatus`. Here it was a paragraph of the note: it scrolled away
          with the text and was never seen from where the box was clicked. */}
      {segments.map((segment, index) => {
        if (!('rendered' in segment)) {
          return (
            <Transclusion
              key={index}
              vaultSlug={vaultSlug}
              target={segment.target}
              anchor={segment.anchor}
            />
          );
        }

        const base = seen;
        seen += taskBoxes(segment.rendered).length;

        return (
          <Markdown
            key={index}
            // The text the ordinal is counted over, stated rather than left to
            // a default: it is the one the parser reports offsets into, and
            // `mappable` above is what makes it safe to write back through.
            source={segment.rendered}
            onToggleTask={(ordinal) => onToggleTask(base + ordinal)}
            writable={writable && mappable}
          >
            {segment.rendered}
          </Markdown>
        );
      })}
    </>
  );
}
