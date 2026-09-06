import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SUPPORTED_LOCALES, setLocale, type Locale } from '../../i18n';
import { usePreferences, type ThemeChoice } from '../store/preferences';
import {
  useLiveSession,
  authConfig,
  type LiveSession,
  type StorageQuota,
  type SubscriptionStatus,
  type SubscriptionType,
} from '../auth/session';
import { signOut as endHostedSession } from '../auth/oauth';
import { gravatarDisplayName } from '../auth/gravatar';
import { clearHandover } from '../../features/auth/LoginPage';
import { Avatar } from './Avatar';
import { StorageBar } from './StorageBar';
import { MonitorIcon, MoonIcon, SunIcon } from './icons';

const THEME_OPTIONS: { value: ThemeChoice; Icon: typeof SunIcon }[] = [
  { value: 'light', Icon: SunIcon },
  { value: 'dark', Icon: MoonIcon },
  { value: 'system', Icon: MonitorIcon },
];

/** What the menu shows, whichever session is answering. */
interface Identity {
  readonly name: string;
  readonly email: string;
  readonly role: string;
  readonly subscriptionType: SubscriptionType | null;
  readonly subscriptionQuota: StorageQuota | null;
  readonly subscriptionQuotaBytes: number | null;
  readonly usedBytes: number | null;
  readonly subscriptionStatus: SubscriptionStatus | null;
}

/**
 * The chip shows the role in the subscription, which the API already resolved.
 * A vault ceiling can lower it for a given vault but never raise it
 * (RN-ACC-011), so it belongs on the vault screen and not here.
 */
function identityOf(live: LiveSession): Identity {
  return {
    name: live.name,
    email: live.email,
    role: live.role,
    subscriptionType: live.subscriptionType,
    subscriptionQuota: live.subscriptionQuota,
    subscriptionQuotaBytes: live.subscriptionQuotaBytes,
    usedBytes: live.usedBytes,
    subscriptionStatus: live.subscriptionStatus,
  };
}

export function UserMenu() {
  const { t, i18n } = useTranslation();
  /** The session is the one the identity provider minted, and there is no other. */
  const live = useLiveSession((s) => s.session);

  const user: Identity | null = live ? identityOf(live) : null;
  const theme = usePreferences((s) => s.theme);
  const setTheme = usePreferences((s) => s.setTheme);
  const [open, setOpen] = useState(false);
  const [borrowedName, setBorrowedName] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  /**
   * The identity provider has no name for everyone, and when it has none the
   * API answers with the e-mail, which is why this menu used to print the same
   * line twice. Gravatar is asked ONLY in that case: a name the person gave
   * the identity provider always wins over one a third party knows about them.
   */
  const nameIsMissing = user !== null && user.name === user.email;
  useEffect(() => {
    if (!nameIsMissing || user === null) return;
    let alive = true;
    void gravatarDisplayName(user.email).then((name) => {
      if (alive) setBorrowedName(name);
    });
    return () => {
      alive = false;
    };
  }, [nameIsMissing, user?.email]);

  const shownName = user === null ? '' : nameIsMissing ? (borrowedName ?? '') : user.name;

  useEffect(() => {
    function onClickOutside(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  if (!user) return null;

  /**
   * NOTHING may change React state before the redirect. Clearing the session
   * here used to schedule a re-render that ran while the browser was still on
   * its way to the provider's logout: the guard saw no token, sent the router
   * to /login, and /login handed the browser BACK to the provider, replacing
   * the pending navigation. The logout was never reached and the person came
   * back signed in.
   *
   * So the order is the whole fix: lower the guard, then leave. The tokens
   * are cleared inside the redirect, and the page is going away anyway.
   *
   * Lowering the handover guard is what makes signing out start a fresh
   * attempt: the sign-in screen hands the browser to the provider without
   * asking, and it may only do that on a first arrival.
   */
  function handleSignOut() {
    clearHandover();
    endHostedSession(authConfig());
  }

  return (
    <div className="user-menu" ref={rootRef}>
      <button
        type="button"
        className="user-menu-trigger"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <Avatar email={user.email} size={32} />
      </button>
      {open && (
        <div className="user-menu-panel">
          <div className="user-menu-identity">
            <Avatar email={user.email} size={48} />
            <div>
              {/*
                One line per thing. With no name to show, the e-mail is the
                identity and stands alone, instead of being printed twice.
              */}
              {shownName ? <strong>{shownName}</strong> : null}
              <div className={shownName ? 'user-menu-email' : undefined}>{user.email}</div>
            </div>
          </div>

          {/*
            Every value here is a term of the domain, and none of them is shown
            as the code spells it: OWNER and individual are symbols, not words
            a person reads. They go through i18n, and the key is the symbol.

            THE SUBSCRIPTION HAS NO NAME to show (RN-SUB-020): what identifies
            it is the perpetual id, and who holds it is the person reading this
            menu. What is worth saying about it is the plan and the quota.

            The status is shown only for `trial`, which is a fact worth saying.
            `active` adds nothing, and no other status reaches this menu: a
            session without operational access never gets past the sign-in
            screen (RN-SUB-007).
          */}
          <div className="user-menu-fields">
            <div className="user-menu-field">
              <span className="user-menu-field-label">{t('auth.role')}</span>
              <span className="chip">{t(`roles.${user.role}`)}</span>
            </div>
            {user.subscriptionType ? (
              <div className="user-menu-field">
                <span className="user-menu-field-label">{t('auth.plan')}</span>
                <span className="chip">{t(`subscriptionType.${user.subscriptionType}`)}</span>
              </div>
            ) : null}
            {/*
              The plan's ceiling alone answers a question nobody asks. What is
              worth knowing is how much of it is left, so when the API says how
              much is stored the chip becomes a bar; the plain chip stays as the
              fallback for a session answering from the token alone.
            */}
            {user.subscriptionQuota ? (
              <div className="user-menu-field">
                <span className="user-menu-field-label">{t('auth.storage')}</span>
                {user.usedBytes !== null && user.subscriptionQuotaBytes ? (
                  <StorageBar usedBytes={user.usedBytes} quotaBytes={user.subscriptionQuotaBytes} />
                ) : (
                  <span className="chip">{t(`storageQuota.${user.subscriptionQuota}`)}</span>
                )}
              </div>
            ) : null}
            {user.subscriptionStatus === 'trial' ? (
              <div className="user-menu-field">
                <span className="user-menu-field-label">{t('auth.status')}</span>
                <span className="chip">{t('subscriptionStatus.trial')}</span>
              </div>
            ) : null}
          </div>

          <div className="user-menu-section">
            <p className="user-menu-caption">{t('theme.heading')}</p>
            <div className="theme-options">
              {THEME_OPTIONS.map(({ value, Icon }) => (
                <button
                  key={value}
                  type="button"
                  className={theme === value ? 'active' : ''}
                  onClick={() => setTheme(value)}
                  title={t(`theme.${value}`)}
                  aria-label={t(`theme.${value}`)}
                >
                  <Icon />
                </button>
              ))}
            </div>
          </div>

          {/*
            The language belongs beside the theme, because both are the same
            kind of thing: how this person wants to be shown the product. Each
            language is named in itself, so the option a person is looking for
            reads the same whichever locale is active when they open the menu.
          */}
          <div className="user-menu-section">
            <p className="user-menu-caption">{t('language.heading')}</p>
            <div className="locale-options">
              {SUPPORTED_LOCALES.map((locale: Locale) => (
                <button
                  key={locale}
                  type="button"
                  className={i18n.language === locale ? 'active' : ''}
                  onClick={() => setLocale(locale)}
                >
                  {t(`language.${locale}`)}
                </button>
              ))}
            </div>
          </div>

          <div className="user-menu-section">
            <button type="button" className="user-menu-signout" onClick={handleSignOut}>
              {t('auth.signOut')}
            </button>
          </div>

          {/*
            The version, at the foot of the panel and in the quietest type on
            it. It is the first thing anyone is asked for when something looks
            wrong, and the last thing anyone needs while reading a vault, so it
            is present and never in the way.
          */}
          <p className="user-menu-version">{t('app.version', { version: __APP_VERSION__ })}</p>
        </div>
      )}
    </div>
  );
}
