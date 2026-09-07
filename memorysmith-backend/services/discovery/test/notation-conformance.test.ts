/**
 * The two sanctioned extractors, run against the PUBLISHED conformance suite
 * of the MemorySmith Markdown Profile (RN-AGT-022, RN-AGT-023).
 *
 * The cases are not written here and they are not a copy of anything written
 * here. They come from the profile this build pins, so a case the extractors
 * fail breaks the build — which is the point of implementing a specification
 * instead of declaring one: the product cannot quietly stop reading what it
 * says it reads.
 *
 * `RECOGNISED_NOTATION` is the same profile as data, and Agent Access teaches
 * from it. Discovery reads it and never writes it, and the two contexts may
 * not import each other, which is why both go through the contracts package.
 *
 * The entries whose reader is `reading-surface` are proved in the frontend,
 * against the real renderer: what a callout looks like is not something a JSON
 * file can assert.
 */

import { describe, expect, it } from 'vitest';
import {
  CONFORMANCE_CASES,
  MARKDOWN_PROFILE_VERSION,
  RECOGNISED_NOTATION,
  type ConformanceCase,
} from '@memorysmith/contracts';
import { extractLinks } from '../src/domain/LinkExtractor.js';
import { extractFacets } from '../src/domain/FacetExtractor.js';

const withLinks = CONFORMANCE_CASES.filter((each) => each.links !== undefined);
const withFacets = CONFORMANCE_CASES.filter((each) => each.facets !== undefined);

/** The extractor output reduced to what a case states, and nothing else. */
function linksOf(markdown: string): Array<{ slug: string; anchor: string | null }> {
  return extractLinks(markdown).map((link) => ({ slug: link.slug, anchor: link.anchor }));
}

function facetsOf(markdown: string): Record<string, { kind: string; values: string[] }> {
  return Object.fromEntries(
    Object.values(extractFacets(markdown)).map((facet) => [
      facet.facet,
      { kind: facet.kind, values: facet.values },
    ]),
  );
}

describe(`the published conformance suite, profile ${MARKDOWN_PROFILE_VERSION}`, () => {
  it.each(withLinks)('$id reads the declared links', (each: ConformanceCase) => {
    // Order is not part of the contract: an edge set is a set.
    expect(linksOf(each.markdown).sort(bySlug)).toEqual([...(each.links ?? [])].sort(bySlug));
  });

  it.each(withFacets)('$id reads the declared facets', (each: ConformanceCase) => {
    expect(facetsOf(each.markdown)).toEqual(each.facets ?? {});
  });

  it('runs a suite that exists, so a silent empty import cannot pass', () => {
    expect(CONFORMANCE_CASES.length).toBeGreaterThan(20);
    expect(withLinks.length).toBeGreaterThan(0);
    expect(withFacets.length).toBeGreaterThan(0);
  });

  it('covers every notation of the two extractors with at least one case', () => {
    const proved = new Set(CONFORMANCE_CASES.map((each) => each.notation));
    const owed = RECOGNISED_NOTATION.filter(
      (entry) => entry.reader === 'links' || entry.reader === 'frontmatter',
    ).map((entry) => entry.id);

    expect(owed.filter((id) => !proved.has(id))).toEqual([]);
  });

  it('declares a reading surface, whose cases are proved in the frontend', () => {
    const surface = RECOGNISED_NOTATION.filter((entry) => entry.reader === 'reading-surface');
    expect(surface.length).toBeGreaterThan(0);
  });
});

function bySlug(
  a: { slug: string; anchor: string | null },
  b: { slug: string; anchor: string | null },
): number {
  return a.slug.localeCompare(b.slug);
}

describe('an embed is a link, and the graph does not tell them apart (RN-DSC-029)', () => {
  it('produces the same edge as the plain form', () => {
    const embedded = extractLinks('![[Lei 14.133]]');
    const linked = extractLinks('[[Lei 14.133]]');

    expect(embedded).toHaveLength(1);
    expect(embedded[0]?.slug).toBe(linked[0]?.slug);
  });

  it('produces the same edge when the embed carries a section', () => {
    const embedded = extractLinks('![[Lei 14.133#Article 75]]');
    const linked = extractLinks('[[Lei 14.133]]');

    expect(embedded[0]?.slug).toBe(linked[0]?.slug);
    // The anchor is normalised like any target and kept for display; it never
    // takes part in resolution (RN-DSC-002).
    expect(embedded[0]?.anchor).toBe('article-75');
  });

  it('collapses an embed and a link to the same note into one edge', () => {
    // The extractor keys by target, so embedding a note and also linking to it
    // is one edge. That is what makes RN-DSC-029 true in the strong sense: the
    // graph cannot tell the two forms apart, not even by counting.
    expect(extractLinks('![[Lei 14.133]] and again [[Lei 14.133]]')).toHaveLength(1);
  });
});

/**
 * The crossings: where this profile changes what the base ring means.
 *
 * Profile v0.3.0 restated CommonMark and GFM as data, and the value of those
 * entries is not the syntax — it is the `effect` each one states, which is
 * where knowing CommonMark is not enough to predict what happens here. Each
 * case below quotes one of them, so what is being read is the profile and not
 * our habits.
 */
describe('a base notation that means something different here', () => {
  it('reads the three link forms as one link, decided by the destination', () => {
    // `link-reference`: the three forms are equivalent once resolved, and the
    // destination decides the edge exactly as in the inline form.
    const full = extractLinks('See [the text][ref].\n\n[ref]: ./lei-14133.md\n');
    const collapsed = extractLinks('See [lei 14133][].\n\n[lei 14133]: ./lei-14133.md\n');
    const shortcut = extractLinks('See [lei 14133].\n\n[lei 14133]: ./lei-14133.md\n');
    const inline = extractLinks('See [the text](./lei-14133.md).');

    expect(full.map((link) => link.slug)).toEqual(['lei-14133']);
    expect(collapsed.map((link) => link.slug)).toEqual(['lei-14133']);
    expect(shortcut.map((link) => link.slug)).toEqual(['lei-14133']);
    expect(inline.map((link) => link.slug)).toEqual(['lei-14133']);
  });

  it('matches a label whatever its case and internal spacing', () => {
    const links = extractLinks('See [Lei   14133][].\n\n[lei 14133]: ./lei-14133.md\n');
    expect(links.map((link) => link.slug)).toEqual(['lei-14133']);
  });

  it('keeps an external destination external, in the reference form too', () => {
    // RN-DSC-003 is about the destination, not about the form it was written
    // in, and `autolink-extended` says the same of a bare address.
    expect(extractLinks('See [the site][s].\n\n[s]: https://example.org/x\n')).toEqual([]);
    expect(extractLinks('The text is at https://example.org/lei-14133.')).toEqual([]);
  });

  it('produces no edge from a definition nobody used', () => {
    // `link-reference-definition`: it renders nothing where it stands. It is a
    // destination waiting to be used, and an unused one is not a reference.
    expect(extractLinks('[ref]: ./lei-14133.md\n')).toEqual([]);
  });

  it('does not read a task box as a reference', () => {
    expect(extractLinks('- [x] Read the act\n- [ ] Summarise it\n')).toEqual([]);
  });

  it('reads a wikilink inside a table cell, because a cell is not a boundary', () => {
    // `table`: a cell is a place text lives and not a boundary an Indexer
    // stops at.
    const links = extractLinks(
      '| Note | Where |\n| --- | --- |\n| [[Lei 14.133]] | Article 75 |\n',
    );
    expect(links.map((link) => link.slug)).toEqual(['lei-14133']);
  });

  it('reads an image as an image, and never as a link to a note', () => {
    // `image`: the `!` in front is the whole difference between the two forms,
    // and reading it as a link turned a picture into a note. The relative case
    // is the one that showed: the graph announced a note called `curve-png`
    // that somebody was apparently about to write (RN-DSC-038).
    expect(extractLinks('![The curve](./curve.png)')).toEqual([]);
    expect(extractLinks('![The curve](../assets/curve.png)')).toEqual([]);
    expect(extractLinks('![The curve](https://example.org/curve.png)')).toEqual([]);
    expect(extractLinks('![The curve][c]\n\n[c]: ./curve.png\n')).toEqual([]);
    // The link form of the same destination still produces the edge, and so
    // does the embed, which may never stop (RN-DSC-029).
    expect(extractLinks('[The curve](./lei-14133.md)').map((l) => l.slug)).toEqual(['lei-14133']);
    expect(extractLinks('![[Lei 14.133]]').map((l) => l.slug)).toEqual(['lei-14133']);
  });

  it('reads a link indented as code, and says so rather than guessing', () => {
    // `code-indented` says an indented block suppresses notation exactly as a
    // fenced one does, and this reader does not implement it. Telling four
    // spaces of code from four spaces of a nested list item needs the block
    // context a parser has and this one does not (PP4). Of the two ways to be
    // wrong, a spurious pending link is cheap and a dropped edge is the graph
    // lying about the vault. The declared behaviour is this one.
    expect(extractLinks('Prose.\n\n    [[Lei 14.133]]\n').map((l) => l.slug)).toEqual([
      'lei-14133',
    ]);
    // The two forms that ARE implemented, next to it, so the line is visible.
    expect(extractLinks('```\n[[Lei 14.133]]\n```\n')).toEqual([]);
    expect(extractLinks('Write `[[Lei 14.133]]` to link.')).toEqual([]);
  });
});
