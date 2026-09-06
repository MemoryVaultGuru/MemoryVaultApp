/**
 * FacetExtractor: the second sanctioned reader of content
 * (architecture-guide.md, section 11.3). It reads ONLY the frontmatter block
 * and classifies each key-value pair BY THE SHAPE OF THE VALUE.
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

export type FacetKind = 'date' | 'boolean' | 'enum' | 'list';

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

export function extractFrontmatter(markdown: string): string | null {
  if (!markdown.startsWith('---')) return null;
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(markdown);
  return match?.[1] ?? null;
}

/** How the author wrote the value, which is what decides the kind. */
type WrittenForm = 'scalar' | 'list';

interface Entry {
  readonly written: WrittenForm;
  readonly values: string[];
}

/**
 * A deliberately small YAML reader: scalars, inline lists and dash lists, and
 * nothing else. Anything more would be interpreting the vault, which is not
 * the backend's business.
 *
 * It carries the written form out alongside the values, because flattening
 * both into an array is what made a list of one item indistinguishable from a
 * scalar, and those are not the same attribute.
 */
function parseFrontmatter(block: string): Record<string, Entry> {
  const entries: Record<string, Entry> = {};
  const lines = block.split(/\r?\n/);
  let currentKey: string | null = null;

  for (const line of lines) {
    if (/^\s*#/.test(line) || line.trim().length === 0) continue;

    const listItem = /^\s*-\s+(.*)$/.exec(line);
    if (listItem && currentKey) {
      entries[currentKey] = {
        written: 'list',
        values: [...(entries[currentKey]?.values ?? []), unquote(listItem[1] ?? '')],
      };
      continue;
    }

    const pair = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(line);
    if (!pair) continue;
    const key = (pair[1] ?? '').trim();
    const raw = (pair[2] ?? '').trim();
    currentKey = key;

    if (raw.length === 0) {
      // `key:` on its own is either an empty value or the head of a dash list.
      // The lines that follow decide, and until one arrives it holds nothing.
      entries[key] = { written: 'scalar', values: [] };
    } else if (raw.startsWith('[') && raw.endsWith(']')) {
      entries[key] = {
        written: 'list',
        values: raw
          .slice(1, -1)
          .split(',')
          .map((each) => unquote(each.trim()))
          .filter((each) => each.length > 0),
      };
    } else {
      entries[key] = { written: 'scalar', values: [unquote(raw)] };
    }
  }
  return entries;
}

function unquote(value: string): string {
  return value.replace(/^["']|["']$/g, '').trim();
}

/**
 * The kind, decided by the form the author wrote (RN-DSC-020). Deciding it by
 * the number of values gave one attribute two kinds across the notes of a
 * single vault, settled by a fact about whichever note was being read.
 */
function kindOf({ written, values }: Entry): FacetKind | null {
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
  const block = extractFrontmatter(markdown);
  if (!block) return {};

  const snapshot: FacetSnapshot = {};
  for (const [facet, entry] of Object.entries(parseFrontmatter(block))) {
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
