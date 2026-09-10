/**
 * Slug: the normalized, URL-safe name a vault or a folder is addressed by.
 *
 * Vault slugs are unique within the subscription (RN-KNW-032); folder slugs are
 * unique among siblings (RN-KNW-002). A note carries none: it is addressed by
 * its identifier and named by its title (RN-KNW-035). This type only
 * guarantees the shape; uniqueness is the repository's to enforce.
 */

import { DomainError } from './errors.js';
import { err, ok, type Result } from './result.js';

const MAX_LENGTH = 80;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Folds accents, lowercases, and collapses everything that is neither a letter
 * nor a digit into single hyphens. Deterministic: the same name always yields
 * the same slug, so two names that fold to one are one address.
 */
export function slugify(raw: string): string {
  return (
    raw
      .normalize('NFD')
      // A dot BETWEEN DIGITS belongs to the number, not to the words around it:
      // "Lei 14.133" has to become "lei-14133", because "lei-14-133" is not what
      // anyone would type in an address.
      .replace(/(\d)[.,](\d)/g, '$1$2')
      .replace(/\p{M}/gu, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, MAX_LENGTH)
      .replace(/-+$/g, '')
  );
}

export class Slug {
  private readonly __slug!: void;
  private constructor(readonly value: string) {}

  /** Accepts an already normalized slug and rejects anything else. */
  static create(raw: string): Result<Slug, DomainError> {
    if (typeof raw !== 'string' || raw.length === 0 || raw.length > MAX_LENGTH) {
      return err(DomainError.validation(`Slug must have 1 to ${MAX_LENGTH} characters`));
    }
    if (!SLUG_PATTERN.test(raw)) {
      return err(
        DomainError.validation(
          'Slug accepts lowercase letters, digits and single hyphens between them',
        ),
      );
    }
    return ok(new Slug(raw));
  }

  /** Derives a slug from free text: a title, a folder name. */
  static from(raw: string): Result<Slug, DomainError> {
    const normalized = slugify(raw ?? '');
    if (normalized.length === 0) {
      return err(DomainError.validation(`Cannot derive a slug from "${String(raw)}"`));
    }
    return Slug.create(normalized);
  }

  equals(other: unknown): boolean {
    return other instanceof Slug && other.value === this.value;
  }

  toString(): string {
    return this.value;
  }

  toJSON(): string {
    return this.value;
  }
}
