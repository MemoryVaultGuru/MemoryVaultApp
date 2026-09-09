/**
 * Note: an Aggregate Root of its own, deliberately NOT part of Vault.
 *
 * If it were inside, creating a note would have to load and lock the whole
 * tree, and the structural invariants do not depend on note content. "A folder
 * with notes cannot be removed without a policy" is eventual consistency (via
 * event), not a transactional invariant. It is the most important modelling
 * decision in the system, because it is what keeps note writing cheap and
 * concurrent (architecture-guide.md, section 6.2).
 *
 * Two details follow from it:
 *  - vaultId is NOT readonly: moving between vaults is a first-class operation
 *    and the NoteId is preserved (RN-KNW-023), which is what keeps the audit
 *    timeline intact, since its key is by subject and not by vault.
 *  - replaceBody takes an ALREADY written ContentRef: whoever talks to S3 is
 *    the use case, never the aggregate.
 *
 * The title is NOT a field a caller sets. It is read out of the body by the
 * chain of the specification, here, on every write, so a note cannot exist
 * whose title disagrees with its content (RN-KNW-035). It is `null` when the
 * content states none a link could name (RN-KNW-036), and there is no slug:
 * nothing in a vault is a key, and two notes may be called the same thing
 * (RN-KNW-037).
 */

import {
  type Authorship,
  type ContentRef,
  createEvent,
  DomainError,
  err,
  type FolderId,
  type Instant,
  type NoteId,
  ok,
  noteTitle,
  type Position,
  type SubscriptionId,
  type VaultId,
  type DomainEvent,
  type Result,
} from '@memorysmith/kernel';
export class Note {
  private readonly events: DomainEvent[] = [];

  private constructor(
    readonly id: NoteId,
    readonly subscriptionId: SubscriptionId,
    private _vaultId: VaultId,
    private _folderId: FolderId,
    private _title: string | null,
    private _position: Position,
    private _bodyRef: ContentRef,
    readonly createdBy: Authorship,
    private _updatedBy: Authorship,
    private _deletedAt: Instant | null,
    private _version: number,
  ) {}

  /**
   * The body arrives alongside the reference to it, because the title is read
   * from the bytes and this is where that reading belongs: a use case that
   * passed a title in could pass one the content does not say.
   */
  static create(input: {
    id: NoteId;
    subscriptionId: SubscriptionId;
    vaultId: VaultId;
    folderId: FolderId;
    body: string;
    position: Position;
    bodyRef: ContentRef;
    by: Authorship;
  }): Result<Note, DomainError> {
    const title = noteTitle(input.body);
    const note = new Note(
      input.id,
      input.subscriptionId,
      input.vaultId,
      input.folderId,
      title,
      input.position,
      input.bodyRef,
      input.by,
      input.by,
      null,
      0,
    );
    note.record(
      'NoteCreated',
      input.by,
      {
        vaultId: input.vaultId.value,
        noteId: input.id.value,
        folderId: input.folderId.value,
        title,
        position: input.position.value,
      },
      input.bodyRef,
      input.bodyRef.bytes,
    );
    return ok(note);
  }

  static rehydrate(input: {
    id: NoteId;
    subscriptionId: SubscriptionId;
    vaultId: VaultId;
    folderId: FolderId;
    title: string | null;
    position: Position;
    bodyRef: ContentRef;
    createdBy: Authorship;
    updatedBy: Authorship;
    deletedAt: Instant | null;
    version: number;
  }): Note {
    return new Note(
      input.id,
      input.subscriptionId,
      input.vaultId,
      input.folderId,
      input.title,
      input.position,
      input.bodyRef,
      input.createdBy,
      input.updatedBy,
      input.deletedAt,
      input.version,
    );
  }

  /** The version currently stored, which is what the optimistic lock expects. */
  get version(): number {
    return this._version;
  }

  /** Called by the repository after a successful write. */
  markPersisted(): void {
    this._version += 1;
  }

  get vaultId(): VaultId {
    return this._vaultId;
  }
  get folderId(): FolderId {
    return this._folderId;
  }
  /** What the chain read, or `null` when no link can name this note. */
  get title(): string | null {
    return this._title;
  }
  get position(): Position {
    return this._position;
  }
  get bodyRef(): ContentRef {
    return this._bodyRef;
  }
  get updatedBy(): Authorship {
    return this._updatedBy;
  }
  get deletedAt(): Instant | null {
    return this._deletedAt;
  }
  get isDeleted(): boolean {
    return this._deletedAt !== null;
  }
  /** The revision a caller must echo back as baseRevision (RN-AGT-005). */
  get revision(): string {
    return this._bodyRef.versionId;
  }

  /**
   * If the content is byte-for-byte identical to the current one there is no
   * new revision, no event and no re-indexing (RN-KNW-028). The caller can
   * tell it was a no-op because no event was recorded.
   *
   * This is also how a note is retitled: there is no operation that renames
   * one apart from its content (RN-KNW-038). Identical bytes cannot state a
   * different title, so the early return costs nothing.
   */
  replaceBody(ref: ContentRef, body: string, by: Authorship): Result<boolean, DomainError> {
    if (this.isDeleted) return err(DomainError.notFound('This note is deleted'));
    if (this._bodyRef.hasSameContentAs(ref)) return ok(false);

    // What the subscription is storing changed by the difference between the
    // revision that was live and the one that now is. The superseded revision
    // stays in the store and stops being counted (RN-SUB-021).
    const delta = ref.bytes - this._bodyRef.bytes;
    this._bodyRef = ref;
    this._title = noteTitle(body);
    this._updatedBy = by;
    this.record(
      'NoteUpdated',
      by,
      {
        vaultId: this._vaultId.value,
        noteId: this.id.value,
        folderId: this._folderId.value,
        title: this._title,
      },
      ref,
      delta,
    );
    return ok(true);
  }

  /**
   * A single write on this item: zero bytes in S3, and the vault META item is
   * not touched (PE8). The Position itself is computed by the use case, which
   * is the only layer that can see the siblings.
   */
  reorder(position: Position, by: Authorship): Result<void, DomainError> {
    if (this.isDeleted) return err(DomainError.notFound('This note is deleted'));
    this._position = position;
    this._updatedBy = by;
    this.record('NoteReordered', by, {
      vaultId: this._vaultId.value,
      noteId: this.id.value,
      folderId: this._folderId.value,
      position: position.value,
    });
    return ok();
  }

  /**
   * Moving preserves the NoteId, and with it the whole timeline of the note
   * (RN-KNW-023). Implementing it as delete plus create would lose the history
   * exactly where it matters.
   *
   * A destination has nothing to refuse: a title collides with nothing, in
   * one vault or in two (RN-KNW-037), so there is no conflict policy left to
   * apply (RN-KNW-022, removed).
   */
  moveTo(
    destination: { vaultId: VaultId; folderId: FolderId; position: Position },
    by: Authorship,
  ): Result<void, DomainError> {
    if (this.isDeleted) return err(DomainError.notFound('This note is deleted'));

    const fromVaultId = this._vaultId;
    const fromFolderId = this._folderId;
    if (fromVaultId.equals(destination.vaultId) && fromFolderId.equals(destination.folderId)) {
      return err(DomainError.validation('The note is already in that folder'));
    }

    this._vaultId = destination.vaultId;
    this._folderId = destination.folderId;
    this._position = destination.position;
    this._updatedBy = by;
    this.record('NoteMoved', by, {
      noteId: this.id.value,
      fromVaultId: fromVaultId.value,
      fromFolderId: fromFolderId.value,
      toVaultId: destination.vaultId.value,
      toFolderId: destination.folderId.value,
      position: destination.position.value,
    });
    return ok();
  }

  /**
   * Soft delete: the note leaves the listings and the search, the bodyRef stays
   * intact and the timeline keeps answering by NoteId (RN-KNW-029). Nothing is
   * released with it, because the note held no name the vault was keeping
   * (RN-KNW-030, removed).
   */
  delete(by: Authorship): Result<void, DomainError> {
    if (this.isDeleted) return err(DomainError.notFound('This note is already deleted'));
    this._deletedAt = by.at;
    this._updatedBy = by;
    // A deleted note is no longer live content, so its bytes leave the count.
    // They do NOT leave the store: nothing here destroys a revision (PE8).
    this.record(
      'NoteDeleted',
      by,
      {
        vaultId: this._vaultId.value,
        noteId: this.id.value,
        folderId: this._folderId.value,
      },
      null,
      -this._bodyRef.bytes,
    );
    return ok();
  }

  /** Nothing has to be free for a note to come back (RN-KNW-037). */
  restore(by: Authorship): Result<void, DomainError> {
    if (!this.isDeleted) return err(DomainError.conflict('This note is not deleted'));
    this._deletedAt = null;
    this._updatedBy = by;
    this.record(
      'NoteRestored',
      by,
      {
        vaultId: this._vaultId.value,
        noteId: this.id.value,
        folderId: this._folderId.value,
        position: this._position.value,
      },
      null,
      this._bodyRef.bytes,
    );
    return ok();
  }

  get hasChanges(): boolean {
    return this.events.length > 0;
  }

  pullEvents(): DomainEvent[] {
    return this.events.splice(0, this.events.length);
  }

  /**
   * One unit of work publishes at most one `NoteUpdated`.
   *
   * That event is a snapshot and not a diff: every recorder of it writes the
   * whole of what the note now is, title, folder and the ContentRef that is
   * live at that instant. So a second one within the same save supersedes
   * the first entirely, and keeping both would publish two events for one
   * operation, the earlier of which cites a revision that is already
   * superseded. Retitling and rewriting a note in a single call did exactly
   * that. The bus promises delivery, not order, so a projector that received
   * the pair the other way round would reindex from the old content and stay
   * there until the note was written again.
   *
   * Only the bytes accumulate, because each event declares its own share of
   * the storage counter (RN-SUB-021) and the two shares are of one change.
   *
   * The collapse is deliberately limited to this one type. `NoteMoved` and
   * `NoteReordered` describe a transition rather than a state, and two of
   * those in one save are two facts.
   */
  private record(
    type: Parameters<typeof createEvent>[0]['type'],
    by: Authorship,
    payload: Record<string, unknown>,
    contentRef: ContentRef | null = null,
    storageDelta = 0,
  ): void {
    const event = createEvent({
      type,
      subscriptionId: this.subscriptionId,
      subject: 'NOTE',
      subjectId: this.id.value,
      authorship: by,
      payload,
      contentRef,
      storageDelta,
    });

    const at = type === 'NoteUpdated' ? this.events.findIndex((each) => each.type === type) : -1;
    const superseded = at === -1 ? undefined : this.events[at];
    if (superseded) {
      this.events[at] = { ...event, storageDelta: superseded.storageDelta + storageDelta };
      return;
    }
    this.events.push(event);
  }
}
