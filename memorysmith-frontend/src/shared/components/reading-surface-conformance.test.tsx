/**
 * The reading surface, run against the PUBLISHED profile (RN-AGT-023).
 *
 * The profile declares five notations under the `reading-surface` reader, and
 * the two sanctioned extractors decide none of them: they are behaviour of
 * this interface and of nothing else. A rendering assertion cannot live in a
 * JSON file — what a callout looks like is not something the suite can state —
 * so the entries come from the profile and the expectation is written here,
 * once per entry, against the real components.
 *
 * The surface is exercised through `WritableContent`, which is what a note
 * actually renders: it splits the embeds, resolves the wikilinks and hands the
 * rest to `Markdown` with the callout and GFM plugins. Rendering it to static
 * markup runs no effects, which is exactly right for two of the five — the
 * mermaid block renders its container before the library is even imported,
 * and an embed renders its pending frame before the note is fetched. Both are
 * the assertion: the notation left the text and became an element.
 *
 * What this test guarantees is coverage as much as behaviour. A notation
 * declared under `reading-surface` with nothing here fails the last case, so
 * the profile cannot grow an entry this interface silently does not implement.
 */

import { beforeAll, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RECOGNISED_NOTATION, MARKDOWN_PROFILE_VERSION } from '@memorysmith/contracts';

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

// The i18n bootstrap and the preference store both read the browser at import
// time, and this file imports them transitively through the components.
vi.stubGlobal('localStorage', memoryStorage());
vi.stubGlobal('matchMedia', () => ({
  matches: false,
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
}));

let render: (markdown: string) => string;

beforeAll(async () => {
  await import('../../i18n');
  const { WritableContent } = await import('./WritableContent');

  render = (markdown: string): string =>
    renderToStaticMarkup(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <WritableContent
            raw={markdown}
            vaultSlug="a-vault"
            baseRevision={null}
            writable={true}
            write={() => Promise.resolve()}
            invalidates={[]}
          />
        </MemoryRouter>
      </QueryClientProvider>,
    );
});

/** What each declared entry has to be true of, once rendered. */
const EXPECTED: Record<string, (html: string) => void> = {
  callout: (html) => {
    // A callout is an element with its type on it, not a blockquote with a
    // marker left in front of the text.
    expect(html).toContain('class="callout"');
    expect(html).toContain('data-callout="warning"');
    expect(html).toContain('callout-title');
    expect(html).not.toContain('[!warning]');
    expect(html).not.toContain('<blockquote>');
  },
  mermaid: (html) => {
    // The container is rendered before the library is imported, which is the
    // whole point: the fence became a diagram and not a code block.
    expect(html).toContain('mermaid-diagram');
    expect(html).not.toContain('language-mermaid');
    expect(html).not.toContain('flowchart LR');
  },
  transclusion: (html) => {
    // The embed left the prose and became a region of its own. Which region
    // depends on a fetch that has not happened here; that it is no longer the
    // literal `![[...]]` is what this entry declares.
    expect(html).not.toContain('![[');
    expect(html).toMatch(/embed|status/);
  },
  'pending-link-display': (html) => {
    expect(html).toContain('wikilink-pending');
    // Visibly pending, never hidden: the text of the target stays on screen.
    expect(html).toContain('A note nobody has written');
    expect(html).not.toContain('[[A note nobody has written]]');
  },
  'task-list': (html) => {
    // What the profile declares: a box per item, carrying the state written in
    // the source, both ways round. One box per item and not two, which is what
    // dropping GFM's own is for.
    expect((html.match(/type="checkbox"/g) ?? []).length).toBe(2);
    expect((html.match(/checked=""/g) ?? []).length).toBe(1);
    expect(html).toContain('Read the act');
    expect(html).toContain('Summarise article 75');
    expect(html).not.toContain('[ ]');
    expect(html).not.toContain('[x]');
    // And what THIS reading surface adds on top of the profile, which the
    // profile leaves open and software-vision.md 13.2 promises: the box is
    // ours and it answers to a click where the role allows writing.
    expect((html.match(/class="[^"]*task-item[^"]*"/g) ?? []).length).toBe(2);
    expect(html).not.toContain('disabled=""');
  },
};

const surface = RECOGNISED_NOTATION.filter((entry) => entry.reader === 'reading-surface');

describe(`the reading surface implements profile ${MARKDOWN_PROFILE_VERSION}`, () => {
  it.each(surface)('renders $id as the profile declares', ({ id, example }) => {
    const expected = EXPECTED[id];
    // A declared notation with no expectation here is a failure of this test,
    // not a gap to discover later in a browser.
    expect(expected, `no reading-surface expectation written for "${id}"`).toBeDefined();
    expected?.(render(example));
  });

  it('has an expectation for every declared entry, and none for anything else', () => {
    expect(Object.keys(EXPECTED).sort()).toEqual(surface.map((entry) => entry.id).sort());
  });

  it('runs against a surface that exists, so an empty import cannot pass', () => {
    expect(surface.length).toBeGreaterThan(0);
  });
});
