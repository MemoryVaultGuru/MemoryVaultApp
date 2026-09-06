/**
 * The slug the reading surface computes, pinned to the PUBLISHED cases.
 *
 * There are two implementations of one rule — this one, and
 * `packages/kernel/src/slug.ts` — because the frontend takes types from
 * `@memorysmith/contracts` and nothing else from the backend. That is a
 * deliberate boundary and it has a price: two copies of a rule drift, and the
 * drift is silent.
 *
 * It already did. The interface was missing the digit-separator step, so
 * `[[Lei 14.133]]` computed `lei-14-133`, found no note under it, and drew a
 * real edge as a pending link — telling the person a note they had written
 * did not exist (#73).
 *
 * So the two are not pinned to each other. They are pinned to the **same
 * published conformance cases the extractors run**, which is what makes the
 * profile a specification rather than a description: the case that failed
 * here, `wikilink/accents-and-digits`, was already in the suite and had never
 * been pointed at this side of the product.
 */

import { describe, expect, it } from 'vitest';
import cases from '@memorysmith/markdown-profile/conformance.json' with { type: 'json' };
import { slugify } from './markdown';

interface ConformanceCase {
  readonly id: string;
  readonly markdown: string;
  readonly links?: ReadonlyArray<{ readonly slug: string; readonly anchor: string | null }>;
}

const suite = (cases as { cases: ConformanceCase[] }).cases;

/**
 * The target a case writes, as the author typed it. The suite states the slug
 * it must produce, so this only has to recover the title from the notation:
 * the slug rule itself is what is under test.
 */
function targetsOf(markdown: string): string[] {
  const found: string[] = [];
  for (const match of markdown.matchAll(/!?\[\[([^\]|#]+)/g)) {
    found.push((match[1] ?? '').trim());
  }
  for (const match of markdown.matchAll(/\]\(([^)\s]+\.md)\)/g)) {
    const path = match[1] ?? '';
    found.push((path.split('/').pop() ?? '').replace(/\.md$/, ''));
  }
  return found;
}

const resolving = suite.filter((each) => (each.links?.length ?? 0) > 0);

describe('the reading surface computes the slug the profile specifies', () => {
  it.each(resolving)('$id', (each: ConformanceCase) => {
    const expected = new Set((each.links ?? []).map((link) => link.slug));
    const produced = targetsOf(each.markdown).map(slugify);

    // Every case here resolves to a single note, so every target the case
    // writes has to land on the slug the suite states.
    for (const slug of produced) {
      expect([...expected]).toContain(slug);
    }
    expect(produced.length).toBeGreaterThan(0);
  });

  it('runs against cases that exist, so a silent empty import cannot pass', () => {
    expect(resolving.length).toBeGreaterThan(5);
  });
});

describe('the two steps the interface was missing', () => {
  it.each([
    ['Lei 14.133', 'lei-14133'],
    ['Artigo 75.4', 'artigo-754'],
    ['Versão 2.0 do protocolo', 'versao-20-do-protocolo'],
    ['IPT 62,5 na safra', 'ipt-625-na-safra'],
  ])('keeps a decimal number whole: %s', (title, slug) => {
    // The separator belongs to the number and not to the words around it.
    // Without this the interface addressed a note the backend never stored.
    expect(slugify(title)).toBe(slug);
  });

  it('truncates a long title at eighty characters, with no hyphen left hanging', () => {
    const slug = slugify(`${'palavra '.repeat(20)}fim`);

    expect(slug.length).toBeLessThanOrEqual(80);
    expect(slug.endsWith('-')).toBe(false);
  });

  it('still folds accents and case, which it always did', () => {
    expect(slugify('Contratação Direta')).toBe('contratacao-direta');
    expect(slugify('  Espaços  nas  bordas  ')).toBe('espacos-nas-bordas');
  });

  it('does not join digits separated by anything else', () => {
    // Only `.` and `,` between two digits. A hyphen is a hyphen.
    expect(slugify('Norma 14-133')).toBe('norma-14-133');
    expect(slugify('Turno 3 e 4')).toBe('turno-3-e-4');
  });
});
