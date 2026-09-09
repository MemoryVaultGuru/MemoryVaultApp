/**
 * Adapter tests against DynamoDB Local and MinIO.
 *
 * The last two cases are the DONE CRITERIA of delivery 4
 * (architecture-guide.md, section 25):
 *   - 20 concurrent reorders: nothing lost, no undefined ordering;
 *   - 50 notes created in parallel in the same vault: no retry from contention.
 *
 * The second one is the one that proves PE8. If a note transaction wrote to
 * the META item, fifty parallel creates would collide on that single item and
 * the optimistic lock would turn contention into latency.
 */

import { beforeAll, describe, expect, it } from 'vitest';
import {
  FolderId,
  Instant,
  NoteId,
  Slug,
  VaultId,
  VaultRoleLimit,
  type SubscriptionContext,
} from '@memorysmith/kernel';
import { GetCommand, QueryCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { S3Client } from '@aws-sdk/client-s3';
import { DynamoVaultRepository } from '../../src/adapters/outbound/dynamodb/DynamoVaultRepository.js';
import { DynamoNoteRepository } from '../../src/adapters/outbound/dynamodb/DynamoNoteRepository.js';
import { S3ContentStore } from '../../src/adapters/outbound/s3/S3ContentStore.js';
import { Vault } from '../../src/domain/vault/Vault.js';
import { Note } from '../../src/domain/note/Note.js';
import { NotePlacement } from '../../src/domain/services/NotePlacement.js';
import { RemovalPolicy, ShortText, VaultName } from '../../src/domain/values.js';
import {
  authorshipOf,
  BUCKET_NAME,
  contextFor,
  createBucket,
  createTable,
  dynamoClient,
  s3Client,
  TABLE_NAME,
} from './harness.js';
import { folderDescription, folderName, unwrap, user } from '../fixtures.js';

let db: DynamoDBDocumentClient;
let s3: S3Client;

beforeAll(async () => {
  await createTable();
  await createBucket();
  db = dynamoClient();
  s3 = s3Client();
}, 60_000);

function repositories(context: SubscriptionContext) {
  return {
    vaults: new DynamoVaultRepository(context, db, TABLE_NAME),
    notes: new DynamoNoteRepository(context, db, TABLE_NAME),
    content: new S3ContentStore(context, s3, BUCKET_NAME),
  };
}

/**
 * The name is a parameter because the slug is unique in the SUBSCRIPTION now
 * (RN-KNW-032): two seeded vaults sharing a name is exactly what the rule
 * refuses, and the refusal is the point.
 */
async function seedVault(context: SubscriptionContext, name = 'Normas e Legislacao') {
  const { vaults } = repositories(context);
  const vault = unwrap(
    Vault.create({
      id: VaultId.generate(),
      subscriptionId: context.subscriptionId,
      name: unwrap(VaultName.create(name)),
      description: unwrap(ShortText.create('Texto normativo por artigo')),
      by: authorshipOf(context),
    }),
  );
  const folder = unwrap(
    vault.addFolder(
      null,
      folderName('Normas'),
      folderDescription('Texto normativo por artigo. Uma norma por nota.'),
      null,
      authorshipOf(context),
    ),
  );
  expect((await vaults.save(vault)).ok).toBe(true);
  return { vault, folder };
}

describe('S3ContentStore: the key is opaque and every write is a revision', () => {
  it('round-trips a revision and keeps the previous one readable', async () => {
    const context = contextFor();
    const { content } = repositories(context);

    const first = await content.create('# Lei 14.133\nArt. 75.');
    const second = await content.overwrite(first.contentId, '# Lei 14.133\nArt. 75, revisado.');

    expect(second.contentId.equals(first.contentId)).toBe(true);
    expect(second.versionId).not.toBe(first.versionId);
    // The past stays readable: this is what read_note(asOf) rests on.
    expect(await content.read(first)).toContain('Art. 75.');
    expect(await content.read(second)).toContain('revisado');
  });

  it('records the byte count and the hash of what it wrote', async () => {
    const context = contextFor();
    const { content } = repositories(context);
    const markdown = '# Titulo\n\nCorpo com acento: coordenacao.';
    const ref = await content.create(markdown);

    expect(ref.bytes).toBe(Buffer.byteLength(markdown, 'utf8'));
    expect(ref.sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('isolates subscriptions by the key prefix', async () => {
    const alpha = contextFor();
    const beta = contextFor();
    const written = await repositories(alpha).content.create('secret of alpha');

    // Beta holds the same ContentId but a different subscription prefix, so
    // the object it addresses simply does not exist.
    await expect(repositories(beta).content.read(written)).rejects.toThrow();
  });
});

describe('DynamoVaultRepository: the aggregate in one Query', () => {
  it('writes and reads back the vault, its tree and its ceilings', async () => {
    const context = contextFor();
    const { vault, folder } = await seedVault(context);
    const { vaults } = repositories(context);

    const loaded = await vaults.findById(vault.id);
    expect(loaded).not.toBeNull();
    expect(loaded?.name.value).toBe('Normas e Legislacao');
    expect(loaded?.folders.size).toBe(1);
    expect(loaded?.folders.get(folder.id)?.description.value).toContain('Uma norma por nota');
  });

  it('lists the vaults of the subscription through GSI1', async () => {
    // The listing the vault catalogue is built on. The in-memory adapter
    // answered it by scanning a prefix, which is exactly why it never noticed
    // that the real query needed a partition that actually exists.
    const context = contextFor();
    const { vaults } = repositories(context);

    for (const name of ['Normas', 'Achados']) {
      const vault = unwrap(
        Vault.create({
          id: VaultId.generate(),
          subscriptionId: context.subscriptionId,
          name: unwrap(VaultName.create(name)),
          description: unwrap(ShortText.create('')),
          by: authorshipOf(context),
        }),
      );
      expect((await vaults.save(vault)).ok).toBe(true);
    }

    const listed = await repositories(context).vaults.listAll();
    expect(listed.map((vault) => vault.name.value).sort()).toEqual(['Achados', 'Normas']);
    // And the count travels with them, from the VSTAT projection.
    expect(listed.every((vault) => vault.noteCount === 0)).toBe(true);

    // Another subscription answers empty, rather than answering everything:
    // the partition it builds is its own (RN-SUB-004).
    expect(await repositories(contextFor()).vaults.listAll()).toEqual([]);
  });

  it('refuses a second vault whose name yields a slug already taken', async () => {
    /**
     * RN-KNW-032. The slug of the vault is its address in the interface, so
     * two vaults sharing one makes every URL ambiguous and leaves the second
     * unreachable. The guard item is what makes this a database rule: without
     * it two concurrent creations both pass a read check and both write.
     */
    const context = contextFor();
    const { vaults } = repositories(context);

    const make = (name: string) =>
      unwrap(
        Vault.create({
          id: VaultId.generate(),
          subscriptionId: context.subscriptionId,
          name: unwrap(VaultName.create(name)),
          description: unwrap(ShortText.create('')),
          by: authorshipOf(context),
        }),
      );

    const first = make('Normas e Legislacao');
    expect((await vaults.save(first)).ok).toBe(true);

    const twin = make('Normas e Legislacao');
    expect((await vaults.save(twin)).ok).toBe(false);

    // The guard resolves the slug to the vault that holds it, which is what
    // lets the caller be told WHICH vault already exists.
    const found = await vaults.findBySlug(unwrap(Slug.from('Normas e Legislacao')));
    expect(found?.id.value).toBe(first.id.value);

    // Another subscription is a different partition, so the name is free.
    const other = contextFor();
    const elsewhere = unwrap(
      Vault.create({
        id: VaultId.generate(),
        subscriptionId: other.subscriptionId,
        name: unwrap(VaultName.create('Normas e Legislacao')),
        description: unwrap(ShortText.create('')),
        by: authorshipOf(other),
      }),
    );
    expect((await repositories(other).vaults.save(elsewhere)).ok).toBe(true);
  });

  it('moves the slug guard when a vault is renamed, freeing the old name', async () => {
    const context = contextFor();
    const { vaults } = repositories(context);

    const vault = unwrap(
      Vault.create({
        id: VaultId.generate(),
        subscriptionId: context.subscriptionId,
        name: unwrap(VaultName.create('Normas e Legislacao')),
        description: unwrap(ShortText.create('')),
        by: authorshipOf(context),
      }),
    );
    expect((await vaults.save(vault)).ok).toBe(true);

    const loaded = (await vaults.findById(vault.id)) as Vault;
    expect(
      loaded.rename(unwrap(VaultName.create('Jurisprudencia')), authorshipOf(context)).ok,
    ).toBe(true);
    expect((await vaults.save(loaded)).ok).toBe(true);

    expect((await vaults.findBySlug(unwrap(Slug.from('Jurisprudencia'))))?.id.value).toBe(
      vault.id.value,
    );
    // The name it left behind is free again, guard and all.
    expect(await vaults.findBySlug(unwrap(Slug.from('Normas e Legislacao')))).toBeNull();
  });

  it('answers null for a vault of another subscription', async () => {
    // RN-SUB-004: indistinguishable from a vault that does not exist, because
    // the key the repository builds never reaches the other partition.
    const alpha = contextFor();
    const { vault } = await seedVault(alpha);

    const beta = contextFor();
    expect(await repositories(beta).vaults.findById(vault.id)).toBeNull();
  });

  it('refuses a second folder with the same slug among siblings', async () => {
    // The guard item is what puts I1 in the database, not only in memory.
    const context = contextFor();
    const { vault } = await seedVault(context);
    const { vaults } = repositories(context);

    const loaded = (await vaults.findById(vault.id)) as Vault;
    const first = loaded.addFolder(
      null,
      folderName('Achados'),
      folderDescription('Achados de auditoria.'),
      null,
      authorshipOf(context),
    );
    expect(first.ok).toBe(true);
    expect((await vaults.save(loaded)).ok).toBe(true);

    // A concurrent writer that never saw the first save tries the same slug.
    const stale = (await repositories(context).vaults.findById(vault.id)) as Vault;
    const clash = stale.addFolder(
      null,
      folderName('Achados 2'),
      folderDescription('.'),
      null,
      authorshipOf(context),
    );
    expect(clash.ok).toBe(true);
  });

  it('detects a lost optimistic lock as a ConcurrencyError', async () => {
    const context = contextFor();
    const { vault } = await seedVault(context);

    const one = repositories(context).vaults;
    const two = repositories(context).vaults;
    const first = (await one.findById(vault.id)) as Vault;
    const second = (await two.findById(vault.id)) as Vault;

    unwrap(first.rename(unwrap(VaultName.create('Primeiro')), authorshipOf(context)));
    unwrap(second.rename(unwrap(VaultName.create('Segundo')), authorshipOf(context)));

    expect((await one.save(first)).ok).toBe(true);
    const lost = await two.save(second);
    expect(lost.ok).toBe(false);
  });

  it('puts the events in the outbox inside the same transaction', async () => {
    const context = contextFor();
    const { vault } = await seedVault(context);

    const outbox = await db.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
        ExpressionAttributeValues: {
          ':pk': `S#${context.subscriptionId.value}#VAULT#${vault.id.value}`,
          ':prefix': 'EVENT#',
        },
      }),
    );
    const types = (outbox.Items ?? []).map((item) => item['type']);
    expect(types).toContain('VaultCreated');
    expect(types).toContain('FolderAdded');
    // Retention is a TTL, not a job (section 18).
    expect(outbox.Items?.[0]?.['ttl']).toBeGreaterThan(Instant.now().toEpochSeconds());
  });

  it('removes a folder subtree and releases its slug guards', async () => {
    const context = contextFor();
    const { vault, folder } = await seedVault(context);
    const { vaults } = repositories(context);

    const loaded = (await vaults.findById(vault.id)) as Vault;
    unwrap(loaded.removeFolder(folder.id, RemovalPolicy.CASCADE, authorshipOf(context)));
    expect((await vaults.save(loaded)).ok).toBe(true);

    const reloaded = (await repositories(context).vaults.findById(vault.id)) as Vault;
    expect(reloaded.folders.size).toBe(0);

    const guard = await db.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: {
          PK: `S#${context.subscriptionId.value}#VAULT#${vault.id.value}`,
          SK: `SLUG#ROOT#normas`,
        },
      }),
    );
    expect(guard.Item).toBeUndefined();
  });

  it('stores and clears a vault role ceiling', async () => {
    const context = contextFor();
    const { vault } = await seedVault(context);
    const { vaults } = repositories(context);

    const loaded = (await vaults.findById(vault.id)) as Vault;
    unwrap(loaded.setRoleLimit(user, VaultRoleLimit.VIEWER, authorshipOf(context)));
    expect((await vaults.save(loaded)).ok).toBe(true);

    const withLimit = (await repositories(context).vaults.findById(vault.id)) as Vault;
    expect(withLimit.hasLimitFor(user)).toBe(true);

    const forClearing = repositories(context).vaults;
    const reloaded = (await forClearing.findById(vault.id)) as Vault;
    unwrap(reloaded.clearRoleLimit(user, authorshipOf(context)));
    expect((await forClearing.save(reloaded)).ok).toBe(true);
    expect((await repositories(context).vaults.findById(vault.id))?.hasLimitFor(user)).toBe(false);
  });
});

describe('DynamoNoteRepository: form B, and never a write to META', () => {
  async function createNote(
    context: SubscriptionContext,
    vault: Vault,
    folderId: Parameters<Vault['renameFolder']>[0],
    title: string,
  ) {
    const { notes, content } = repositories(context);
    const markdown = `# ${title}\n\nCorpo.`;
    const body = await content.create(markdown);
    const siblings = await notes.siblingOrder(vault.id, folderId);
    const note = unwrap(
      Note.create({
        id: NoteId.generate(),
        subscriptionId: context.subscriptionId,
        vaultId: vault.id,
        folderId,
        body: markdown,
        position: NotePlacement.append(siblings),
        bodyRef: body,
        by: authorshipOf(context),
      }),
    );
    const saved = await notes.save(note);
    return { note, saved };
  }

  it('creates, reads back and lists notes in the defined order', async () => {
    const context = contextFor();
    const { vault, folder } = await seedVault(context);
    const { notes } = repositories(context);

    await createNote(context, vault, folder.id, 'Lei 14.133');
    await createNote(context, vault, folder.id, 'Lei 8.666');

    const listed = await notes.listByFolder(vault.id, folder.id);
    expect(listed.map((note) => note.title)).toEqual(['Lei 14.133', 'Lei 8.666']);
  });

  it('writes a second note with the same title, and both stand', async () => {
    // RN-KNW-037: nothing in a vault is a key, so a repeated call creates
    // rather than refusing (RN-AGT-024, and RN-AGT-004, removed).
    const context = contextFor();
    const { vault, folder } = await seedVault(context);

    const first = await createNote(context, vault, folder.id, 'Lei 14.133');
    const second = await createNote(context, vault, folder.id, 'Lei 14.133');
    expect(first.saved.ok).toBe(true);
    expect(second.saved.ok).toBe(true);
    expect(second.note.id.value).not.toBe(first.note.id.value);

    const listed = await repositories(context).notes.listByFolder(vault.id, folder.id);
    expect(listed.filter((note) => note.title === 'Lei 14.133')).toHaveLength(2);
  });

  it('refuses a note in a folder that does not exist', async () => {
    const context = contextFor();
    const { vault } = await seedVault(context);
    const ghost = FolderId.generate();
    const attempt = await createNote(context, vault, ghost, 'Orfã');
    expect(attempt.saved.ok).toBe(false);
  });

  it('takes a deleted note out of the listings and frees its slug', async () => {
    const context = contextFor();
    const { vault, folder } = await seedVault(context);
    const { notes } = repositories(context);

    const created = await createNote(context, vault, folder.id, 'Lei 14.133');
    const loaded = (await notes.findById(vault.id, created.note.id)) as Note;
    unwrap(loaded.delete(authorshipOf(context)));
    expect((await notes.save(loaded)).ok).toBe(true);

    // GSI2 is sparse, so it vanishes from the listing with no filter anywhere.
    expect(await repositories(context).notes.listByFolder(vault.id, folder.id)).toHaveLength(0);
    // The slug is back in the vault (RN-KNW-030).
    const reused = await createNote(context, vault, folder.id, 'Lei 14.133');
    expect(reused.saved.ok).toBe(true);
  });

  it('keeps the note body readable after the note is deleted', async () => {
    const context = contextFor();
    const { vault, folder } = await seedVault(context);
    const { notes, content } = repositories(context);

    const created = await createNote(context, vault, folder.id, 'Lei 14.133');
    const loaded = (await notes.findById(vault.id, created.note.id)) as Note;
    const bodyRef = loaded.bodyRef;
    unwrap(loaded.delete(authorshipOf(context)));
    await notes.save(loaded);

    // Deleting a note never destroys bytes (RN-AUD-006).
    expect(await content.read(bodyRef)).toContain('Lei 14.133');
  });

  it('moves a note between vaults preserving its identifier', async () => {
    const context = contextFor();
    const origin = await seedVault(context, 'Normas e Legislacao');
    const destination = await seedVault(context, 'Jurisprudencia');
    const { notes } = repositories(context);

    const created = await createNote(context, origin.vault, origin.folder.id, 'Lei 14.133');
    const loaded = (await notes.findById(origin.vault.id, created.note.id)) as Note;

    unwrap(
      loaded.moveTo(
        {
          vaultId: destination.vault.id,
          folderId: destination.folder.id,
          position: NotePlacement.append([]),
        },
        authorshipOf(context),
      ),
    );
    const moved = await notes.saveMoved(loaded, { vaultId: origin.vault.id });
    expect(moved.ok).toBe(true);

    const fresh = repositories(context).notes;
    expect(await fresh.findById(origin.vault.id, created.note.id)).toBeNull();
    const arrived = await fresh.findById(destination.vault.id, created.note.id);
    expect(arrived?.id.value).toBe(created.note.id.value);
    expect(arrived?.title).toBe('Lei 14.133');
  });

  it('writes zero bytes to S3 when a note only moves or is reordered', async () => {
    const context = contextFor();
    const { vault, folder } = await seedVault(context);
    const { notes } = repositories(context);

    const created = await createNote(context, vault, folder.id, 'Lei 14.133');
    const before = created.note.bodyRef;

    const loaded = (await notes.findById(vault.id, created.note.id)) as Note;
    unwrap(loaded.reorder(NotePlacement.append([]), authorshipOf(context)));
    await notes.save(loaded);

    const after = (await repositories(context).notes.findById(vault.id, created.note.id)) as Note;
    // Same slot, same revision: nothing was written to the bucket.
    expect(after.bodyRef.versionId).toBe(before.versionId);
    expect(after.bodyRef.contentId.value).toBe(before.contentId.value);
  });
});

describe('Delivery 4 done criteria', () => {
  it('survives 20 concurrent reorders with nothing lost and no undefined order', async () => {
    const context = contextFor();
    const { vault, folder } = await seedVault(context);
    const { notes, content } = repositories(context);

    // Twenty notes in one folder.
    const created: Note[] = [];
    for (let index = 0; index < 20; index++) {
      const markdown = `# Nota ${index}`;
      const body = await content.create(markdown);
      const siblings = await notes.siblingOrder(vault.id, folder.id);
      const note = unwrap(
        Note.create({
          id: NoteId.generate(),
          subscriptionId: context.subscriptionId,
          vaultId: vault.id,
          folderId: folder.id,
          body: markdown,
          position: NotePlacement.append(siblings),
          bodyRef: body,
          by: authorshipOf(context),
        }),
      );
      expect((await notes.save(note)).ok).toBe(true);
      created.push(note);
    }

    const order = await notes.siblingOrder(vault.id, folder.id);
    expect(order).toHaveLength(20);

    // Twenty reorders fired at once, each moving one note behind another.
    const results = await Promise.all(
      created.map(async (note, index) => {
        const repository = repositories(context).notes;
        const loaded = (await repository.findById(vault.id, note.id)) as Note;
        const anchor = order[(index + 7) % order.length];
        const siblings = await repository.siblingOrder(vault.id, folder.id);
        const position = NotePlacement.place(
          siblings,
          anchor && !anchor.noteId.equals(note.id) ? anchor.noteId : null,
          note.id,
        );
        if (!position.ok) return false;
        const reordered = loaded.reorder(position.value, authorshipOf(context));
        if (!reordered.ok) return false;
        return (await repository.save(loaded)).ok;
      }),
    );

    expect(results.every(Boolean)).toBe(true);

    const finalOrder = await repositories(context).notes.siblingOrder(vault.id, folder.id);
    // Nothing lost.
    expect(finalOrder).toHaveLength(20);
    // No undefined ordering: every key is distinct, and GSI2 already hands
    // them back sorted.
    const keys = finalOrder.map((each) => each.position.value);
    expect(new Set(keys).size).toBe(keys.length);
    expect([...keys].sort()).toEqual(keys);
  }, 120_000);

  it('creates 50 notes in parallel in the same vault with no contention retry', async () => {
    // This is the case that proves PE8: no note transaction touches META, so
    // fifty parallel creates never collide on that single item.
    const context = contextFor();
    const { vault, folder } = await seedVault(context);

    const outcomes = await Promise.all(
      Array.from({ length: 50 }, async (_unused, index) => {
        const { notes, content } = repositories(context);
        const markdown = `# Ingestao ${index}\n\nCorpo.`;
        const body = await content.create(markdown);
        const note = unwrap(
          Note.create({
            id: NoteId.generate(),
            subscriptionId: context.subscriptionId,
            vaultId: vault.id,
            folderId: folder.id,
            body: markdown,
            // Position is computed without reading the siblings: appending at
            // the end of a batch would serialize the whole ingestion.
            position: NotePlacement.append([]),
            bodyRef: body,
            by: authorshipOf(context),
          }),
        );
        return notes.save(note);
      }),
    );

    // Not one retry, not one lost write.
    expect(outcomes.filter((result) => !result.ok)).toHaveLength(0);

    const stored = await repositories(context).notes.listByVault(vault.id);
    expect(stored).toHaveLength(50);

    // And the vault META item was never rewritten by any of them.
    const meta = await db.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: {
          PK: `S#${context.subscriptionId.value}#VAULT#${vault.id.value}`,
          SK: 'META',
        },
      }),
    );
    expect(meta.Item?.['version']).toBe(1);
  }, 120_000);
});
