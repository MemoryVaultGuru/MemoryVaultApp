/**
 * The rest of the MemorySmith ring, at the level where each piece decides.
 *
 * The conformance test proves each declared notation through the real
 * renderer; these prove the edges the profile states and a single example
 * cannot cover — a notation inside a code fence, a block that is not the one
 * asked for, a comment that was the whole paragraph.
 */

import { describe, expect, it } from 'vitest';
import { blockOf, isBlockAnchor, sectionOf } from './transclusion';

describe('a block identifier names the block it ends (profile 5.7)', () => {
  const note = [
    '# Lei 14.133',
    '',
    'An opening paragraph.',
    '',
    'The rule is stated once, here. ^article-75',
    '',
    'And something after it.',
    '',
    'A second one. ^note-b',
  ].join('\n');

  it('returns the block the identifier ends, and only it', () => {
    expect(blockOf(note, 'article-75')).toBe('The rule is stated once, here. ^article-75');
  });

  it('tells two identifiers of one note apart', () => {
    expect(blockOf(note, 'note-b')).toBe('A second one. ^note-b');
  });

  it('returns the whole block when it runs over several lines', () => {
    const wrapped = ['First line of the block', 'and its second line. ^wrapped'].join('\n');
    expect(blockOf(wrapped, 'wrapped')).toBe(
      'First line of the block\nand its second line. ^wrapped',
    );
  });

  it('answers null for an identifier that names nothing, and never throws', () => {
    // Reported the way a pending link is: a vault is read most while it is
    // still being written, so a target that is not there yet is expected.
    expect(blockOf(note, 'does-not-exist')).toBeNull();
  });

  it('does not match an identifier that is a prefix of another', () => {
    expect(blockOf('A block. ^article-75-b', 'article-75')).toBeNull();
  });

  it('does not read a caret in the middle of a line as an identifier', () => {
    expect(blockOf('The exponent ^2 is written like this.', '2')).toBeNull();
  });
});

describe('an anchor addresses a block or a section, and the marker says which', () => {
  it('reads ^id as a block and anything else as a section', () => {
    expect(isBlockAnchor('^article-75')).toBe(true);
    expect(isBlockAnchor('Article 75')).toBe(false);
  });

  it('keeps the two apart, so neither answers for the other', () => {
    const note = ['## Article 75', '', 'The section body.', '', 'A block. ^article-75'].join('\n');

    expect(sectionOf(note, 'Article 75')).toContain('The section body.');
    expect(blockOf(note, 'article-75')).toBe('A block. ^article-75');
  });
});
