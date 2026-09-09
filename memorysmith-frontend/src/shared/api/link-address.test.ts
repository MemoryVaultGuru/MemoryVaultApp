/**
 * The two addresses, side by side (RN-DSC-045, RN-DSC-046, RN-DSC-056).
 *
 * A **URL is an address**: the product writes it, a person copies it, and
 * pasting it back has to land on the note it was copied from. A **wikilink is
 * a name**: an author writes it inside the content, it names a title, and a
 * title may be carried by several notes. Putting the name in the address made
 * the address inherit the ambiguity of the name, and this is the seam that
 * undoes the merge.
 */

import { describe, expect, it } from 'vitest';
import { linkTargetAddress, noteAddress, noteIdOf } from './note-address';

const ID = '01J8X2K9QZ3M4N5P6R7S8T9V0W';

describe('the address of a note names one note and never two', () => {
  it('is the trail, a readable label and the identifier', () => {
    expect(noteAddress('enologia', '01-castas', 'Índice', ID)).toBe(
      '/vaults/enologia/root/01-castas/indice--01j8x2k9qz3m4n5p6r7s8t9v0w',
    );
  });

  it('gives two notes with one title two different addresses', () => {
    // RN-KNW-037: the ambiguity is in the name and not in the address.
    const other = '01J8X2K9QZ3M4N5P6R7S8T9V0X';
    const first = noteAddress('enologia', '01-castas', 'Índice', ID);
    const second = noteAddress('enologia', '03-safras', 'Índice', other);
    expect(first).not.toBe(second);
    expect(noteIdOf(first.split('/').pop() ?? '')).toBe(ID);
    expect(noteIdOf(second.split('/').pop() ?? '')).toBe(other);
  });

  it('carries no percent escape, whatever the title has in it', () => {
    // The case the first draft of this design needed a raw pathname split
    // for: `useParams()['*']` hands an inner `%2F` back as `/`, and cuts a
    // title in half. None of that exists when the segment is ASCII.
    const address = noteAddress('a', 'f', 'Reunião 03/09/2026', ID);
    expect(address).toBe('/vaults/a/root/f/reuniao-03-09-2026--01j8x2k9qz3m4n5p6r7s8t9v0w');
    expect(address.split('/')).toHaveLength(6);
  });
});

describe('the address of a link target names a name', () => {
  it('is where the encoding of a name legitimately lives', () => {
    expect(linkTargetAddress('a', 'Reunião 03/09/2026')).toBe(
      '/vaults/a/links/Reuni%C3%A3o%2003%2F09%2F2026',
    );
  });

  it('normalises to NFC before encoding, so both spellings are one address', () => {
    const decomposed = 'Ação'.normalize('NFD');
    expect(linkTargetAddress('a', decomposed)).toBe(linkTargetAddress('a', 'Ação'));
  });

  it('does not fold case, because the specification does not', () => {
    // `…/links/indice` is a pending target and never a redirect that repairs
    // it: an address that forgave what a wikilink refuses would make the two
    // surfaces disagree about which note is which (RN-DSC-056).
    expect(linkTargetAddress('a', 'indice')).not.toBe(linkTargetAddress('a', 'Índice'));
  });
});
