/**
 * Vault use cases (architecture-guide.md, section 14.1).
 *
 * FIXED RULE, NO EXCEPTION: every Knowledge use case loads the vault and calls
 * policy.require BEFORE anything else (section 14.2). The three inputs of that
 * decision arrive at no extra cost, because the ceilings came back in the
 * same Query that loaded the vault.
 */

import {
  type Authorship,
  type ContentRef,
  DomainError,
  err,
  ok,
  Role,
  Slug,
  VaultId,
  VaultRoleLimit,
  type Result,
  type UserId,
} from '@memorysmith/kernel';
import { AuthorizationPolicy, type RequestContext } from '../domain/access/AuthorizationPolicy.js';
import { composeVaultContext } from '../domain/services/VaultContextComposer.js';
import { Vault } from '../domain/vault/Vault.js';
import { ShortText, VaultName } from '../domain/values.js';
import type { ContentStore, VaultRepository } from '../domain/ports/index.js';
import { admitWrite, type StorageBudget } from '../domain/services/StorageQuota.js';

export interface VaultDependencies {
  readonly vaults: VaultRepository;
  readonly content: ContentStore;
  /** What the plan allows and what is already stored (RN-SUB-021). */
  readonly storage: StorageBudget;
  /**
   * The attribute names the specification reserves, injected from the
   * composition root because it is the layer that knows which version the
   * product pins (RN-AGT-025). Neither the domain nor the application reads a
   * specification.
   */
  readonly reservedVocabulary: readonly string[];
}

/** Loads a vault and authorizes in one step, so no caller can forget. */
async function loadAuthorized(
  deps: VaultDependencies,
  ctx: RequestContext,
  vaultId: VaultId,
  action: 'read' | 'write' | 'administer',
): Promise<Result<Vault, DomainError>> {
  const vault = await deps.vaults.findById(vaultId);
  // A vault of another subscription never even reaches here: the key the
  // repository builds carries the subscription of the token (RN-SUB-004).
  if (!vault) return err(DomainError.notFound('Vault not found'));
  /**
   * A deleted vault answers like one that does not exist, to every operation
   * and every context: this single line is what makes the soft delete real for
   * the folders, the templates, the guidance and every note inside, since all
   * of them come through here. Restoring is the one path that loads it
   * anyway, and it does so explicitly.
   */
  if (vault.isDeleted) return err(DomainError.notFound('Vault not found'));

  const allowed = AuthorizationPolicy.require(ctx, vault, action);
  if (!allowed.ok) return allowed;
  return ok(vault);
}

export class CreateVault {
  constructor(private readonly deps: VaultDependencies) {}

  async execute(input: {
    ctx: RequestContext;
    name: string;
    description: string;
    subscriptionId: Parameters<typeof Vault.create>[0]['subscriptionId'];
    by: Authorship;
  }): Promise<Result<Vault, DomainError>> {
    // Creating a vault is a subscription-level decision: OWNER or EDITOR.
    const role = input.ctx.isOwner ? Role.OWNER : input.ctx.role;
    if (!role.canWrite()) {
      return err(DomainError.forbiddenVisible('Creating a vault requires the EDITOR role'));
    }

    const name = VaultName.create(input.name);
    if (!name.ok) return name;
    const description = ShortText.create(input.description);
    if (!description.ok) return description;

    /**
     * Idempotency, the same shape create_note already has (RN-AGT-004): the
     * slug is the address of the vault, so a second call with the same name
     * finds the first vault instead of creating a twin nobody can reach. The
     * transaction carries the guard too, which is what settles a race; this
     * read is what turns the race into a good answer when there is none.
     */
    const slug = Slug.from(name.value.value);
    if (!slug.ok) return slug;
    const existing = await this.deps.vaults.findBySlug(slug.value);
    if (existing) {
      return err(
        DomainError.conflict('A vault with this slug already exists in this subscription', {
          code: 'ALREADY_EXISTS',
          vaultId: existing.id.value,
          slug: slug.value.value,
        }),
      );
    }

    const vault = Vault.create({
      id: VaultId.generate(),
      subscriptionId: input.subscriptionId,
      name: name.value,
      description: description.value,
      by: input.by,
    });
    if (!vault.ok) return vault;

    const saved = await this.deps.vaults.save(vault.value);
    return saved.ok ? ok(vault.value) : err(saved.error);
  }
}

export class ListVaults {
  constructor(private readonly deps: VaultDependencies) {}

  /**
   * Every vault of the subscription, filtered by the effective role. A member
   * sees every vault; the ceiling controls writing, not seeing (RN-ACC-012).
   */
  async execute(input: { ctx: RequestContext }): Promise<Result<Vault[], DomainError>> {
    const found = await this.deps.vaults.listAll();
    return ok(
      found.filter((vault) => AuthorizationPolicy.effectiveRole(input.ctx, vault).canRead()),
    );
  }
}

export class GetVault {
  constructor(private readonly deps: VaultDependencies) {}

  async execute(input: {
    ctx: RequestContext;
    vaultId: VaultId;
  }): Promise<Result<{ vault: Vault; guidance: string | null; role: Role }, DomainError>> {
    const vault = await loadAuthorized(this.deps, input.ctx, input.vaultId, 'read');
    if (!vault.ok) return vault;

    const guidance = vault.value.guidanceRef
      ? await this.deps.content.read(vault.value.guidanceRef)
      : null;
    return ok({
      vault: vault.value,
      guidance,
      role: AuthorizationPolicy.effectiveRole(input.ctx, vault.value),
    });
  }
}

export class RenameVault {
  constructor(private readonly deps: VaultDependencies) {}

  async execute(input: {
    ctx: RequestContext;
    vaultId: VaultId;
    name: string;
    by: Authorship;
  }): Promise<Result<void, DomainError>> {
    // Renaming and deleting a vault belong to the OWNER (software-vision 5.2).
    const vault = await loadAuthorized(this.deps, input.ctx, input.vaultId, 'administer');
    if (!vault.ok) return vault;

    const name = VaultName.create(input.name);
    if (!name.ok) return name;

    // Renaming into a slug another vault of the subscription already holds is
    // the same collision as creating one, and gets the same answer.
    const slug = Slug.from(name.value.value);
    if (!slug.ok) return slug;
    const holder = await this.deps.vaults.findBySlug(slug.value);
    if (holder && !holder.id.equals(vault.value.id)) {
      return err(
        DomainError.conflict('A vault with this slug already exists in this subscription', {
          code: 'ALREADY_EXISTS',
          vaultId: holder.id.value,
          slug: slug.value.value,
        }),
      );
    }

    const renamed = vault.value.rename(name.value, input.by);
    if (!renamed.ok) return renamed;

    const saved = await this.deps.vaults.save(vault.value);
    return saved.ok ? ok() : err(saved.error);
  }
}

/**
 * Deleting a vault: reversible, and no byte is destroyed (RN-KNW-033). It is
 * an OWNER decision, like renaming, because it takes the whole vault out of
 * reach at once (software-vision.md 5.2).
 */
export class DeleteVault {
  constructor(private readonly deps: VaultDependencies) {}

  async execute(input: {
    ctx: RequestContext;
    vaultId: VaultId;
    by: Authorship;
  }): Promise<Result<void, DomainError>> {
    const vault = await loadAuthorized(this.deps, input.ctx, input.vaultId, 'administer');
    if (!vault.ok) return vault;

    const deleted = vault.value.delete(input.by);
    if (!deleted.ok) return deleted;

    const saved = await this.deps.vaults.save(vault.value);
    return saved.ok ? ok() : err(saved.error);
  }
}

/**
 * The way back. It is the ONE use case that loads a deleted vault on purpose,
 * so it does not go through `loadAuthorized`, which answers 404 for one.
 */
export class RestoreVault {
  constructor(private readonly deps: VaultDependencies) {}

  async execute(input: {
    ctx: RequestContext;
    vaultId: VaultId;
    by: Authorship;
  }): Promise<Result<void, DomainError>> {
    const vault = await this.deps.vaults.findById(input.vaultId);
    if (!vault || !vault.isDeleted) return err(DomainError.notFound('Vault not found'));

    const allowed = AuthorizationPolicy.require(input.ctx, vault, 'administer');
    if (!allowed.ok) return allowed;

    // Deleting freed the slug, so restoring requires it to be free again,
    // exactly as restoring a note does (RN-KNW-030).
    const holder = await this.deps.vaults.findBySlug(vault.slug);
    if (holder && !holder.id.equals(vault.id)) {
      return err(
        DomainError.conflict('That name was taken by another vault while this one was deleted', {
          code: 'ALREADY_EXISTS',
          vaultId: holder.id.value,
          slug: vault.slug.value,
        }),
      );
    }

    const restored = vault.restore(input.by);
    if (!restored.ok) return restored;

    const saved = await this.deps.vaults.save(vault);
    return saved.ok ? ok() : err(saved.error);
  }
}

/**
 * Writes the content FIRST and the pointer second (section 10.5). If the
 * transaction fails, an unreferenced blob is left in S3: invisible, harmless,
 * collected by the weekly orphan job. The reverse order would produce a
 * pointer to content that does not exist, in the middle of the hot path.
 */

/**
 * The revision guard of the two Content Slots that are not notes (RN-KNW-034).
 *
 * The reason RN-AGT-005 gives for notes holds here with more force, not less:
 * the guidance is the most shared document of a vault, and the one most likely
 * to be written by two hands at once, a person on the web and an agent over
 * MCP. Last-write-wins there would erase, without a word, what the other just
 * wrote.
 *
 * The current content travels with the refusal, so the caller can choose
 * between redoing and merging instead of guessing what changed.
 */
export async function guardRevision(
  read: (ref: ContentRef) => Promise<string>,
  current: ContentRef | null,
  baseRevision: string | null,
): Promise<Result<void, DomainError>> {
  const now = current?.versionId ?? null;
  if (now === baseRevision) return ok();

  return err(
    DomainError.conflict('The content changed since the revision you based this write on', {
      currentRevision: now,
      currentContent: current ? await read(current) : null,
    }),
  );
}
export class PutGuidance {
  constructor(private readonly deps: VaultDependencies) {}

  async execute(input: {
    ctx: RequestContext;
    vaultId: VaultId;
    content: string;
    baseRevision: string | null;
    by: Authorship;
  }): Promise<Result<ContentRef, DomainError>> {
    const vault = await loadAuthorized(this.deps, input.ctx, input.vaultId, 'write');
    if (!vault.ok) return vault;

    const current = vault.value.guidanceRef;
    const fresh = await guardRevision(
      (ref) => this.deps.content.read(ref),
      current,
      input.baseRevision,
    );
    if (!fresh.ok) return fresh;

    // Checked BEFORE the content is written, so a refused write leaves nothing
    // behind in the store: a guidance replaces the previous one, so what it
    // costs is the difference between them.
    const admitted = admitWrite(
      await this.deps.storage.current(),
      Buffer.byteLength(input.content, 'utf8') - (current?.bytes ?? 0),
    );
    if (!admitted.ok) return admitted;

    const ref = current
      ? await this.deps.content.overwrite(current.contentId, input.content)
      : await this.deps.content.create(input.content);

    const applied = vault.value.setGuidance(ref, input.by);
    if (!applied.ok) return applied;
    if (!vault.value.hasChanges) return ok(ref); // identical bytes: no revision

    const saved = await this.deps.vaults.save(vault.value);
    return saved.ok ? ok(ref) : err(saved.error);
  }
}

/** The composed document the agent reads: guidance plus the annotated tree. */
export class GetVaultContext {
  constructor(private readonly deps: VaultDependencies) {}

  async execute(input: {
    ctx: RequestContext;
    vaultId: VaultId;
  }): Promise<Result<string, DomainError>> {
    const vault = await loadAuthorized(this.deps, input.ctx, input.vaultId, 'read');
    if (!vault.ok) return vault;

    const guidance = vault.value.guidanceRef
      ? await this.deps.content.read(vault.value.guidanceRef)
      : null;
    return ok(
      composeVaultContext({
        vault: vault.value,
        guidance,
        reservedVocabulary: this.deps.reservedVocabulary,
      }),
    );
  }
}

export class SetVaultRoleLimit {
  constructor(private readonly deps: VaultDependencies) {}

  async execute(input: {
    ctx: RequestContext;
    vaultId: VaultId;
    userId: UserId;
    /** The only admitted value is VIEWER (RN-ACC-012). */
    limit: string;
    subscriptionRole: Role;
    by: Authorship;
  }): Promise<Result<void, DomainError>> {
    const vault = await loadAuthorized(this.deps, input.ctx, input.vaultId, 'administer');
    if (!vault.ok) return vault;

    const limit = VaultRoleLimit.create(input.limit);
    if (!limit.ok) return limit;
    // RN-ACC-011: the ceiling only demotes. Setting one above the member's
    // role is refused with VALIDATION rather than silently ignored.
    if (!input.subscriptionRole.atLeast(limit.value.role)) {
      return err(DomainError.validation('A vault ceiling can only lower a role, never raise it'));
    }

    const applied = vault.value.setRoleLimit(input.userId, limit.value, input.by);
    if (!applied.ok) return applied;

    const saved = await this.deps.vaults.save(vault.value);
    return saved.ok ? ok() : err(saved.error);
  }
}

export class ClearVaultRoleLimit {
  constructor(private readonly deps: VaultDependencies) {}

  async execute(input: {
    ctx: RequestContext;
    vaultId: VaultId;
    userId: UserId;
    by: Authorship;
  }): Promise<Result<void, DomainError>> {
    const vault = await loadAuthorized(this.deps, input.ctx, input.vaultId, 'administer');
    if (!vault.ok) return vault;

    const cleared = vault.value.clearRoleLimit(input.userId, input.by);
    if (!cleared.ok) return cleared;

    const saved = await this.deps.vaults.save(vault.value);
    return saved.ok ? ok() : err(saved.error);
  }
}

export { loadAuthorized };
