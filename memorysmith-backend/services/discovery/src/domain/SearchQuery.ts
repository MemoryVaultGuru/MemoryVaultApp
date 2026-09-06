/**
 * The search query language (software-vision.md, section 10.2).
 *
 * Pure domain: it parses text into a tree and evaluates that tree against a
 * candidate. It knows nothing about DynamoDB, about how a note is stored or
 * about where the content came from, which is what lets the whole language be
 * tested without infrastructure.
 *
 * The shape follows what people already know from a Markdown vault:
 *
 *   lei 14133            every bare term must match (implicit AND)
 *   "lei 14.133"         a quoted phrase matches as one literal string
 *   -rascunho            a leading dash negates
 *   a OR b               either side
 *   (a OR b) c           parentheses group
 *   title:auditoria      match the note title only
 *   folder:normas        match the folder name only
 *   content:prazo        match the body only
 *   section:vigencia     match a heading of the note
 *   maturity:evergreen   match a FACET, whatever the vault happens to call it
 *
 * The field list is deliberately NOT closed. `title`, `folder`, `content` and
 * `section` are the four the backend knows how to answer by itself; anything
 * else is looked up as a facet, so a vault that writes `norma: federal` in its
 * frontmatter gets `norma:federal` as a filter without a line of code being
 * written for it (PP4, RN-DSC-020). The ubiquitous language of the vault is
 * the query language.
 *
 * Matching is by SUBSTRING over a normalized form, not by token. That is what
 * makes a word invented inside one note findable by typing part of it, and it
 * is the behaviour a vault user expects from every other tool they use.
 */

/** The four fields the backend answers from its own projections. */
export const STRUCTURAL_FIELDS = ['title', 'folder', 'content', 'section'] as const;
export type StructuralField = (typeof STRUCTURAL_FIELDS)[number];

export type QueryNode =
  | { readonly kind: 'term'; readonly field: StructuralField | null; readonly value: string }
  | { readonly kind: 'facet'; readonly facet: string; readonly value: string }
  | { readonly kind: 'not'; readonly node: QueryNode }
  | { readonly kind: 'and'; readonly nodes: QueryNode[] }
  | { readonly kind: 'or'; readonly nodes: QueryNode[] };

/** What a candidate note offers the evaluator. All of it already normalized. */
export interface Candidate {
  readonly title: string;
  readonly folder: string;
  readonly content: string;
  readonly sections: string[];
  /**
   * The other spellings of the title, from the reserved `aliases`
   * (RN-DSC-032). They are searched wherever the title is, because that is
   * what an alias is: a vault of technical terms lives on acronyms, and
   * requiring the full title in every search is what makes people stop
   * finding things. They do NOT resolve wikilinks — that is a different
   * question, decided in the negative, and it stays that way.
   */
  readonly aliases: string[];
  /** facet name to its values, as the FACET projection holds them. */
  readonly facets: Record<string, string[]>;
  /**
   * The kind of each facet, as the extractor classified it. Only `date` is
   * consulted, and only to match by prefix instead of by substring
   * (RN-DSC-031). A missing entry means an unknown kind, which matches the
   * old way: a projection written before the kind was carried keeps working.
   */
  readonly facetKinds: Record<string, string>;
}

export class QuerySyntaxError extends Error {}

/**
 * Normalization is the whole difference between a search that finds and one
 * that almost finds: case folded, diacritics stripped. `Vigência` and
 * `vigencia` are the same word to someone typing in a hurry, and a vault in
 * Portuguese makes that the common case rather than the exception.
 *
 * It is done character by character, and every character contributes exactly
 * as many units as it occupied, so a position in the normalized text is the
 * same position in the original. That is what lets the excerpt be cut from the
 * text the author actually wrote: a naive `NFD` over the whole string shifts
 * every offset after the first accent, and the reader would get a passage
 * sliced a few characters off, or lowercased and unaccented prose nobody typed.
 */
export function normalize(raw: string): string {
  let out = '';
  for (const character of raw) {
    const folded = character.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
    out += folded.length === character.length ? folded : character.toLowerCase();
  }
  return out;
}

// ---------------------------------------------------------------------------
// Tokenizer
// ---------------------------------------------------------------------------

type Token =
  | { kind: 'word'; value: string; quoted: boolean }
  | { kind: 'or' }
  | { kind: 'not' }
  | { kind: 'open' }
  | { kind: 'close' };

const MAX_QUERY_LENGTH = 500;

function tokenize(raw: string): Token[] {
  if (raw.length > MAX_QUERY_LENGTH) {
    throw new QuerySyntaxError(`A query is limited to ${MAX_QUERY_LENGTH} characters`);
  }

  const tokens: Token[] = [];
  let index = 0;

  while (index < raw.length) {
    const char = raw[index] as string;

    if (/\s/.test(char)) {
      index++;
      continue;
    }

    if (char === '(') {
      tokens.push({ kind: 'open' });
      index++;
      continue;
    }

    if (char === ')') {
      tokens.push({ kind: 'close' });
      index++;
      continue;
    }

    /**
     * A dash negates only where a term can start, which is decided by the
     * character before it and not by the previous token: `lei -rascunho` has a
     * space in front of the dash and negates, while `lei-14133` does not, or
     * every slug someone types would parse as a negation of half a word.
     */
    if (char === '-' && startsTermAt(raw, index)) {
      tokens.push({ kind: 'not' });
      index++;
      continue;
    }

    if (char === '"') {
      const end = raw.indexOf('"', index + 1);
      if (end === -1) throw new QuerySyntaxError('A quoted phrase was never closed');
      tokens.push({ kind: 'word', value: raw.slice(index + 1, end), quoted: true });
      index = end + 1;
      continue;
    }

    /**
     * A bare word runs to whitespace or to a parenthesis. A quote inside it
     * ends it too, so `title:"lei 14.133"` keeps the prefix and reads the
     * phrase as one value.
     */
    let end = index;
    while (end < raw.length && !/[\s()"]/.test(raw[end] as string)) end++;

    let value = raw.slice(index, end);
    index = end;

    if (raw[index] === '"' && value.endsWith(':')) {
      const close = raw.indexOf('"', index + 1);
      if (close === -1) throw new QuerySyntaxError('A quoted phrase was never closed');
      value += raw.slice(index + 1, close);
      index = close + 1;
      tokens.push({ kind: 'word', value, quoted: true });
      continue;
    }

    if (value === 'OR') {
      tokens.push({ kind: 'or' });
      continue;
    }

    tokens.push({ kind: 'word', value, quoted: false });
  }

  return tokens;
}

function startsTermAt(raw: string, index: number): boolean {
  if (index === 0) return true;
  const previous = raw[index - 1] as string;
  return /[\s(]/.test(previous);
}

// ---------------------------------------------------------------------------
// Parser: OR binds loosest, then implicit AND, then NOT, then a term.
// ---------------------------------------------------------------------------

export function parseQuery(raw: string): QueryNode {
  const tokens = tokenize(raw);
  if (tokens.length === 0) throw new QuerySyntaxError('A search needs a query');

  let position = 0;

  const peek = (): Token | undefined => tokens[position];

  function parseOr(): QueryNode {
    const nodes = [parseAnd()];
    while (peek()?.kind === 'or') {
      position++;
      nodes.push(parseAnd());
    }
    return nodes.length === 1 ? (nodes[0] as QueryNode) : { kind: 'or', nodes };
  }

  function parseAnd(): QueryNode {
    const nodes: QueryNode[] = [];
    while (position < tokens.length) {
      const token = peek();
      if (!token || token.kind === 'or' || token.kind === 'close') break;
      nodes.push(parseNot());
    }
    if (nodes.length === 0) throw new QuerySyntaxError('An operator is missing its term');
    return nodes.length === 1 ? (nodes[0] as QueryNode) : { kind: 'and', nodes };
  }

  function parseNot(): QueryNode {
    if (peek()?.kind === 'not') {
      position++;
      return { kind: 'not', node: parseNot() };
    }
    return parseAtom();
  }

  function parseAtom(): QueryNode {
    const token = peek();
    if (!token) throw new QuerySyntaxError('An operator is missing its term');

    if (token.kind === 'open') {
      position++;
      const inner = parseOr();
      if (peek()?.kind !== 'close') throw new QuerySyntaxError('A group was never closed');
      position++;
      return inner;
    }

    if (token.kind !== 'word') throw new QuerySyntaxError('An operator is missing its term');
    position++;
    return termOf(token);
  }

  const tree = parseOr();
  if (position < tokens.length) throw new QuerySyntaxError('A group was closed but never opened');
  return tree;
}

function termOf(token: Extract<Token, { kind: 'word' }>): QueryNode {
  /**
   * A colon only introduces a field when it is not the first character and
   * something follows it. `:` alone, or a value that starts with one, is just
   * text someone typed.
   */
  const colon = token.value.indexOf(':');
  if (colon > 0 && colon < token.value.length - 1) {
    const field = normalize(token.value.slice(0, colon));
    const value = normalize(token.value.slice(colon + 1));
    if ((STRUCTURAL_FIELDS as readonly string[]).includes(field)) {
      return { kind: 'term', field: field as StructuralField, value };
    }
    return { kind: 'facet', facet: field, value };
  }

  const value = normalize(token.value);
  if (value.length === 0) throw new QuerySyntaxError('A search needs a query');
  return { kind: 'term', field: null, value };
}

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------

/**
 * A bare term looks in the title, the folder, the headings and the body, which
 * is what someone means when they type a word and nothing else. A term with a
 * field looks only there.
 */
export function matches(node: QueryNode, candidate: Candidate): boolean {
  switch (node.kind) {
    case 'and':
      return node.nodes.every((each) => matches(each, candidate));
    case 'or':
      return node.nodes.some((each) => matches(each, candidate));
    case 'not':
      return !matches(node.node, candidate);
    case 'facet': {
      const values = candidate.facets[node.facet] ?? [];
      // A date is matched by PREFIX and never by substring (RN-DSC-031).
      // Values are canonicalised to `YYYY-MM-DD`, so a prefix is exactly the
      // granularity somebody asked for: `2026`, `2026-09`, `2026-09-03`.
      // Substring made `created:09` mean September and also the year 2009,
      // which is not a question anybody asked.
      if (candidate.facetKinds[node.facet] === 'date') {
        return values.some((value) => value.startsWith(node.value));
      }
      return values.some((value) => value.includes(node.value));
    }
    case 'term': {
      // An alias is another name for the note, so it answers wherever the
      // title does: under `title:` and under a bare term.
      const named = (needle: string): boolean =>
        candidate.title.includes(needle) ||
        candidate.aliases.some((alias) => alias.includes(needle));

      if (node.field === 'title') return named(node.value);
      if (node.field === 'folder') return candidate.folder.includes(node.value);
      if (node.field === 'content') return candidate.content.includes(node.value);
      if (node.field === 'section') {
        return candidate.sections.some((section) => section.includes(node.value));
      }
      return (
        named(node.value) ||
        candidate.folder.includes(node.value) ||
        candidate.content.includes(node.value) ||
        candidate.sections.some((section) => section.includes(node.value))
      );
    }
  }
}

/**
 * Ranking, deliberately simple and explainable: a hit in the title outweighs a
 * hit in a heading, which outweighs a hit in the body. Nobody has to guess why
 * a note came first, and there is no tuned weight to maintain.
 */
export function score(node: QueryNode, candidate: Candidate): number {
  const terms = positiveTerms(node);
  if (terms.length === 0) return 1;

  let total = 0;
  for (const term of terms) {
    if (term.kind === 'facet') {
      total += 2;
      continue;
    }
    // An alias ranks as the title does, because it is one: a note found by
    // `RTO` should not sort below one that merely mentions it in a paragraph.
    if (candidate.title === term.value || candidate.aliases.includes(term.value)) total += 10;
    else if (
      candidate.title.includes(term.value) ||
      candidate.aliases.some((alias) => alias.includes(term.value))
    )
      total += 5;
    else if (candidate.sections.some((section) => section.includes(term.value))) total += 3;
    else if (candidate.folder.includes(term.value)) total += 2;
    else if (candidate.content.includes(term.value)) total += 1;
  }
  return total / terms.length;
}

/** Negations and the branches under them do not contribute to the score. */
function positiveTerms(node: QueryNode): Array<Extract<QueryNode, { kind: 'term' | 'facet' }>> {
  switch (node.kind) {
    case 'not':
      return [];
    case 'and':
    case 'or':
      return node.nodes.flatMap(positiveTerms);
    default:
      return [node];
  }
}

/**
 * The passage around the first match, so the caller can decide with the source
 * in sight (RN-DSC-010).
 *
 * The term is located in the normalized text and the passage is cut from the
 * original, which `normalize` makes safe by preserving positions. It cuts on a
 * word boundary, because a snippet that starts mid-word reads as corruption.
 */
export function excerptAround(
  original: string,
  normalized: string,
  needle: string,
  width = 160,
): string {
  const at = normalized.indexOf(needle);
  if (at === -1) return original.slice(0, width).trim();

  const half = Math.floor((width - needle.length) / 2);
  let start = Math.max(0, at - half);
  let end = Math.min(original.length, at + needle.length + half);

  if (start > 0) {
    const space = original.indexOf(' ', start);
    if (space !== -1 && space < at) start = space + 1;
  }
  if (end < original.length) {
    const space = original.lastIndexOf(' ', end);
    if (space > at + needle.length) end = space;
  }

  return `${start > 0 ? '…' : ''}${original.slice(start, end).trim()}${end < original.length ? '…' : ''}`;
}

/** The first positive term, which is the one an excerpt should be cut around. */
export function firstTerm(node: QueryNode): string | null {
  const terms = positiveTerms(node);
  const term = terms.find((each) => each.kind === 'term');
  return term ? term.value : null;
}
