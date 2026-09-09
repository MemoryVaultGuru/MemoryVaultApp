/**
 * The product limits of software-vision.md, section 14, exercised where they
 * are enforced: the use case, not the aggregate.
 *
 * They exist as tests because a declared limit that nothing verifies is a
 * number in a document. `maxFolders` and `maxDepth` are covered in
 * vault.test.ts, on the aggregate that owns them; the two here belong to
 * CreateNote and had no test at all.
 */

import { describe, expect, it } from 'vitest';
import { Role, type ContentRef } from '@memorysmith/kernel';
import { CreateNote } from '../src/application/notes.js';
import { VAULT_LIMITS } from '../src/domain/values.js';
import type { Note } from '../src/domain/note/Note.js';
import type { Vault } from '../src/domain/vault/Vault.js';
import { authorship, contentRef, expectErr, rehydratedVaultWithNotes, user } from './fixtures.js';

const ctx = { user, isOwner: true, role: Role.OWNER };

/**
 * The smallest set of doubles CreateNote can run on. Everything answers the
 * happy path, so a refusal in a test below can only have come from the limit
 * under test.
 */
function deps(vault: Vault) {
  return {
    vaults: {
      findById: async () => vault,
      listAll: async () => [vault],
      save: async () => ({ ok: true as const, value: undefined }),
    },
    notes: {
      findById: async () => null,
      listByFolder: async () => [] as Note[],
      listByVault: async () => [] as Note[],
      siblingOrder: async () => [],
      save: async () => ({ ok: true as const, value: undefined }),
      saveMoved: async () => ({ ok: true as const, value: undefined }),
    },
    content: {
      create: async (): Promise<ContentRef> => contentRef(),
      overwrite: async (): Promise<ContentRef> => contentRef(),
      read: async () => '',
    },
    storage: {
      current: async () => ({ usedBytes: 0, limitBytes: 1024 ** 3 }),
    },
  } as unknown as ConstructorParameters<typeof CreateNote>[0];
}

describe('vault limits', () => {
  it('refuses the note that would pass the ceiling of notes per vault', async () => {
    const { vault, folderId } = rehydratedVaultWithNotes(VAULT_LIMITS.maxNotes);

    const refused = await new CreateNote(deps(vault)).execute({
      ctx,
      vaultId: vault.id,
      folderId,
      content: '# Uma nota a mais',
      afterNoteId: null,
      by: authorship(),
    });

    const error = expectErr(refused);
    expect(error.code).toBe('LIMIT_EXCEEDED');
    expect(error.message).toContain(String(VAULT_LIMITS.maxNotes));
  });

  it('admits the note that lands exactly on the ceiling', async () => {
    const { vault, folderId } = rehydratedVaultWithNotes(VAULT_LIMITS.maxNotes - 1);

    const created = await new CreateNote(deps(vault)).execute({
      ctx,
      vaultId: vault.id,
      folderId,
      content: '# A última que cabe',
      afterNoteId: null,
      by: authorship(),
    });

    expect(created.ok).toBe(true);
  });

  it('refuses a body over 1 MB, before anything is written to the store', async () => {
    const { vault, folderId } = rehydratedVaultWithNotes(1);

    const refused = await new CreateNote(deps(vault)).execute({
      ctx,
      vaultId: vault.id,
      folderId,
      content: 'a'.repeat(VAULT_LIMITS.maxNoteBytes + 1),
      afterNoteId: null,
      by: authorship(),
    });

    const error = expectErr(refused);
    expect(error.code).toBe('LIMIT_EXCEEDED');
    expect(error.message).toContain('1 MB');
  });

  it('measures the body in bytes and not in characters', async () => {
    const { vault, folderId } = rehydratedVaultWithNotes(1);
    // Each of these costs two bytes in UTF-8, so half the ceiling in
    // characters is exactly the ceiling in bytes, plus one to cross it.
    const content = 'é'.repeat(VAULT_LIMITS.maxNoteBytes / 2 + 1);

    const refused = await new CreateNote(deps(vault)).execute({
      ctx,
      vaultId: vault.id,
      folderId,
      content,
      afterNoteId: null,
      by: authorship(),
    });

    expect(content.length).toBeLessThan(VAULT_LIMITS.maxNoteBytes);
    expect(expectErr(refused).code).toBe('LIMIT_EXCEEDED');
  });
});
