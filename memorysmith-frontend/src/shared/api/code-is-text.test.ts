/**
 * Inside code, notation is characters.
 *
 * The reading surface reads the notation twice: once as a remark plugin, over
 * a tree where a code node is already a code node, and once as a rewrite of
 * the raw text, BEFORE the parser runs. The second one is `resolveWikilinks`
 * and the embed split, and it was rewriting inside code — so a note teaching
 * how to write a wikilink displayed `[Target](pending:Target)` where its
 * author had written `` `[[Target]]` ``, and the example taught the opposite
 * of what it said.
 *
 * The profile states it in the base ring: `code-span` is where an author
 * writes notation without invoking it, and a fenced block parses nothing
 * inside it. Both are asserted here, at the level where the rewrite happens,
 * because a rendering test only shows the first one that breaks.
 */

import { describe, expect, it } from 'vitest';
import { resolveWikilinks } from './markdown';
import { demoteEmbeds, splitEmbeds } from './transclusion';

const resolve = (title: string): string | null => (title === 'Target' ? '/v/a/target' : null);

describe('a wikilink written inside code stays written', () => {
  it('leaves a code span alone and resolves the same link outside it', () => {
    const out = resolveWikilinks('Write `[[Target]]` to reach [[Target]].', resolve);

    expect(out).toContain('`[[Target]]`');
    expect(out).toContain('[Target](/v/a/target)');
  });

  it('leaves a fenced block alone, resolved target or not', () => {
    const out = resolveWikilinks('```\n[[Target]] and [[Nobody]]\n```\n\n[[Target]]\n', resolve);

    expect(out).toContain('[[Target]] and [[Nobody]]');
    expect(out).toContain('[Target](/v/a/target)');
  });

  it('leaves an unterminated fence alone, which is what a note being written has', () => {
    const out = resolveWikilinks('Before [[Target]]\n\n```\n[[Target]]\n', resolve);

    expect(out).toContain('[Target](/v/a/target)');
    expect(out.slice(out.indexOf('```'))).toContain('[[Target]]');
  });

  it('reads a wikilink indented as code, and says so rather than guessing', () => {
    // Not a limitation to find later: telling four spaces of code from four
    // spaces of a nested list item needs a parser, and guessing it wrong turns
    // a real link into text. The link extractor makes the same choice.
    const out = resolveWikilinks('Prose.\n\n    [[Target]]\n', resolve);

    expect(out).toContain('[Target](/v/a/target)');
  });
});

describe('an embed written inside code is an example of one', () => {
  it('is not expanded into a transclusion', () => {
    const segments = splitEmbeds('Write `![[Target]]` to embed it.\n');

    expect(segments.every((segment) => segment.kind === 'text')).toBe(true);
    expect(segments.map((s) => (s.kind === 'text' ? s.text : '')).join('')).toContain(
      '`![[Target]]`',
    );
  });

  it('is not demoted to a wikilink either, inside a fence', () => {
    expect(demoteEmbeds('```\n![[Target]]\n```\n')).toContain('![[Target]]');
  });

  it('still expands the one written outside code, in the same body', () => {
    const segments = splitEmbeds('Write `![[Target]]`, and here it is:\n\n![[Target]]\n');

    expect(segments.filter((segment) => segment.kind === 'embed')).toHaveLength(1);
  });
});
