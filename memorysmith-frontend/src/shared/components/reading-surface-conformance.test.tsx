/**
 * The reading surface, run against the PUBLISHED profile (RN-AGT-023).
 *
 * The profile declares a set of notations under the `reading-surface` reader,
 * and the two sanctioned extractors decide none of them: they are behaviour of
 * this interface and of nothing else. A rendering assertion cannot live in a
 * JSON file — what a callout looks like is not something the suite can state —
 * so the entries come from the profile and the expectation is written here,
 * once per entry, against the real components.
 *
 * **The entries asked for are those outside the `base` ring, and that is a
 * decision, not a filter.** Profile v0.3.0 restated CommonMark and GFM inside
 * `profile.json`, taking this reader from 12 entries to 35, and 20 of the new
 * ones are the base ring. Writing those expectations would mean asserting
 * that emphasis renders as `<em>` — asserting that react-markdown works,
 * which is a claim about somebody else's library and not about this surface.
 * What the base ring did bring is the **crossings**: the places where this
 * profile changes what CommonMark means. Those are proved, at the bottom of
 * this file, one case each and named.
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
            write={() => Promise.resolve('rev-2')}
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
  highlight: (html) => {
    expect(html).toContain('<mark>');
    expect(html).toContain('only for the cases listed in article 75');
    // The `==` never reaches the screen.
    expect(html).not.toContain('==');
  },
  comment: (html) => {
    // It leaves the PAGE. That the bytes are untouched is asserted where the
    // bytes live: `read_note` and the export return them, and nothing here
    // rewrites a note.
    expect(html).not.toContain('check this against the 2027 revision');
    expect(html).not.toContain('%%');
    // What was written around it stays.
    expect(html).toContain('The rule holds.');
  },
  'block-id': (html) => {
    // The identifier names the block for an embed to resolve to, and is never
    // rendered as text.
    expect(html).toContain('The rule is stated once, here.');
    expect(html).not.toContain('^article-75');
  },
  'math-inline': (html) => {
    expect(html).toContain('katex');
    expect(html).not.toContain('$n');
  },
  'math-block': (html) => {
    expect(html).toContain('katex');
    expect(html).not.toContain('$$');
  },
  'sub-sup': (html) => {
    // Rejected, so the characters stay on the page: the author sees they got
    // nothing, which is what the profile says they get. What must NOT happen
    // is the tilde turning into strikethrough, which is a worse answer than
    // none — it is why `singleTilde` is off.
    expect(html).toContain('H~2~O');
    expect(html).not.toContain('<sub>');
    expect(html).not.toContain('<sup>');
    expect(html).not.toContain('<del>');
  },
  'raw-html': (html) => {
    // Not rendered: the tag is text. This is the security boundary, and the
    // `<script>` case below is the one that matters.
    expect(html).toContain('&lt;b&gt;read the act&lt;/b&gt;');
    expect(html).not.toContain('<b>read the act</b>');
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
  table: (html) => {
    expect(html).toContain('<table>');
    expect(html).toContain('<th>');
    expect(html).toContain('<td>');
    // The delimiter row is structure and never a row of its own.
    expect(html).not.toContain('---');
  },
  strikethrough: (html) => {
    expect(html).toContain('<del>');
    expect(html).toContain('still in force');
    expect(html).not.toContain('~~');
  },
  'autolink-extended': (html) => {
    // Bare, and still a link. External, so it is a plain anchor and never one
    // of ours: `wikilink` is the class this surface puts on an edge.
    expect(html).toContain('href="https://example.org/lei-14133"');
    expect(html).not.toContain('class="wikilink"');
  },
};

const surface = RECOGNISED_NOTATION.filter(
  (entry) => entry.reader === 'reading-surface' && entry.ring !== 'base',
);

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

/**
 * The rejections are half of what the profile declares, and the reading
 * surface is where a rejection is most easily undone by accident: drawing a
 * chip around `#subject` would promise a grouping that does not exist
 * (RN-DSC-033). An affordance without the function it promises is worse than
 * the raw text.
 */
describe('a rejected notation is rendered as what it is: text', () => {
  const rejected = RECOGNISED_NOTATION.filter((entry) => !entry.recognised);

  it('renders an inline #tag as plain text, with no chip and nothing to click', () => {
    const html = render('The decision touches #procurement and #contracts.');

    expect(html).toContain('#procurement');
    expect(html).toContain('#contracts');
    expect(html).not.toMatch(/<a[^>]*>#/);
    expect(html).not.toMatch(/class="[^"]*tag[^"]*"/);
  });

  it('does not read a heading as a tag either', () => {
    const html = render('# Direct contracting\n\nThe rule.\n');

    expect(html).toContain('<h1>Direct contracting</h1>');
    expect(html).not.toContain('#');
  });

  it('renders an external link as a link and never as a wikilink of ours', () => {
    const html = render('See [the official text](https://example.org/lei-14133).');

    expect(html).toContain('href="https://example.org/lei-14133"');
    expect(html).not.toContain('class="wikilink"');
    expect(html).not.toContain('wikilink-pending');
  });

  it('declares rejections at all, so this list cannot quietly empty out', () => {
    expect(rejected.map((entry) => entry.id)).toContain('inline-tag');
    expect(rejected.map((entry) => entry.id)).toContain('raw-html');
    expect(rejected.map((entry) => entry.id)).toContain('sub-sup');
  });
});

/**
 * The raw HTML policy is a **security boundary** and not a rendering
 * preference, which is why it is asserted with the payload that would matter
 * rather than with a `<b>` (profile 5.10). A vault is written by several
 * people and by agents; a page that renders arbitrary HTML out of one is a
 * script injection whose trigger is written by whoever wrote the note.
 */
describe('raw HTML in a note is text, and stays text', () => {
  it('does not render a script tag', () => {
    const html = render('Before. <script>window.stolen = document.cookie</script> After.');

    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('Before.');
    expect(html).toContain('After.');
  });

  it('does not render an event handler smuggled onto an element', () => {
    const html = render('<img src="x" onerror="window.stolen = 1">');

    // The whole tag is text, so the handler is characters on a page and not
    // an attribute of anything: there is no element for it to be on.
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
    expect(html).toContain('onerror=&quot;');
  });

  it('does not render an iframe', () => {
    const html = render('<iframe src="https://example.org"></iframe>');

    expect(html).not.toContain('<iframe');
  });
});

/**
 * The `$` that is not math. A price and a shell variable are text, and the
 * profile says so in as many words, so the negatives are asserted next to the
 * positives rather than left to the library.
 */
describe('a dollar sign that is not opening a formula stays a dollar sign', () => {
  it('leaves a price alone', () => {
    const html = render('The licence costs $30 a month, and the plan $60.');

    expect(html).toContain('$30');
    expect(html).toContain('$60');
    expect(html).not.toContain('katex');
  });

  it('leaves a shell variable alone', () => {
    const html = render('Run it with $HOME set.');

    expect(html).toContain('$HOME');
    expect(html).not.toContain('katex');
  });
});

/**
 * The crossings: where this profile changes what the base ring means.
 *
 * These are the entries v0.3.0 brought that are worth a test even though the
 * ring they sit in is a restatement of somebody else's specification. Each
 * one is a place where knowing CommonMark is not enough to predict what
 * happens here, and each is stated by `profile.json` in the `effect` of a
 * `base` entry — so the profile is what is being read, and not our habits.
 */
describe('a base notation that means something different here', () => {
  it('renders an image as an image, and an embed as neither', () => {
    // `image`: a `!` in front of a wikilink is not an image, it is an embed.
    const html = render('![The curve](https://example.org/curve.png)\n\n![[A note]]\n');

    expect(html).toContain('alt="The curve"');
    expect(html).not.toContain('![[');
    expect(html).not.toContain('alt="[[A note]]"');
  });

  it('keeps the alt text of an image, which is the description and not decoration', () => {
    const html = render('![Fourteen minutes against thirty](https://example.org/x.png)');

    expect(html).toContain('alt="Fourteen minutes against thirty"');
  });

  it('leaves a wikilink inside a code span as characters', () => {
    // `code-span`: it is where an author writes notation without invoking it.
    const html = render('Write `[[Target]]` to link to it.');

    expect(html).toContain('[[Target]]');
    expect(html).not.toContain('class="wikilink"');
  });

  it('leaves every notation inside a fenced block alone', () => {
    // `code-fenced`: nothing inside is parsed. Not the wikilink, not the
    // callout marker, not the marked text.
    const html = render('```\n[[Target]] and ==marked== and > [!warning] x\n```\n');

    expect(html).toContain('[[Target]]');
    expect(html).toContain('==marked==');
    expect(html).not.toContain('<mark>');
    expect(html).not.toContain('class="callout"');
  });

  it('reads three dashes under a paragraph as a heading and not as frontmatter', () => {
    // `thematic-break`: `---` is context-dependent and all three readings are
    // correct in their place. Only the first line of the file opens a head.
    const html = render('Serra Gaucha\n---\n\nThe rest.\n');

    expect(html).toContain('<h2>Serra Gaucha</h2>');
    expect(html).not.toContain('<hr');
  });

  it('does not strike a single tilde, which is where this surface leaves GFM', () => {
    // `strikethrough` names both `~x~` and `~~x~~`, following the renderer
    // rather than the GFM specification, which is `~~x~~`. Honouring the
    // single tilde would strike `H~2~O` — the one form the profile declares
    // ABSENT, in `sub-sup` — so this surface implements the specification and
    // not the renderer, and says so in `architecture-guide.md` section 14.
    const html = render('Water is H~2~O, and the rule is ~~revoked~~.');

    expect(html).toContain('H~2~O');
    expect(html).toContain('<del>revoked</del>');
  });
});

/**
 * A public image is content, and an address is a decision.
 *
 * The profile declares the image in the base ring and says the alt text is the
 * description a Reader MUST NOT drop. There is no upload here — the product
 * stores `text/markdown` and nothing else — so a picture in a note is always
 * an address somebody else serves, which makes what this surface will and
 * will not follow part of rendering it (RN-DSC-039).
 */
describe('a picture in a note, and the addresses around it', () => {
  it('renders a public image, with the description the author wrote', () => {
    const html = render('![The maturation curve](https://example.org/curve.png "Serra Gaucha")');

    expect(html).toContain('src="https://example.org/curve.png"');
    expect(html).toContain('alt="The maturation curve"');
    expect(html).toContain('title="Serra Gaucha"');
  });

  it('renders one inside a callout, where a note actually puts it', () => {
    const html = render('> [!tip] The curve\n> ![The curve](https://example.org/c.png)\n');

    expect(html).toContain('class="callout"');
    expect(html).toContain('src="https://example.org/c.png"');
  });

  it('follows a link to the web and to a person', () => {
    expect(render('[The text](https://example.org/x)')).toContain('href="https://example.org/x"');
    expect(render('[Write](mailto:a@example.org)')).toContain('href="mailto:a@example.org"');
  });

  it('leaves an address it does not follow as text, and never as a link', () => {
    const html = render('[Open it](obsidian://open?vault=Notas&file=Lei)');

    expect(html).toContain('Open it');
    expect(html).toContain('link-refused');
    expect(html).not.toContain('<a');
    expect(html).not.toContain('obsidian://');
  });

  it('does the same with a page carried inside the address', () => {
    const html = render('[Click](data:text/html;base64,PHNjcmlwdD4=)');

    expect(html).toContain('link-refused');
    expect(html).not.toContain('data:text/html');
  });

  it('still draws the pending link, which is the scheme all of this was for', () => {
    const html = render('[[A note nobody has written]]');

    expect(html).toContain('wikilink-pending');
    expect(html).toContain('A note nobody has written');
  });
});
