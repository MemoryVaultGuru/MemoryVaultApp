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
