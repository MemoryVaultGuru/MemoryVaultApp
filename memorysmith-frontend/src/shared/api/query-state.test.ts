/**
 * The three states of a fetched screen (RN-SUB-022).
 *
 * The case that matters is the second one: with `retry: false` a query that
 * failed is not loading and holds no data, so `isLoading || !data` sent it to
 * the loading branch and the screen said "Loading…" over a request that was
 * already dead.
 */

import { describe, expect, it } from 'vitest';
import { queryState } from './query-state';

describe('a wait, a failure and an answer are three different things', () => {
  it('reads a query still in flight as pending', () => {
    expect(queryState({ isPending: true, isError: false })).toBe('pending');
  });

  it('reads an errored query as an error, and never as a wait', () => {
    expect(queryState({ isPending: false, isError: true, data: undefined })).toBe('error');
    expect(queryState({ isLoading: false, isError: true })).toBe('error');
  });

  it('prefers the failure when a stale answer is still in hand', () => {
    expect(queryState({ isPending: false, isError: true, data: { any: 'thing' } })).toBe('error');
  });

  it('reads an answered query as ready', () => {
    expect(queryState({ isPending: false, isError: false, data: { any: 'thing' } })).toBe('ready');
  });

  it('reads an empty answer as an answer, because zero is a result', () => {
    expect(queryState({ isPending: false, isError: false, data: [] })).toBe('ready');
    expect(queryState({ isPending: false, isError: false, data: 0 })).toBe('ready');
  });

  it('waits when nothing has arrived and nothing has failed', () => {
    expect(queryState({ isPending: false, isError: false, data: undefined })).toBe('pending');
  });
});
