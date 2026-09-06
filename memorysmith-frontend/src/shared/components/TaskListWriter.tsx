import { useCallback, useEffect, useRef, useState } from 'react';
import { messageKeyOf } from '../api/error-mapper';
import { revisionChain } from '../api/revision-chain';
import { useWriteStatus } from '../store/write-status';

/**
 * The write behind a task box: optimistic on the screen, grouped in flight.
 *
 * Ticking five items of a checklist should leave ONE entry in the history and
 * not five, so clicks inside a short window collapse into a single write. The
 * grouping is entirely of the client: the server sees an ordinary write, with
 * baseRevision, authorship and a new revision, and nothing about it leaks into
 * the domain.
 *
 * Ticking and unticking the same box inside the window sends nothing at all,
 * because the content went back to being identical (RN-KNW-028).
 */
const WINDOW_MS = 2000;

export interface TaskWrite {
  /** The text as it stands now, with every pending toggle applied. */
  readonly raw: string;
  /** The revision the whole group is based on. */
  readonly baseRevision: string | null;
  /**
   * True when the page is going away. The request has to be made in a way the
   * browser finishes after the document is gone, or the click is lost.
   */
  readonly keepalive?: boolean;
}

/**
 * A write answers the revision it produced. That is the other half of
 * optimistic concurrency, and the half this used to be missing.
 */
export type TaskWriter = (input: TaskWrite) => Promise<string>;

export function useGroupedWrite({
  raw,
  baseRevision,
  write,
  onWritten,
  onConflict,
}: {
  raw: string;
  baseRevision: string | null;
  write: TaskWriter;
  /**
   * Called after a write LANDS, so the surface can drop what it is holding
   * and read what the server now has.
   *
   * Without it the screen kept showing the content it was rendered with:
   * `staleTime: Infinity` means a query is never refetched on its own, so
   * leaving the note and coming back showed the state from before the edit,
   * and only a reload — which drops the cache with the page — fixed it. The
   * write had landed all along.
   */
  onWritten: () => void;
  onConflict: () => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  /**
   * The four states go to the FRAME of the screen and not to the content.
   *
   * A grouped write is a property of the document — five ticks are one
   * transaction — so its status cannot belong to a box. Rendered at the top of
   * the content it became a paragraph of the note, scrolled away with the
   * text, and was never seen from where the click happened. What it says is
   * still the same discipline: a failure names the failure it was, because a
   * message that invents a cause sends the reader looking for a person who
   * was never there.
   */
  const status = useWriteStatus();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<string | null>(null);
  const committed = useRef(raw);
  /**
   * The callbacks, held in refs and called THROUGH them.
   *
   * Both arrive as inline arrows, so they are new functions on every render,
   * and the chain below is built once. Capturing the first ones directly
   * happens to work today — they close over a vault slug and a note id that
   * do not change while the note is mounted — and "happens to work" is the
   * reasoning that produced the last three defects of this feature. The
   * indirection costs a line and removes the question.
   */
  const writeRef = useRef(write);
  const writtenRef = useRef(onWritten);
  writeRef.current = write;
  writtenRef.current = onWritten;

  /**
   * The revision the next write is based on, advancing on every success.
   * Everything about why is in `revision-chain.ts`, which is also where it is
   * tested: two writes in a row is not a case a rendering test reaches.
   */
  const chain = useRef(
    revisionChain(
      (input) => writeRef.current(input),
      baseRevision,
      () => writtenRef.current(),
    ),
  );

  // The document was reloaded: the draft is stale and so is the revision.
  useEffect(() => {
    committed.current = raw;
    setDraft(null);
  }, [raw]);

  // A reload brings a revision of its own, and it wins: it comes from the
  // server, and what is held here is only what this session wrote.
  useEffect(() => {
    chain.current.reset(baseRevision);
  }, [baseRevision]);

  const flush = useCallback(
    async (options: { keepalive?: boolean } = {}) => {
      const next = pending.current;
      pending.current = null;
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
      }
      // Identical bytes are not a write: no revision, no event, no reindexing.
      if (next === null || next === committed.current) return;

      try {
        status.saving();
        await chain.current.write(next, options);
        committed.current = next;
        status.saved();
      } catch (error) {
        // A conflict is information, not a system error: the screen goes back to
        // what the server says and the person is told someone wrote first. Any
        // other failure says what it was, in the words of the error taxonomy.
        setDraft(null);
        const conflict = (error as { code?: string })?.code === 'CONFLICT';
        status.failed(conflict ? 'note.writeConflict' : messageKeyOf(error));
        if (conflict) onConflict();
      }
    },
    [onConflict, status],
  );

  const toggle = useCallback(
    (next: string) => {
      status.changed();
      setDraft(next);
      pending.current = next;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), WINDOW_MS);
    },
    [flush, status],
  );

  // Leaving the SCREEN before the window closes must not lose the click.
  useEffect(() => {
    return () => {
      if (pending.current !== null) void flush();
    };
  }, [flush]);

  /**
   * Leaving the PAGE must not lose it either, and that is a different event.
   *
   * The cleanup above runs when React unmounts the component. `F5`, closing
   * the tab and switching to another application are none of those: the
   * browser leaves, the effect never runs, and a click inside the two-second
   * window is gone. That is what made reloading to check whether it saved a
   * gamble — the very reload used to find out could be what destroyed it.
   *
   * `pagehide` fires on all three, including the phone case that
   * `beforeunload` misses, and the request goes out with `keepalive` so the
   * browser finishes it after the page is gone.
   */
  useEffect(() => {
    const leaving = (): void => {
      if (pending.current !== null) void flush({ keepalive: true });
    };
    window.addEventListener('pagehide', leaving);
    return () => window.removeEventListener('pagehide', leaving);
  }, [flush]);

  return { text: draft ?? raw, toggle };
}
