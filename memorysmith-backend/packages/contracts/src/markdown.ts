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
 * **Two lists below are ours and not the profile's**, and they are here because
 * profile v0.4.0 stopped carrying the fields they used to be read from. Each
 * one says what it is for at its own declaration. They are not a transcription
 * of the specification: the first is a decision about what this repository's
 * own guards are asked for, and the second is what this product does with
 * forms the profile deliberately no longer describes.
 */

import profile from '@memorysmith/markdown-profile/profile.json' with { type: 'json' };
import conformance from '@memorysmith/markdown-profile/conformance.json' with { type: 'json' };

/**
 * Who decides this notation. The first two are the sanctioned extractors of
 * `architecture-guide.md` §11.3; the third is the reading surface, which is
 * behaviour of the interface and is proved by a test of its own kind — a
 * rendering assertion cannot live in a JSON file (RN-AGT-023).
 */
export type NotationReader = 'links' | 'frontmatter' | 'reading-surface';

export interface RecognisedNotation {
  readonly id: string;
  readonly reader: NotationReader;
  /** The form, as an agent would type it. */
  readonly syntax: string;
  /** A body that exercises the form, used verbatim by the conformance test. */
  readonly example: string;
  /** What observably happens. Written for the agent, not for the code. */
  readonly effect: string;
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

/**
 * Where the forms of the profile were established.
 *
 * It was `base` until profile v0.4.0 and it was a list of tiers the profile
 * was built out of; it is now a list of **sources a form is credited to**, and
 * the difference is not cosmetic. An implementation is no longer asked to
 * support a specification in full — a requirement nobody can check — it is
 * asked to support the notation the document lists, which is a requirement the
 * suite settles.
 *
 * `version` is OPTIONAL, and the third source is why: Obsidian publishes
 * documentation rather than a versioned specification. It is credited because
 * seven notation families came from it — the wikilink and its alias, anchor,
 * embed and block forms, callouts, marked text, comments, block identifiers —
 * and crediting them to "the vault editors that established it" named nobody.
 *
 * **The precedence is not uniform, and that is the part worth carrying.** Where
 * the profile and CommonMark or GFM disagree, the source governs. Where the
 * profile and Obsidian disagree, the profile governs. A source is a lineage
 * here, never a compatibility claim.
 */
export const MARKDOWN_PROFILE_SOURCES: ReadonlyArray<{
  readonly id: string;
  readonly name: string;
  readonly version?: string;
  readonly url: string;
}> = profile.sources;

export const RECOGNISED_NOTATION: readonly RecognisedNotation[] =
  profile.notations as readonly RecognisedNotation[];

/**
 * The published cases, run by the conformance tests of both implementations.
 * They are the suite of the specification and not a copy of it: a case the
 * extractors or the reading surface fail breaks the build.
 */
export const CONFORMANCE_CASES: readonly ConformanceCase[] =
  conformance.cases as readonly ConformanceCase[];

/**
 * The entries whose rendering this repository does NOT assert, because the
 * base parser is what produces them.
 *
 * **This list is a decision of ours, and it used to be a field.** Until profile
 * v0.4.0 every entry carried a `ring`, and two guards — the reading-surface
 * expectations and the two demonstration vaults — were scoped to everything
 * outside the `base` one. The profile dropped the tier for a good reason: an
 * implementation is asked for the notation the document lists and not for a
 * specification in full. But the reason those two guards were scoped did not
 * go away with the field, so the scope is written here instead of being
 * inferred from data that no longer says it.
 *
 * The reason, unchanged: asserting that emphasis renders as `<em>` is a claim
 * about react-markdown and not about this surface, and forcing a setext
 * heading into two hand-written vaults turns them into the list of specimens
 * they exist to not be. CommonMark is the floor every renderer already stands
 * on; what those two guards prove is what this profile adds on top of it.
 *
 * **Three things this list is not.**
 *
 * It is not a claim that these forms are untested: the published conformance
 * suite runs every case the profile ships, scoped by nothing, and the crossings
 * — where the profile changes what a base form MEANS — are asserted by hand in
 * `a base notation that means something different here`. A link inside a code
 * span, an embed that looks like an image, `---` under a paragraph: those are
 * here in this list and proved there.
 *
 * It is not what the skill is asked for. The skill teaches the whole table,
 * these entries included, and that is the same decision reaching the opposite
 * answer: the crossings are exactly what an agent gets wrong, so the reader who
 * most needs them is the one reading that table.
 *
 * And it is not allowed to silently absorb a new entry. Both guards assert that
 * every declared notation is either expected or listed here, so a form the
 * profile adds in a later version fails the build until somebody classifies it,
 * which is the property the old `ring` field gave for free.
 */
export const DELEGATED_TO_THE_BASE_PARSER: ReadonlySet<string> = new Set([
  'paragraph',
  'backslash-escape',
  'character-reference',
  'heading-atx',
  'heading-setext',
  'thematic-break',
  'block-quote',
  'list-bullet',
  'list-ordered',
  'code-fenced',
  'code-indented',
  'link-reference-definition',
  'code-span',
  'emphasis',
  'strong',
  'strong-emphasis',
  'link-inline',
  'link-reference',
  'image',
  'autolink',
  'hard-line-break',
]);

/**
 * A form this product deliberately does not read, declared here because the
 * profile no longer declares anything about it.
 *
 * Until v0.4.0 the profile carried these as entries with `recognised: false`,
 * and §8 kept a catalogue of notation it declined. Both are gone, and the
 * profile is right that they had to go: a list of the forms a specification
 * refuses needs an entry for every form of every other dialect and can never be
 * finished. §8 is now one rule covering all of them at once — an implementation
 * MAY render an undescribed form, MUST NOT derive meaning from it, and MUST NOT
 * claim conformance on account of it.
 *
 * **What the profile stopped saying, this product still says.** Nothing changed
 * about the behaviour: `#subject` in the body of a note becomes no edge and no
 * facet, and the reading surface draws it as plain text with no chip and
 * nothing to click (RN-DSC-033, and RN-PRT-007 depends on it). The rule is
 * ours, argued from PP4 and from a survey of the example vaults, and it needs
 * somewhere to live now that it is not a row in `profile.json`.
 *
 * The guard that watches it is the reason this list is not simply deleted. Of
 * everything the reading surface does, a rejection is the easiest to undo by
 * accident: drawing a chip around `#subject` promises a grouping that does not
 * exist, and an affordance without the function it promises is worse than the
 * raw text. That guard read `recognised: false` and would now watch nothing.
 *
 * Every entry here MUST be absent from `RECOGNISED_NOTATION`, and a test says
 * so: if a later version of the profile declares one of these forms, this list
 * is the thing that has to change, not the thing that quietly disagrees.
 */
export interface DeclaredSilence {
  readonly id: string;
  /** The form, as somebody arriving from another editor would type it. */
  readonly syntax: string;
  /** A body exercising the form, used verbatim by the guards. */
  readonly example: string;
  /** What happens, which in every case here is nothing. */
  readonly effect: string;
}

export const DECLARED_SILENCE: readonly DeclaredSilence[] = [
  {
    id: 'inline-tag',
    syntax: '#subject',
    example: 'The decision touches #procurement and #contracts.',
    effect:
      'NOTHING. It is stored and returned exactly as written, and shown as plain text: no chip, no colour, nothing to click. Two editors read the inline hashtag in incompatible ways, as a link and as metadata of the file, so there is nothing to inherit. Here the curation vocabulary lives in the frontmatter, where the Guidance governs it. To group, write `tags:`; to connect, write `[[wikilink]]`.',
  },
  {
    id: 'sub-sup',
    syntax: '~subscript~  ·  ^superscript^',
    example: 'The formula is H~2~O, and the area is 3 m^2^.',
    effect:
      'NOTHING, and the characters stay on the page so that is visible. There is no notation for superscript or subscript here, which is why strikethrough accepts two tildes and only two: a single-tilde extension would strike the middle of `H~2~O`, and a wrong answer is worse than none.',
  },
];
