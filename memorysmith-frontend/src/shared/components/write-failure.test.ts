/**
 * A write that fails says WHY, and never invents a reason.
 *
 * The screen used to render one sentence for every failure — "someone wrote
 * here first, and the content was reloaded" — so a refused request, a dead
 * session and a real conflict all told the same story, and the story was
 * wrong for two of the three. It was reported from production as a conflict
 * on a note nobody else had touched, which is exactly the reader the invented
 * cause sends looking for a person who was never there (#75).
 */

import { describe, expect, it } from 'vitest';
import { ApiError, messageKeyOf } from '../api/error-mapper';

/** What the writer picks, as `useGroupedWrite` picks it. */
function reasonFor(error: unknown): string {
  return (error as { code?: string })?.code === 'CONFLICT'
    ? 'note.writeConflict'
    : messageKeyOf(error);
}

describe('the message names the failure that happened', () => {
  it('says a conflict when it is one, which is the only case that ever was', () => {
    const conflict = new ApiError('CONFLICT', 'The note changed', 409);
    expect(reasonFor(conflict)).toBe('note.writeConflict');
  });

  it('does not claim a conflict for a refused request', () => {
    // The defect that started this: `baseRevision` reached the API as an
    // object, the request was refused at validation, and the screen announced
    // that somebody had written first.
    const refused = new ApiError('VALIDATION', 'baseRevision must be a string', 400);
    expect(reasonFor(refused)).toBe('errors.validation');
    expect(reasonFor(refused)).not.toBe('note.writeConflict');
  });

  it('does not claim a conflict for a session that ended', () => {
    const expired = new ApiError('UNAUTHENTICATED', 'Sign in to continue', 401);
    expect(reasonFor(expired)).toBe('errors.unauthenticated');
  });

  it('does not claim a conflict for a vault that is out of room', () => {
    expect(reasonFor(new ApiError('LIMIT_EXCEEDED', 'quota', 429))).toBe('errors.limitExceeded');
  });

  it('does not claim a conflict when the network is gone', () => {
    expect(reasonFor(new ApiError('OFFLINE', 'unreachable', 0))).toBe('errors.offline');
  });

  it('falls back to the unexpected message for something that is not an ApiError', () => {
    expect(reasonFor(new Error('boom'))).toBe('errors.unexpected');
  });
});
