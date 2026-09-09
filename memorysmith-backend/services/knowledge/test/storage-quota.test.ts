/**
 * The storage quota, applied (RN-SUB-019, RN-SUB-021).
 *
 * Two halves are tested here and they are independent: what each mutation
 * DECLARES it moved, which is what the counter is built from, and what the
 * policy ADMITS given a budget. A wrong declaration would silently drift the
 * counter, which is the failure mode worth a test of its own: nothing breaks,
 * the number just stops being true.
 */

import { describe, expect, it } from 'vitest';
import { admitWrite } from '../src/domain/services/StorageQuota.js';
import { FolderId } from '@memorysmith/kernel';
import { authorship, contentRef, newNote, newVault, noteBody, unwrap } from './fixtures.js';

const folderId = FolderId.generate();

describe('storage: what each mutation declares', () => {
  it('a new note costs its whole body', () => {
    const vault = newVault();
    const note = newNote(vault, folderId, 'Contratação direta');
    const [created] = note.pullEvents();

    expect(created?.type).toBe('NoteCreated');
    expect(created?.storageDelta).toBe(note.bodyRef.bytes);
  });

  it('a new body costs only the difference between the two revisions', () => {
    const vault = newVault();
    const note = newNote(vault, folderId, 'Contratação direta');
    note.pullEvents();

    const bigger = contentRef('b'.repeat(64), note.bodyRef.bytes + 300);
    unwrap(note.replaceBody(bigger, noteBody('Contratação direta'), authorship()));
    const [updated] = note.pullEvents();

    expect(updated?.type).toBe('NoteUpdated');
    expect(updated?.storageDelta).toBe(300);
  });

  it('an edit that shortens the note gives the difference back', () => {
    const vault = newVault();
    const note = newNote(vault, folderId, 'Contratação direta');
    note.pullEvents();

    const smaller = contentRef('c'.repeat(64), note.bodyRef.bytes - 20);
    unwrap(note.replaceBody(smaller, noteBody('Contratação direta'), authorship()));
    const [updated] = note.pullEvents();

    expect(updated?.storageDelta).toBe(-20);
  });

  /**
   * The case that makes the delta a declaration rather than something derived
   * from the event type: a write of the same length changes the title of the
   * note and moves no bytes at all.
   */
  it('a rewrite of the same length retitles the note and moves no bytes', () => {
    const vault = newVault();
    const note = newNote(vault, folderId, 'Contratação direta');
    note.pullEvents();

    const sameSize = contentRef('d'.repeat(64), note.bodyRef.bytes);
    unwrap(note.replaceBody(sameSize, noteBody('Contratação direta por dispensa'), authorship()));
    const [updated] = note.pullEvents();

    expect(note.title).toBe('Contratação direta por dispensa');
    expect(updated?.type).toBe('NoteUpdated');
    expect(updated?.storageDelta).toBe(0);
  });

  it('deleting releases the body, and restoring puts it back', () => {
    const vault = newVault();
    const note = newNote(vault, folderId, 'Contratação direta');
    const bytes = note.bodyRef.bytes;
    note.pullEvents();

    unwrap(note.delete(authorship()));
    const [deleted] = note.pullEvents();
    expect(deleted?.storageDelta).toBe(-bytes);

    unwrap(note.restore(authorship()));
    const [restored] = note.pullEvents();
    expect(restored?.storageDelta).toBe(bytes);
  });

  it('reordering and moving are storage-neutral', () => {
    const vault = newVault();
    const note = newNote(vault, folderId, 'Contratação direta');
    note.pullEvents();

    unwrap(note.reorder(note.position, authorship()));
    unwrap(
      note.moveTo(
        { vaultId: vault.id, folderId: FolderId.generate(), position: note.position },
        authorship(),
      ),
    );
    const events = note.pullEvents();
    expect(events).toHaveLength(2);
    for (const event of events) expect(event.storageDelta).toBe(0);
  });

  it('a guidance costs the difference against the one it replaces', () => {
    const vault = newVault();
    vault.pullEvents(); // VaultCreated, which moves nothing
    unwrap(vault.setGuidance(contentRef('d'.repeat(64), 1000), authorship()));
    const [first] = vault.pullEvents();
    expect(first?.storageDelta).toBe(1000);

    unwrap(vault.setGuidance(contentRef('e'.repeat(64), 1500), authorship()));
    const [second] = vault.pullEvents();
    expect(second?.storageDelta).toBe(500);
  });
});

describe('storage: what the policy admits', () => {
  const budget = { usedBytes: 900, limitBytes: 1000 };

  it('admits a write that fits', () => {
    expect(admitWrite(budget, 100).ok).toBe(true);
  });

  it('refuses a write that would cross the line, saying by how much', () => {
    const refused = admitWrite(budget, 101);
    expect(refused.ok).toBe(false);
    if (refused.ok) return;
    expect(refused.error.code).toBe('LIMIT_EXCEEDED');
    expect(refused.error.details).toMatchObject({
      usedBytes: 900,
      limitBytes: 1000,
      requestedBytes: 101,
    });
  });

  /**
   * The reason the policy looks at the delta and not at the total: over the
   * line, the only writes that matter are the ones that get you back under it.
   */
  it('admits shrinking and deleting even when already over the limit', () => {
    const over = { usedBytes: 5000, limitBytes: 1000 };
    expect(admitWrite(over, -400).ok).toBe(true);
    expect(admitWrite(over, 0).ok).toBe(true);
    expect(admitWrite(over, 1).ok).toBe(false);
  });
});
