import { QueryClient } from '@tanstack/react-query';

/**
 * A query is never refetched on its own, and what the application writes is
 * invalidated by whoever wrote it.
 *
 * The comment here used to say the seed was static and that the real HTTP
 * client would bring a staleness policy of its own. It arrived in 0.2.0 and
 * brought none, which left the cache permanently holding content the
 * application itself had just overwritten: leaving a note after ticking a box
 * and coming back showed the state from before the edit, and only a reload
 * fixed it, because a reload drops the cache with the page.
 *
 * The policy is the one written here, and it is deliberate rather than
 * inherited. Nothing in a vault changes without somebody writing it, so time
 * is the wrong trigger for a refetch: a write is. `WritableContent`
 * invalidates what it wrote, on success and on conflict alike, and that is
 * the whole of the policy.
 *
 * `retry: false` belongs to the same decision. A failed read is information —
 * a session that ended, a note that is gone — and retrying it silently turns
 * a message into a wait.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: Infinity,
      retry: false,
    },
  },
});
