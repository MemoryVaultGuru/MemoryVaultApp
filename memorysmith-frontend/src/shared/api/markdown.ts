// Markdown helpers used by the UI: frontmatter split, guidance heuristics and
// wikilink resolution. The backend never interprets note content (PP4); these
// helpers exist purely for presentation.

import { isAttachmentName } from './attachment';

export interface SplitDocument {
  frontmatter: Record<string, string>;
  /**
   * Which of those keys the vault wrote as a list, whether in a dash block or
   * inline. The values are flattened to one comma-separated string so the
   * table can print them, and that flattening is lossy: `tags: a, b` and a
   * two-item list read the same afterwards. The set keeps the difference,
   * because a list is drawn as chips and a sentence is not, and guessing from
   * the commas would turn a prose value that happens to have one into chips.
   */
  lists: Set<string>;
  body: string;
}

/**
 * A note is bytes the vault wrote, and a vault written on Windows, or in a
 * desktop editor, or pasted from anywhere, carries CRLF. Every reader in this
 * module starts here, because a carriage return left at the end of a line is
 * invisible in the source and fatal to a regex: `.` does not match one, so
 * `(.*)$` fails on exactly the lines that have a value.
 */
export function toUnixNewlines(raw: string): string {
  return raw.replace(/\r\n?/g, '\n');
}

/**
 * Strips one layer of matching quotes, as the facet projector does. The trim
 * comes first: an item of an inline list arrives with the space that followed
 * the comma, and a quote that is not at position zero is not stripped.
 */
function unquote(value: string): string {
  return value
    .trim()
    .replace(/^["']|["']$/g, '')
    .trim();
}

/**
 * The frontmatter block, read the way the Discovery facet projector reads it
 * (FacetExtractor.ts). The two have to agree: the graph groups notes by what
 * the projector saw, and this table is where a reader checks it. An attribute
 * this parser drops is an attribute the graph offers and the note appears not
 * to have.
 */
export function splitFrontmatter(input: string): SplitDocument {
  const raw = toUnixNewlines(input);
  const bare = { frontmatter: {}, lists: new Set<string>(), body: raw };
  if (!raw.startsWith('---')) return bare;
  const end = raw.indexOf('\n---', 3);
  if (end === -1) return bare;
  const head = raw.slice(raw.indexOf('\n') + 1, end);
  const body = raw.slice(raw.indexOf('\n', end + 1) + 1);

  const frontmatter: Record<string, string> = {};
  const lists = new Set<string>();
  let lastKey: string | null = null;
  for (const line of head.split('\n')) {
    const kv = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(line);
    if (kv && kv[1]) {
      lastKey = kv[1];
      const value = (kv[2] ?? '').trim();
      // An inline list becomes the same comma-separated string a dash list
      // produces, so `tags: [a, b]` and a `tags:` block read alike from here.
      const inlineList = value.startsWith('[') && value.endsWith(']');
      if (inlineList) lists.add(lastKey);
      frontmatter[lastKey] = inlineList
        ? value
            .slice(1, -1)
            .split(',')
            .map(unquote)
            .filter((item) => item.length > 0)
            .join(', ')
        : unquote(value);
    } else if (lastKey && /^\s+-\s+/.test(line)) {
      const item = unquote(line.replace(/^\s+-\s+/, ''));
      lists.add(lastKey);
      frontmatter[lastKey] = frontmatter[lastKey] ? `${frontmatter[lastKey]}, ${item}` : item;
    }
  }
  return { frontmatter, lists, body };
}

export function guidanceTitle(guidance: string, fallback: string): string {
  const match = /^#\s+(.+)$/m.exec(toUnixNewlines(guidance));
  return match?.[1]?.trim() ?? fallback;
}

function stripInlineMarkdown(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(
      /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g,
      (_a, target: string, label?: string) => label ?? target,
    );
}

export function guidanceDescription(guidance: string): string {
  const lines = toUnixNewlines(guidance).split('\n');
  for (const line of lines) {
    if (line.startsWith('> ') && !line.startsWith('> [!')) {
      return stripInlineMarkdown(line.replace(/^>\s*/, '').trim());
    }
  }
  for (const line of lines) {
    const text = line.trim();
    if (text && !text.startsWith('#') && !text.startsWith('>')) return stripInlineMarkdown(text);
  }
  return '';
}

const WIKILINK = /\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\]/g;

/**
 * Code, where notation is characters and nothing else.
 *
 * A fenced block parses nothing inside it and a code span is where an author
 * writes notation without invoking it — both stated by the profile, in the
 * `code-fenced` and `code-span` entries of the profile. The rewrites below
 * run over the raw text BEFORE the parser sees it, so they are the one place
 * in this interface that has to know that on its own: every other reading of
 * the notation is a remark plugin, working on a tree where a code node is
 * already a code node.
 *
 * The indented form is deliberately NOT here, and the reason is the cost of
 * being wrong. Telling four spaces of code from four spaces of a nested list
 * item needs the block context only a parser has; guessing it wrong turns a
 * real link into text, and the same guess in the link extractor would drop a
 * real edge. A wikilink written inside an indented code block is therefore
 * still read, in both readers, and that is declared rather than discovered
 * (`architecture-guide.md` §11.1).
 */
const CODE = /```[\s\S]*?(?:\n```|$)|`[^`\n]*`/g;

/** The half-open ranges of `body` that are code. */
export function codeRegions(body: string): Array<[number, number]> {
  return [...body.matchAll(CODE)].map((match) => [
    match.index ?? 0,
    (match.index ?? 0) + match[0].length,
  ]);
}

/** Whether an offset falls inside one of them. */
export function insideCode(regions: Array<[number, number]>, at: number): boolean {
  return regions.some(([start, end]) => at >= start && at < end);
}

/**
 * A GFM table, which is the third place an embed cannot expand (profile §7.3).
 *
 * A cell holds inlines and never blocks (§4.1), so an embed of a note in a
 * cell is drawn as a link, the same answer the one-level rule and the embed
 * ceiling already give. What made this its own case is that the expansion is
 * decided on the raw string, by cutting the body into runs around each
 * `![[…]]`, and a cut inside a table row does not merely fail to expand: it
 * ends the run mid-row, so the parser that reads it has an unterminated table
 * and the closing pipe becomes a paragraph of its own.
 *
 * Detected here rather than in a plugin for the reason the code regions
 * already are: the split happens before anything is parsed, so this is the one
 * place in the interface that has to recognise the block on its own.
 *
 * A table is a line containing a pipe, followed by a delimiter row of dashes,
 * and it runs to the first blank line. The outer pipes are optional, which is
 * why the delimiter row is what identifies the block. A shape this misses
 * costs nothing new — it is the behaviour of before — so the pattern is
 * deliberately the conservative one.
 */
const DELIMITER_ROW = /^ {0,3}\|?[ \t]*:?-{1,}:?[ \t]*(\|[ \t]*:?-{1,}:?[ \t]*)*\|?[ \t]*$/;

export function tableRegions(body: string): Array<[number, number]> {
  const regions: Array<[number, number]> = [];
  const code = codeRegions(body);
  const lines = body.split('\n');
  const offsets: number[] = [];

  let at = 0;
  for (const line of lines) {
    offsets.push(at);
    at += line.length + 1;
  }

  for (let index = 0; index + 1 < lines.length; index++) {
    const header = lines[index] ?? '';
    const delimiter = lines[index + 1] ?? '';
    if (!header.includes('|') || !delimiter.includes('|')) continue;
    if (!DELIMITER_ROW.test(delimiter)) continue;
    if (insideCode(code, offsets[index] ?? 0)) continue;

    let last = index + 1;
    while (last + 1 < lines.length && (lines[last + 1] ?? '').trim().length > 0) last++;

    regions.push([offsets[index] ?? 0, (offsets[last] ?? 0) + (lines[last] ?? '').length]);
    index = last;
  }
  return regions;
}

/** Whether an offset falls inside one of them. */
export function insideTable(regions: Array<[number, number]>, at: number): boolean {
  return regions.some(([start, end]) => at >= start && at < end);
}

/** Runs a rewrite over everything except code, which is copied through. */
export function outsideCode(body: string, rewrite: (text: string) => string): string {
  let out = '';
  let cursor = 0;
  for (const [start, end] of codeRegions(body)) {
    out += rewrite(body.slice(cursor, start)) + body.slice(start, end);
    cursor = end;
  }
  return out + rewrite(body.slice(cursor));
}

// Replaces [[wikilinks]] with markdown links. Resolved targets point at the
// note route; unresolved ones become pending: links styled by the renderer.
export function resolveWikilinks(body: string, resolve: (title: string) => string | null): string {
  return outsideCode(body, (text) => resolveWikilinksIn(text, resolve));
}

/**
 * The target of a wikilink is a TITLE, and it is literal: nothing in it is
 * decoded, no extension is removed and no path segment is discarded
 * (RN-DSC-043). It used to be slugified here, which is what made a link differ
 * from its note over an accent or a capital.
 */
function resolveWikilinksIn(body: string, resolve: (title: string) => string | null): string {
  return body.replace(WIKILINK, (_all, target: string, label?: string) => {
    const clean = target.split('#')[0]?.trim().replace(/\\$/, '').trim() ?? '';
    const text = displayText(clean, label, target);
    if (!clean) return `[${text}](pending:)`;
    // The pipe is read by WHAT THE TARGET IS: a note takes the alias, an
    // attachment takes the dimensions, and a target that resolves to neither
    // takes the alias — because reading it as a dimension would discard text
    // an author wrote (RN-DSC-049).
    if (isAttachmentName(clean)) return `[${text}](attachment:${encodeURIComponent(clean)})`;
    const url = resolve(clean.normalize('NFC'));
    return url ? `[${text}](${url})` : `[${text}](pending:${encodeURIComponent(clean)})`;
  });
}

/**
 * What the link shows. The pipe of an attachment carries dimensions and is
 * never rendered as text, so what is left to show is the name of the file.
 */
function displayText(clean: string, label: string | undefined, target: string): string {
  if (clean && isAttachmentName(clean)) return clean;
  return (label ?? target).trim();
}

/** The longest a slug may be, on both sides. */
const MAX_SLUG_LENGTH = 80;

/**
 * The slug of a note, as the product derives it from the title (profile §5.3).
 *
 * **This is the second implementation of one rule**, and the first is
 * `packages/kernel/src/slug.ts`. It is duplicated because the frontend takes
 * types from `@memorysmith/contracts` and nothing else from the backend
 * (`architecture-guide.md` §5.1), and breaking that to share six lines would
 * drag the kernel into the browser bundle. The price of the duplication is
 * that it drifts in silence — it already did, which is #73 — so the two are
 * pinned to the **published conformance cases** rather than to each other.
 *
 * Two of the six steps were missing here, and both matter for exactly the
 * titles these vaults are full of:
 *
 * - A `.` or `,` **between two digits** belongs to the number and not to the
 *   words around it, so `Lei 14.133` is `lei-14133` and never `lei-14-133`.
 *   Without it the reading surface computed a slug the backend had never
 *   stored, failed to find the note, and drew a real edge as a pending link.
 * - The truncation, which decides the slug of any long title.
 */
export function slugify(name: string): string {
  return name
    .normalize('NFD')
    .replace(/(\d)[.,](\d)/g, '$1$2')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/g, '');
}

/**
 * The hosts a note asks the reader's browser to talk to (profile §7.10,
 * RN-DSC-040).
 *
 * An image whose destination names a host is a **request to that host**, made
 * when the note is opened, by whoever opens it — and the trigger was written
 * by whoever wrote the note, which is the same sentence §7.9 uses about raw
 * HTML. What travels with it is the reader's address, their user-agent and the
 * moment they read it.
 *
 * The profile admits three answers and forbids only silence: never fetching,
 * fetching on the reader's action, or fetching and saying so. This product
 * gives the third, so this is the half that says so. It is the image of §3.14
 * and nothing else: a diagram and a formula render locally, and a link —
 * bracketed, bare or autolinked — is a navigation the person initiates rather
 * than a request the page makes.
 *
 * Code is excluded, because an image written inside a fence is an example of
 * the notation and fetches nothing.
 */
const IMAGE_DESTINATION = /!\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g;

export function remoteImageHosts(body: string): string[] {
  const regions = codeRegions(body);
  const hosts = new Set<string>();

  for (const match of body.matchAll(IMAGE_DESTINATION)) {
    if (insideCode(regions, match.index ?? 0)) continue;

    const destination = (match[1] ?? '').trim();
    // A path, a relative target or an anchor names no host and asks nobody
    // for anything. Only a scheme or a leading `//` reaches outside.
    const authority = /^[a-z][a-z0-9+.-]*:\/\//i.test(destination)
      ? destination.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '')
      : destination.startsWith('//')
        ? destination.slice(2)
        : '';
    if (authority === '') continue;

    // The authority, minus any credentials, port and path: what a person needs
    // in order to recognise who they just talked to.
    const host = (authority.split('/')[0] ?? '').split('@').pop() ?? '';
    const named = host.split(':')[0] ?? '';
    if (named !== '') hosts.add(named.toLowerCase());
  }
  return [...hosts];
}
