// The session, as the token tells it.
//
// With the backend live, everything here comes from the claims and from
// GET /access/session. Without it, the prototype keeps its simulated session,
// and the screens cannot tell the difference.
//
// The subscription is never chosen by the SPA: it is the claim the token
// carries (RN-SUB-002), and switching it is an explicit call that mints a new
// token (RN-SUB-013).

import { create } from 'zustand';
import type { SessionDto } from '@memorysmith/contracts';
import { claimsOf, readTokens, type AuthConfig } from './oauth';
import { ApiError } from '../api/error-mapper';
import { getSession } from '../api/backend';
import i18n from '../../i18n';

export type SubscriptionState =
  | 'none' // signed in, has not asked for a subscription yet
  | 'pending' // asked, waiting for a platform admin
  | 'blocked' // rejected, suspended or cancelled
  | 'active'; // trial or active: the product is usable

/** The states that keep someone out of the product, and out of a session. */
export type WithoutSubscription = Exclude<SubscriptionState, 'active'>;

/** The commercial shape of the active subscription, as the API declares it. */
export type SubscriptionType = SessionDto['subscriptions'][number]['type'];
export type StorageQuota = SessionDto['subscriptions'][number]['quota'];
export type SubscriptionStatus = SessionDto['subscriptions'][number]['status'];

export interface LiveSession {
  readonly userId: string;
  readonly email: string;
  readonly name: string;
  readonly isPlatformAdmin: boolean;
  readonly subscriptionState: SubscriptionState;
  /**
   * Type, quota and the status as it is spelled, not as it is grouped:
   * `subscriptionState` above answers "does this session reach the product",
   * and `trial` and `active` give it the same answer. The menu shows the
   * subscription the person has, and those two are not the same thing to say.
   */
  readonly subscriptionType: SubscriptionType | null;
  readonly subscriptionQuota: StorageQuota | null;
  /** The same ceiling in bytes, as the API declares it (RN-SUB-019). */
  readonly subscriptionQuotaBytes: number | null;
  /** What the subscription is storing now (RN-SUB-021). */
  readonly usedBytes: number | null;
  readonly subscriptionStatus: SubscriptionStatus | null;
  /** The role in the active subscription, already resolved by the API. */
  readonly role: SessionDto['role'];
  readonly subscriptions: SessionDto['subscriptions'];
}

interface SessionStore {
  session: LiveSession | null;
  loading: boolean;
  /**
   * Whether load() has finished at least once. It is NOT the negation of
   * `loading`: before the first call, nothing is loading and nothing is
   * loaded, and those two states are what a route guard has to tell apart.
   * Reading "no session" during that gap is how a guard bounces a perfectly
   * valid token to the sign-in screen on every page load.
   */
  loaded: boolean;
  error: string | null;
  load: () => Promise<void>;
  clear: () => void;
}

function stateOf(status: string | undefined): SubscriptionState {
  if (!status) return 'none';
  if (status === 'trial' || status === 'active') return 'active';
  if (status === 'pending_approval') return 'pending';
  return 'blocked';
}

export const useLiveSession = create<SessionStore>((set) => ({
  session: null,
  loading: false,
  loaded: false,
  error: null,

  async load(): Promise<void> {
    const tokens = readTokens();
    if (!tokens) {
      set({ session: null, loading: false, loaded: true });
      return;
    }
    set({ loading: true, error: null });

    const claims = claimsOf(tokens.accessToken) ?? claimsOf(tokens.idToken);
    try {
      const dto = await getSession();
      const active =
        dto.activeSubscription ??
        dto.subscriptions.find((link) => link.subscriptionId === claims?.subscriptionId);
      set({
        loading: false,
        loaded: true,
        session: {
          userId: dto.user.userId,
          email: dto.user.email,
          name: dto.user.name,
          isPlatformAdmin: dto.user.isPlatformAdmin,
          // The status in the token is what governs access, and it ages with
          // the token: a suspension takes effect on the next refresh (§8.5).
          subscriptionState: stateOf(claims?.subscriptionStatus ?? active?.status),
          subscriptionType: active?.type ?? null,
          subscriptionQuota: active?.quota ?? null,
          subscriptionQuotaBytes: active?.quotaBytes ?? null,
          // `?? null` and not the value straight: an API that predates the
          // counter answers without the field, and `undefined` reaching the
          // menu would render a bar measuring nothing.
          usedBytes: dto.usedBytes ?? null,
          subscriptionStatus: active?.status ?? null,
          role: dto.role,
          subscriptions: dto.subscriptions,
        },
      });
    } catch (error) {
      // A failure to AUTHENTICATE is not a degraded session, it is no session
      // (RN-SUB-022). Rebuilding one out of the claims of a token the API has
      // just refused is what let a dead session keep passing the guard: the
      // claims still parse and still say `active` long after the token stops
      // being accepted. Anything else — offline, a 500 — is a session we know
      // exists and cannot describe, and that one still degrades.
      const refused = error instanceof ApiError && error.code === 'UNAUTHENTICATED';
      set({
        loading: false,
        loaded: true,
        error: error instanceof Error ? error.message : 'unknown',
        session:
          claims && !refused
            ? {
                userId: claims.sub,
                email: claims.email ?? '',
                name: claims.name ?? claims.email ?? '',
                isPlatformAdmin: claims.groups.includes('platform-admin'),
                subscriptionState: stateOf(claims.subscriptionStatus),
                subscriptionType: null,
                subscriptionQuota: null,
                subscriptionQuotaBytes: null,
                usedBytes: null,
                subscriptionStatus: null,
                role: 'NONE',
                subscriptions: [],
              }
            : null,
      });
    }
  },

  clear(): void {
    set({ session: null, error: null, loading: false, loaded: true });
  },
}));

/**
 * The locale of the product, as the identity provider spells it. Our codes are
 * the i18n ones (`en_US`, `pt_BR`); the provider wants BCP 47, and it answers
 * in English to anything it does not know, so the mapping is explicit and the
 * fallback is the canonical locale rather than a guess.
 */
function providerLang(): string {
  return i18n.language === 'pt_BR' ? 'pt-BR' : 'en';
}

export function authConfig(): AuthConfig {
  const env = import.meta.env as Record<string, string | undefined>;
  return {
    domain: (env['VITE_COGNITO_DOMAIN'] ?? '').replace(/\/$/, ''),
    clientId: env['VITE_COGNITO_CLIENT_ID'] ?? '',
    redirectUri: `${window.location.origin}/auth/callback`,
    scopes: 'openid email profile',
    lang: providerLang(),
  };
}
