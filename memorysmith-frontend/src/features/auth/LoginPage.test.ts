/**
 * The sign-in screen never asks for a click that decides nothing.
 *
 * The product used to have two doors into it that behaved differently with
 * nothing on screen to explain why: arriving without a session handed the
 * browser to the provider, and signing out stopped at a card with a button.
 * The button asked for nothing, because the provider owns the credentials.
 *
 * The reason recorded for the sign-out case was a loop: handing the browser
 * back to a provider session that was still warm would sign the person
 * straight back in. **That was checked against the deployed pool before this
 * changed.** `signOut()` goes through the Cognito `/logout` endpoint, which
 * ends the hosted-UI session, and the handover that follows lands on a
 * credentials form. There was no loop left to guard against.
 *
 * The two cases that DO keep the button are pinned here, because sweeping them
 * along would be the easy mistake: the account that reaches nothing has
 * something to say, and the failed handover is the loop guard itself.
 */

import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { WithoutSubscription } from '../../shared/auth/session';

// Importing this module reaches the i18n bootstrap, which reads the browser
// at load time. The decision under test touches none of it.
vi.stubGlobal('localStorage', {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
} as unknown as Storage);

let decideLogin: (marks: {
  denied: WithoutSubscription | null;
  ended: boolean;
  already: boolean;
}) => { kind: string; state?: WithoutSubscription };

beforeAll(async () => {
  ({ decideLogin } = await import('./LoginPage'));
});

describe('a screen with nothing to say hands the browser over', () => {
  it('hands over on a first arrival with no session', () => {
    expect(decideLogin({ denied: null, ended: false, already: false })).toEqual({
      kind: 'handover',
    });
  });

  it('hands over after signing out, which leaves no mark of its own', () => {
    // Signing out lowers the handover guard and marks nothing else, so it
    // reaches this screen exactly as a first arrival does. That identity IS
    // the change: the two doors now behave the same because they are one.
    expect(decideLogin({ denied: null, ended: false, already: false })).toEqual({
      kind: 'handover',
    });
  });
});

describe('a screen with something to say stops and says it', () => {
  it.each(['none', 'pending', 'blocked'] as const)(
    'stops for an account that reaches nothing: %s',
    (state) => {
      expect(decideLogin({ denied: state, ended: false, already: false })).toEqual({
        kind: 'withoutSubscription',
        state,
      });
    },
  );

  it('stops for a session that ended on its own', () => {
    expect(decideLogin({ denied: null, ended: true, already: false })).toEqual({ kind: 'expired' });
  });

  it('stops when a handover in this visit came back with no session', () => {
    expect(decideLogin({ denied: null, ended: false, already: true })).toEqual({
      kind: 'handoverFailed',
    });
  });

  it('never hands over again on its own once a handover has failed', () => {
    // The loop guard has to survive being combined with anything else: a
    // handover that came back empty may not be answered with another one.
    expect(decideLogin({ denied: null, ended: false, already: true }).kind).not.toBe('handover');
    expect(decideLogin({ denied: null, ended: true, already: true }).kind).not.toBe('handover');
  });
});

describe('the order of the marks is part of the rule', () => {
  it('prefers the subscription message over an expiry', () => {
    // It is the one fact a person cannot discover any other way. An expiry
    // resolves itself on the next sign-in; "your subscription is waiting for
    // approval" does not.
    expect(decideLogin({ denied: 'pending', ended: true, already: true })).toEqual({
      kind: 'withoutSubscription',
      state: 'pending',
    });
  });

  it('prefers the expiry over the loop guard', () => {
    expect(decideLogin({ denied: null, ended: true, already: true })).toEqual({ kind: 'expired' });
  });
});
