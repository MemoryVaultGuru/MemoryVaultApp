/**
 * The title of a note, read in a chain (MemorySmith Markdown Specification
 * §5.3). This is the third sanctioned reader of content, and the one Knowledge
 * needs synchronously on the write, because a listing cannot wait for a
 * projection to know what a note is called (architecture-guide.md §11).
 *
 * It is a pure function of the kernel, used by Knowledge when a note is
 * written and by Discovery when a link is resolved, so the two can never
 * disagree about what a note is called (RN-KNW-035).
 *
 * What it reads is the notation the specification declares — the first level-1
 * heading, and one reserved key of the frontmatter — and never a vault
 * convention or a vocabulary this backend holds a list of (PP4).
 */

import { bodyWithoutFrontmatter, frontmatterOf } from './frontmatter.js';

/**
 * The four delimiters of the form that addresses a note. A title carrying one
 * of them has no addressable title: the note exists, it renders, it links
 * outward and it is searchable, and no link can name it (§5.3, RN-KNW-036).
 *
 * A `/` is deliberately not among them. `Reunião 03/09/2026` is an ordinary
 * title, because folders play no part in identity.
 */
const UNADDRESSABLE = /[#[\]|]/;

/**
 * The frontmatter key that names a note (§6.5). It is here because this is
 * where it is read, and it is exported because the facet extractor has to know
 * which key it must never turn into an attribute (RN-DSC-050).
 */
export const TITLE_KEY = 'title';

/**
 * The title of a note, or `null` when it has none that a link could name.
 *
 * The chain, in order:
 *
 * 1. `title:` of the frontmatter, when it is a single text value of any
 *    length. Its length is not capped: the 40-character ceiling of §6.3 is
 *    where a value stops being a category, and a title is never a category.
 * 2. The plain text of the first level-1 heading, when the frontmatter states
 *    none.
 * 3. Neither, and the note has no addressable title.
 *
 * **A `title:` that is there ends the chain.** The heading is where a title is
 * read when the frontmatter states none; it is not a repair for one the author
 * wrote, so a stated title carrying one of the four characters leaves the note
 * with no address and does not fall through (RN-KNW-039).
 *
 * Nothing here is ever an error. A `title:` of any other shape — a list, a
 * nested block, an empty value — means the frontmatter stated no title, and no
 * title is invented out of the value that was not used. This product never
 * validates content (§6.5).
 */
export function noteTitle(body: string): string | null {
  const stated = statedTitle(body);
  if (stated !== null) return addressable(stated);
  const heading = firstLevelOneHeading(bodyWithoutFrontmatter(body));
  return heading === null ? null : addressable(heading);
}

/** The `title:` of the frontmatter, when it is a single text value. */
function statedTitle(body: string): string | null {
  const entry = frontmatterOf(body)[TITLE_KEY];
  if (!entry || entry.written !== 'scalar') return null;
  const [value] = entry.values;
  return value === undefined || value.length === 0 ? null : value;
}

/**
 * Trimmed, normalised to NFC, and `null` when no link could name it.
 *
 * NFC is not a fold: `Ação` exists as two byte sequences that render
 * identically and are typed by different editors, and normalising is what
 * keeps them one note instead of two. Nothing else is folded — comparison is
 * case-exact (§5.3).
 */
function addressable(raw: string): string | null {
  const title = raw.normalize('NFC').trim();
  if (title.length === 0 || UNADDRESSABLE.test(title)) return null;
  return title;
}

/**
 * The first level-1 heading of the body, ATX or Setext, as plain text.
 *
 * Blocks before inlines (§3): a `# Title` inside a fenced code block is code
 * and names nothing, the same crossing §5.6 states for links. The indented
 * form of a code block is not recognised here, exactly as it is not in the
 * link extractor and for the same declared reason (architecture-guide.md
 * §11.1): telling four spaces of code from four spaces of a nested list item
 * needs the block context this reader does not have.
 */
function firstLevelOneHeading(body: string): string | null {
  const lines = body.split(/\r?\n/);
  let fence: string | null = null;
  let previous: string | null = null;

  for (const line of lines) {
    const fenceMark = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (fence !== null) {
      if (fenceMark && line.trimStart().startsWith(fence)) fence = null;
      previous = null;
      continue;
    }
    if (fenceMark) {
      fence = (fenceMark[1] ?? '').slice(0, 3);
      previous = null;
      continue;
    }

    const atx = /^ {0,3}#(?!#)[ \t]+(.*?)(?:[ \t]+#+)?[ \t]*$/.exec(line);
    if (atx) return inlineText(atx[1] ?? '');

    // Setext: an underline of `=` turns the paragraph above it into a level-1
    // heading. Only the line immediately above is read, because a title
    // written across two lines is not a title anybody links to.
    if (previous !== null && /^ {0,3}=+[ \t]*$/.test(line)) return inlineText(previous);

    previous = line.trim().length > 0 && !/^ {0,3}[>-]/.test(line) ? line.trim() : null;
  }
  return null;
}

const ESCAPE = /\\([!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~])/g;
/** A character no note carries, used to hold an escaped one out of the way. */
const SENTINEL = String.fromCharCode(0);
const SET_ASIDE = new RegExp(`${SENTINEL}(\\d+)${SENTINEL}`, 'g');
const NAMED_REFERENCES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

/**
 * The plain text of a heading, after inline parsing. `# **Lei** 14.133` is
 * titled `Lei 14.133` and never `**Lei** 14.133` — otherwise `[[Lei 14.133]]`
 * would not match its own note.
 *
 * A wikilink written inside a heading is deliberately left as it was typed:
 * its brackets survive, and the note has no addressable title. That is the
 * same answer §5.3 gives to every other title carrying a delimiter of the form
 * that addresses it, and inventing a target out of one would make the note
 * answer to a name its author never wrote outside a link.
 */
function inlineText(raw: string): string {
  // An escaped character is set aside before anything else runs, so a `\*`
  // never delimits an emphasis, and it is put back at the very end as an
  // ordinary character of the title — `\#` included, which leaves the note
  // without an addressable title exactly as an unescaped `#` would.
  const escaped: string[] = [];
  let text = raw.replace(ESCAPE, (_match, character: string) => {
    escaped.push(character);
    return `${SENTINEL}${escaped.length - 1}${SENTINEL}`;
  });

  // A code span renders its content, without the backticks that delimit it.
  text = text.replace(/(`+)[ ]?([\s\S]*?)[ ]?\1(?!`)/g, '$2');
  // A link renders its label and an image its alt text; the destination is not
  // part of what the heading says.
  text = text.replace(/!?\[([^[\]]*)\]\([^()\s]*(?:[ \t]+"[^"]*")?\)/g, '$1');
  text = text.replace(/!?\[([^[\]]*)\]\[[^[\]]*\]/g, '$1');
  text = text.replace(/<([a-z][a-z0-9+.-]*:[^<>\s]*|[^<>\s@]+@[^<>\s]+)>/gi, '$1');
  // Emphasis, strong emphasis and strikethrough. The underscore forms are
  // bounded by non-word characters, because `snake_case_name` is a word and
  // not an emphasis (§3.12).
  text = text
    .replace(/\*\*\*([^*]+)\*\*\*/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/~~([^~]+)~~/g, '$1')
    .replace(/(^|[^\p{L}\p{N}])___([^_]+)___(?=[^\p{L}\p{N}]|$)/gu, '$1$2')
    .replace(/(^|[^\p{L}\p{N}])__([^_]+)__(?=[^\p{L}\p{N}]|$)/gu, '$1$2')
    .replace(/(^|[^\p{L}\p{N}])_([^_]+)_(?=[^\p{L}\p{N}]|$)/gu, '$1$2');

  text = text.replace(
    /&(?:#(\d{1,7})|#[xX]([0-9a-fA-F]{1,6})|([a-zA-Z]+));/g,
    (match, dec, hex, name) => {
      if (dec) return String.fromCodePoint(Number(dec));
      if (hex) return String.fromCodePoint(Number.parseInt(hex as string, 16));
      return NAMED_REFERENCES[(name as string).toLowerCase()] ?? match;
    },
  );

  return text.replace(SET_ASIDE, (_match, index: string) => escaped[Number(index)] ?? '');
}
