/**
 * Role: an ORDERED enumeration, and the order is the point.
 *
 * It is what lets the vault ceiling be written as a minimum
 * (architecture-guide.md, section 14.2) instead of a chain of conditionals,
 * and it is what makes it impossible, by type, for a ceiling to promote
 * anyone (RN-ACC-011).
 */

import { DomainError } from './errors.js';
import { err, ok, type Result } from './result.js';

const RANK = {
  NONE: 0,
  VIEWER: 1,
  EDITOR: 2,
  OWNER: 3,
} as const;

export type RoleName = keyof typeof RANK;

export class Role {
  private readonly __role!: void;
  private constructor(
    readonly name: RoleName,
    readonly rank: number,
  ) {}

  static readonly NONE = new Role('NONE', RANK.NONE);
  static readonly VIEWER = new Role('VIEWER', RANK.VIEWER);
  static readonly EDITOR = new Role('EDITOR', RANK.EDITOR);
  static readonly OWNER = new Role('OWNER', RANK.OWNER);

  static create(raw: string): Result<Role, DomainError> {
    switch (raw) {
      case 'NONE':
        return ok(Role.NONE);
      case 'VIEWER':
        return ok(Role.VIEWER);
      case 'EDITOR':
        return ok(Role.EDITOR);
      case 'OWNER':
        return ok(Role.OWNER);
      default:
        return err(DomainError.validation(`Not a valid role: ${String(raw)}`));
    }
  }

  /** OWNER is not a membership: only these two can be granted in a workspace. */
  static membership(raw: string): Result<Role, DomainError> {
    if (raw !== 'EDITOR' && raw !== 'VIEWER') {
      return err(DomainError.validation('A workspace membership is EDITOR or VIEWER'));
    }
    return Role.create(raw);
  }

  /** The lower of two roles. The whole ceiling rule is this function. */
  static min(left: Role, right: Role): Role {
    return left.rank <= right.rank ? left : right;
  }

  atLeast(other: Role): boolean {
    return this.rank >= other.rank;
  }

  canWrite(): boolean {
    return this.atLeast(Role.EDITOR);
  }

  canRead(): boolean {
    return this.atLeast(Role.VIEWER);
  }

  equals(other: unknown): boolean {
    return other instanceof Role && other.name === this.name;
  }

  toString(): string {
    return this.name;
  }

  toJSON(): string {
    return this.name;
  }
}

/**
 * The only admitted ceiling value is VIEWER (RN-ACC-012): there is no ceiling
 * that removes visibility of the vault, because a member of the workspace sees
 * every vault in it. What the ceiling controls is writing, not seeing.
 */
export class VaultRoleLimit {
  private readonly __vaultRoleLimit!: void;
  private constructor(readonly role: Role) {}

  static readonly VIEWER = new VaultRoleLimit(Role.VIEWER);

  static create(raw: string): Result<VaultRoleLimit, DomainError> {
    // RN-ACC-012. The code stays in this comment and out of the message: an
    // error message is served text, and it addresses whoever called the API,
    // who has no document to resolve the code against (RN-AGT-021).
    if (raw !== 'VIEWER') {
      return err(DomainError.validation('The only admitted vault role limit is VIEWER'));
    }
    return ok(VaultRoleLimit.VIEWER);
  }

  toString(): string {
    return this.role.name;
  }

  toJSON(): string {
    return this.role.name;
  }
}
