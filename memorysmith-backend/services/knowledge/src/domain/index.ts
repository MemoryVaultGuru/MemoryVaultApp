/**
 * The Knowledge domain: aggregates, value objects, domain services and ports.
 * Zero imports of any AWS SDK, and the CI dependency rule is what keeps it
 * that way (architecture-guide.md, section 5.5).
 */

export { Vault } from './vault/Vault.js';
export { Folder } from './vault/Folder.js';
export { FolderTree } from './vault/FolderTree.js';
export { Note } from './note/Note.js';
export {
  FolderDescription,
  FolderName,
  RemovalPolicy,
  ShortText,
  VaultName,
  VAULT_LIMITS,
} from './values.js';
export { FolderTreePlacement, type Placement } from './services/FolderTreePlacement.js';
export { NotePlacement, type NoteOrder } from './services/NotePlacement.js';
export { composeVaultContext, type VaultContextInput } from './services/VaultContextComposer.js';
export { admitWrite, type StorageBudget, type StorageState } from './services/StorageQuota.js';
export {
  AuthorizationPolicy,
  type Action,
  type RequestContext,
} from './access/AuthorizationPolicy.js';
export type {
  ContentStore,
  EventPublisher,
  NoteRepository,
  VaultRepository,
} from './ports/index.js';
