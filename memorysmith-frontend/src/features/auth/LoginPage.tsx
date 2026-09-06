import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { beginSignIn } from '../../shared/auth/oauth';
import { authConfig, type WithoutSubscription } from '../../shared/auth/session';

/**
 * Marks that this browser already handed itself over to the identity
 * provider. Without it, a sign-in that comes back without a session would
 * bounce between here and the provider forever, and the person would see a
 * flickering screen instead of a message. It lives in sessionStorage because
 * the question it answers is "in THIS visit", and it is cleared the moment a
 * session exists.
 */
const HANDOVER_KEY = 'memorysmith.signin.handover';

/**
 * Marks that the person asked to LEAVE. Handing the browser straight back to
 * the provider is right for someone who arrived without a session; doing it to
 * someone who just clicked "sign out" would undo the very thing they asked
 * for, and on a provider session that is still warm it would sign them back in
 * without a click.
 */
const SIGNED_OUT_KEY = 'memorysmith.signin.signedOut';

/**
 * Marks that the person was signed out because the account reaches nothing:
 * no subscription, one still waiting for approval, or one that is blocked.
 * The value is WHICH of the three, because the three are different facts and
 * a single "no access" would read as a defect to someone whose subscription
 * is merely waiting.
 */
const WITHOUT_SUBSCRIPTION_KEY = 'memorysmith.signin.withoutSubscription';

/**
 * Marks that the session ended on its own: the token could no longer be
 * renewed, or the API refused it. The person did not ask for anything, so the
 * screen owes them the reason — being returned to sign-in in the middle of
 * reading a note reads as a defect when nothing says what happened
 * (RN-SUB-022).
 */
const EXPIRED_KEY = 'memorysmith.signin.expired';

export function clearHandover(): void {
  try {
    sessionStorage.removeItem(HANDOVER_KEY);
  } catch {
    // A browser with storage disabled just loses the loop guard, not the flow.
  }
}

export function markSignedOut(): void {
  try {
    sessionStorage.setItem(SIGNED_OUT_KEY, 'yes');
    sessionStorage.removeItem(HANDOVER_KEY);
  } catch {
    // Without storage the sign-out still happens; only the message is lost.
  }
}

export function markSessionExpired(): void {
  try {
    sessionStorage.setItem(EXPIRED_KEY, 'yes');
    sessionStorage.removeItem(HANDOVER_KEY);
  } catch {
    // Without storage the session still ends; only the message is lost.
  }
}

export function markWithoutSubscription(state: WithoutSubscription): void {
  try {
    sessionStorage.setItem(WITHOUT_SUBSCRIPTION_KEY, state);
    sessionStorage.removeItem(HANDOVER_KEY);
  } catch {
    // Without storage the sign-out still happens; only the message is lost.
  }
}

export function LoginPage() {
  const { t } = useTranslation();
  const started = useRef(false);
  const [handedOver, setHandedOver] = useState(false);
  const [signedOut, setSignedOut] = useState(false);
  const [expired, setExpired] = useState(false);
  const [withoutSubscription, setWithoutSubscription] = useState<WithoutSubscription | null>(null);

  /**
   * There is nothing to decide here: the identity provider owns the
   * credentials, so a screen whose only content is one button is a click
   * asking for nothing. It hands over immediately, and only shows the button
   * if a previous handover in this visit came back without a session.
   */
  useEffect(() => {
    if (started.current) return;
    started.current = true;

    let already = false;
    let left = false;
    let ended = false;
    let denied: WithoutSubscription | null = null;
    try {
      denied = sessionStorage.getItem(WITHOUT_SUBSCRIPTION_KEY) as WithoutSubscription | null;
      sessionStorage.removeItem(WITHOUT_SUBSCRIPTION_KEY);
      left = sessionStorage.getItem(SIGNED_OUT_KEY) === 'yes';
      sessionStorage.removeItem(SIGNED_OUT_KEY);
      ended = sessionStorage.getItem(EXPIRED_KEY) === 'yes';
      sessionStorage.removeItem(EXPIRED_KEY);
      already = sessionStorage.getItem(HANDOVER_KEY) === 'yes';
      if (!left && !denied && !ended) sessionStorage.setItem(HANDOVER_KEY, 'yes');
    } catch {
      // Storage refused: fall through and hand over anyway.
    }
    // Handing the browser back to the provider here would sign the same
    // account straight back in, on a provider session that is still warm, and
    // it would be shown the door again: the person would watch the two screens
    // trade the browser back and forth and never read the reason.
    if (denied) {
      setWithoutSubscription(denied);
      return;
    }
    // A session that ended on its own owes an explanation before anything
    // else happens. Handing over here would take the person to a credentials
    // form they never asked for, and the reason would be lost on the way.
    if (ended) {
      setExpired(true);
      return;
    }
    if (left) {
      setSignedOut(true);
      return;
    }
    if (already) {
      setHandedOver(true);
      return;
    }
    void beginSignIn(authConfig());
  }, []);

  return (
    <div className="login-screen">
      <div className="login-card">
        <img src="/symbol.svg" alt="" className="login-symbol symbol-light" />
        <img src="/symbol-dark.svg" alt="" className="login-symbol symbol-dark" />
        <h1 className="brand-word">
          MemorySmith<span className="brand-suffix">.app</span>
        </h1>
        <p className="login-tagline">{t('app.tagline')}</p>

        <div className="login-form">
          <p className="login-hint">
            {withoutSubscription
              ? t(`auth.${withoutSubscription}Subscription`)
              : expired
                ? t('auth.sessionExpired')
                : signedOut
                  ? t('auth.signedOut')
                  : handedOver
                    ? t('auth.handoverFailed')
                    : t('auth.handingOver')}
          </p>
          {withoutSubscription || expired || signedOut || handedOver ? (
            <button
              type="button"
              className="button-primary"
              onClick={() => void beginSignIn(authConfig())}
            >
              {t('auth.signIn')}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
