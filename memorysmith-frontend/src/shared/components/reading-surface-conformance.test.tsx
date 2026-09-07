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
 * **The entries asked for are those the profile ADDS to what a base parser
 * already does, and that is a decision, not a filter.** Profile v0.3.0
 * restated CommonMark and GFM inside `profile.json`, taking this reader from
 * 12 entries to 35. Writing an expectation for each would mean asserting that
 * emphasis renders as `<em>` — asserting that react-markdown works, which is a
 * claim about somebody else's library and not about this surface. What the
 * restated forms did bring is the **crossings**: the places where this profile
 * changes what CommonMark means. Those are proved, at the bottom of this file,
 * one case each and named.
 *
 * Which entries are exempt is `DELEGATED_TO_THE_BASE_PARSER` in the contracts.
 * It was a filter on `entry.ring` until profile v0.4.0 removed the field, and
 * the last case here is what keeps the move from costing anything: an entry in
 * neither list fails, exactly as an unclassified ring never could.
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
import {
  DECLARED_SILENCE,
  DELEGATED_TO_THE_BASE_PARSER,
  MARKDOWN_PROFILE_VERSION,
  RECOGNISED_NOTATION,
} from '@memorysmith/contracts';

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
    // The example carries both halves since profile v0.4.0: two prices that
    // must survive as text, and one formula that must render. The old
    // expectation asserted only the second and passed while `100 e o frete R`
    // was being typeset as mathematics between them.
    expect(html).toContain('katex');
    expect(html).not.toContain('$n');
    expect(html).toContain('R$100 e o frete R$200');
  },
  'math-block': (html) => {
    expect(html).toContain('katex');
    expect(html).not.toContain('$$');
  },
  // `sub-sup` was here until profile v0.4.0 stopped declaring it. The
  // behaviour is unchanged and the assertion moved to the rejections block
  // below, which now reads `DECLARED_SILENCE` — the form is no longer the
  // profile's to describe, and it is still ours to answer for.
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
    expect((html.match(/type="checkbox"/g) ?? []).length).toBe(3);
    expect((html.match(/checked=""/g) ?? []).length).toBe(1);
    expect(html).toContain('Price research');
    expect(html).toContain('Three quotes gathered');
    expect(html).not.toContain('[ ]');
    expect(html).not.toContain('[x]');
    // The example nests since profile v0.4.0, and a nested item is a task like
    // any other: the box belongs to the item, not to the top level. `[X]` is
    // the capital form, which GFM accepts and which has to leave the page too.
    expect(html).not.toContain('[X]');
    // And what THIS reading surface adds on top of the profile, which the
    // profile leaves open and software-vision.md 13.2 promises: the box is
    // ours and it answers to a click where the role allows writing.
    expect((html.match(/class="[^"]*task-item[^"]*"/g) ?? []).length).toBe(3);
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
    // Two tildes and only two. The example carries both halves on one line
    // since profile v0.4.0, which is the point: `~~revoked~~` is struck and
    // `H~2~O` is not. A renderer accepting the single tilde would strike the
    // middle of the second one — a wrong answer where the profile promises
    // none at all, and the reason `singleTilde` is off.
    expect(html).toContain('<del>');
    expect(html).toContain('revoked');
    expect(html).toContain('H~2~O');
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
  (entry) => entry.reader === 'reading-surface' && !DELEGATED_TO_THE_BASE_PARSER.has(entry.id),
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
 * The reading surface is where a rejection is most easily undone by accident:
 * drawing a chip around `#subject` would promise a grouping that does not
 * exist (RN-DSC-033), and an affordance without the function it promises is
 * worse than the raw text.
 *
 * These were read off `recognised: false` until profile v0.4.0 stopped
 * carrying it — a catalogue of the forms a specification declines can never be
 * finished, so §8 became one rule about all of them at once. What this product
 * does with them did not change, so the declaration is ours now, in
 * `DECLARED_SILENCE`, and this is the guard that would otherwise have been
 * left watching an empty list.
 */
describe('a rejected notation is rendered as what it is: text', () => {
  const silent = DECLARED_SILENCE.map((entry) => entry.id);

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

  it('renders a subscript and a superscript as the characters they are', () => {
    // There is no notation for either, so the author sees they got nothing —
    // the answer the profile gives, and a better one than a tilde silently
    // striking the middle of a formula.
    const html = render('The formula is H~2~O, and the area is 3 m^2^.');

    expect(html).toContain('H~2~O');
    expect(html).toContain('m^2^');
    expect(html).not.toContain('<sub>');
    expect(html).not.toContain('<sup>');
    expect(html).not.toContain('<del>');
  });

  it('declares rejections at all, so this list cannot quietly empty out', () => {
    // The assertion that caught the v0.4.0 break: the source went empty and
    // this said so, instead of a whole describe block passing on nothing.
    expect(silent).toContain('inline-tag');
    expect(silent).toContain('sub-sup');
  });

  it('renders every declared silence through the surface it is declared for', () => {
    // Each example rendered, and what must not happen is anything: no element
    // the form would have produced in the editor somebody arrived from.
    for (const entry of DECLARED_SILENCE) {
      const html = render(entry.example);

      expect(html, entry.id).not.toContain('<sub>');
      expect(html, entry.id).not.toContain('<sup>');
      expect(html, entry.id).not.toMatch(/<a[^>]*>#/);
    }
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
  it('leaves a price alone when a space separates it from the amount', () => {
    // The outside edge: a `$` followed by whitespace does not open, and one
    // preceded by whitespace does not close.
    const html = render('The licence costs $30 a month, and the plan $60.');

    expect(html).toContain('$30');
    expect(html).toContain('$60');
    expect(html).not.toContain('katex');
  });

  it('leaves two prices alone when nothing separates them from the amount', () => {
    // The INSIDE edge, added by profile v0.4.0 and the reason it was added.
    // Neither `$` here sits next to a space, so the outside edge alone decides
    // nothing and the sentence lost its middle: `100 e o frete R` came out
    // typeset as mathematics, with the `R` and the `200` stranded either side.
    // It is an ordinary sentence in pt-BR, where a price is written `R$`.
    const html = render('O item custa R$100 e o frete R$200, e nada disso é fórmula.');

    expect(html).toContain('R$100 e o frete R$200');
    expect(html).not.toContain('katex');
  });

  it('renders a real formula in the same sentence as two prices', () => {
    // Both halves at once, which is the case the profile ships as the worked
    // example: the rule has to reject two delimiters and accept a third.
    const html = render('O item custa R$100 e o frete R$200, e a complexidade é $n \\log n$.');

    expect(html).toContain('R$100 e o frete R$200');
    expect(html).toContain('katex');
    expect(html).not.toContain('$n');
  });

  it('does not open a formula written immediately after a word character', () => {
    // The declared cost of protecting the price, named by the profile under
    // Compatibility: `2 $x$` is the form that works.
    const plain = render('A largura é 2$x$ do total.');
    const spaced = render('A largura é 2 $x$ do total.');

    expect(plain).not.toContain('katex');
    expect(plain).toContain('2$x$');
    expect(spaced).toContain('katex');
  });

  it('does not close a formula on a delimiter followed by a digit', () => {
    const html = render('Custa $50 hoje e $60 amanhã.');

    expect(html).toContain('$50');
    expect(html).toContain('$60');
    expect(html).not.toContain('katex');
  });

  it('leaves a shell variable alone', () => {
    // Neither edge decides this one: both delimiters look legal by every local
    // rule, so the profile withdrew the claim in v0.4.0 and says a `$` written
    // for any other purpose belongs in a code span. This case survives because
    // `$HOME set.` ends the sentence with no second delimiter — two of them in
    // one sentence is what the code span is for.
    const html = render('Run it with $HOME set.');

    expect(html).toContain('$HOME');
    expect(html).not.toContain('katex');
  });

  it('protects two shell variables in one sentence through a code span', () => {
    const html = render('Run it with `$HOME` and `$PATH` set.');

    expect(html).toContain('$HOME');
    expect(html).toContain('$PATH');
    expect(html).not.toContain('katex');
  });
});

/**
 * The crossings: where this profile changes what an inherited form means.
 *
 * These are the entries v0.3.0 brought that are worth a test even though the
 * form itself is a restatement of somebody else's specification. Each one is a
 * place where knowing CommonMark is not enough to predict what happens here,
 * and each is stated by `profile.json` in the `effect` of the entry — so the
 * profile is what is being read, and not our habits.
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

/**
 * The three places an embed cannot expand, and the one answer to all of them
 * (profile §7.3): where expansion cannot happen the embed becomes a link, and
 * it is never dropped.
 *
 * The table cell was named by profile v0.4.0 and it is the sharpest of the
 * three, because the split that decides expansion runs on the raw string: a
 * cut inside a table row did not merely fail to expand, it ended the run
 * mid-row and left the parser an unterminated table.
 */
describe('an embed where no block fits', () => {
  const TABLE = '| Rule | Where |\n|---|---|\n| The general one | ![[Lei 14.133]] |\n';

  it('keeps the table whole, with the embed inside the cell', () => {
    const html = render(TABLE);

    // One table, and the row it was written with. The embed used to land
    // outside it, the cell used to come out empty, and the closing pipe used
    // to become a paragraph of its own.
    expect(html).toContain('<table>');
    expect((html.match(/<table>/g) ?? []).length).toBe(1);
    expect(html).toContain('The general one');
    expect(html).not.toMatch(/<p>\s*\|\s*<\/p>/);
    expect(html).not.toContain('<td></td>');
  });

  it('draws the embed in the cell as a link, and never drops it', () => {
    const html = render(TABLE);

    // Demoted to a wikilink, which resolves like any other: the note does not
    // exist here, so it is the pending form. What must not happen is the
    // literal notation reaching the page, or the reference disappearing.
    expect(html).toContain('Lei 14.133');
    expect(html).not.toContain('![[');
    expect(html).not.toContain('[[Lei 14.133]]');
    expect(html).toMatch(/wikilink/);
  });

  it('still expands an embed written outside the table in the same note', () => {
    // The skip is scoped to the cell and to nothing else, and the run carrying
    // the table has to survive being cut around a later embed.
    const html = render(`${TABLE}\n![[Another note]]\n`);

    expect(html).toContain('<table>');
    expect(html).toMatch(/embed|status/);
    expect(html).not.toContain('![[');
  });

  it('leaves an embed written inside a fence alone, table or no table', () => {
    const html = render('```\n| A | B |\n|---|---|\n| x | ![[Lei 14.133]] |\n```\n');

    expect(html).toContain('![[Lei 14.133]]');
    expect(html).not.toContain('<table>');
  });
});
