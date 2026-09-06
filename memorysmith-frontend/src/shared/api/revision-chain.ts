/**
 * The other half of optimistic concurrency: a write **retires the revision it
 * was based on**, so the next write has to name the one it produced.
 *
 * Sending `baseRevision` was already done, and doing only that is what made a
 * person conflict with themselves. The document was loaded at revision A; the
 * first tick wrote and the server moved to B; the second tick still said A,
 * and the server answered `CONFLICT` — correctly, because the note really had
 * changed. It changed because of the first tick.
 *
 * The chain lives here rather than inside the component because it is the
 * whole of what was missing, and because two writes in a row is not something
 * a rendering test reaches: it needs a second write to exist at all, which is
 * exactly the case that was never run.
 */

export interface RevisionChain {
  /** What the next write will be based on. */
  readonly current: string | null;
  /** Writes, and adopts the revision the write produced. */
  write(text: string): Promise<void>;
  /**
   * Takes the revision the server states, discarding whatever this chain
   * holds. A reload wins: it comes from the server, and what is held here is
   * only what this session wrote.
   */
  reset(to: string | null): void;
}

export function revisionChain(
  write: (input: { raw: string; baseRevision: string | null }) => Promise<string>,
  initial: string | null,
  /**
   * Announced when a write LANDS, which is the same moment the revision
   * advances — so it belongs here and not in the caller. The surface listens
   * to drop what it is holding: with `staleTime: Infinity` a query is never
   * refetched on its own, and only a conflict used to invalidate anything, so
   * leaving a note after ticking a box and coming back showed the state from
   * before the edit while the server had the new one all along.
   */
  onWritten: () => void = () => undefined,
): RevisionChain {
  let current = initial;

  return {
    get current(): string | null {
      return current;
    },
    async write(text: string): Promise<void> {
      // The assignment happens only on success: a write that failed retired
      // nothing, and the revision in hand is still the right one to retry on.
      // The announcement is on the same line of reasoning: nothing landed, so
      // there is nothing for the surface to read back.
      current = await write({ raw: text, baseRevision: current });
      onWritten();
    },
    reset(to: string | null): void {
      current = to;
    },
  };
}
