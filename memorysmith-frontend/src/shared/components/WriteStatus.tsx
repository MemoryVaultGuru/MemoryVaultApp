import { useTranslation } from 'react-i18next';
import { useWriteStatus } from '../store/write-status';

/**
 * What happened to the write, in the frame of the screen.
 *
 * It lives in the header because the header is already fixed: the message is
 * visible from any scroll position, it covers no content, and it needs no
 * overlay of its own. It renders nothing at all while there is nothing to
 * say, which is what keeps a reading surface a reading surface.
 *
 * It is a live region, announced politely. The message it replaced was a
 * paragraph of the note, so a screen reader met it only by reaching it while
 * reading — which, in a note of any length, is nowhere near the box that was
 * ticked.
 */
export function WriteStatus() {
  const { t } = useTranslation();
  const state = useWriteStatus((store) => store.state);
  const messageKey = useWriteStatus((store) => store.messageKey);

  // `aria-live` has to be in the tree BEFORE the text arrives, or the change
  // is not announced. So the region is always rendered and only its content
  // comes and goes.
  return (
    <div className="write-status" role="status" aria-live="polite" data-state={state}>
      {state === 'idle' ? null : (
        <>
          <span className="write-status-dot" aria-hidden="true" />
          <span className="write-status-text">
            {state === 'failed' ? t(messageKey ?? 'errors.unexpected') : t(`write.${state}`)}
          </span>
        </>
      )}
    </div>
  );
}
