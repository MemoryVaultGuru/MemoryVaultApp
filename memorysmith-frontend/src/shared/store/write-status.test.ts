/**
 * What the frame says about a write (#81).
 *
 * The screen used to say nothing at all on success and put its one failure
 * message at the top of the content, where it scrolls away with the text. So
 * the only way to learn whether a tick had saved was to reload — and reloading
 * inside the grouping window was itself what destroyed the write.
 *
 * The states are tested here rather than through a render because what
 * matters about them is the sequence and the self-clearing, and neither is
 * something a static markup test can see.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SAVED_VISIBLE_MS, useWriteStatus } from './write-status';

beforeEach(() => {
  vi.useFakeTimers();
  useWriteStatus.getState().clear();
});

afterEach(() => {
  vi.useRealTimers();
});

const state = () => useWriteStatus.getState();

describe('the frame says nothing while there is nothing to say', () => {
  it('starts idle, so a reading surface stays a reading surface', () => {
    expect(state().state).toBe('idle');
    expect(state().messageKey).toBeNull();
  });
});

describe('a write is announced through its whole life', () => {
  it('goes from changed to saving to saved', () => {
    state().changed();
    expect(state().state).toBe('unsaved');

    state().saving();
    expect(state().state).toBe('saving');

    state().saved();
    expect(state().state).toBe('saved');
  });

  it('clears the success on its own, because saved is a state that is over', () => {
    state().saved();
    vi.advanceTimersByTime(SAVED_VISIBLE_MS + 1);

    expect(state().state).toBe('idle');
  });

  it('does not clear a state that arrived after the success', () => {
    // A tick during the two seconds the success is on screen must not be
    // wiped by the timer of the write before it.
    state().saved();
    state().changed();
    vi.advanceTimersByTime(SAVED_VISIBLE_MS + 1);

    expect(state().state).toBe('unsaved');
  });
});

describe('a failure stays until something else happens', () => {
  it('keeps the message rather than clearing itself', () => {
    state().failed('errors.offline');
    vi.advanceTimersByTime(SAVED_VISIBLE_MS * 4);

    expect(state().state).toBe('failed');
    expect(state().messageKey).toBe('errors.offline');
  });

  it('carries the key of the failure it was, and not one sentence for all', () => {
    state().failed('note.writeConflict');
    expect(state().messageKey).toBe('note.writeConflict');

    state().failed('errors.unauthenticated');
    expect(state().messageKey).toBe('errors.unauthenticated');
  });

  it('is replaced by the next attempt', () => {
    state().failed('errors.offline');
    state().changed();

    expect(state().state).toBe('unsaved');
    expect(state().messageKey).toBeNull();
  });
});

describe('the status belongs to the document being read', () => {
  it('is cleared, so a message never outlives what it was about', () => {
    state().saved();
    state().clear();

    expect(state().state).toBe('idle');
  });
});
