/**
 * The reserved vocabulary is written in en-US and may be READ in another
 * language (RN-DSC-030), and the properties of a note are drawn in a declared
 * order (RN-DSC-051).
 *
 * The translation stops at the label. The bytes of the note, what the export
 * writes, and what the search answers all keep the en-US key, which is what
 * makes a vault kept in Portuguese answer `created:2026-09` and still read as
 * Portuguese on screen.
 *
 * The list is not written here either: it comes from the pinned specification,
 * so a version that reserves one more name reserves it in this test too — and
 * the label guard below is what turns that into a failing build rather than a
 * key nobody translated.
 */

import { describe, expect, it } from 'vitest';
import { DRAWN_RESERVED_KEYS } from '@memorysmith/contracts';
import { orderedProperties, propertyLabel } from './PropertyValue';
import en from '../../i18n/locales/en_US.json' with { type: 'json' };
import pt from '../../i18n/locales/pt_BR.json' with { type: 'json' };

/** A translator that makes the lookup visible. */
const t = (key: string): string => `<${key}>`;

describe('a reserved key may be shown translated', () => {
  it.each([...DRAWN_RESERVED_KEYS])('translates %s', (key) => {
    expect(propertyLabel(key, t)).toBe(`<reserved.${key}>`);
  });

  it('has a label in both locales for every reserved key it draws', () => {
    // The guard that makes an eighth reserved name a failing build instead of
    // a key drawn in en-US inside a screen in Portuguese.
    for (const key of DRAWN_RESERVED_KEYS) {
      expect((en.reserved as Record<string, string>)[key], `en_US label for ${key}`).toBeTruthy();
      expect((pt.reserved as Record<string, string>)[key], `pt_BR label for ${key}`).toBeTruthy();
    }
  });
});

describe('every other attribute keeps the name whoever wrote the note gave it', () => {
  it('leaves an attribute the vault invented alone', () => {
    expect(propertyLabel('maturity', t)).toBe('maturity');
    expect(propertyLabel('norma', t)).toBe('norma');
  });

  it('does not translate an attribute that merely reads like a reserved one', () => {
    // `etiquetas` is somebody's own key, in their own language, and renaming
    // it on screen would be the interface deciding what their vault means.
    expect(propertyLabel('etiquetas', t)).toBe('etiquetas');
    expect(propertyLabel('Tags', t)).toBe('Tags');
  });
});

describe('the properties are drawn in a declared order (RN-DSC-051)', () => {
  const drawn = (entries: Array<[string, string]>): string[] =>
    orderedProperties(entries).map(([key]) => key);

  it('puts the reserved keys first, in the order of the specification', () => {
    const written: Array<[string, string]> = [
      ['maturity', 'seed'],
      ['updated', '2026-09-09'],
      ['norma', 'federal'],
      ['tags', 'contracts'],
    ];
    expect(drawn(written)).toEqual(['tags', 'updated', 'maturity', 'norma']);
  });

  it('keeps the vocabulary of the vault in the order the note wrote it', () => {
    const written: Array<[string, string]> = [
      ['zeta', '1'],
      ['alfa', '2'],
      ['created', '2026-09-01'],
    ];
    expect(drawn(written)).toEqual(['created', 'zeta', 'alfa']);
  });

  it('never draws the title as a property, because a note is not a category of itself', () => {
    expect(
      drawn([
        ['title', 'Lei 14.133'],
        ['maturity', 'seed'],
      ]),
    ).toEqual(['maturity']);
  });
});
