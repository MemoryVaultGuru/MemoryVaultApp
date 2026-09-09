/**
 * FacetExtractor: the second sanctioned reader of content
 * (architecture-guide.md, section 11.3). It reads ONLY the frontmatter block
 * and classifies each key-value pair BY THE SHAPE OF THE VALUE.
 *
 * The block itself and the YAML subset of it are read by the kernel, which is
 * also where the chain that reads the title of a note reads them from: there
 * is exactly one function in this repository that finds the frontmatter of a
 * body, because two readers of the same bytes is the defect this cycle is
 * paying off.
 *
 * There is no list of keys in the code and no per-vault configuration: the
 * vocabulary belongs to the guidance, and `maturity` and `reviewed`, the two
 * facets the product declares, are to this extractor attributes like any other
 * (RN-DSC-019, RN-DSC-020).
 *
 * Free text is discarded. An attribute that reveals itself as free text
 * through use is dropped by the cardinality ceiling (RN-DSC-024), which is why
 * `title` and `source` never become statistics without anyone maintaining an
 * exclusion list.
 *
 * The shape is the FORM THE AUTHOR WROTE, and never how many values that form
 * happens to hold: `tags: [contracts]` is a list of one item, and adding a
 * second value to an attribute must not change what the attribute is.
 */

import { frontmatterOf, type FrontmatterEntry } from '@memorysmith/kernel';

export type FacetKind = 'date' | 'boolean' | 'enum' | 'list';

/**
 * The vocabulary the profile reserves, always in en-US (RN-DSC-030).
 *
 * Reserved means **declared**, not enforced. Nothing in this extractor treats
 * these four differently: they are classified by the shape of their value like
 * every other attribute, so `created: manually` degrades to an ordinary enum
 * instead of being an error. What the reservation buys is a name every vault
 * spells the same way, which is what lets a tool, an interface or an agent say
 * something about "when this was written" without asking the vault first.
 *
 * The interface may translate the LABEL of one of these and never the bytes,
 * which is the same line PP4 draws everywhere else.
 */
export const RESERVED_KEYS = ['aliases', 'tags', 'created', 'updated'] as const;
export type ReservedKey = (typeof RESERVED_KEYS)[number];

/**
 * `title` is deliberately NOT reserved. The title of a note is structural, and
 * a `title:` in the frontmatter is an ordinary attribute that the cardinality
 * ceiling switches off on its own (RN-DSC-024) — which is exactly what should
 * happen to a key that is different in every note.
 */
export function isReserved(key: string): key is ReservedKey {
  return (RESERVED_KEYS as readonly string[]).includes(key);
}

export interface FacetValue {
  readonly facet: string;
  readonly kind: FacetKind;
  /** One value for a scalar; several for a list, as `tags` usually is. */
  readonly values: string[];
}

export type FacetSnapshot = Record<string, FacetValue>;

/** Above this many characters a value is prose, not a category. */
const MAX_ENUM_LENGTH = 40;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2})?)?/;

/**
 * The kind, decided by the form the author wrote (RN-DSC-020). Deciding it by
 * the number of values gave one attribute two kinds across the notes of a
 * single vault, settled by a fact about whichever note was being read.
 */
function kindOf({ written, values }: FrontmatterEntry): FacetKind | null {
  if (values.length === 0) return null;
  if (written === 'list') {
    return values.every((value) => value.length <= MAX_ENUM_LENGTH) ? 'list' : null;
  }
  const [value] = values as [string];
  if (value.length === 0) return null;
  if (/^(true|false|yes|no)$/i.test(value)) return 'boolean';
  if (ISO_DATE.test(value)) return 'date';
  // A short value is enumerable; a long one is prose and is discarded.
  return value.length <= MAX_ENUM_LENGTH ? 'enum' : null;
}

function canonical(kind: FacetKind, value: string): string {
  if (kind === 'boolean') return /^(true|yes)$/i.test(value) ? 'true' : 'false';
  if (kind === 'date') return (ISO_DATE.exec(value)?.[0] ?? value).slice(0, 10);
  return value;
}

/** The portrait of one note: what it says about itself, in aggregable form. */
export function extractFacets(markdown: string): FacetSnapshot {
  const snapshot: FacetSnapshot = {};
  for (const [facet, entry] of Object.entries(frontmatterOf(markdown))) {
    const kind = kindOf(entry);
    if (!kind) continue; // free text and empties are described, not counted
    snapshot[facet] = {
      facet,
      kind,
      values: entry.values.map((value) => canonical(kind, value)),
    };
  }
  return snapshot;
}

/**
 * The portrait reduced to what a reader groups by: the facet name and its
 * values, without the kind. It is the shape the graph view reads, and it is
 * derived here so no adapter has to know how a snapshot is built.
 */
export function valuesOf(snapshot: FacetSnapshot): Record<string, string[]> {
  const values: Record<string, string[]> = {};
  for (const entry of Object.values(snapshot)) values[entry.facet] = [...entry.values];
  return values;
}

/**
 * The delta between the previous portrait and the new one. The old value is
 * NOT in the event, which is exactly why the portrait per note exists
 * (section 11.3): update and deletion have to decrement what was there.
 */
export function facetDelta(
  before: FacetSnapshot | null,
  after: FacetSnapshot | null,
): Array<{ facet: string; value: string; delta: number; kind: FacetKind }> {
  const changes = new Map<
    string,
    { facet: string; value: string; delta: number; kind: FacetKind }
  >();

  const apply = (snapshot: FacetSnapshot | null, sign: number): void => {
    for (const entry of Object.values(snapshot ?? {})) {
      for (const value of entry.values) {
        const key = `${entry.facet}#${value}`;
        const current = changes.get(key);
        changes.set(key, {
          facet: entry.facet,
          value,
          kind: entry.kind,
          delta: (current?.delta ?? 0) + sign,
        });
      }
    }
  };

  apply(before, -1);
  apply(after, 1);
  return [...changes.values()].filter((change) => change.delta !== 0);
}
