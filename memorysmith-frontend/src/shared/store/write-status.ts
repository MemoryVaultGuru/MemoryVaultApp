import { create } from 'zustand';

/**
 * What happened to the write the person is making, said in one place.
 *
 * It is a store and not a piece of component state because the two ends are
 * far apart: the write is made deep inside the content, and what it has to
 * say belongs to the **frame** of the screen. A grouped write is a property
 * of the document — five ticks are one transaction — so its status cannot
 * live next to a box, and putting it at the top of the content made it a
 * paragraph of the note, which scrolls away and is never seen from where the
 * click happened.
 *
 * It says one thing about one document. It is not a notification system, and
 * it is deliberately not general: a second message would have to decide which
 * of the two wins, and that decision has no good answer.
 */

export type WriteState =
  /** Nothing to say. The reading surface is a reading surface again. */
  | 'idle'
  /** Changed on screen, not sent yet: the grouping window is open. */
  | 'unsaved'
  /** In flight. */
  | 'saving'
  /** The server has it. */
  | 'saved'
  /** It did not land, and `messageKey` says why. */
  | 'failed';

interface WriteStatusState {
  readonly state: WriteState;
  /** The i18n key of the failure, when there is one. */
  readonly messageKey: string | null;
  changed: () => void;
  saving: () => void;
  saved: () => void;
  failed: (messageKey: string) => void;
  clear: () => void;
}

/** How long `saved` stays before the frame goes quiet again. */
export const SAVED_VISIBLE_MS = 2500;

export const useWriteStatus = create<WriteStatusState>((set) => ({
  state: 'idle',
  messageKey: null,
  changed: () => set({ state: 'unsaved', messageKey: null }),
  saving: () => set({ state: 'saving', messageKey: null }),
  saved: () => {
    set({ state: 'saved', messageKey: null });
    // It clears itself, because "saved" is the state of a thing that is over.
    // A failure does not: it stays until the next attempt says otherwise.
    setTimeout(() => {
      const { state } = useWriteStatus.getState();
      if (state === 'saved') set({ state: 'idle' });
    }, SAVED_VISIBLE_MS);
  },
  failed: (messageKey) => set({ state: 'failed', messageKey }),
  clear: () => set({ state: 'idle', messageKey: null }),
}));
