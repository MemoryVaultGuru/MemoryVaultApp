/**
 * The two halves of the image family the specification finished: the
 * dimensions an image carries in its alt text (§3.14, RN-DSC-048) and the
 * attachment a vault keeps beside its notes (§5.8, RN-DSC-049).
 *
 * The crossing between them is the pipe, and it is read by WHAT THE TARGET IS:
 * a note takes the alias, an attachment takes the dimensions, and a target
 * that resolves to neither takes the alias — because reading it as a dimension
 * would discard text an author wrote. Whichever it is, the pipe never changes
 * the target.
 */

import { describe, expect, it } from 'vitest';
import { readImageAlt } from './image-dimensions';
import { isAttachmentName } from './attachment';
import { resolveWikilinks } from './markdown';
import { splitEmbeds } from './transclusion';

describe('the pipe in an alt text separates the description from the dimensions', () => {
  it('reads width and height, and keeps the description', () => {
    expect(readImageAlt('Engelbart|100x145')).toEqual({
      description: 'Engelbart',
      width: 100,
      height: 145,
    });
  });

  it('reads a width on its own, which keeps the aspect ratio', () => {
    expect(readImageAlt('Engelbart|100')).toEqual({
      description: 'Engelbart',
      width: 100,
      height: null,
    });
  });

  it('leaves a value that is not a dimension inside the description', () => {
    // Deleting what an author wrote into an accessibility label is the worse
    // of the two failures, so `large` stays and nothing is applied.
    expect(readImageAlt('Engelbart|large')).toEqual({
      description: 'Engelbart|large',
      width: null,
      height: null,
    });
    expect(readImageAlt('A curve|100x')).toEqual({
      description: 'A curve|100x',
      width: null,
      height: null,
    });
  });

  it('never drops the description, which is what a reader hears', () => {
    expect(readImageAlt('Engelbart').description).toBe('Engelbart');
    expect(readImageAlt('|100').description).toBe('');
  });
});

describe('an attachment is a file of the vault that is not a note', () => {
  it('is told from a title by its extension, and a title may carry a dot', () => {
    expect(isAttachmentName('engelbart.jpg')).toBe(true);
    expect(isAttachmentName('colheita-2026.csv')).toBe(true);
    expect(isAttachmentName('Lei 14.133')).toBe(false);
    expect(isAttachmentName('Lei 14.133.md')).toBe(false);
  });

  it('is reported as an unresolved reference, and never as a pending note', () => {
    const resolve = (): string | null => null;
    const out = resolveWikilinks('Ver ![[engelbart.jpg]] no arquivo.', resolve);

    expect(out).toContain('attachment:');
    expect(out).not.toContain('pending:');
    expect(out).toContain('engelbart.jpg');
  });

  it('carries its dimensions in the same pipe, and shows neither as text', () => {
    const out = resolveWikilinks('![[engelbart.jpg|100x145]]', () => null);
    expect(out).toContain('attachment:');
    expect(out).not.toContain('100x145');
  });

  it('is never transcluded, because there is no note to expand', () => {
    const segments = splitEmbeds('![[engelbart.jpg]] and ![[Lei 14.133]]');
    expect(segments.filter((each) => each.kind === 'embed')).toHaveLength(1);
    expect(
      segments.some((each) => each.kind === 'text' && each.text.includes('engelbart.jpg')),
    ).toBe(true);
  });
});

describe('the pipe is read by what the target is', () => {
  const resolve = (title: string): string | null => (title === 'Lei 14.133' ? '/v/a/lei' : null);

  it('shows the alias when the target is a note', () => {
    expect(resolveWikilinks('[[Lei 14.133|a nova lei]]', resolve)).toContain(
      '[a nova lei](/v/a/lei)',
    );
  });

  it('shows the alias when the target resolves to nothing', () => {
    // Reading it as a dimension would discard the text an author wrote.
    const out = resolveWikilinks('[[Uma nota futura|o apelido]]', resolve);
    expect(out).toContain('[o apelido](pending:');
  });

  it('never lets the pipe change the target', () => {
    const asked: string[] = [];
    resolveWikilinks('[[Lei 14.133|qualquer coisa]]', (title) => {
      asked.push(title);
      return null;
    });
    expect(asked).toEqual(['Lei 14.133']);
  });
});
