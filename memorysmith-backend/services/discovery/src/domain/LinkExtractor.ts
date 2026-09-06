/**
 * LinkExtractor: the first of the two sanctioned readers of content
 * (architecture-guide.md, section 11.1). It reads ONLY universal Markdown
 * syntax - no field name, no vault convention - because what a convention
 * means belongs to the guidance, never to the backend (PP4).
 *
 * One resolution rule for both link forms: the target is reduced to the
 * basename without extension, normalized to a Slug, and resolved WITHIN THE
 * VAULT.
 */

import { slugify } from '@memorysmith/kernel';

export interface ExtractedLink {
  /** The normalized target, which is what resolution matches on. */
  readonly slug: string;
  /** The anchor, kept for display and dropped from resolution (RN-DSC-002). */
  readonly anchor: string | null;
  /** What the author actually typed, for the health report. */
  readonly raw: string;
}

const WIKILINK = /\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g;
const MARKDOWN_LINK = /\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

/**
 * The reference form of a link, which is the same link written apart from its
 * destination (profile v0.3.0, `link-reference-definition` and
 * `link-reference`). The three forms are equivalent once resolved, and the
 * destination decides the edge exactly as it does inline, so reading only the
 * inline one meant a note that keeps its addresses at the bottom - which is
 * how a long note stays readable - produced no edges at all.
 */
const DEFINITION = /^ {0,3}\[([^\]\n]+)\]:[ \t]*<?([^\s>]+)>?/gm;
/** `[text][label]` and the collapsed `[label][]`. */
const REFERENCE = /\[([^\]\n]*)\]\[([^\]\n]*)\]/g;
/** `[label]` on its own, which is a link only when the label is defined. */
const SHORTCUT = /(^|[^[!])\[([^\]\n]+)\](?![[(:])/g;

function normalize(target: string): ExtractedLink | null {
  const trimmed = target.trim();
  if (trimmed.length === 0) return null;
  // A link with a scheme or a host is external and never becomes an edge
  // (RN-DSC-003).
  if (HAS_SCHEME.test(trimmed) || trimmed.startsWith('//')) return null;

  const [pathPart, anchorPart] = trimmed.split('#', 2);
  if (!pathPart) return null;

  // Path segments are DELIBERATELY ignored (RN-DSC-001): the edge is between
  // notes, not between folders, and honouring the path would break the link
  // the moment the note changed folder, which is what the product exists to
  // prevent.
  const basename = pathPart.split('/').pop() ?? pathPart;
  const withoutExtension = basename.replace(/\.mdx?$/i, '');
  const slug = slugify(withoutExtension);
  if (slug.length === 0) return null;

  return { slug, anchor: anchorPart ? slugify(anchorPart) || anchorPart : null, raw: trimmed };
}

/** Every link written in the body of a note, deduplicated by target. */
export function extractLinks(markdown: string): ExtractedLink[] {
  const body = stripCodeBlocks(markdown);
  const found = new Map<string, ExtractedLink>();
  const add = (target: string): void => {
    const link = normalize(target);
    if (link && !found.has(link.slug)) found.set(link.slug, link);
  };

  for (const match of body.matchAll(WIKILINK)) add(match[1] ?? '');
  for (const match of body.matchAll(MARKDOWN_LINK)) add(match[1] ?? '');

  // A definition on its own is not a link: it renders nothing where it stands
  // and it is a destination waiting to be used. What produces the edge is the
  // reference that names it, in any of its three forms.
  const defined = definitions(body);
  if (defined.size > 0) {
    for (const match of body.matchAll(REFERENCE)) {
      const label = (match[2] ?? '').trim() || (match[1] ?? '');
      const destination = defined.get(labelKey(label));
      if (destination) add(destination);
    }
    for (const match of body.matchAll(SHORTCUT)) {
      const destination = defined.get(labelKey(match[2] ?? ''));
      if (destination) add(destination);
    }
  }
  return [...found.values()];
}

/** The destinations declared at the bottom of the note, by normalised label. */
function definitions(body: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const match of body.matchAll(DEFINITION)) {
    map.set(labelKey(match[1] ?? ''), match[2] ?? '');
  }
  return map;
}

/** A label matches case-insensitively and whatever its internal spacing. */
function labelKey(label: string): string {
  return label.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * A link inside code is an example, not a reference: a fenced block parses
 * nothing inside it and a code span is where an author writes the notation
 * without invoking it (profile `code-fenced` and `code-span`).
 *
 * The INDENTED form is deliberately absent, and it is a declared limitation
 * rather than an oversight (`architecture-guide.md` §11.1). Telling four
 * spaces of code from four spaces of a nested list item needs the block
 * context only a parser has, and this reader has none by design (PP4). Of the
 * two ways to be wrong, reading a link that was an example costs a spurious
 * pending link, and skipping a nested list item costs a real edge — the graph
 * lying about what the vault says, which is what the product exists to
 * prevent. So the cheaper mistake is the one that stays.
 */
function stripCodeBlocks(markdown: string): string {
  return markdown.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '');
}
