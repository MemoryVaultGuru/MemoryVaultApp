// Ending a session the browser can no longer use (RN-SUB-022).
//
// It lives here, and not in `shared/`, because it is the one place that knows
// all three halves at once: the credentials in `shared/auth`, the store the
// screens read, and the mark the sign-in screen renders. Wiring it into the
// HTTP client at bootstrap is what keeps every screen out of the business of
// noticing that a session died.

import { clearTokens } from '../shared/auth/oauth';
import { useLiveSession } from '../shared/auth/session';
import { markSessionExpired } from '../features/auth/LoginPage';

let ending = false;

/**
 * Throws the dead credentials away and returns the person to the sign-in
 * screen, with the reason.
 *
 * The guard matters: a screen holds several queries and they all fail at the
 * same moment, so without it one dead token becomes a handful of navigations
 * racing each other. The flag is never lowered, because this function only
 * ever ends in a page load.
 */
export function endExpiredSession(): void {
  if (ending) return;
  ending = true;

  markSessionExpired();
  clearTokens();
  useLiveSession.getState().clear();

  // A full load rather than a router navigation: everything already fetched
  // belongs to a session that no longer exists, and starting from nothing is
  // the only state that is certainly consistent.
  window.location.assign('/login');
}
