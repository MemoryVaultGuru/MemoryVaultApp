// The ONE module that knows the identity provider (architecture-guide.md §5.3).
//
// It speaks OAuth 2.1 with PKCE directly against the Cognito hosted UI, with
// no SDK: the flow is three fetches and a redirect, and keeping it explicit is
// what makes the token lifecycle readable.
//
// The subscription_id and subscription_status claims arrive already signed,
// injected by the pre-token-generation trigger (§8.5). The SPA never sends a
// subscription anywhere; it only ever reads what the token says.

export interface AuthConfig {
  readonly domain: string;
  readonly clientId: string;
  readonly redirectUri: string;
  readonly scopes: string;
  /**
   * The language the sign-in page opens in, as the provider spells it. The
   * person already chose a language in the product, and being handed to a
   * page in another one is the seam showing (RN of no rule, just courtesy).
   */
  readonly lang: string;
}

export interface Tokens {
  readonly accessToken: string;
  readonly idToken: string;
  readonly refreshToken: string | null;
  readonly expiresAt: number;
}

export interface TokenClaims {
  readonly sub: string;
  readonly email?: string;
  readonly name?: string;
  readonly subscriptionId?: string;
  readonly subscriptionStatus?: string;
  readonly groups: string[];
}

const VERIFIER_KEY = 'memorysmith.pkce';
const TOKENS_KEY = 'memorysmith.tokens';

function base64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

async function challengeFor(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64Url(new Uint8Array(digest));
}

/** Sends the browser to the hosted UI, remembering the PKCE verifier. */
export async function beginSignIn(config: AuthConfig): Promise<void> {
  const verifier = base64Url(crypto.getRandomValues(new Uint8Array(32)));
  sessionStorage.setItem(VERIFIER_KEY, verifier);

  const url = new URL(`${config.domain}/oauth2/authorize`);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', config.clientId);
  url.searchParams.set('redirect_uri', config.redirectUri);
  url.searchParams.set('scope', config.scopes);
  url.searchParams.set('code_challenge', await challengeFor(verifier));
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('lang', config.lang);
  window.location.assign(url.toString());
}

/** Exchanges the code for tokens. Called once, on the callback route. */
export async function completeSignIn(config: AuthConfig, code: string): Promise<Tokens> {
  const verifier = sessionStorage.getItem(VERIFIER_KEY);
  if (!verifier) throw new Error('The sign-in flow was not started in this browser');

  const response = await fetch(`${config.domain}/oauth2/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      code,
      code_verifier: verifier,
    }),
  });
  sessionStorage.removeItem(VERIFIER_KEY);
  if (!response.ok) throw new Error('The identity provider refused the authorization code');

  return store(await response.json());
}

/** Refreshes silently. Rotation is handled by the provider, not by us. */
export async function refresh(config: AuthConfig): Promise<Tokens | null> {
  const current = readTokens();
  if (!current?.refreshToken) return null;

  const response = await fetch(`${config.domain}/oauth2/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: config.clientId,
      refresh_token: current.refreshToken,
    }),
  });
  if (!response.ok) return null;

  return store(await response.json());
}

export function readTokens(): Tokens | null {
  const raw = localStorage.getItem(TOKENS_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Tokens;
  } catch {
    return null;
  }
}

export function clearTokens(): void {
  localStorage.removeItem(TOKENS_KEY);
}

/**
 * Persists what the token endpoint answered, KEEPING the refresh token when
 * the answer carries none.
 *
 * Cognito returns `refresh_token` on the authorization-code exchange and never
 * on a refresh, so a missing field means "the one you hold is still yours",
 * not "your credential was revoked". Writing `null` over it turned the first
 * silent refresh into the last one: the access token lives an hour, the
 * refresh token thirty days, and the second hour found nothing to refresh
 * with.
 */
function store(payload: unknown): Tokens {
  const body = payload as {
    access_token: string;
    id_token: string;
    refresh_token?: string;
    expires_in: number;
  };
  const tokens: Tokens = {
    accessToken: body.access_token,
    idToken: body.id_token,
    refreshToken: body.refresh_token ?? readTokens()?.refreshToken ?? null,
    expiresAt: Date.now() + body.expires_in * 1000,
  };
  localStorage.setItem(TOKENS_KEY, JSON.stringify(tokens));
  return tokens;
}

/**
 * Reads the claims WITHOUT verifying the signature, which is correct here and
 * would not be on the server: the browser is showing them to their own owner,
 * and every decision that matters is taken by the backend against the signed
 * token it receives.
 */
export function claimsOf(token: string): TokenClaims | null {
  const [, payload] = token.split('.');
  if (!payload) return null;
  try {
    const decoded = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as Record<
      string,
      unknown
    >;
    return {
      sub: String(decoded['sub'] ?? ''),
      email: typeof decoded['email'] === 'string' ? decoded['email'] : undefined,
      name: typeof decoded['name'] === 'string' ? decoded['name'] : undefined,
      subscriptionId:
        typeof decoded['subscription_id'] === 'string' ? decoded['subscription_id'] : undefined,
      subscriptionStatus:
        typeof decoded['subscription_status'] === 'string'
          ? decoded['subscription_status']
          : undefined,
      groups: Array.isArray(decoded['cognito:groups'])
        ? (decoded['cognito:groups'] as unknown[]).map(String)
        : [],
    };
  } catch {
    return null;
  }
}

export function signOut(config: AuthConfig): void {
  clearTokens();
  const url = new URL(`${config.domain}/logout`);
  url.searchParams.set('client_id', config.clientId);
  url.searchParams.set('lang', config.lang);
  url.searchParams.set('logout_uri', new URL('/', config.redirectUri).toString());
  window.location.assign(url.toString());
}
