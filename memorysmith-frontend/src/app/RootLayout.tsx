import { useEffect } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { usePreferences, resolveTheme } from '../shared/store/preferences';
import { useLiveSession, authConfig, type WithoutSubscription } from '../shared/auth/session';
import { readTokens, signOut as endHostedSession } from '../shared/auth/oauth';
import { markWithoutSubscription } from '../features/auth/LoginPage';
import { AppSkeleton } from '../shared/components/skeletons';

// Applies the effective theme (light/dark/system) to the document root and
// re-applies it when the OS preference changes while in system mode.
export function RootLayout() {
  const theme = usePreferences((s) => s.theme);
  const load = useLiveSession((state) => state.load);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      document.documentElement.dataset.theme = resolveTheme(theme);
    };
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [theme]);

  useEffect(() => {
    // The session comes from the token, always.
    void load();
  }, [load]);

  return <Outlet />;
}

/**
 * The guard. It answers three questions in order: is there a token, does it
 * carry a subscription, and does that subscription grant operational access.
 *
 * Either a session reaches the product or it does not exist. A token whose
 * subscription is missing, still waiting or blocked cannot do a single thing
 * in here, so instead of parking the person on a screen of their own they are
 * signed out and told why on the sign-in screen. Why it says WHICH of the
 * three: "there is nothing here" and "your access is suspended" are different
 * facts, and the second one reads as a defect when it is not spelled out
 * (software-vision.md, section 13.2).
 */
export function RequireSession() {
  const live = useLiveSession((state) => state.session);
  const loaded = useLiveSession((state) => state.loaded);

  if (!readTokens()) return <Navigate to="/login" replace />;
  // A token exists, so the only honest answer before the session resolves is
  // to wait. This guard renders BEFORE the effect that starts the load, so
  // reading "no session" here would mean "not asked yet", and redirecting on
  // it sends every page load and every deep link back to sign-in.
  if (!loaded) return <AppSkeleton />;
  if (!live) return <Navigate to="/login" replace />;

  if (live.subscriptionState !== 'active') {
    return <SignOutWithoutSubscription state={live.subscriptionState} />;
  }

  return <Outlet />;
}

/**
 * Leaving, when the session cannot be used. The reason is recorded first and
 * the redirect is the last thing that happens, because nothing may change
 * React state on the way out: a re-render during the trip to the provider is
 * what used to replace the pending navigation and bring the person back signed
 * in.
 */
function SignOutWithoutSubscription({ state }: { state: WithoutSubscription }) {
  useEffect(() => {
    markWithoutSubscription(state);
    endHostedSession(authConfig());
  }, [state]);

  return <AppSkeleton />;
}
