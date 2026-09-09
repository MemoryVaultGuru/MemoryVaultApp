/**
 * The `aliases` of a note: the alternative spellings it answers to.
 *
 * They are read from the frontmatter block, by the same reader the facets are
 * classified from, and they do two things that are not the same thing: they
 * join the search index as spellings of the note (RN-DSC-032), and they
 * resolve a wikilink target that **no title matched** (RN-DSC-052).
 *
 * The second one is new, and it is the one that needs the boundary stated:
 * an alias fills an empty and never takes a target a title already answered.
 */

import { frontmatterOf } from '@memorysmith/kernel';

const ALIASES_KEY = 'aliases';

/**
 * Every alias the note declares, trimmed and in the order it wrote them.
 *
 * A scalar counts: `aliases: RPO` is one alias, because refusing it would be
 * validating content, and the shape of a value decides how it is indexed and
 * never whether it is read.
 */
export function extractFrontmatterAliases(markdown: string): string[] {
  const entry = frontmatterOf(markdown)[ALIASES_KEY];
  if (!entry) return [];
  return entry.values.map((value) => value.trim()).filter((value) => value.length > 0);
}
