/**
 * What a `root/*` path names.
 *
 * The question has two callers that must never disagree: the route, which
 * decides what to render, and resuming a reading, which asks it BEFORE
 * navigating. A remembered note that has been deleted, renamed or moved must
 * land on the tree and never on the not-found line, and this is where that is
 * decided — with the structure already in hand, so it costs no request and
 * cannot flash.
 */

import { describe, expect, it } from 'vitest';
import { noteAt } from './trail';
import type { FolderNode, NoteSummary } from '../../shared/types/api';

function note(slug: string, folderId: string): NoteSummary {
  return { id: `n-${slug}`, slug, title: slug, folderId };
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
    [note('lei-14133', 'f-decisions')],
    [folder('2026', 'decisions/2026', [note('article-75', 'f-decisions/2026')])],
  ),
  folder('empty', 'empty', []),
];

describe('a path names a note, or it does not', () => {
  it('finds a note in a top-level folder', () => {
    expect(noteAt(folders, 'decisions/lei-14133')).toBe('lei-14133');
  });

  it('finds a note in a nested folder', () => {
    expect(noteAt(folders, 'decisions/2026/article-75')).toBe('article-75');
  });

  it('says no to a folder, which is not a note', () => {
    expect(noteAt(folders, 'decisions')).toBeNull();
    expect(noteAt(folders, 'decisions/2026')).toBeNull();
  });

  it('says no to the vault root', () => {
    expect(noteAt(folders, '')).toBeNull();
  });

  it('says no to a note that is no longer there', () => {
    expect(noteAt(folders, 'decisions/deleted-yesterday')).toBeNull();
  });

  it('says no to a note under a folder that is no longer there', () => {
    expect(noteAt(folders, 'archive/lei-14133')).toBeNull();
  });

  it('does not find a note by its slug alone, outside its folder', () => {
    // The path is the address. A note answering at the vault root because it
    // exists somewhere would resume into a URL that renders nothing.
    expect(noteAt(folders, 'lei-14133')).toBeNull();
  });

  it('does not confuse a note of one folder with the same slug in another', () => {
    expect(noteAt(folders, 'empty/lei-14133')).toBeNull();
  });
});
