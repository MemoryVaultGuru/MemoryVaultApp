/**
 * In-memory adapters (architecture-guide.md, section 7.2). They exist so that
 * use cases can be tested without DynamoDB Local or MinIO, and they honour the
 * same two properties the production ones do:
 *
 *  - the subscription comes from the SubscriptionContext held by the
 *    repository, never from a method argument (PE2);
 *  - saving state and recording the events is one atomic step, which is what
 *    the outbox buys in production (section 10.4).
 */

import {
  ConcurrencyError,
  ContentId,
  ContentRef,
  Instant,
  ok,
  type DomainEvent,
  type EventPublisher,
  type FolderId,
  type NoteId,
  type Result,
  type Slug,
  type SubscriptionContext,
  type VaultId,
} from '@memorysmith/kernel';
import { createHash } from 'node:crypto';
import type { Note } from '../../../domain/note/Note.js';
import type { NoteOrder } from '../../../domain/services/NotePlacement.js';
import type { ContentStore, NoteRepository, VaultRepository } from '../../../domain/ports/index.js';
import type { StorageBudget, StorageState } from '../../../domain/services/StorageQuota.js';
import type { Vault } from '../../../domain/vault/Vault.js';

/** Records what was published, so a test can assert on the event stream. */
export class RecordingEventPublisher implements EventPublisher {
  readonly published: DomainEvent[] = [];

  async publish(events: DomainEvent[]): Promise<void> {
    this.published.push(...events);
  }

  ofType(type: string): DomainEvent[] {
    return this.published.filter((event) => event.type === type);
  }

  clear(): void {
    this.published.length = 0;
  }
}

/**
 * The storage budget, in memory. Production keeps the used bytes in a counter
 * the outbox relay maintains; a test states them directly, and moves them with
 * `record()` to stand in for the relay having caught up.
 *
 * The default limit is generous on purpose: a test that is not about the quota
 * must never trip over it.
 */
export class InMemoryStorageBudget implements StorageBudget {
  constructor(
    public limitBytes = Number.MAX_SAFE_INTEGER,
    public usedBytes = 0,
  ) {}

  async current(): Promise<StorageState> {
    return { usedBytes: this.usedBytes, limitBytes: this.limitBytes };
  }

  /** What the relay would have applied for these events (RN-SUB-021). */
  record(events: readonly DomainEvent[]): void {
    for (const event of events) this.usedBytes += event.storageDelta;
    if (this.usedBytes < 0) this.usedBytes = 0;
  }
}

/** The shared "database", so several repositories can see the same state. */
export class InMemoryDatabase {
  readonly vaults = new Map<string, { vault: Vault; version: number }>();
  readonly notes = new Map<string, { note: Note; version: number }>();
  readonly content = new Map<string, { revisions: Map<string, string>; latest: string }>();

  clear(): void {
    this.vaults.clear();
    this.notes.clear();
    this.content.clear();
  }
}

function vaultKey(sub: SubscriptionContext, id: VaultId): string {
  return `S#${sub.subscriptionId.value}#VAULT#${id.value}`;
}

function noteKey(sub: SubscriptionContext, vault: VaultId, note: NoteId): string {
  return `${vaultKey(sub, vault)}#NOTE#${note.value}`;
}

export class InMemoryVaultRepository implements VaultRepository {
  constructor(
    private readonly sub: SubscriptionContext,
    private readonly db: InMemoryDatabase,
    private readonly events: EventPublisher,
  ) {}

  async findById(id: VaultId): Promise<Vault | null> {
    return this.db.vaults.get(vaultKey(this.sub, id))?.vault ?? null;
  }

  /**
   * A deleted vault is out, with no filter needed in the caller: in DynamoDB
   * that is GSI1 being sparse, and here it is this line.
   */
  async listAll(): Promise<Vault[]> {
    const prefix = `S#${this.sub.subscriptionId.value}#VAULT#`;
    return [...this.db.vaults.entries()]
      .filter(([key]) => key.startsWith(prefix))
      .map(([, entry]) => entry.vault)
      .filter((vault) => !vault.isDeleted);
  }

  /**
   * Same answer the database gives, from the same question: which vault of
   * this subscription holds this slug. The adapter in memory has no guard item,
   * so it looks through the list, which is the honest equivalent at this size.
   * A deleted vault holds no slug, exactly as its guard item is released.
   */
  async findBySlug(slug: Slug): Promise<Vault | null> {
    const vaults = await this.listAll();
    return vaults.find((vault) => vault.slug.value === slug.value) ?? null;
  }

  async save(vault: Vault): Promise<Result<void, ConcurrencyError>> {
    const key = vaultKey(this.sub, vault.id);
    const stored = this.db.vaults.get(key);
    if (stored && stored.version !== vault.version) {
      return { ok: false, error: new ConcurrencyError() };
    }
    const events = vault.pullEvents();
    vault.markPersisted();
    this.db.vaults.set(key, { vault, version: vault.version });
    await this.events.publish(events);
    return ok();
  }
}

export class InMemoryNoteRepository implements NoteRepository {
  constructor(
    private readonly sub: SubscriptionContext,
    private readonly db: InMemoryDatabase,
    private readonly events: EventPublisher,
  ) {}

  async findById(vault: VaultId, id: NoteId): Promise<Note | null> {
    return this.db.notes.get(noteKey(this.sub, vault, id))?.note ?? null;
  }

  async listByFolder(vault: VaultId, folder: FolderId): Promise<Note[]> {
    return (await this.listByVault(vault))
      .filter((note) => note.folderId.equals(folder))
      .sort((left, right) => left.position.compare(right.position));
  }

  async listByVault(vault: VaultId): Promise<Note[]> {
    const prefix = `${vaultKey(this.sub, vault)}#NOTE#`;
    return [...this.db.notes.entries()]
      .filter(([key]) => key.startsWith(prefix))
      .map(([, entry]) => entry.note)
      .filter((note) => !note.isDeleted);
  }

  async siblingOrder(vault: VaultId, folder: FolderId): Promise<NoteOrder[]> {
    return (await this.listByFolder(vault, folder)).map((note) => ({
      noteId: note.id,
      position: note.position,
    }));
  }

  async save(note: Note): Promise<Result<void, ConcurrencyError>> {
    const key = noteKey(this.sub, note.vaultId, note.id);
    const stored = this.db.notes.get(key);
    if (stored && stored.version !== note.version) {
      return { ok: false, error: new ConcurrencyError() };
    }

    const events = note.pullEvents();
    note.markPersisted();
    this.db.notes.set(key, { note, version: note.version });
    await this.events.publish(events);
    return ok();
  }

  async saveMoved(note: Note, from: { vaultId: VaultId }): Promise<Result<void, ConcurrencyError>> {
    // The item key itself changes, so the old one is deleted and a new one is
    // written.
    this.db.notes.delete(noteKey(this.sub, from.vaultId, note.id));
    return this.save(note);
  }
}

export class InMemoryContentStore implements ContentStore {
  constructor(
    private readonly sub: SubscriptionContext,
    private readonly db: InMemoryDatabase,
  ) {}

  /** The same opaque key shape the S3 adapter builds. */
  private keyOf(contentId: ContentId): string {
    return `s/${this.sub.subscriptionId.value}/c/${contentId.value}.md`;
  }

  async create(markdown: string): Promise<ContentRef> {
    return this.write(ContentId.generate(), markdown);
  }

  async overwrite(slot: ContentId, markdown: string): Promise<ContentRef> {
    return this.write(slot, markdown);
  }

  async read(ref: ContentRef): Promise<string> {
    const slot = this.db.content.get(this.keyOf(ref.contentId));
    const revision = slot?.revisions.get(ref.versionId);
    if (revision === undefined) {
      throw new Error(`No such revision: ${ref.contentId.value}@${ref.versionId}`);
    }
    return revision;
  }

  private write(contentId: ContentId, markdown: string): ContentRef {
    const key = this.keyOf(contentId);
    const slot = this.db.content.get(key) ?? { revisions: new Map<string, string>(), latest: '' };
    const versionId = `v${slot.revisions.size + 1}-${Instant.now().epochMillis}`;
    slot.revisions.set(versionId, markdown);
    slot.latest = versionId;
    this.db.content.set(key, slot);

    const bytes = Buffer.byteLength(markdown, 'utf8');
    const sha256 = createHash('sha256').update(markdown, 'utf8').digest('hex');
    const ref = ContentRef.create({ contentId, versionId, sha256, bytes });
    if (!ref.ok) throw new Error(ref.error.message);
    return ref.value;
  }
}
