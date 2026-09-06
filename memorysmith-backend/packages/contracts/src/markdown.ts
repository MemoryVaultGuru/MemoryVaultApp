/**
 * The notation the product reads inside the body of a note, IMPORTED rather
 * than declared.
 *
 * It used to be written here, and it is not any more. The notation is now a
 * published specification with a version of its own — the MemorySmith Markdown
 * Profile — carrying the same list as prose (`SPEC.md`), as data
 * (`profile.json`) and as an executable suite (`tests/conformance.json`). The
 * product does not declare the notation; it **implements a version of it**,
 * and says which.
 *
 * That is the whole reason this file shrank. A specification and an
 * implementation that keep separate copies of the same list drift apart on the
 * first cycle, and the drift is silent — which is exactly the failure the
 * profile exists to prevent one layer up, for the vaults. Keeping a private
 * transcription here would have been that same mistake, made by us.
 *
 * The version is pinned in `pnpm-workspace.yaml`, in one place, and a bump is
 * a deliberate commit whose proof is the conformance suite going green.
 *
 * It is re-exported from this package, and not read directly by whoever needs
 * it, because two contexts need the same list and may never import each other:
 * Discovery READS this notation, in its two sanctioned extractors, and Agent
 * Access TEACHES it, in the skill that tells an agent how to write a note this
 * product understands (RN-AGT-017, RN-AGT-022).
 *
 * `recognised: false` entries are as important as the others. Most of what an
 * agent gets wrong is not a notation it typed badly, it is a notation it
 * believed in: an absolute link it expected to become an edge, a sentence in
 * the frontmatter it expected to become a facet, an inline `#tag` it expected
 * to organise something.
 */

import profile from '@memorysmith/markdown-profile/profile.json' with { type: 'json' };
import conformance from '@memorysmith/markdown-profile/conformance.json' with { type: 'json' };

/**
 * Which ring the notation belongs to. `vault` is what this profile specifies;
 * `extended` is GFM and CommonMark, inherited and not ours to define.
 */
export type NotationRing = 'vault' | 'extended';

/**
 * Who decides this notation. The first two are the sanctioned extractors of
 * `architecture-guide.md` §11.3; the third is the reading surface, which is
 * behaviour of the interface and is proved by a test of its own kind — a
 * rendering assertion cannot live in a JSON file (RN-AGT-023).
 */
export type NotationReader = 'links' | 'frontmatter' | 'reading-surface';

export interface RecognisedNotation {
  readonly id: string;
  readonly ring: NotationRing;
  readonly reader: NotationReader;
  /** The form, as an agent would type it. */
  readonly syntax: string;
  /** A body that exercises the form, used verbatim by the conformance test. */
  readonly example: string;
  /** What observably happens. Written for the agent, not for the code. */
  readonly effect: string;
  /** False when the point of the entry is that NOTHING happens. */
  readonly recognised: boolean;
  /** The section of `SPEC.md` that specifies it. */
  readonly spec?: string;
}

/** One case of the published suite. Absent expectations assert nothing. */
export interface ConformanceCase {
  readonly id: string;
  readonly notation: string;
  readonly markdown: string;
  readonly links?: ReadonlyArray<{ readonly slug: string; readonly anchor: string | null }>;
  readonly facets?: Readonly<Record<string, { readonly kind: string; readonly values: string[] }>>;
}

/** The version of the profile this build implements. Cited, never guessed. */
export const MARKDOWN_PROFILE_VERSION: string = profile.version;

/** The name and the address of the specification, for what the product serves. */
export const MARKDOWN_PROFILE_URL: string = profile.url;
export const MARKDOWN_PROFILE_NAME: string = profile.profile;

/** The specifications this profile builds on, in order. */
export const MARKDOWN_PROFILE_BASE: ReadonlyArray<{
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly url: string;
}> = profile.base;

export const RECOGNISED_NOTATION: readonly RecognisedNotation[] =
  profile.notations as readonly RecognisedNotation[];

/**
 * The published cases, run by the conformance tests of both implementations.
 * They are the suite of the specification and not a copy of it: a case the
 * extractors or the reading surface fail breaks the build.
 */
export const CONFORMANCE_CASES: readonly ConformanceCase[] =
  conformance.cases as readonly ConformanceCase[];
