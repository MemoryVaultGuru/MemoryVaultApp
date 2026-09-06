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

/**
 * Forgets that this visit already handed over.
 *
 * Two things call it, and for the same reason: a sign-in that SUCCEEDED, and a
 * sign-out. Both end the attempt the mark was guarding — one by producing a
 * session, the other by the person deliberately starting over — so the next
 * arrival at this screen is a first arrival and hands over on its own.
 */
export function clearHandover(): void {
  try {
    sessionStorage.removeItem(HANDOVER_KEY);
  } catch {
    // A browser with storage disabled just loses the loop guard, not the flow.
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

/** What the sign-in screen does on arrival. */
export type LoginOutcome =
  | { readonly kind: 'handover' }
  | { readonly kind: 'withoutSubscription'; readonly state: WithoutSubscription }
  | { readonly kind: 'expired' }
  | { readonly kind: 'handoverFailed' };

/**
 * The rule of this screen, as a decision over the marks that reach it.
 *
 * **It never asks for a click that decides nothing.** Every path that arrives
 * with no session to explain hands the browser to the identity provider; it
 * stops and speaks only when it has something to say. Signing out is not one
 * of those: the person who left knows they left, and telling them so is a
 * screen they have to dismiss to get what they came back for.
 *
 * The order matters and is not alphabetical. A subscription that reaches
 * nothing is read first, because that is the one message a person cannot
 * discover any other way; an expiry second, because it explains a return the
 * person did not ask for; and the loop guard last, because it only applies to
 * a handover this visit already tried.
 */
export function decideLogin(marks: {
  readonly denied: WithoutSubscription | null;
  readonly ended: boolean;
  readonly already: boolean;
}): LoginOutcome {
  if (marks.denied) return { kind: 'withoutSubscription', state: marks.denied };
  if (marks.ended) return { kind: 'expired' };
  if (marks.already) return { kind: 'handoverFailed' };
  return { kind: 'handover' };
}

export function LoginPage() {
  const { t } = useTranslation();
  const started = useRef(false);
  const [handedOver, setHandedOver] = useState(false);
  const [expired, setExpired] = useState(false);
  const [withoutSubscription, setWithoutSubscription] = useState<WithoutSubscription | null>(null);

  /**
   * This screen never asks for a click that decides nothing.
   *
   * The identity provider owns the credentials, so arriving here with no
   * session to explain is not a decision: the browser is handed over, and the
   * page the person lands on is dressed in the brand and says plainly that it
   * wants credentials. It stops and speaks only when it has something to say —
   * an account that reaches nothing, a session that ended on its own, or a
   * sign-in that came back empty.
   *
   * **Signing out used to stop here too**, on the argument that handing the
   * browser back would sign a still-warm provider session straight back in.
   * That was checked against the deployed pool before this was changed:
   * `signOut()` goes through the Cognito `/logout` endpoint, which ends the
   * hosted-UI session, and the handover that follows lands on a credentials
   * form. There is no loop, so there was nothing left for the click to protect.
   */
  useEffect(() => {
    if (started.current) return;
    started.current = true;

    let already = false;
    let ended = false;
    let denied: WithoutSubscription | null = null;
    try {
      denied = sessionStorage.getItem(WITHOUT_SUBSCRIPTION_KEY) as WithoutSubscription | null;
      sessionStorage.removeItem(WITHOUT_SUBSCRIPTION_KEY);
      ended = sessionStorage.getItem(EXPIRED_KEY) === 'yes';
      sessionStorage.removeItem(EXPIRED_KEY);
      already = sessionStorage.getItem(HANDOVER_KEY) === 'yes';
      // Armed on the way out, and on the sign-out path too: `clearHandover()`
      // lowered it when the person left, so a handover that comes back with no
      // session still finds the guard raised and stops instead of looping.
      if (!denied && !ended) sessionStorage.setItem(HANDOVER_KEY, 'yes');
    } catch {
      // Storage refused: fall through and hand over anyway.
    }
    const outcome = decideLogin({ denied, ended, already });
    // `withoutSubscription`: handing the browser back would sign the same
    // account straight in and show it the door again, and the person would
    // watch the two screens trade the browser without ever reading the reason.
    if (outcome.kind === 'withoutSubscription') return setWithoutSubscription(outcome.state);
    // `expired`: the person did not ask for anything, so the return to this
    // screen owes an explanation. Handing over would take them to a
    // credentials form they never asked for and lose the reason on the way.
    if (outcome.kind === 'expired') return setExpired(true);
    // `handoverFailed`: the loop guard itself. A sign-in that came back with
    // no session must never trigger another one on its own.
    if (outcome.kind === 'handoverFailed') return setHandedOver(true);
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
                : handedOver
                  ? t('auth.handoverFailed')
                  : t('auth.handingOver')}
          </p>
          {withoutSubscription || expired || handedOver ? (
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
