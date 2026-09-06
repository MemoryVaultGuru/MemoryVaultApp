// The HTTP client. Every call to the backend goes through here, and this is
// the only place that knows about bearer tokens and status codes.
//
// NO REQUEST EVER CARRIES A subscriptionId. It comes from the token, always
// (RN-SUB-002), which is why nothing below takes one.

import { apiErrorFrom, ApiError } from './error-mapper';
import { readTokens, refresh, type AuthConfig } from '../auth/oauth';

export interface HttpConfig {
  readonly origin: string;
  readonly auth: AuthConfig;
  /**
   * Called once for every request that cannot authenticate: no usable token
   * here, or a `401` from the API. It is the ONE place that reacts to a dead
   * session, so no screen has to (RN-SUB-022). Optional, because the
   * prototype configures no backend at all.
   */
  readonly onUnauthenticated?: () => void;
}

let config: HttpConfig | null = null;

export function configureHttp(next: HttpConfig): void {
  config = next;
}

export function apiOrigin(): string | null {
  return config?.origin ?? null;
}

async function bearer(): Promise<string | null> {
  const tokens = readTokens();
  if (!tokens) return null;
  // A minute of margin, so a request never leaves with a token that expires
  // while it is in flight.
  if (tokens.expiresAt - Date.now() > 60_000) return tokens.accessToken;
  if (!config) return tokens.accessToken;
  return (await refresh(config.auth))?.accessToken ?? null;
}

export async function request<T>(
  path: string,
  init: {
    method?: string;
    body?: unknown;
    accept?: 'json' | 'text';
    /**
     * Let the browser finish this request after the page is gone. It is for
     * a write made on the way out — a reload, a closed tab, an app switched
     * away from — where the ordinary request would simply be dropped.
     */
    keepalive?: boolean;
  } = {},
): Promise<T> {
  if (!config) throw new ApiError('INTERNAL', 'The API client was not configured', 0);

  const token = await bearer();
  if (!token) throw unauthenticated(new ApiError('UNAUTHENTICATED', 'Sign in to continue', 401));

  let response: Response;
  try {
    response = await fetch(`${config.origin}${path}`, {
      method: init.method ?? 'GET',
      headers: {
        authorization: `Bearer ${token}`,
        ...(init.body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
      ...(init.keepalive ? { keepalive: true } : {}),
    });
  } catch {
    // A failed fetch is the network, not the API: saying so is the difference
    // between "we are down" and "you are offline".
    throw new ApiError('OFFLINE', 'The application could not reach the server', 0);
  }

  if (response.status === 204) return undefined as T;

  if (init.accept === 'text') {
    const text = await response.text();
    if (!response.ok) throw unauthenticated(apiErrorFrom(response.status, safeJson(text)));
    return text as T;
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok) throw unauthenticated(apiErrorFrom(response.status, payload));
  return payload as T;
}

/**
 * Passes an error through, ending the session first when it is the one error
 * no screen can recover from.
 *
 * It returns the error rather than throwing it so the call sites keep reading
 * as `throw`, and every path out of this module goes through here: a token
 * that cannot be renewed and a `401` from the API are the same fact, and
 * reacting to only one of them is how a browser keeps believing in a session
 * the server has already refused.
 */
function unauthenticated(error: ApiError): ApiError {
  if (error.code === 'UNAUTHENTICATED') config?.onUnauthenticated?.();
  return error;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
