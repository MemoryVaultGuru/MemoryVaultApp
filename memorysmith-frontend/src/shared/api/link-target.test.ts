/**
 * The target the reading surface reads out of a wikilink, pinned to the
 * PUBLISHED cases.
 *
 * This file used to prove a slug, and the slug is gone. Specification 0.6.0
 * resolves a link against the **title** of a note: a wikilink target is
 * literal, nothing in it is decoded, no extension is removed and no path
 * segment is discarded (RN-DSC-043). So what has to agree with the backend is
 * no longer a computation — it is a reading, and this is where the reading
 * surface is held to the same cases the extractor runs.
 *
 * The boundary that made two implementations necessary has not moved: the
 * frontend takes what it needs from `@memorysmith/contracts` and nothing else
 * from the backend. What changed is that the rule they both implement got
 * simpler, and a simpler rule drifts less — the defect this file was written
 * for (#73) was a slug computed two different ways, and there is no slug now.
 */

import { describe, expect, it } from 'vitest';
import cases from '@memorysmith/markdown-spec/conformance.json' with { type: 'json' };
import { resolveWikilinks } from './markdown';

interface ConformanceCase {
  readonly id: string;
  readonly markdown: string;
  readonly links?: ReadonlyArray<{ readonly title: string; readonly anchor: string | null }>;
}

const suite = (cases as { cases: ConformanceCase[] }).cases;

/** The wikilink cases: the Markdown form is the backend's to tolerate. */
const wikilinkCases = suite.filter(
  (each) => (each.links?.length ?? 0) > 0 && /\[\[/.test(each.markdown),
);

/** What the reading surface asks the resolver for, in order. */
function targetsAskedFor(markdown: string): string[] {
  const asked: string[] = [];
  resolveWikilinks(markdown, (title) => {
    asked.push(title);
    return null;
  });
  return asked;
}

describe('the reading surface reads the target the specification states', () => {
  it.each(wikilinkCases)('$id', (each: ConformanceCase) => {
    const expected = (each.links ?? []).map((link) => link.title);
    for (const asked of targetsAskedFor(each.markdown)) {
      expect(expected, `${asked} is not a target this case declares`).toContain(asked);
    }
  });

  it('asks for the title literally, without folding anything', () => {
    expect(targetsAskedFor('Ver [[Lei 14.133]].')).toEqual(['Lei 14.133']);
    expect(targetsAskedFor('Ver [[Reunião 03/09/2026]].')).toEqual(['Reunião 03/09/2026']);
    expect(targetsAskedFor('Ver [[Lei 14.133.md]].')).toEqual(['Lei 14.133.md']);
    expect(targetsAskedFor('Ver [[Índice#Castas]].')).toEqual(['Índice']);
    expect(targetsAskedFor('Ver [[Lei 14.133|a nova lei]].')).toEqual(['Lei 14.133']);
  });

  it('normalises to NFC and folds nothing else, so case is exact', () => {
    const decomposed = 'Ver [[Ação]].'.normalize('NFD');
    expect(targetsAskedFor(decomposed)).toEqual(['Ação'.normalize('NFC')]);
    expect(targetsAskedFor('Ver [[lei 14.133]].')).toEqual(['lei 14.133']);
  });

  it('reads the escaped pipe of a table cell as the end of the target', () => {
    expect(targetsAskedFor('| Onde | [[Lei 14.133\\|art. 75]] |')).toEqual(['Lei 14.133']);
  });
});
