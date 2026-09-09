/**
 * Note use cases: form B of the transaction, the hot path
 * (architecture-guide.md, section 10.2).
 *
 * One rule of the public contract lives here, and it is what makes an agent
 * safe to point at a vault: update_note requires baseRevision, and a
 * divergence answers CONFLICT WITH THE CURRENT CONTENT attached, so the caller
 * can choose between redoing and merging (RN-AGT-005).
 *
 * The other one used to be idempotency, and it is gone with the key it stood
 * on: **create_note always creates** (RN-AGT-024). Nothing in a vault is
 * unique, two notes may carry one title (RN-KNW-037), and a repeated call
 * writes a second note. Answering ALREADY_EXISTS would mean the API refusing
 * what the model allows.
 */

import {
  type Authorship,
  DomainError,
  err,
  type FolderId,
  NoteId,
  ok,
  type VaultId,
  type Result,
} from '@memorysmith/kernel';
import type { RequestContext } from '../domain/access/AuthorizationPolicy.js';
import { Note } from '../domain/note/Note.js';
import { NotePlacement } from '../domain/services/NotePlacement.js';
import { VAULT_LIMITS } from '../domain/values.js';
import type { NoteRepository } from '../domain/ports/index.js';
import { loadAuthorized, type VaultDependencies } from './vaults.js';
import { admitWrite } from '../domain/services/StorageQuota.js';

export interface NoteDependencies extends VaultDependencies {
  readonly notes: NoteRepository;
}

const MAX_RETRIES = 3;

/** Retries a lost optimistic lock up to three times before surfacing it. */
async function withRetry<T>(
  operation: () => Promise<Result<T, DomainError>>,
): Promise<Result<T, DomainError>> {
  let last: Result<T, DomainError> | null = null;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    last = await operation();
    if (last.ok || last.error.code !== 'CONFLICT') return last;
  }
  return last as Result<T, DomainError>;
}

export class ListNotes {
  constructor(private readonly deps: NoteDependencies) {}

  async execute(input: {
    ctx: RequestContext;
    vaultId: VaultId;
    folderId?: FolderId | undefined;
  }): Promise<Result<Note[], DomainError>> {
    const vault = await loadAuthorized(this.deps, input.ctx, input.vaultId, 'read');
    if (!vault.ok) return vault;

    return ok(
      input.folderId
        ? await this.deps.notes.listByFolder(input.vaultId, input.folderId)
        : await this.deps.notes.listByVault(input.vaultId),
    );
  }
}

export class ReadNote {
  constructor(private readonly deps: NoteDependencies) {}

  async execute(input: {
    ctx: RequestContext;
    vaultId: VaultId;
    noteId: NoteId;
  }): Promise<Result<{ note: Note; content: string }, DomainError>> {
    const vault = await loadAuthorized(this.deps, input.ctx, input.vaultId, 'read');
    if (!vault.ok) return vault;

    const note = await this.deps.notes.findById(input.vaultId, input.noteId);
    if (!note || note.isDeleted) return err(DomainError.notFound('Note not found'));

    return ok({ note, content: await this.deps.content.read(note.bodyRef) });
  }
}

export class CreateNote {
  constructor(private readonly deps: NoteDependencies) {}

  async execute(input: {
    ctx: RequestContext;
    vaultId: VaultId;
    folderId: FolderId;
    content: string;
    afterNoteId: NoteId | null;
    by: Authorship;
  }): Promise<Result<Note, DomainError>> {
    const vault = await loadAuthorized(this.deps, input.ctx, input.vaultId, 'write');
    if (!vault.ok) return vault;

    if (!vault.value.folders.has(input.folderId)) {
      return err(DomainError.notFound('Folder not found in this vault'));
    }
    if (Buffer.byteLength(input.content, 'utf8') > VAULT_LIMITS.maxNoteBytes) {
      return err(DomainError.limitExceeded('A note holds at most 1 MB of content'));
    }
    if (vault.value.noteCount >= VAULT_LIMITS.maxNotes) {
      return err(DomainError.limitExceeded(`A vault holds at most ${VAULT_LIMITS.maxNotes} notes`));
    }
    // A new note costs its whole body, and the check runs before the content
    // is written so a refused write leaves nothing in the store (RN-SUB-021).
    const admitted = admitWrite(
      await this.deps.storage.current(),
      Buffer.byteLength(input.content, 'utf8'),
    );
    if (!admitted.ok) return admitted;

    // Content first, pointer second (section 10.5).
    const body = await this.deps.content.create(input.content);
    const siblings = await this.deps.notes.siblingOrder(input.vaultId, input.folderId);
    const position = input.afterNoteId
      ? NotePlacement.place(siblings, input.afterNoteId)
      : ok(NotePlacement.append(siblings));
    if (!position.ok) return position;

    const note = Note.create({
      id: NoteId.generate(),
      subscriptionId: vault.value.subscriptionId,
      vaultId: input.vaultId,
      folderId: input.folderId,
      body: input.content,
      position: position.value,
      bodyRef: body,
      by: input.by,
    });
    if (!note.ok) return note;

    const saved = await this.deps.notes.save(note.value);
    return saved.ok ? ok(note.value) : err(saved.error);
  }
}

export class UpdateNote {
  constructor(private readonly deps: NoteDependencies) {}

  async execute(input: {
    ctx: RequestContext;
    vaultId: VaultId;
    noteId: NoteId;
    content: string;
    baseRevision: string;
    by: Authorship;
  }): Promise<Result<Note, DomainError>> {
    const vault = await loadAuthorized(this.deps, input.ctx, input.vaultId, 'write');
    if (!vault.ok) return vault;
    if (Buffer.byteLength(input.content, 'utf8') > VAULT_LIMITS.maxNoteBytes) {
      return err(DomainError.limitExceeded('A note holds at most 1 MB of content'));
    }

    return withRetry(async () => {
      const note = await this.deps.notes.findById(input.vaultId, input.noteId);
      if (!note || note.isDeleted) return err(DomainError.notFound('Note not found'));

      if (note.revision !== input.baseRevision) {
        // The current content travels with the conflict, so the caller can
        // decide between redoing and merging. Blind overwrite is not accepted
        // in a vault that sustains auditing.
        return err(
          DomainError.conflict('The note changed since the revision you based this edit on', {
            currentRevision: note.revision,
            currentContent: await this.deps.content.read(note.bodyRef),
          }),
        );
      }

      // Only the difference between the revision that is live and the one
      // being written: an edit that shortens a note never costs anything.
      const admitted = admitWrite(
        await this.deps.storage.current(),
        Buffer.byteLength(input.content, 'utf8') - note.bodyRef.bytes,
      );
      if (!admitted.ok) return admitted;

      const ref = await this.deps.content.overwrite(note.bodyRef.contentId, input.content);
      const replaced = note.replaceBody(ref, input.content, input.by);
      if (!replaced.ok) return replaced;
      if (!note.hasChanges) return ok(note); // identical bytes (RN-KNW-028)

      const saved = await this.deps.notes.save(note);
      return saved.ok ? ok(note) : err(saved.error);
    });
  }
}

export class ReorderNote {
  constructor(private readonly deps: NoteDependencies) {}

  async execute(input: {
    ctx: RequestContext;
    vaultId: VaultId;
    noteId: NoteId;
    afterNoteId: NoteId | null;
    by: Authorship;
  }): Promise<Result<void, DomainError>> {
    const vault = await loadAuthorized(this.deps, input.ctx, input.vaultId, 'write');
    if (!vault.ok) return vault;

    const note = await this.deps.notes.findById(input.vaultId, input.noteId);
    if (!note || note.isDeleted) return err(DomainError.notFound('Note not found'));

    const siblings = await this.deps.notes.siblingOrder(input.vaultId, note.folderId);
    const position = NotePlacement.place(siblings, input.afterNoteId, note.id);
    if (!position.ok) return position;

    const reordered = note.reorder(position.value, input.by);
    if (!reordered.ok) return reordered;

    const saved = await this.deps.notes.save(note);
    return saved.ok ? ok() : err(saved.error);
  }
}

/**
 * Moving between folders costs zero bytes in S3. Moving between vaults is the
 * only operation that writes into two vault partitions in one transaction, and
 * it preserves the NoteId, and with it the whole timeline (RN-KNW-023).
 *
 * Nothing is resolved against the destination on the way in: a title collides
 * with nothing there, so the move carries no policy (RN-KNW-022, removed).
 */
export class MoveNote {
  constructor(private readonly deps: NoteDependencies) {}

  async execute(input: {
    ctx: RequestContext;
    vaultId: VaultId;
    noteId: NoteId;
    toVaultId: VaultId | null;
    toFolderId: FolderId;
    afterNoteId: NoteId | null;
    by: Authorship;
  }): Promise<Result<Note, DomainError>> {
    const origin = await loadAuthorized(this.deps, input.ctx, input.vaultId, 'write');
    if (!origin.ok) return origin;

    const destinationVaultId = input.toVaultId ?? input.vaultId;
    const crossVault = !destinationVaultId.equals(input.vaultId);
    const destination = crossVault
      ? await loadAuthorized(this.deps, input.ctx, destinationVaultId, 'write')
      : origin;
    if (!destination.ok) return destination;

    if (!destination.value.folders.has(input.toFolderId)) {
      return err(DomainError.notFound('Folder not found in the destination vault'));
    }

    const note = await this.deps.notes.findById(input.vaultId, input.noteId);
    if (!note || note.isDeleted) return err(DomainError.notFound('Note not found'));

    const siblings = await this.deps.notes.siblingOrder(destinationVaultId, input.toFolderId);
    const position = input.afterNoteId
      ? NotePlacement.place(siblings, input.afterNoteId, note.id)
      : ok(NotePlacement.append(siblings));
    if (!position.ok) return position;

    const moved = note.moveTo(
      {
        vaultId: destinationVaultId,
        folderId: input.toFolderId,
        position: position.value,
      },
      input.by,
    );
    if (!moved.ok) return moved;

    const saved = crossVault
      ? await this.deps.notes.saveMoved(note, { vaultId: input.vaultId })
      : await this.deps.notes.save(note);
    return saved.ok ? ok(note) : err(saved.error);
  }
}

/** Soft delete: the note leaves the listings, the bytes stay (RN-KNW-029). */
export class DeleteNote {
  constructor(private readonly deps: NoteDependencies) {}

  async execute(input: {
    ctx: RequestContext;
    vaultId: VaultId;
    noteId: NoteId;
    by: Authorship;
  }): Promise<Result<void, DomainError>> {
    const vault = await loadAuthorized(this.deps, input.ctx, input.vaultId, 'write');
    if (!vault.ok) return vault;

    const note = await this.deps.notes.findById(input.vaultId, input.noteId);
    if (!note || note.isDeleted) return err(DomainError.notFound('Note not found'));

    const deleted = note.delete(input.by);
    if (!deleted.ok) return deleted;

    const saved = await this.deps.notes.save(note);
    return saved.ok ? ok() : err(saved.error);
  }
}

export class RestoreNote {
  constructor(private readonly deps: NoteDependencies) {}

  async execute(input: {
    ctx: RequestContext;
    vaultId: VaultId;
    noteId: NoteId;
    by: Authorship;
  }): Promise<Result<void, DomainError>> {
    const vault = await loadAuthorized(this.deps, input.ctx, input.vaultId, 'write');
    if (!vault.ok) return vault;

    const note = await this.deps.notes.findById(input.vaultId, input.noteId);
    if (!note) return err(DomainError.notFound('Note not found'));

    // Nothing has to be free for a note to come back: another note may have
    // been written under the same title in the meantime, and both stand
    // (RN-KNW-037, and RN-KNW-030, removed).
    //
    // Bringing a note back puts its bytes back on the count, so it is a write
    // that grows the stored content and is refused when there is no room.
    const admitted = admitWrite(await this.deps.storage.current(), note.bodyRef.bytes);
    if (!admitted.ok) return admitted;

    const restored = note.restore(input.by);
    if (!restored.ok) return restored;

    const saved = await this.deps.notes.save(note);
    return saved.ok ? ok() : err(saved.error);
  }
}
