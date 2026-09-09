/**
 * LinkExtractor: the first of the two sanctioned readers of content
 * (architecture-guide.md, section 11.1). It reads ONLY the notation the
 * specification declares - no field name, no vault convention - because what a
 * convention means belongs to the guidance, never to the backend (PP4).
 *
 * **A target is a title, and the two forms reach it differently.** A wikilink
 * target is LITERAL: nothing in it is decoded, no extension is removed and no
 * path segment is discarded, because a title is what the author typed
 * (RN-DSC-043). The three tolerances - discarding the path, dropping a
 * trailing `.md`, percent-decoding - belong to the Markdown form alone, and
 * their order is fixed by the specification: split at the first unencoded `#`,
 * then discard the path, then drop the extension, then decode.
 *
 * Decoding earlier would undo the escaping it exists for: `C%23%20basics`
 * would become `C# basics` and split at a `#` its author encoded precisely so
 * it would not be a delimiter, and `and%2For` would lose its first half to the
 * path rule. Delimiters first, decode after, compare last.
 *
 * What this reader does NOT do is resolve. It says what a note points at; what
 * a note answers to is the title chain and the aliases, and putting the two
 * together is `resolveTargets` (LinkResolver.ts).
 */

export interface ExtractedLink {
  /** The title the author addressed, literal and normalised to NFC. */
  readonly title: string;
  /** The anchor, kept for display and dropped from resolution (RN-DSC-002). */
  readonly anchor: string | null;
  /** What the author actually typed, for the health report. */
  readonly raw: string;
}

/**
 * The wikilink, in the three shapes it is written in. The alias after the pipe
 * is display and never changes the target, and the target of a link written
 * inside a table cell arrives with the escaped pipe its author had to write
 * there.
 */
const WIKILINK = /\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g;
/**
 * A link, and NOT an image: the `!` in front is the whole difference between
 * the two forms, and reading it as a link made an image a note. A relative
 * `![Curve](./curve.png)` became a pending link called `curve-png` - the graph
 * announcing a note somebody was about to write, from a picture (RN-DSC-038).
 *
 * The embed is untouched by this. `![[note]]` is read by WIKILINK above, which
 * does not care what precedes it, and it has to keep producing exactly the
 * edge `[[note]]` produces (RN-DSC-029). The two forms never meet: this one
 * requires a `](`, and the embed has no parenthesis at all.
 */
const MARKDOWN_LINK = /(?<!!)\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

/** Step 2: the first `#` that is not itself percent-encoded. */
function splitAnchor(target: string): { path: string; anchor: string | null } {
  const at = target.indexOf('#');
  if (at === -1) return { path: target, anchor: null };
  return { path: target.slice(0, at), anchor: target.slice(at + 1) };
}

/**
 * An escape that is not one is left exactly as written and is never an error:
 * the `%` of `[Half](50%)` opens nothing, and `decodeURIComponent` throwing on
 * it must not cost the note its link.
 */
function percentDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * A title is compared after NFC and folded in no other way (RN-DSC-041), and
 * `raw` is what the author typed — the health report shows a target as it was
 * written, not as it was read.
 */
function asTitle(value: string, anchor: string | null, raw: string): ExtractedLink | null {
  const title = value.trim().normalize('NFC');
  if (title.length === 0) return null;
  return { title, anchor: anchor === null ? null : anchor.trim().normalize('NFC'), raw };
}

/** The wikilink form: the target is what was typed, and nothing touches it. */
function fromWikilink(target: string): ExtractedLink | null {
  // Inside a table cell the pipe of an alias is escaped, so a target arriving
  // from there ends at the backslash its author had to write.
  const written = target.replace(/\\$/, '');
  const { path, anchor } = splitAnchor(written);
  return asTitle(path, anchor, target);
}

/** The Markdown form: the three tolerances, in the order the specification fixes. */
function fromMarkdownLink(target: string): ExtractedLink | null {
  const trimmed = target.trim();
  if (trimmed.length === 0) return null;
  // Step 1: a scheme or a host means the world and never the vault
  // (RN-DSC-003).
  if (HAS_SCHEME.test(trimmed) || trimmed.startsWith('//')) return null;

  const { path, anchor } = splitAnchor(trimmed);
  const basename = path.split('/').pop() ?? path;
  const withoutExtension = basename.replace(/\.mdx?$/i, '');
  return asTitle(
    percentDecode(withoutExtension),
    anchor === null ? null : percentDecode(anchor),
    target,
  );
}

/**
 * Every link written in the body of a note, deduplicated by target.
 *
 * Several links to one target are one edge, and an embed and a plain link to
 * the same target are one edge too: the graph does not distinguish
 * transclusion from reference, not even by counting (§5.4).
 */
export function extractLinks(markdown: string): ExtractedLink[] {
  const body = stripCodeBlocks(markdown);
  const found = new Map<string, ExtractedLink>();
  const add = (link: ExtractedLink | null): void => {
    if (link && !found.has(link.title)) found.set(link.title, link);
  };

  for (const match of body.matchAll(WIKILINK)) add(fromWikilink(match[1] ?? ''));
  for (const match of body.matchAll(MARKDOWN_LINK)) add(fromMarkdownLink(match[1] ?? ''));

  // A definition on its own is not a link: it renders nothing where it stands
  // and it is a destination waiting to be used. What produces the edge is the
  // reference that names it, in any of its three forms.
  const defined = definitions(body);
  if (defined.size > 0) {
    for (const match of body.matchAll(REFERENCE)) {
      const label = (match[2] ?? '').trim() || (match[1] ?? '');
      const destination = defined.get(labelKey(label));
      if (destination) add(fromMarkdownLink(destination));
    }
    for (const match of body.matchAll(SHORTCUT)) {
      const destination = defined.get(labelKey(match[2] ?? ''));
      if (destination) add(fromMarkdownLink(destination));
    }
  }
  return [...found.values()];
}

/**
 * The reference form of a link, which is the same link written apart from its
 * destination. The three forms are equivalent once resolved, and the
 * destination decides the edge exactly as it does inline, so reading only the
 * inline one meant a note that keeps its addresses at the bottom - which is
 * how a long note stays readable - produced no edges at all.
 */
const DEFINITION = /^ {0,3}\[([^\]\n]+)\]:[ \t]*<?([^\s>]+)>?/gm;
/** `[text][label]` and the collapsed `[label][]`, and again never an image. */
const REFERENCE = /(?<!!)\[([^\]\n]*)\]\[([^\]\n]*)\]/g;
/**
 * `[label]` ON ITS OWN, which is a link only when the label is defined.
 *
 * "On its own" is what the three exclusions in front are for: a `[` before it
 * makes it a wikilink, a `!` makes it the label of an image, and a `]` makes
 * it the second half of a reference — which the pattern above already read,
 * and which would otherwise smuggle an image back in through `![alt][label]`.
 */
const SHORTCUT = /(^|[^[!\]])\[([^\]\n]+)\](?![[(:])/g;

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
 * without invoking it (`code-fenced` and `code-span`).
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
