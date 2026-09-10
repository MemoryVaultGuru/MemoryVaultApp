/**
 * The driver of the retitling migration (#102): what it actually sends.
 *
 * The transformations are asserted next door, against the readers of 0.6.0.
 * What is left is the half nobody can check by reading it — that a run reports
 * without writing, that a write goes through the product API carrying the
 * revision it read, and that a job pointed at the wrong version of the API
 * refuses instead of writing `title: undefined` into fifteen hundred notes.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { main } from '../src/retitle.js';

interface Call {
  readonly method: string;
  readonly path: string;
  readonly body: Record<string, unknown> | null;
}

const VAULT = { vaultId: 'v1', name: 'Contratos' };
const SUMMARY = { noteId: 'n1', title: 'Lei 14.133', slug: 'lei-14133' };
const NOTE = {
  ...SUMMARY,
  content: 'Ver [[lei-14133]].\n',
  revision: { contentId: 'c1', versionId: 'ver-7', sha256: 'x', bytes: 19 },
};

/** The 0.5.7 API, answering from memory, and recording what it was asked. */
function stubApi(notes: Array<Record<string, unknown>> = [SUMMARY]): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal('fetch', (url: string, init: RequestInit) => {
    const path = url.replace('https://api.example', '');
    calls.push({
      method: init.method ?? 'GET',
      path,
      body: init.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null,
    });

    const answer =
      path === '/knowledge/vaults' ? [VAULT] : path === '/knowledge/vaults/v1/notes' ? notes : NOTE;
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(answer),
      text: () => Promise.resolve(''),
    } as Response);
  });
  return calls;
}

beforeEach(() => {
  process.env['API_ORIGIN'] = 'https://api.example';
  process.env['ACCESS_TOKEN'] = 'token';
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('the migration run', () => {
  it('writes nothing without --apply', async () => {
    const calls = stubApi();
    expect(await main([])).toBe(0);
    expect(calls.filter((call) => call.method !== 'GET')).toEqual([]);
  });

  it('writes through the product API, echoing the revision it read', async () => {
    const calls = stubApi();
    expect(await main(['--apply'])).toBe(0);

    const written = calls.filter((call) => call.method === 'PUT');
    expect(written).toHaveLength(1);
    expect(written[0]?.path).toBe('/knowledge/vaults/v1/notes/n1');
    expect(written[0]?.body).toEqual({
      content: '---\ntitle: Lei 14.133\n---\n\nVer [[Lei 14.133]].\n',
      // The revision this write is based on, not the whole content reference:
      // one produces a new revision, the other is refused at validation.
      baseRevision: 'ver-7',
      title: 'Lei 14.133',
    });
  });

  it('refuses an API that no longer carries the stored title and its slug', async () => {
    // Run after the deploy, it would find no slug to resolve against, report
    // every link pending and write a title read out of nothing. The
    // information it needs is gone by then, and the answer is the right order.
    stubApi([{ noteId: 'n1', title: 'Lei 14.133' }]);
    await expect(main(['--apply'])).rejects.toThrow(/BEFORE the deploy/);
  });
});
