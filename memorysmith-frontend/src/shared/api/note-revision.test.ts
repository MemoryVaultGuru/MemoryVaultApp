/**
 * The revision a write echoes back is the VERSION, not the whole reference.
 *
 * This is the defect that reached production and the reason the frontend now
 * types the response by the published DTO instead of by a shape retyped here
 * (#75). The local shape said `revision: string`; the contract says it is a
 * `ContentRef`, an object of four fields. The whole object was therefore sent
 * as `baseRevision`, the API refused the request at validation, and no task
 * box in the product could ever be ticked.
 *
 * The assertion is made against the **published schemas** and not against a
 * description of them, because a description is the thing that was wrong.
 */

import { describe, expect, it } from 'vitest';
import { noteSchema, updateNoteRequestSchema } from '@memorysmith/contracts';

/** What the API answers for a note, as its own schema defines it. */
const payload = {
  noteId: '01JQ8Z6VZ0000000000000000A',
  vaultId: '01JQ8Z6VZ0000000000000000B',
  folderId: '01JQ8Z6VZ0000000000000000C',
  title: 'Recovery Time Objective',
  slug: 'recovery-time-objective',
  position: 'a0',
  bytes: 47,
  updatedAt: '2026-09-06T12:00:00.000Z',
  updatedBy: { userId: '01JQ8Z6VZ0000000000000000E', agent: null, at: '2026-09-06T12:00:00.000Z' },
  content: '# Recovery Time Objective\n\n- [ ] Read the act\n',
  revision: {
    contentId: '01JQ8Z6VZ0000000000000000D',
    versionId: 'kFf3.mR2nQ8vX1pL',
    sha256: 'a'.repeat(64),
    bytes: 47,
  },
  createdBy: { userId: '01JQ8Z6VZ0000000000000000E', agent: null, at: '2026-09-06T12:00:00.000Z' },
  deletedAt: null,
};

describe('the note DTO carries a reference, and a write carries a version', () => {
  it('is an object on the way out, with the version inside it', () => {
    const note = noteSchema.parse(payload);

    expect(typeof note.revision).toBe('object');
    expect(note.revision.versionId).toBe('kFf3.mR2nQ8vX1pL');
  });

  it('refuses the whole reference as baseRevision, which is what used to be sent', () => {
    const note = noteSchema.parse(payload);
    const sent = updateNoteRequestSchema.safeParse({
      content: note.content,
      baseRevision: note.revision,
    });

    expect(sent.success).toBe(false);
  });

  it('accepts the version, which is what the frontend now reads', () => {
    const note = noteSchema.parse(payload);
    const sent = updateNoteRequestSchema.safeParse({
      content: note.content,
      baseRevision: note.revision.versionId,
    });

    expect(sent.success).toBe(true);
  });

  it('refuses an empty string, so a missing revision cannot pass as one', () => {
    // `baseRevision ?? ''` in the caller would have been silently accepted by
    // a looser schema, and refused by the server with the same conflict.
    expect(updateNoteRequestSchema.safeParse({ content: 'x', baseRevision: '' }).success).toBe(
      false,
    );
  });
});
