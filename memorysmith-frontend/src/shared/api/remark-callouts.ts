/**
 * Vault callouts, rendered as callouts.
 *
 * A callout is a blockquote whose first line is a type marker:
 *
 *     > [!warning] O que pode dar errado
 *     > O corpo do aviso.
 *
 * It is a vault convention and not universal Markdown, so nothing in the
 * backend knows about it (PP4). What used to happen here was a pass over the
 * string that swapped the marker for an emoji and left the blockquote behind,
 * which reads as a quotation with a picture in front of it. This turns it into
 * the element the vault editors draw, and the type travels to the DOM as an
 * attribute so the stylesheet can colour and ice it without a class per type.
 *
 * It is a remark plugin rather than another pass over the string because the
 * marker has to leave the tree the renderer walks, not the text the parser
 * reads: a `[!note]` inside a code fence is not a callout, and only the parser
 * can tell the difference.
 */

interface MdastNode {
  type: string;
  value?: string;
  children?: MdastNode[];
  data?: { hName?: string; hProperties?: Record<string, unknown> };
}

/** `[!type]`, an optional fold marker, and whatever titles it. */
const MARKER = /^\[!([A-Za-z][\w-]*)\][+-]?[ \t]*(.*)$/;

export function remarkCallouts() {
  return (tree: MdastNode): void => descend(tree);
}

function descend(node: MdastNode): void {
  for (const child of node.children ?? []) {
    if (child.type === 'blockquote') rewrite(child);
    descend(child);
  }
}

function rewrite(quote: MdastNode): void {
  const [head, ...blocks] = quote.children ?? [];
  if (head?.type !== 'paragraph') return;
  const [lead, ...inline] = head.children ?? [];
  if (lead?.type !== 'text' || typeof lead.value !== 'string') return;

  const broke = lead.value.indexOf('\n');
  const marker = MARKER.exec(broke === -1 ? lead.value : lead.value.slice(0, broke));
  if (!marker) return;

  const kind = (marker[1] ?? '').toLowerCase();
  const { title, body } = split(
    marker[2] ?? '',
    broke === -1 ? null : lead.value.slice(broke + 1),
    inline,
  );

  quote.data = {
    hName: 'div',
    hProperties: { className: ['callout'], 'data-callout': kind },
  };
  quote.children = [
    {
      type: 'paragraph',
      data: { hName: 'div', hProperties: { className: ['callout-title'] } },
      // An untitled callout is titled by its own type, as the editors do.
      children: title.length > 0 ? title : [{ type: 'text', value: capitalize(kind) }],
    },
    ...(body.length > 0 ? [{ type: 'paragraph', children: body }] : []),
    ...blocks,
  ];
}

/**
 * Cuts the first paragraph at its first line break: what comes before titles
 * the callout, what comes after opens its body. The break can fall inside any
 * of the inline nodes, because a title that carries emphasis makes the
 * paragraph three children and not one, so the split walks them instead of
 * assuming the title ends where the first text node does.
 */
function split(
  titled: string,
  after: string | null,
  inline: MdastNode[],
): { title: MdastNode[]; body: MdastNode[] } {
  const title: MdastNode[] = [{ type: 'text', value: titled }];
  const body: MdastNode[] = [];
  // The lead text already broke, so everything after it belongs to the body.
  let titling = after === null;
  if (after !== null) body.push({ type: 'text', value: after });

  for (const node of inline) {
    if (!titling) {
      body.push(node);
      continue;
    }
    const breakAt = node.type === 'text' ? (node.value ?? '').indexOf('\n') : -1;
    if (breakAt === -1) {
      title.push(node);
      continue;
    }
    title.push({ type: 'text', value: (node.value ?? '').slice(0, breakAt) });
    body.push({ type: 'text', value: (node.value ?? '').slice(breakAt + 1) });
    titling = false;
  }

  return { title: trimEdges(title), body: trimEdges(body) };
}

/** Drops the empty text nodes the cut leaves at either end. */
function trimEdges(nodes: MdastNode[]): MdastNode[] {
  const kept = [...nodes];
  while (kept.length > 0 && isBlank(kept[0])) kept.shift();
  while (kept.length > 0 && isBlank(kept[kept.length - 1])) kept.pop();
  return kept;
}

function isBlank(node: MdastNode | undefined): boolean {
  return node?.type === 'text' && (node.value ?? '').trim().length === 0;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
