/**
 * The rest of the vault ring, on the reading surface: marked text, comments
 * and block identifiers (profile §5.5, §5.6, §5.7).
 *
 * All three are remark plugins rather than passes over the string, for the
 * reason `remark-callouts.ts` already gives: a `==` inside a code fence is not
 * a highlight, and only the parser can tell the difference. Rewriting the text
 * before it is parsed is how a notation starts firing inside examples.
 *
 * None of them touches the bytes. The reading surface is a rendering of the
 * note and never a rewriting of it, so what a tool returns and what an export
 * writes are unaffected by everything here — which is the whole of what makes
 * `%%comment%%` an asymmetry that has to be declared rather than a deletion.
 */

interface MdastNode {
  type: string;
  value?: string;
  children?: MdastNode[];
  data?: { hName?: string; hProperties?: Record<string, unknown> };
}

/** Walks every node, letting the visitor rewrite a parent's children. */
function walk(node: MdastNode, visit: (parent: MdastNode) => void): void {
  if (!node.children) return;
  visit(node);
  for (const child of node.children) walk(child, visit);
}

/** Text nodes carry the raw characters; nothing else is rewritten. */
function isText(node: MdastNode): boolean {
  return node.type === 'text';
}

/**
 * `==highlight==` becomes marked text (§5.5).
 *
 * It carries no meaning beyond emphasis: no edge, no attribute, no index
 * entry. The `==` never reaches the screen.
 */
const HIGHLIGHT = /==([^=]+)==/g;

export function remarkHighlight() {
  return (tree: MdastNode): void =>
    walk(tree, (parent) => {
      parent.children = (parent.children ?? []).flatMap((child) => {
        if (!isText(child) || !child.value?.includes('==')) return [child];
        return split(child.value, HIGHLIGHT, (inner) => ({
          type: 'emphasis',
          data: { hName: 'mark' },
          children: [{ type: 'text', value: inner }],
        }));
      });
    });
}

/**
 * `%%comment%%` leaves the page and stays in the file (§5.6).
 *
 * The asymmetry is the decision and it is declared, not discovered: the bytes
 * are untouched, so `read_note` returns the comment and the export writes it,
 * and an agent therefore sees what a person on the page does not. Text the
 * author did not want *read on the page* is still text the author wrote, and
 * deleting bytes to make a page tidier is not something this product does.
 */
const COMMENT = /%%([\s\S]*?)%%/g;

export function remarkComments() {
  return (tree: MdastNode): void =>
    walk(tree, (parent) => {
      parent.children = (parent.children ?? []).flatMap((child) => {
        if (!isText(child) || !child.value?.includes('%%')) return [child];
        const stripped = child.value.replace(COMMENT, '');
        // A paragraph that was nothing but a comment leaves no empty node
        // behind, or the page grows a blank line where nothing was written.
        return stripped.length === 0 ? [] : [{ ...child, value: stripped }];
      });
    });
}

/**
 * `^identifier` at the end of a block names that block (§5.7), and is never
 * rendered as text. What it names is resolved by the embed, not here: this
 * plugin only keeps the marker off the page.
 */
const BLOCK_ID = /[ \t]*\^([A-Za-z0-9-]+)[ \t]*$/;

export function remarkBlockIds() {
  return (tree: MdastNode): void =>
    walk(tree, (parent) => {
      const children = parent.children ?? [];
      const last = children[children.length - 1];
      if (!last || !isText(last) || !last.value?.includes('^')) return;
      const stripped = last.value.replace(BLOCK_ID, '');
      if (stripped === last.value) return;
      if (stripped.length === 0) children.pop();
      else last.value = stripped;
    });
}

interface Positioned extends MdastNode {
  position?: { start?: { offset?: number }; end?: { offset?: number } };
}

/**
 * The `$` that is not math (profile §5.8).
 *
 * `remark-math` opens a formula at any `$` and closes it at the next one, so
 * **two prices in one paragraph become a formula**: `costs $30 a month, and
 * the plan $60` renders `30 a month, and the plan` as mathematics. That is not
 * an exotic case, it is a sentence somebody writes on an ordinary day.
 *
 * The profile states the rule that prevents it: a `$` followed by whitespace
 * does not open, and one preceded by whitespace does not close. This runs
 * after `remark-math` and gives back to the text any inline formula that
 * breaks it, using the source the parser read — the delimiters are gone from
 * the node, and the position is what still knows where they were.
 *
 * Block math (`$$…$$`) is untouched: its delimiters are unambiguous.
 */
export function remarkMathDollarRule() {
  return (tree: MdastNode, file: { value?: unknown }): void => {
    const source = typeof file.value === 'string' ? file.value : String(file.value ?? '');
    if (source.length === 0) return;

    walk(tree, (parent) => {
      parent.children = (parent.children ?? []).map((child) => {
        if (child.type !== 'inlineMath') return child;

        const { start, end } = (child as Positioned).position ?? {};
        if (start?.offset === undefined || end?.offset === undefined) return child;

        const raw = source.slice(start.offset, end.offset);
        const inner = raw.replace(/^\$+/, '').replace(/\$+$/, '');
        if (inner.length > 0 && !/^\s/.test(inner) && !/\s$/.test(inner)) return child;

        // Not a formula after all: the characters go back on the page exactly
        // as they were typed, which is what somebody writing a price meant.
        return { type: 'text', value: raw };
      });
    });
  };
}

/** Cuts a text node on a pattern, keeping the parts between the matches. */
function split(value: string, pattern: RegExp, make: (inner: string) => MdastNode): MdastNode[] {
  const parts: MdastNode[] = [];
  let cursor = 0;
  pattern.lastIndex = 0;

  for (const match of value.matchAll(pattern)) {
    const at = match.index ?? 0;
    if (at > cursor) parts.push({ type: 'text', value: value.slice(cursor, at) });
    parts.push(make(match[1] ?? ''));
    cursor = at + match[0].length;
  }
  if (parts.length === 0) return [{ type: 'text', value }];
  if (cursor < value.length) parts.push({ type: 'text', value: value.slice(cursor) });
  return parts;
}
