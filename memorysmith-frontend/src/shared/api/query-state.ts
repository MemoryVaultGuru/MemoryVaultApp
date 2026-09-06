/**
 * The three states a fetched screen can be in, told apart once.
 *
 * `isLoading || !data` collapses two of them: with `retry: false` an errored
 * query is not loading and has no data, so it takes the loading branch and
 * the screen says "Loading…" forever over a request that already failed
 * (RN-SUB-022). The failure is silent, and reloading walks the same path.
 *
 * It is a function rather than a rule everyone remembers, because the rule is
 * one line and has already been got wrong on every surface that fetches.
 */
export type QueryState = 'pending' | 'error' | 'ready';

export function queryState(query: {
  isPending?: boolean;
  isLoading?: boolean;
  isError?: boolean;
  data?: unknown;
}): QueryState {
  // The error is read FIRST: a query that failed is not pending, whatever a
  // missing `data` might suggest.
  if (query.isError) return 'error';
  if (query.isPending ?? query.isLoading ?? false) return 'pending';
  // Not pending, not failed, and still nothing: a refetch in flight over a
  // cache that was never filled. It is a wait, and it is not a failure.
  return query.data === undefined || query.data === null ? 'pending' : 'ready';
}
