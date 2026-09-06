import { useCallback, useEffect, useRef, useState } from 'react';
import { messageKeyOf } from '../api/error-mapper';

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
}

export function useGroupedWrite({
  raw,
  baseRevision,
  write,
  onConflict,
}: {
  raw: string;
  baseRevision: string | null;
  write: (input: TaskWrite) => Promise<unknown>;
  onConflict: () => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  /**
   * WHY the write failed, and not merely that it did.
   *
   * This used to be a boolean, and the screen rendered one sentence for it:
   * "someone wrote here first, and the content was reloaded". Every failure
   * therefore asserted a cause nobody had established — a refused request, a
   * dead session and a real conflict all told the same story, and the one it
   * told was wrong for two of the three. A message that invents a cause is
   * worse than one that admits it does not know: it sends the reader looking
   * for a person who was never there.
   */
  const [failure, setFailure] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<string | null>(null);
  const committed = useRef(raw);

  // The server answered, or the document was reloaded: the draft is stale.
  useEffect(() => {
    committed.current = raw;
    setDraft(null);
  }, [raw]);

  const flush = useCallback(async () => {
    const next = pending.current;
    pending.current = null;
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    // Identical bytes are not a write: no revision, no event, no reindexing.
    if (next === null || next === committed.current) return;

    try {
      await write({ raw: next, baseRevision });
      committed.current = next;
    } catch (error) {
      // A conflict is information, not a system error: the screen goes back to
      // what the server says and the person is told someone wrote first. Any
      // other failure says what it was, in the words of the error taxonomy.
      setDraft(null);
      const conflict = (error as { code?: string })?.code === 'CONFLICT';
      setFailure(conflict ? 'note.writeConflict' : messageKeyOf(error));
      if (conflict) onConflict();
    }
  }, [baseRevision, onConflict, write]);

  const toggle = useCallback(
    (next: string) => {
      setFailure(null);
      setDraft(next);
      pending.current = next;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), WINDOW_MS);
    },
    [flush],
  );

  // Leaving the page before the window closes must not lose the click.
  useEffect(() => {
    return () => {
      if (pending.current !== null) void flush();
    };
  }, [flush]);

  return { text: draft ?? raw, toggle, failure };
}
