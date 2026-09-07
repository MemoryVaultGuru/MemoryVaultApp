import {
  isValidElement,
  type AnchorHTMLAttributes,
  type HTMLAttributes,
  type ReactNode,
} from 'react';
import ReactMarkdown from 'react-markdown';
import { Link } from 'react-router-dom';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import {
  remarkBlockIds,
  remarkComments,
  remarkHighlight,
  remarkMathDollarRule,
} from '../api/remark-memorysmith-ring';
import { useTranslation } from 'react-i18next';
import { toUnixNewlines } from '../api/markdown';
import { followable } from '../api/address';
import { ordinalAt } from '../api/tasklist';
import { remarkCallouts } from '../api/remark-callouts';
import { toJsxRuntime } from 'hast-util-to-jsx-runtime';
import { Fragment, jsx, jsxs } from 'react/jsx-runtime';
import { highlightLanguage, highlightTree } from '../api/highlight';
import 'katex/dist/katex.min.css';
import { MermaidDiagram } from './MermaidDiagram';

interface MarkdownProps {
  children: string;
  /**
   * The text the ordinal of a task box is counted over. It has to be the text
   * the PARSER saw, because the offsets come from it — not the bytes a write
   * sends back, which are the original ones. Keeping the two aligned is the
   * caller's job, and `WritableContent` does it by refusing to enable the
   * boxes when the two disagree on how many there are.
   */
  source?: string;
  onToggleTask?: (ordinal: number) => void;
  writable?: boolean;
}

type LiProps = HTMLAttributes<HTMLLIElement> & { node?: unknown };

function MarkdownAnchor({ href, children, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement>) {
  const { t } = useTranslation();
  if (href?.startsWith('pending:')) {
    return (
      <span className="wikilink-pending" title={t('note.pendingLink')}>
        {children}
      </span>
    );
  }
  // Refused by `followable`: the text stays on the page and stops being
  // something to click. An author sees they got nothing, which is the same
  // answer the profile gives for a notation it does not implement.
  if (!href) {
    return (
      <span className="link-refused" title={t('note.refusedLink')}>
        {children}
      </span>
    );
  }
  if (href.startsWith('/')) {
    return (
      <Link className="wikilink" to={href}>
        {children}
      </Link>
    );
  }
  return (
    <a href={href} target="_blank" rel="noreferrer" {...rest}>
      {children}
    </a>
  );
}

/**
 * A code span, a fenced block, and the one info string with a rendering rule.
 *
 * The order of the three branches is the contract. `mermaid` is checked first
 * and reaches `MermaidDiagram` with its source untouched, because it is the
 * only info string the profile attaches a rendering rule to (§7.2) and a
 * highlighter in front of that check would swallow a diagram. A language the
 * highlighter carries is tokenised. Everything else — a code span, a fence
 * with no info string, a language nobody registered — renders exactly as it
 * did before highlighting existed, which is the pattern the profile sets for
 * the diagram it cannot draw and the formula it cannot typeset: show the
 * source, never hide it.
 *
 * The tokens arrive as ELEMENTS. `refractor` produces a hast tree and
 * `toJsxRuntime` builds React out of it, so no note-derived markup is ever
 * parsed as HTML — the boundary §7.9 draws, held at the one place a
 * highlighter would otherwise breach it.
 */
function MarkdownCode({ className, children, ...rest }: HTMLAttributes<HTMLElement>) {
  if (className?.includes('language-mermaid')) {
    return <MermaidDiagram code={String(children).trim()} />;
  }

  const language = highlightLanguage(className);
  if (language !== null) {
    // The source is read and never rewritten: what is on the page is the
    // bytes, split into spans. React-markdown hands the children of a fence as
    // a single string ending in the newline before the closing fence.
    const code = String(children).replace(/\n$/, '');
    return (
      <code className={className} {...rest}>
        {toJsxRuntime(highlightTree(code, language), { Fragment, jsx, jsxs })}
      </code>
    );
  }

  return (
    <code className={className} {...rest}>
      {children}
    </code>
  );
}

/** The hast element react-markdown hands a component, as much as is used. */
interface HastElement {
  readonly tagName?: string;
  readonly properties?: Record<string, unknown>;
  readonly children?: readonly HastElement[];
  readonly position?: { readonly start?: { readonly offset?: number } };
}

/**
 * Whether this list item is a task box, and how it is ticked.
 *
 * The state is read from the child `input` that GFM produces, and NOT from a
 * `checked` on the item itself: react-markdown 9 hands a component the **hast**
 * element, which carries no such property. Reading it there returned
 * `undefined` for every item, which sent every task box in the product down
 * the plain branch and onto the screen as GFM's own disabled checkbox — no
 * handler, no click, on any note.
 */
function taskState(node: HastElement | undefined): boolean | null {
  const box = node?.children?.find((child) => child.tagName === 'input');
  const checked = box?.properties?.['checked'];
  return typeof checked === 'boolean' ? checked : null;
}

/**
 * A list item that carries a task box. The ordinal comes from the position the
 * parser reports, mapped back to the n-th task of the source, which is what
 * lets a click become a one-character change in the original text.
 */
function TaskItem({
  node,
  children,
  className,
  source,
  toggleTask,
  writable,
  ...rest
}: LiProps & {
  source: string;
  toggleTask: ((ordinal: number) => void) | undefined;
  writable: boolean;
}) {
  const element = node as HastElement | undefined;
  const checked = taskState(element);
  if (checked === null) {
    return (
      <li className={className} {...rest}>
        {children}
      </li>
    );
  }

  const offset = element?.position?.start?.offset;
  const ordinal = offset === undefined ? -1 : ordinalAt(source, offset);
  const enabled = writable && toggleTask !== undefined && ordinal >= 0;

  return (
    // Our class comes LAST, because the one react-markdown passes in is on
    // `className` and spreading it after would silently take the item back.
    <li {...rest} className={`${className ?? ''} task-item`.trim()}>
      <input
        type="checkbox"
        checked={checked}
        disabled={!enabled}
        onChange={() => enabled && toggleTask(ordinal)}
      />
      {/* The box GFM already rendered is dropped: it is `disabled`, it answers
          to nothing, and two boxes in one item is worse than none. */}
      {dropBox(children)}
    </li>
  );
}

/**
 * The children of the item without the checkbox GFM put in front of them.
 *
 * It is matched by element type rather than by position, because a leading
 * space follows it and neither the space nor the order is part of any contract.
 */
function dropBox(children: ReactNode): ReactNode {
  if (!Array.isArray(children)) return children;
  return (children as ReactNode[]).filter(
    (child) => !(isValidElement(child) && child.type === 'input'),
  );
}
export function Markdown({ children, source, onToggleTask, writable = false }: MarkdownProps) {
  const text = toUnixNewlines(children);

  return (
    <div className="markdown">
      <ReactMarkdown
        remarkPlugins={[
          /**
           * `singleTilde: false` is a decision and not a default.
           *
           * GFM specifies strikethrough as `~~x~~`; GitHub also accepts a
           * single tilde, outside its own specification. Here that extension
           * actively misrenders the one notation the profile declares absent:
           * somebody writing `H~2~O` for a subscript would get `H` struck-out
           * `2` `O`, which is a worse answer than nothing. With it off the
           * characters stay on the page, and the author can see they got what
           * the profile says they get, which is nothing (profile 5.9).
           */
          [remarkGfm, { singleTilde: false }],
          remarkCallouts,
          remarkHighlight,
          remarkComments,
          remarkBlockIds,
          remarkMath,
          // After remark-math, and it gives back what was never a formula.
          remarkMathDollarRule,
        ]}
        // Raw HTML is NOT enabled, and its absence is the point: no
        // `rehype-raw` is loaded, so a note carrying `<script>` is text. It is
        // a security boundary rather than a rendering preference, because a
        // vault is written by several people and by agents (profile 5.10).
        rehypePlugins={[[rehypeKatex, { throwOnError: false }]]}
        // Which addresses this surface will follow, and the reason the stock
        // filter is not doing it, are in `address.ts` (RN-DSC-039).
        urlTransform={followable}
        components={{
          a: MarkdownAnchor,
          code: MarkdownCode,
          li: (props: LiProps) => (
            <TaskItem
              {...props}
              source={source ?? text}
              toggleTask={onToggleTask}
              writable={writable}
            />
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
