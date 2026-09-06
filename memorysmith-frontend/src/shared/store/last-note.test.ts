/**
 * Where the reading stopped, per vault and per browser.
 *
 * Everything here has to survive a browser that refuses storage, because the
 * feature is a convenience and the vault opening is not: a throw from
 * `localStorage` may never be what keeps somebody out of their own notes.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { forgetNote, lastNoteOf, rememberNote } from './last-note';

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

/** A browser that refuses site data: every accessor throws. */
function refusingStorage(): Storage {
  const refuse = (): never => {
    throw new DOMException('The operation is insecure.', 'SecurityError');
  };
  return {
    get length(): number {
      return refuse();
    },
    clear: refuse,
    getItem: refuse,
    key: refuse,
    removeItem: refuse,
    setItem: refuse,
  } as unknown as Storage;
}

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the last note is remembered per vault', () => {
  it('gives back what was remembered', () => {
    rememberNote('procurement', 'decisions/lei-14133');
    expect(lastNoteOf('procurement')).toBe('decisions/lei-14133');
  });

  it('keeps one note per vault, without the vaults touching each other', () => {
    rememberNote('procurement', 'decisions/lei-14133');
    rememberNote('journal', '2026/september');

    expect(lastNoteOf('procurement')).toBe('decisions/lei-14133');
    expect(lastNoteOf('journal')).toBe('2026/september');
  });

  it('replaces the note of a vault instead of piling entries up', () => {
    rememberNote('procurement', 'decisions/lei-14133');
    rememberNote('procurement', 'decisions/article-75');

    expect(lastNoteOf('procurement')).toBe('decisions/article-75');
  });

  it('answers null for a vault nothing was read in', () => {
    expect(lastNoteOf('never-opened')).toBeNull();
  });

  it('forgets one vault and leaves the others alone', () => {
    rememberNote('procurement', 'decisions/lei-14133');
    rememberNote('journal', '2026/september');
    forgetNote('procurement');

    expect(lastNoteOf('procurement')).toBeNull();
    expect(lastNoteOf('journal')).toBe('2026/september');
  });

  it('ignores an empty vault or an empty path, rather than storing one', () => {
    rememberNote('', 'decisions/lei-14133');
    rememberNote('procurement', '');

    expect(lastNoteOf('procurement')).toBeNull();
  });
});

describe('nothing here can keep a vault from opening', () => {
  it('reads null out of stored nonsense instead of throwing', () => {
    localStorage.setItem('memorysmith.lastNote', 'not json at all');
    expect(lastNoteOf('procurement')).toBeNull();
  });

  it('drops entries that are not paths, and keeps the ones that are', () => {
    localStorage.setItem(
      'memorysmith.lastNote',
      JSON.stringify({ procurement: 42, journal: '2026/september' }),
    );

    expect(lastNoteOf('procurement')).toBeNull();
    expect(lastNoteOf('journal')).toBe('2026/september');
  });

  it('survives a browser that refuses storage outright', () => {
    vi.stubGlobal('localStorage', refusingStorage());

    expect(() => rememberNote('procurement', 'decisions/lei-14133')).not.toThrow();
    expect(() => forgetNote('procurement')).not.toThrow();
    expect(lastNoteOf('procurement')).toBeNull();
  });
});
