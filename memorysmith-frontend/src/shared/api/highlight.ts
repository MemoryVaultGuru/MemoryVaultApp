/**
 * Syntax highlighting for a fenced block that names its language.
 *
 * **This is presentation and nothing else.** The profile attaches a rendering
 * rule to exactly one info string, `mermaid`, and says of every other one only
 * that it names the language by convention. So highlighting is a product
 * decision rather than a conformance obligation — §8 is explicit that an
 * implementation MAY render an undescribed form however it likes — and the
 * four rules below are the ones the profile *does* impose on anything sitting
 * this close to the body of a note.
 *
 * **The bytes never change.** Highlighting is display. §7.6 sets the principle
 * for comments — the bytes stay in the file and a tool that returns the note
 * returns them — and §7.11 states it as behaviour, where a task toggle writes
 * back exactly the one character that changed. Nothing here touches the
 * source: the tokens are read from it and the string is not rewritten.
 *
 * **An unknown language renders as plain code, never as nothing.** The profile
 * sets that pattern twice, for the diagram it cannot draw (§7.2) and for the
 * mathematics it cannot typeset (§7.8): show the source, never hide it. A
 * language `refractor` does not carry falls through to exactly what was
 * rendered before this existed.
 *
 * **`mermaid` keeps its branch**, and it is checked before this is reached. It
 * is the one info string with a rendering rule, and a highlighter installed in
 * front of that check would swallow a diagram.
 *
 * **The markup arrives as elements and never as an HTML string.** §7.9 refuses
 * raw HTML as a security boundary — a vault is written by several people and
 * by agents, and a page that renders arbitrary HTML out of one is a script
 * injection whose trigger is written by whoever wrote the note. A highlighter
 * returning HTML to be injected reopens that door with the note body as its
 * input. `refractor` produces a hast tree, which is converted to React
 * elements, so nothing is ever parsed as markup.
 *
 * **The languages are enumerated rather than bundled.** Prism carries close to
 * three hundred grammars and a knowledge vault writes in a handful. The list
 * is what a vault of this product plausibly holds — the languages of its own
 * repository, the two query languages, the three configuration formats and the
 * two shells — and adding one is a line, which is the point: a bundle nobody
 * chose is a bundle nobody can defend.
 */

import { refractor } from 'refractor/core';
import type { Root } from 'hast';
import bash from 'refractor/bash';
import css from 'refractor/css';
import diff from 'refractor/diff';
import graphql from 'refractor/graphql';
import ini from 'refractor/ini';
import java from 'refractor/java';
import javascript from 'refractor/javascript';
import json from 'refractor/json';
import markdown from 'refractor/markdown';
import python from 'refractor/python';
import sql from 'refractor/sql';
import toml from 'refractor/toml';
import tsx from 'refractor/tsx';
import typescript from 'refractor/typescript';
import yaml from 'refractor/yaml';

for (const language of [
  bash,
  css,
  diff,
  graphql,
  ini,
  java,
  javascript,
  json,
  markdown,
  python,
  sql,
  toml,
  tsx,
  typescript,
  yaml,
]) {
  refractor.register(language);
}

/**
 * The language of a fenced block, from the class react-markdown puts on it.
 *
 * `null` for a block with no info string, for one whose language is not
 * carried, and for `mermaid` — which never reaches here, and is refused
 * explicitly so that a future caller cannot make it.
 */
export function highlightLanguage(className: string | undefined): string | null {
  const match = /(?:^|\s)language-([A-Za-z0-9#+._-]+)/.exec(className ?? '');
  const named = match?.[1]?.toLowerCase();
  if (!named || named === 'mermaid') return null;
  return refractor.registered(named) ? named : null;
}

/** The tokens of `code` in `language`, as a hast tree. Never an HTML string. */
export function highlightTree(code: string, language: string): Root {
  return refractor.highlight(code, language);
}
