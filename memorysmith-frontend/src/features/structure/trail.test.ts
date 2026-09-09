/**
 * What a `root/*` path names.
 *
 * The question has two callers that must never disagree: the route, which
 * decides what to render, and resuming a reading, which asks it BEFORE
 * navigating. It is answered from the **shape of the last segment** and not
 * from the structure (RN-DSC-055), which is what makes a remembered address
 * survive a retitle and a move — the two things that used to break it.
 */

import { describe, expect, it } from 'vitest';
import { noteAt } from './trail';
import { noteAddress, noteIdOf, noteSegment } from '../../shared/api/note-address';
import type { FolderNode, NoteSummary } from '../../shared/types/api';

const LEI = '01J8X2K9QZ3M4N5P6R7S8T9V0W';
const ART = '01J8X2K9QZ3M4N5P6R7S8T9V0X';

function note(id: string, title: string, folderId: string): NoteSummary {
  return { id, title, folderId };
}

function folder(
  slug: string,
  slugPath: string,
  notes: NoteSummary[],
  children: FolderNode[] = [],
): FolderNode {
  return {
    id: `f-${slugPath}`,
    parentId: null,
    name: slug,
    slug,
    slugPath,
    description: 'a folder',
    position: 1,
    hasTemplate: false,
    noteCount: notes.length,
    notes,
    children,
  };
}

const folders: FolderNode[] = [
  folder(
    'decisions',
    'decisions',
    [note(LEI, 'Lei 14.133', 'f-decisions')],
    [folder('2026', 'decisions/2026', [note(ART, 'Article 75', 'f-decisions/2026')])],
  ),
  folder('empty', 'empty', []),
];

describe('a path names a note by its identifier, or it does not', () => {
  it('finds a note in a top-level folder', () => {
    expect(noteAt(folders, 'decisions/lei-14133--01j8x2k9qz3m4n5p6r7s8t9v0w')).toBe(LEI);
  });

  it('finds a note in a nested folder', () => {
    expect(noteAt(folders, 'decisions/2026/article-75--01j8x2k9qz3m4n5p6r7s8t9v0x')).toBe(ART);
  });

  it('finds it with a stale label, with no label, and in upper case', () => {
    // The label is decoration and is never compared: it goes out of date the
    // moment somebody edits a title, and an address that went out of date has
    // to keep working (RN-DSC-045).
    expect(noteAt(folders, 'decisions/whatever-it-used-to-be--01j8x2k9qz3m4n5p6r7s8t9v0w')).toBe(
      LEI,
    );
    expect(noteAt(folders, 'decisions/01j8x2k9qz3m4n5p6r7s8t9v0w')).toBe(LEI);
    expect(noteAt(folders, `decisions/${LEI}`)).toBe(LEI);
  });

  it('finds it under a folder trail that is no longer right', () => {
    // A moved note keeps its identifier, so a remembered address still lands.
    expect(noteAt(folders, 'archive/lei-14133--01j8x2k9qz3m4n5p6r7s8t9v0w')).toBe(LEI);
  });

  it('says no to a folder, which is not a note', () => {
    expect(noteAt(folders, 'decisions')).toBeNull();
    expect(noteAt(folders, 'decisions/2026')).toBeNull();
  });

  it('says no to the vault root', () => {
    expect(noteAt(folders, '')).toBeNull();
  });

  it('says no to a segment that carries no identifier', () => {
    expect(noteAt(folders, 'decisions/lei-14133')).toBeNull();
    expect(noteAt(folders, 'decisions/lei-14133--not-a-ulid')).toBeNull();
  });
});

describe('the segment of a note address', () => {
  it('is the label, then the identifier, and it round-trips', () => {
    expect(noteSegment('Lei 14.133', LEI)).toBe('lei-14133--01j8x2k9qz3m4n5p6r7s8t9v0w');
    expect(noteIdOf(noteSegment('Lei 14.133', LEI))).toBe(LEI);
  });

  it('is the bare identifier when the note has no addressable title', () => {
    // RN-KNW-036 as the degenerate case of the same rule, not a second scheme.
    expect(noteSegment(null, LEI)).toBe('01j8x2k9qz3m4n5p6r7s8t9v0w');
    expect(noteIdOf(noteSegment(null, LEI))).toBe(LEI);
  });

  it('is ASCII end to end, whatever the title carries', () => {
    const address = noteAddress('enologia', '01-castas', 'Reunião 03/09/2026', LEI);
    expect(address).not.toMatch(/[^\x20-\x7e]/);
    expect(address).not.toContain('%');
    expect(noteIdOf(address.split('/').pop() ?? '')).toBe(LEI);
  });

  it('splits at the LAST double hyphen, whatever precedes it', () => {
    expect(noteIdOf(`a--b--${LEI.toLowerCase()}`)).toBe(LEI);
  });
});
