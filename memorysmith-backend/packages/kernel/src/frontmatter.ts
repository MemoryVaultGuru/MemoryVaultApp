/**
 * The frontmatter block, and the YAML subset the specification declares for it
 * (MemorySmith Markdown Specification §6.1 and §6.2).
 *
 * It lives in the kernel because two contexts read the same bytes: Knowledge
 * derives the title of a note on the write (§5.3), and Discovery classifies
 * every other key into facets (§6.3). Two readers of one block is the defect
 * this cycle is paying off in the shape of `slugify`, so there is exactly one
 * function in this repository that finds the frontmatter of a body.
 *
 * It reads the notation the specification declares and nothing else: no key is
 * special here, no vault convention is known, and nothing is validated. What a
 * value means belongs to the guidance, never to the backend (PP4).
 */

/** How the author wrote the value, which is what decides the kind (§6.3). */
export type FrontmatterForm = 'scalar' | 'list';

export interface FrontmatterEntry {
  readonly written: FrontmatterForm;
  readonly values: string[];
}

/** Every key of the block, by the name the author wrote. */
export type Frontmatter = Record<string, FrontmatterEntry>;

/**
 * The block itself, between the delimiters and without them, or `null` when
 * the document does not open with one. It has to begin on the very first line
 * (§6.1): a `---` further down is a thematic break.
 */
export function frontmatterBlock(markdown: string): string | null {
  if (!markdown.startsWith('---')) return null;
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(markdown);
  return match?.[1] ?? null;
}

/**
 * The body without its frontmatter.
 *
 * The block takes no part in the searchable text (§6.1) and no part in the
 * chain that reads the title, where the first level-1 heading is the one of
 * the body and never a `# ` written inside the block.
 */
export function bodyWithoutFrontmatter(markdown: string): string {
  const block = frontmatterBlock(markdown);
  if (block === null) return markdown;
  const closing = markdown.indexOf('---', markdown.indexOf('---') + 3);
  return markdown.slice(closing + 3).replace(/^\r?\n/, '');
}

/**
 * A deliberately small YAML reader: scalars, inline lists and dash lists, and
 * nothing else (§6.2). Nesting, anchors, multi-line scalars and typed tags are
 * outside the specification — they may be stored and nothing may be derived
 * from them — so reading more than this would be interpreting the vault.
 *
 * The written form travels out alongside the values, because flattening both
 * into an array is what made a list of one item indistinguishable from a
 * scalar, and those are not the same attribute.
 */
export function parseFrontmatter(block: string): Frontmatter {
  const entries: Record<string, FrontmatterEntry> = {};
  let currentKey: string | null = null;

  for (const line of block.split(/\r?\n/)) {
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

/** The frontmatter of a document, read in one step. */
export function frontmatterOf(markdown: string): Frontmatter {
  const block = frontmatterBlock(markdown);
  return block === null ? {} : parseFrontmatter(block);
}

/** One layer of matching quotes is stripped, and one only (§6.2). */
function unquote(value: string): string {
  return value.replace(/^["']|["']$/g, '').trim();
}
