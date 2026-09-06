/**
 * The reserved vocabulary is written in en-US and may be READ in another
 * language (RN-DSC-030).
 *
 * The translation stops at the label. The bytes of the note, what the export
 * writes, and what the search answers all keep the en-US key, which is what
 * makes a vault kept in Portuguese answer `created:2026-09` and still read as
 * Portuguese on screen.
 */

import { describe, expect, it } from 'vitest';
import { propertyLabel } from './PropertyValue';

/** A translator that makes the lookup visible. */
const t = (key: string): string => `<${key}>`;

describe('a reserved key may be shown translated', () => {
  it.each(['aliases', 'tags', 'created', 'updated'])('translates %s', (key) => {
    expect(propertyLabel(key, t)).toBe(`<reserved.${key}>`);
  });
});

describe('every other attribute keeps the name whoever wrote the note gave it', () => {
  it('leaves an attribute the vault invented alone', () => {
    expect(propertyLabel('maturity', t)).toBe('maturity');
    expect(propertyLabel('norma', t)).toBe('norma');
  });

  it('leaves title alone, which is deliberately not reserved', () => {
    expect(propertyLabel('title', t)).toBe('title');
  });

  it('does not translate an attribute that merely reads like a reserved one', () => {
    // `etiquetas` is somebody's own key, in their own language, and renaming
    // it on screen would be the interface deciding what their vault means.
    expect(propertyLabel('etiquetas', t)).toBe('etiquetas');
    expect(propertyLabel('Tags', t)).toBe('Tags');
  });
});
