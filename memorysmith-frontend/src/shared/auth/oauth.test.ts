/**
 * The credential the browser holds, across a silent refresh (RN-SUB-022).
 *
 * The defect this pins down had a two-hour fuse and no symptom: the access
 * token lives an hour, so the FIRST refresh succeeded and disarmed every one
 * after it by writing `null` over a refresh token valid for thirty days.
 * Cognito does not return `refresh_token` on a `grant_type=refresh_token`
 * exchange, and a missing field is not a revoked credential.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readTokens, refresh, type AuthConfig } from './oauth';

const config: AuthConfig = {
  domain: 'https://auth.example.test',
  clientId: 'client',
  redirectUri: 'https://app.example.test/auth/callback',
  scopes: 'openid email profile',
  lang: 'en',
};

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key: string) => map.get(key) ?? null,
    key: (index: number) => [...map.keys()][index] ?? null,
    removeItem: (key: string) => void map.delete(key),
    setItem: (key: string, value: string) => void map.set(key, value),
  } as Storage;
}

/** What the browser holds after a successful sign-in. */
function signedIn(): void {
  localStorage.setItem(
    'memorysmith.tokens',
    JSON.stringify({
      accessToken: 'access-1',
      idToken: 'id-1',
      refreshToken: 'refresh-30-days',
      expiresAt: Date.now() - 1,
    }),
  );
}

/** What Cognito answers to a refresh: everything but the refresh token. */
function refreshed(): Response {
  return {
    ok: true,
    json: () => Promise.resolve({ access_token: 'access-2', id_token: 'id-2', expires_in: 3600 }),
  } as Response;
}

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('a silent refresh keeps the credential it was made with', () => {
  it('keeps the refresh token when the answer carries none', async () => {
    signedIn();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(refreshed()));

    const tokens = await refresh(config);

    expect(tokens?.accessToken).toBe('access-2');
    expect(tokens?.refreshToken).toBe('refresh-30-days');
    expect(readTokens()?.refreshToken).toBe('refresh-30-days');
  });

  it('survives a second refresh, which is where the defect showed', async () => {
    signedIn();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(refreshed()));

    await refresh(config);
    // The stored token has just been written with a fresh hour of life; a
    // second exchange is what a browser left open long enough performs.
    localStorage.setItem(
      'memorysmith.tokens',
      JSON.stringify({ ...readTokens(), expiresAt: Date.now() - 1 }),
    );
    const second = await refresh(config);

    expect(second?.refreshToken).toBe('refresh-30-days');
  });

  it('takes a rotated refresh token when the provider does send one', async () => {
    signedIn();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            access_token: 'access-2',
            id_token: 'id-2',
            refresh_token: 'rotated',
            expires_in: 3600,
          }),
      } as Response),
    );

    expect((await refresh(config))?.refreshToken).toBe('rotated');
  });

  it('refuses to refresh with nothing, instead of asking the provider', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    expect(await refresh(config)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
