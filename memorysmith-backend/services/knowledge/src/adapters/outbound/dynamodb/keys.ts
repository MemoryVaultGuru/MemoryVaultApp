/**
 * Key builders for mv-knowledge (architecture-guide.md, section 9.3).
 *
 * EVERY key starts with the subscription, and the builder accepts only a
 * SubscriptionId value object, which can only be produced from a verified
 * token claim. That is what turns "we always scope by subscription" from a
 * code-review rule into a compiler rule (PE2, section 8.2).
 *
 * The lexicographic order of the sort keys is CHOSEN, not accidental:
 * FSTAT# and LIMIT# fall between FOLDER# and META, so the whole aggregate, the
 * counters AND the role ceilings come back in a single Query over a single
 * partition. EVENT# sorts before that range; NOTE#, SEEN# and SLUG# sort after
 * it.
 */

import type { FolderId, NoteId, Position, SubscriptionId, VaultId } from '@memorysmith/kernel';

/** The sort key of the vault item itself. */
export const META = 'META';
/** Lower bound of the single-Query range that loads the whole aggregate. */
export const AGGREGATE_RANGE_START = 'FOLDER#';
/** Upper bound: META itself, inclusive. */
export const AGGREGATE_RANGE_END = META;

export class KnowledgeKeys {
  constructor(private readonly subscriptionId: SubscriptionId) {}

  /** Every item of a vault lives in this one partition. */
  vault(vaultId: VaultId): string {
    return `S#${this.subscriptionId.value}#VAULT#${vaultId.value}`;
  }

  folder(folderId: FolderId): string {
    return `FOLDER#${folderId.value}`;
  }

  /** Note counter of one folder, maintained by the outbox relay. */
  folderStat(folderId: FolderId): string {
    return `FSTAT#${folderId.value}`;
  }

  /** Note counter of the whole vault, projected into GSI1 as VSTAT#. */
  vaultStat(): string {
    return 'FSTAT';
  }

  limit(userId: string): string {
    return `LIMIT#${userId}`;
  }

  note(noteId: NoteId): string {
    return `NOTE#${noteId.value}`;
  }

  /** I1 in the database: unique among siblings (RN-KNW-002). */
  folderSlugGuard(parentFolderId: FolderId | null, slug: string): string {
    return `SLUG#${parentFolderId?.value ?? 'ROOT'}#${slug}`;
  }

  /** Outbox item; the ULID orders publication by generation time. */
  event(eventId: string): string {
    return `EVENT#${eventId}`;
  }

  /** Dedup marker that makes a counter update exactly-once (section 10.3). */
  seen(eventId: string): string {
    return `SEEN#${eventId}`;
  }

  // ---- GSI1: vaults of the subscription, already carrying the count --------

  /**
   * One partition per subscription, which is what listing vaults asks for now
   * that nothing sits between the subscription and the vault. It doubles as
   * the table partition of the slug guard below: same string, different table
   * attribute, and both start with the subscription (rule 1).
   */
  subscriptionVaults(): string {
    return `S#${this.subscriptionId.value}#VAULTS`;
  }

  gsi1Vault(vaultId: VaultId): string {
    return `VAULT#${vaultId.value}`;
  }

  gsi1VaultStat(vaultId: VaultId): string {
    return `VSTAT#${vaultId.value}`;
  }

  /**
   * Stored bytes of the whole subscription, maintained by the outbox relay
   * (RN-SUB-021). It lives in the subscription's partition and not in a
   * vault's, because a plan limits the subscription, and a vault in the bin is
   * still holding what it holds.
   */
  storageUsage(): string {
    return 'USAGE';
  }

  /**
   * Unique WITHIN THE SUBSCRIPTION (RN-KNW-032). It lives in the vaults
   * partition of the TABLE, not in GSI1, because a transaction cannot condition
   * on an index: the guard has to be an item the write can lock against.
   */
  vaultSlugGuard(slug: string): string {
    return `VSLUG#${slug}`;
  }

  // ---- GSI2: notes of a folder, in the defined order -----------------------

  folderPartition(folderId: FolderId): string {
    return `S#${this.subscriptionId.value}#FOLDER#${folderId.value}`;
  }

  /**
   * Sparse on purpose: these attributes only exist while deletedAt does not,
   * so a deleted note leaves every listing without a filter anywhere
   * (section 12.4).
   */
  gsi2Note(position: Position, noteId: NoteId): string {
    return `NOTE#${position.value}#${noteId.value}`;
  }
}
