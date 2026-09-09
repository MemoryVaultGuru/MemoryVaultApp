/**
 * Test fixtures for the Knowledge domain. Pure construction, no I/O and no
 * framework mock: if the domain needed an SDK mock to be tested, the hexagon
 * would have leaked (architecture-guide.md, section 19).
 */

import {
  Authorship,
  ContentId,
  ContentRef,
  FolderId,
  Instant,
  NoteId,
  Position,
  Slug,
  SubscriptionId,
  UserId,
  VaultId,
  type Result,
} from '@memorysmith/kernel';
import { Vault } from '../src/domain/vault/Vault.js';
import { Folder } from '../src/domain/vault/Folder.js';
import { Note } from '../src/domain/note/Note.js';
import { FolderDescription, FolderName, ShortText, VaultName } from '../src/domain/values.js';
import { NotePlacement, type NoteOrder } from '../src/domain/services/NotePlacement.js';

export function unwrap<T>(result: Result<T, { message: string }>): T {
  if (!result.ok) throw new Error(`Expected ok, got: ${result.error.message}`);
  return result.value;
}

export function expectErr<T, E>(result: Result<T, E>): E {
  if (result.ok) throw new Error('Expected an error, got ok');
  return result.error;
}

export const user = unwrap(UserId.create('user-owner'));
export const otherUser = unwrap(UserId.create('user-member'));

export function authorship(at = Instant.now()): Authorship {
  return Authorship.byHuman(user, at);
}

export function contentRef(sha = 'a'.repeat(64), bytes = 42): ContentRef {
  return unwrap(
    ContentRef.create({
      contentId: ContentId.generate(),
      versionId: `v-${sha.slice(0, 6)}`,
      sha256: sha,
      bytes,
    }),
  );
}

export function vaultName(value: string): VaultName {
  return unwrap(VaultName.create(value));
}

export function folderName(value: string): FolderName {
  return unwrap(FolderName.create(value));
}

export function folderDescription(value: string): FolderDescription {
  return unwrap(FolderDescription.create(value));
}

/**
 * A note whose content states its title, which is the only place a title comes
 * from now (RN-KNW-035). The fixtures take a title and write the note that
 * says it, so a test that cares about a title still reads as one.
 */
export function noteBody(title: string): string {
  return `# ${title}\n\nThe general rule.\n`;
}

export function newVault(name = 'Normas e Legislacao'): Vault {
  return unwrap(
    Vault.create({
      id: VaultId.generate(),
      subscriptionId: SubscriptionId.generate(),
      name: vaultName(name),
      description: unwrap(ShortText.create('Texto normativo por artigo')),
      by: authorship(),
    }),
  );
}

/** A vault with a small tree, enough to exercise ordering and depth. */
export function vaultWithTree(): {
  vault: Vault;
  normas: ReturnType<Vault['addFolder']>;
} {
  const vault = newVault();
  const normas = vault.addFolder(
    null,
    folderName('Normas'),
    folderDescription('Texto normativo por artigo. Uma norma por nota.'),
    null,
    authorship(),
  );
  vault.addFolder(
    null,
    folderName('Achados'),
    folderDescription('Achados de auditoria.'),
    unwrap(normas).id,
    authorship(),
  );
  vault.pullEvents();
  return { vault, normas };
}

export function newNote(
  vault: Vault,
  folderId: FolderId,
  title = 'Lei 14.133',
  siblings: NoteOrder[] = [],
): Note {
  return unwrap(
    Note.create({
      id: NoteId.generate(),
      subscriptionId: vault.subscriptionId,
      vaultId: vault.id,
      folderId,
      body: noteBody(title),
      position: NotePlacement.append(siblings),
      bodyRef: contentRef(),
      by: authorship(),
    }),
  );
}

/**
 * A vault as it comes back from storage, with the folder note counters that
 * travel in the same Query (architecture-guide.md, section 9.3).
 */
export function rehydratedVaultWithNotes(notes: number): { vault: Vault; folderId: FolderId } {
  const folderId = FolderId.generate();
  const folder = Folder.rehydrate({
    id: folderId,
    parentFolderId: null,
    name: folderName('Normas'),
    slug: unwrap(Slug.from('Normas')),
    description: folderDescription('Texto normativo por artigo.'),
    position: Position.first(),
    templateRef: null,
    createdBy: authorship(),
    updatedAt: Instant.now(),
  });
  const vault = Vault.rehydrate({
    id: VaultId.generate(),
    subscriptionId: SubscriptionId.generate(),
    name: vaultName('Normas e Legislacao'),
    slug: unwrap(Slug.from('Normas e Legislacao')),
    description: unwrap(ShortText.create('')),
    guidanceRef: null,
    folders: [folder],
    limits: new Map(),
    noteCounts: new Map([[folderId.value, notes]]),
    vaultNoteCount: notes,
    version: 7,
    createdBy: authorship(),
    updatedAt: Instant.now(),
    deletedAt: null,
  });
  return { vault, folderId };
}
