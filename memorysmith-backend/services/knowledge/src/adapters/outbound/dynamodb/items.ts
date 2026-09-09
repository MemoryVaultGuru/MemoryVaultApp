/**
 * Item shapes of mv-knowledge and the translation to and from the aggregates.
 *
 * This file is the only place that knows what an attribute is called. The
 * domain never sees an attribute name, and the item never sees a value object
 * (architecture-guide.md, sections 9.3 and 7.2).
 */

import {
  Authorship,
  AgentIdentity,
  ContentId,
  ContentRef,
  type DomainError,
  FolderId,
  Instant,
  NoteId,
  Position,
  Slug,
  type SubscriptionId,
  UserId,
  VaultId,
  VaultRoleLimit,
  type DomainEvent,
} from '@memorysmith/kernel';
import { Folder } from '../../../domain/vault/Folder.js';
import { Note } from '../../../domain/note/Note.js';
import { Vault } from '../../../domain/vault/Vault.js';
import { FolderDescription, FolderName, ShortText, VaultName } from '../../../domain/values.js';

/** A raw item as the DynamoDB document client hands it over. */
export type Item = Record<string, unknown>;

export function unwrapOrThrow<T>(
  result: { ok: true; value: T } | { ok: false; error: DomainError },
): T {
  if (!result.ok) {
    // Stored data that no longer parses is a corrupted row, not a user error.
    throw new Error(`Corrupted item in mv-knowledge: ${result.error.message}`);
  }
  return result.value;
}

export function serializeContentRef(ref: ContentRef | null): Item | null {
  return ref ? ref.toJSON() : null;
}

export function parseContentRef(raw: unknown): ContentRef | null {
  if (!raw) return null;
  return unwrapOrThrow(ContentRef.fromJSON(raw));
}

export function serializeAuthorship(authorship: Authorship): Item {
  return authorship.toJSON();
}

export function parseAuthorship(raw: unknown): Authorship {
  const record = (raw ?? {}) as {
    userId?: string;
    agent?: { clientId: string; clientName: string } | null;
    at?: string;
  };
  const user = unwrapOrThrow(UserId.create(String(record.userId)));
  const at = unwrapOrThrow(Instant.fromISO(String(record.at)));
  if (!record.agent) return Authorship.byHuman(user, at);
  const agent = unwrapOrThrow(AgentIdentity.create(record.agent.clientId, record.agent.clientName));
  return Authorship.byAgent(user, agent, at);
}

// ---- Vault ------------------------------------------------------------------

export function vaultMetaItem(vault: Vault, pk: string): Item {
  const item: Item = {
    PK: pk,
    SK: 'META',
    entity: 'VAULT',
    vaultId: vault.id.value,
    name: vault.name.value,
    slug: vault.slug.value,
    description: vault.description.value,
    guidanceRef: serializeContentRef(vault.guidanceRef),
    version: vault.version + 1,
    createdBy: serializeAuthorship(vault.createdBy),
    createdAt: vault.createdBy.at.toISOString(),
    updatedAt: vault.updatedAt.toISOString(),
  };
  // The repository projects this item into GSI1 only while the vault is live,
  // exactly as a note leaves GSI2 when it is deleted: the listing needs no
  // filter, because a deleted vault is not in the index at all.
  if (vault.isDeleted) item['deletedAt'] = vault.deletedAt?.toISOString();
  return item;
}

export function folderItem(folder: Folder, pk: string, sk: string): Item {
  return {
    PK: pk,
    SK: sk,
    entity: 'FOLDER',
    folderId: folder.id.value,
    parentFolderId: folder.parentFolderId?.value ?? null,
    name: folder.name.value,
    slug: folder.slug.value,
    description: folder.description.value,
    position: folder.position.value,
    templateRef: serializeContentRef(folder.templateRef),
    createdBy: serializeAuthorship(folder.createdBy),
    updatedAt: folder.updatedAt.toISOString(),
  };
}

export function parseFolder(item: Item): Folder {
  const parentRaw = item['parentFolderId'];
  return Folder.rehydrate({
    id: unwrapOrThrow(FolderId.create(String(item['folderId']))),
    parentFolderId: parentRaw ? unwrapOrThrow(FolderId.create(String(parentRaw))) : null,
    name: unwrapOrThrow(FolderName.create(String(item['name']))),
    slug: unwrapOrThrow(Slug.create(String(item['slug']))),
    description: unwrapOrThrow(FolderDescription.create(String(item['description']))),
    position: unwrapOrThrow(Position.create(String(item['position']))),
    templateRef: parseContentRef(item['templateRef']),
    createdBy: parseAuthorship(item['createdBy']),
    updatedAt: unwrapOrThrow(Instant.fromISO(String(item['updatedAt']))),
  });
}

/**
 * Rebuilds the aggregate from the items of ONE Query: the META item, the
 * folders, the counters and the ceilings, all from the same partition.
 */
export function parseVault(items: Item[], subscriptionId: SubscriptionId): Vault | null {
  const meta = items.find((item) => item['SK'] === 'META');
  if (!meta) return null;

  const folders: Folder[] = [];
  const noteCounts = new Map<string, number>();
  const limits = new Map<string, VaultRoleLimit>();
  let vaultNoteCount = 0;

  for (const item of items) {
    const sk = String(item['SK']);
    if (sk.startsWith('FOLDER#')) folders.push(parseFolder(item));
    else if (sk === 'FSTAT') vaultNoteCount = Number(item['noteCount'] ?? 0);
    else if (sk.startsWith('FSTAT#')) {
      noteCounts.set(sk.slice('FSTAT#'.length), Number(item['noteCount'] ?? 0));
    } else if (sk.startsWith('LIMIT#')) {
      limits.set(sk.slice('LIMIT#'.length), VaultRoleLimit.VIEWER);
    }
  }

  return Vault.rehydrate({
    id: unwrapOrThrow(VaultId.create(String(meta['vaultId']))),
    subscriptionId,
    name: unwrapOrThrow(VaultName.create(String(meta['name']))),
    slug: unwrapOrThrow(Slug.create(String(meta['slug']))),
    description: unwrapOrThrow(ShortText.create(String(meta['description'] ?? ''))),
    guidanceRef: parseContentRef(meta['guidanceRef']),
    folders,
    limits,
    noteCounts,
    vaultNoteCount,
    version: Number(meta['version'] ?? 0),
    createdBy: parseAuthorship(meta['createdBy']),
    updatedAt: unwrapOrThrow(Instant.fromISO(String(meta['updatedAt']))),
    deletedAt: meta['deletedAt'] ? unwrapOrThrow(Instant.fromISO(String(meta['deletedAt']))) : null,
  });
}

// ---- Note -------------------------------------------------------------------

export function noteItem(
  note: Note,
  keys: { pk: string; sk: string; gsi2pk: string; gsi2sk: string },
): Item {
  const item: Item = {
    PK: keys.pk,
    SK: keys.sk,
    entity: 'NOTE',
    noteId: note.id.value,
    vaultId: note.vaultId.value,
    folderId: note.folderId.value,
    position: note.position.value,
    bodyRef: serializeContentRef(note.bodyRef),
    createdBy: serializeAuthorship(note.createdBy),
    updatedBy: serializeAuthorship(note.updatedBy),
    updatedAt: note.updatedBy.at.toISOString(),
    version: note.version + 1,
  };
  // The title is what the chain read out of the body, and a note may have
  // none. The attribute is absent rather than empty in that case, because an
  // empty string is a title somebody wrote and this is the absence of one
  // (RN-KNW-036).
  if (note.title !== null) item['title'] = note.title;
  if (note.isDeleted) {
    item['deletedAt'] = note.deletedAt?.toISOString();
    item['deletedBy'] = serializeAuthorship(note.updatedBy);
  } else {
    // GSI2 is sparse: these two attributes exist only while the note is live,
    // so a deleted note disappears from every listing with no filter anywhere.
    item['GSI2PK'] = keys.gsi2pk;
    item['GSI2SK'] = keys.gsi2sk;
  }
  return item;
}

export function parseNote(item: Item, subscriptionId: SubscriptionId): Note {
  const deletedAt = item['deletedAt'];
  return Note.rehydrate({
    id: unwrapOrThrow(NoteId.create(String(item['noteId']))),
    subscriptionId,
    vaultId: unwrapOrThrow(VaultId.create(String(item['vaultId']))),
    folderId: unwrapOrThrow(FolderId.create(String(item['folderId']))),
    title: item['title'] === undefined ? null : String(item['title']),
    position: unwrapOrThrow(Position.create(String(item['position']))),
    bodyRef: parseContentRef(item['bodyRef']) as ContentRef,
    createdBy: parseAuthorship(item['createdBy']),
    updatedBy: parseAuthorship(item['updatedBy']),
    deletedAt: deletedAt ? unwrapOrThrow(Instant.fromISO(String(deletedAt))) : null,
    version: Number(item['version'] ?? 0),
  });
}

// ---- Outbox -----------------------------------------------------------------

/** Seven days, matching the outbox retention of section 18. */
const OUTBOX_TTL_DAYS = 7;

export function outboxItem(event: DomainEvent, pk: string, sk: string): Item {
  return {
    PK: pk,
    SK: sk,
    entity: 'EVENT',
    eventId: event.eventId,
    type: event.type,
    occurredAt: event.occurredAt.toISOString(),
    subscriptionId: event.subscriptionId.value,
    subject: event.subject,
    subjectId: event.subjectId,
    authorship: serializeAuthorship(event.authorship),
    contentRef: serializeContentRef(event.contentRef),
    storageDelta: event.storageDelta,
    payload: event.payload,
    ttl: event.occurredAt.plusDays(OUTBOX_TTL_DAYS).toEpochSeconds(),
  };
}

/** The wire shape the relay publishes to EventBridge (contracts package). */
export function eventEnvelopeFrom(item: Item): Item {
  return {
    eventId: item['eventId'],
    type: item['type'],
    occurredAt: item['occurredAt'],
    subscriptionId: item['subscriptionId'],
    subject: item['subject'],
    subjectId: item['subjectId'],
    authorship: item['authorship'],
    contentRef: item['contentRef'] ?? null,
    storageDelta: item['storageDelta'] ?? 0,
    payload: item['payload'] ?? {},
  };
}

export { ContentId };
