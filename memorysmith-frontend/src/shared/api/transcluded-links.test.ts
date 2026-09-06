/**
 * A wikilink inside transcluded content is a link (#79).
 *
 * `Transclusion` rendered its content straight, while every other reading
 * surface resolved the wikilinks first, so a `[[link]]` inside an embedded
 * note reached the page with its brackets. The sharpest case is the one the
 * one-level rule creates itself: an embed found inside embedded content is
 * demoted to a wikilink — and §13.2 says that embed is drawn as **a link** to
 * its target. Raw text is not a link.
 *
 * This is the composition `Transclusion` performs, tested where a static
 * render can reach it: the fetch behind a transclusion never resolves in a
 * markup test, which is exactly why the conformance test covered the entry
 * and never the level underneath.
 */

import { describe, expect, it } from 'vitest';
import { demoteEmbeds } from './transclusion';
import { resolveWikilinks } from './markdown';

/** A vault where one note exists and the other does not. */
const resolve = (slug: string): string | null =>
  slug === 'cabernet-sauvignon' ? '/vaults/enologia/root/01-castas/cabernet-sauvignon' : null;

const render = (body: string): string => resolveWikilinks(demoteEmbeds(body), resolve);

describe('an embed inside embedded content becomes a link, not text', () => {
  it('resolves the demoted block embed that was reported raw', () => {
    const out = render('![[Cabernet Sauvignon#^brix-engana]]');

    expect(out).not.toContain('[[');
    expect(out).toContain('/vaults/enologia/root/01-castas/cabernet-sauvignon');
  });

  it('resolves a demoted whole-note embed', () => {
    expect(render('![[Cabernet Sauvignon]]')).toContain('cabernet-sauvignon');
  });

  it('keeps the visible text of the target', () => {
    expect(render('![[Cabernet Sauvignon]]')).toContain('Cabernet Sauvignon');
  });
});

describe('a plain wikilink inside transcluded content behaves as it does outside', () => {
  it('resolves one whose target exists', () => {
    const out = render('Ver [[Cabernet Sauvignon]] para a estrutura.');

    expect(out).not.toContain('[[');
    expect(out).toContain('/vaults/enologia/root/01-castas/cabernet-sauvignon');
  });

  it('marks one whose target does not exist as pending, and never as raw text', () => {
    // Visibly pending is the profile's rule, and it does not stop being the
    // rule because the note is being read inside another one.
    const out = render('Ver [[Correlação IPT e safra fria]].');

    expect(out).not.toContain('[[');
    expect(out).toContain('pending:');
  });

  it('keeps the alias form showing what the author wrote', () => {
    expect(render('Ver [[Cabernet Sauvignon|a casta]].')).toContain('a casta');
  });
});
