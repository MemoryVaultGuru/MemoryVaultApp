/**
 * The addresses the reading surface follows, at the level where it is decided.
 *
 * The list is a decision about the product and not a defence against a known
 * attack, so both halves are asserted: what passes, because erasing a real
 * link is the expensive mistake, and what does not, one case per reason.
 */

import { describe, expect, it } from 'vitest';
import { followable } from './address';

describe('an address the surface follows', () => {
  it('keeps the web and a person', () => {
    expect(followable('https://example.org/lei-14133')).toBe('https://example.org/lei-14133');
    expect(followable('http://example.org')).toBe('http://example.org');
    expect(followable('mailto:someone@example.org')).toBe('mailto:someone@example.org');
  });

  it('keeps the pending link, which is why the stock filter was off', () => {
    expect(followable('pending:Uma%20nota')).toBe('pending:Uma%20nota');
  });

  it('keeps what has no scheme at all: a route, a relative target, an anchor', () => {
    expect(followable('/v/a-vault/note/lei-14133')).toBe('/v/a-vault/note/lei-14133');
    expect(followable('./outra-nota.md')).toBe('./outra-nota.md');
    expect(followable('../normas/lei.md')).toBe('../normas/lei.md');
    expect(followable('#article-75')).toBe('#article-75');
  });
});

describe('an address the surface does not follow', () => {
  it('refuses the scheme of a desktop editor, which is a decision', () => {
    // It opens the vault of whoever has that editor and that vault on that
    // machine: it works for the author and does nothing for every other
    // reader of the same note.
    expect(followable('obsidian://open?vault=Notas&file=Lei')).toBe('');
  });

  it('refuses a page carried inside the address', () => {
    expect(followable('data:text/html;base64,PHNjcmlwdD4=')).toBe('');
    expect(followable('data:image/png;base64,iVBORw0KGgo=')).toBe('');
  });

  it('refuses script written where an address goes', () => {
    // React blocks the first one on its own. That it does is not a reason to
    // hand it the chance.
    expect(followable('javascript:alert(1)')).toBe('');
    expect(followable('JavaScript:alert(1)')).toBe('');
    expect(followable('vbscript:msgbox')).toBe('');
  });

  it("refuses the reader's own disk, addressed by somebody else", () => {
    expect(followable('file:///C:/Users/someone/notes')).toBe('');
  });

  it('refuses by default, so a scheme nobody thought of does not pass', () => {
    expect(followable('tel:+5551999999999')).toBe('');
    expect(followable('ftp://example.org/x')).toBe('');
    expect(followable('whatever://example.org')).toBe('');
  });

  it('is not fooled by the space in front of a scheme', () => {
    expect(followable('  javascript:alert(1)')).toBe('');
  });
});
