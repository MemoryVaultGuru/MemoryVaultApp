import { describe, expect, it } from 'vitest';
import { FolderId, VaultId } from '@memorysmith/kernel';
import { NotePlacement } from '../src/domain/services/NotePlacement.js';
import {
  authorship,
  contentRef,
  expectErr,
  newNote,
  newVault,
  noteBody,
  unwrap,
} from './fixtures.js';

const folderId = FolderId.generate();

describe('Note: creation', () => {
  it('records NoteCreated carrying the complete ContentRef', () => {
    const vault = newVault();
    const note = newNote(vault, folderId, 'Lei 14.133, art. 75');

    // The title is what the content says, and nothing was passed in.
    expect(note.title).toBe('Lei 14.133, art. 75');
    const [event] = note.pullEvents();
    expect(event?.type).toBe('NoteCreated');
    expect(event?.subject).toBe('NOTE');
    expect(event?.subjectId).toBe(note.id.value);
    expect(event?.contentRef?.sha256).toBe(note.bodyRef.sha256);
  });

  it('exposes the revision a caller must echo back on update', () => {
    const vault = newVault();
    const note = newNote(vault, folderId);
    expect(note.revision).toBe(note.bodyRef.versionId);
  });
});

describe('Note: editing', () => {
  it('replaces the body and records NoteUpdated with the new ref', () => {
    const vault = newVault();
    const note = newNote(vault, folderId);
    note.pullEvents();

    const next = contentRef('d'.repeat(64), 900);
    expect(unwrap(note.replaceBody(next, noteBody('Lei 14.133'), authorship()))).toBe(true);
    expect(note.bodyRef.equals(next)).toBe(true);
    const [event] = note.pullEvents();
    expect(event?.type).toBe('NoteUpdated');
    expect(event?.contentRef?.bytes).toBe(900);
  });

  it('is a no-op when the content is byte-for-byte identical', () => {
    // RN-KNW-028: no new revision, no event, no re-indexing.
    const vault = newVault();
    const note = newNote(vault, folderId);
    note.pullEvents();

    const sameBytes = contentRef(note.bodyRef.sha256, note.bodyRef.bytes);
    expect(unwrap(note.replaceBody(sameBytes, noteBody('Lei 14.133'), authorship()))).toBe(false);
    expect(note.pullEvents()).toHaveLength(0);
  });

  it('retitles a note by editing the content that states the title', () => {
    // RN-KNW-038: there is no operation that renames a note apart from its
    // content, and this is what one looks like.
    const vault = newVault();
    const note = newNote(vault, folderId);
    note.pullEvents();

    const rewritten = contentRef('f'.repeat(64), 1500);
    unwrap(note.replaceBody(rewritten, noteBody('Lei 14.133, art. 76'), authorship()));

    expect(note.title).toBe('Lei 14.133, art. 76');
    const [event] = note.pullEvents();
    expect(event?.type).toBe('NoteUpdated');
    // The event is the whole truth: the title the chain read AND the live ref.
    expect(event?.payload['title']).toBe('Lei 14.133, art. 76');
    expect(event?.contentRef?.equals(rewritten)).toBe(true);
  });

  it('leaves a note with no addressable title, and writes it anyway', () => {
    // RN-KNW-036: the content states nothing a link could name. The note is
    // written, and what is reported is the absence, not an error.
    const vault = newVault();
    const note = newNote(vault, folderId);
    note.pullEvents();

    unwrap(note.replaceBody(contentRef('b'.repeat(64), 40), 'Just prose.\n', authorship()));

    expect(note.title).toBeNull();
    expect(note.pullEvents()[0]?.payload['title']).toBeNull();
  });

  it('keeps the two events of a move and a reorder apart', () => {
    // Only NoteUpdated is a snapshot. A transition is a fact of its own, and
    // collapsing two of those would lose one.
    const vault = newVault();
    const note = newNote(vault, folderId);
    note.pullEvents();

    unwrap(
      note.moveTo(
        { vaultId: vault.id, folderId: FolderId.generate(), position: note.position },
        authorship(),
      ),
    );
    unwrap(note.reorder(note.position, authorship()));

    expect(note.pullEvents().map((event) => event.type)).toEqual(['NoteMoved', 'NoteReordered']);
  });
});

describe('Note: ordering', () => {
  it('reorders with a single write, zero bytes in S3', () => {
    const vault = newVault();
    const first = newNote(vault, folderId, 'Lei 14.133');
    const second = newNote(vault, folderId, 'Lei 8.666', [
      { noteId: first.id, position: first.position },
    ]);
    const before = second.position;
    second.pullEvents();

    const siblings = [
      { noteId: first.id, position: first.position },
      { noteId: second.id, position: second.position },
    ];
    // Move the second note to the front of the folder.
    const position = unwrap(NotePlacement.place(siblings, null, second.id));
    unwrap(second.reorder(position, authorship()));

    const note = second;
    expect(note.position.value < first.position.value).toBe(true);
    expect(note.position.equals(before)).toBe(false);
    const [event] = note.pullEvents();
    expect(event?.type).toBe('NoteReordered');
    // Nothing about the content moved: no ref travels with a reorder.
    expect(event?.contentRef).toBeNull();
  });

  it('refuses to place a note after itself', () => {
    const vault = newVault();
    const note = newNote(vault, folderId);
    const placement = NotePlacement.place(
      [{ noteId: note.id, position: note.position }],
      note.id,
      note.id,
    );
    expect(expectErr(placement).code).toBe('VALIDATION');
  });
});

describe('Note: moving', () => {
  it('preserves the NoteId and reports both sides of the move', () => {
    // RN-KNW-023: the identifier survives, and with it the whole timeline.
    const vault = newVault();
    const note = newNote(vault, folderId);
    const originalId = note.id.value;
    note.pullEvents();

    const toVault = VaultId.generate();
    const toFolder = FolderId.generate();
    unwrap(
      note.moveTo(
        { vaultId: toVault, folderId: toFolder, position: NotePlacement.append([]) },
        authorship(),
      ),
    );

    expect(note.id.value).toBe(originalId);
    const [event] = note.pullEvents();
    expect(event?.type).toBe('NoteMoved');
    expect(event?.payload).toMatchObject({
      fromVaultId: vault.id.value,
      toVaultId: toVault.value,
      toFolderId: toFolder.value,
    });
  });

  it('refuses a move that changes nothing', () => {
    const vault = newVault();
    const note = newNote(vault, folderId);
    const move = note.moveTo(
      { vaultId: note.vaultId, folderId: note.folderId, position: note.position },
      authorship(),
    );
    expect(expectErr(move).code).toBe('VALIDATION');
  });
});

describe('Note: deleting is not destroying', () => {
  it('marks the note, keeps the bodyRef and records NoteDeleted', () => {
    const vault = newVault();
    const note = newNote(vault, folderId);
    const bodyBefore = note.bodyRef;
    note.pullEvents();

    unwrap(note.delete(authorship()));

    expect(note.isDeleted).toBe(true);
    // The content pointer is untouched: read_note(asOf) keeps answering.
    expect(note.bodyRef.equals(bodyBefore)).toBe(true);
    expect(note.pullEvents()[0]?.type).toBe('NoteDeleted');
  });

  it('refuses every write on a deleted note', () => {
    const vault = newVault();
    const note = newNote(vault, folderId);
    unwrap(note.delete(authorship()));
    note.pullEvents();

    expect(
      expectErr(note.replaceBody(contentRef('e'.repeat(64)), noteBody('Other'), authorship())).code,
    ).toBe('NOT_FOUND');
    expect(expectErr(note.reorder(NotePlacement.append([]), authorship())).code).toBe('NOT_FOUND');
    expect(expectErr(note.delete(authorship())).code).toBe('NOT_FOUND');
  });

  it('restores a deleted note', () => {
    const vault = newVault();
    const note = newNote(vault, folderId);
    unwrap(note.delete(authorship()));
    note.pullEvents();

    unwrap(note.restore(authorship()));
    expect(note.isDeleted).toBe(false);
    expect(note.pullEvents()[0]?.type).toBe('NoteRestored');
  });

  it('refuses to restore a note that was never deleted', () => {
    const vault = newVault();
    const note = newNote(vault, folderId);
    expect(expectErr(note.restore(authorship())).code).toBe('CONFLICT');
  });
});
