/**
 * The two vaults that show the profile working.
 *
 * A conformance suite proves the notation is read; a skill teaches it. Neither
 * can be read by a person deciding whether to bring their knowledge here, and
 * neither shows the notation doing its work — a callout that is drawn, a
 * wikilink that resolves, an embed that expands, a facet that filters.
 * `deploy-aws/vaults/continuity-engineering` and `.../enologia` do, and they
 * are the only artefact of the profile that is documentation, demonstration
 * and fixture at once.
 *
 * **They are the first thing to age when a notation changes**, and they age
 * while teaching the wrong version to precisely the person who is learning.
 * That is what this test is for, and it asserts both directions:
 *
 * 1. every entry of the declared notation appears in **each** vault, so a
 *    notation cannot be added to the profile and demonstrated nowhere;
 * 2. neither vault demonstrates a notation the profile does **not** declare,
 *    so they cannot teach a reader something this product will not do.
 *
 * **The first direction is asked of everything outside the `base` ring, and
 * that is a decision, not a filter.** Profile v0.3.0 restated CommonMark and
 * GFM inside `profile.json`, so the declared notation went from 31 entries to
 * 54, and 20 of the new ones are the base ring. Demanding those here would
 * force a setext heading, an indented code block and a link reference
 * definition into prose that has no use for any of them — which is the list
 * of specimens these vaults were written to not be. CommonMark is the floor
 * every renderer already stands on; what a reader cannot learn anywhere else
 * is what this profile adds on top of it, and that is what these vaults owe.
 * GFM stays in: a table, a struck word and a bare address are not universal,
 * and each of the three carries a crossing of its own — a wikilink inside a
 * table cell is an edge, a bare address never is.
 *
 * The prose is written by hand, because a generated vault teaches nothing.
 * This is what keeps it honest.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { RECOGNISED_NOTATION } from '../src/markdown.js';

/**
 * What the vaults owe: everything the profile adds to the two specifications
 * it inherits. The reason is in the preamble, and it is written as a filter on
 * the ring so that a notation added to `memorysmith` or to `extended` is
 * demanded here the day it is declared, with no list to remember to update.
 */
const DEMANDED = RECOGNISED_NOTATION.filter((entry) => entry.ring !== 'base');

const VAULTS = resolve(
  fileURLToPath(import.meta.url),
  '..',
  '..',
  '..',
  '..',
  '..',
  'deploy-aws',
  'vaults',
);

/** The two, named: en-US and pt-BR, and not translations of each other. */
const DEMONSTRATION = ['continuity-engineering', 'enologia'] as const;

interface Note {
  readonly path: string;
  readonly head: string;
  readonly body: string;
  readonly raw: string;
}

function notesOf(slug: string): Note[] {
  const found: Note[] = [];

  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (!entry.endsWith('.md')) continue;
      // GUIDANCE, STRUCTURE and TEMPLATE are generated from the model; the
      // notation is demonstrated in the notes somebody wrote.
      if (['GUIDANCE.md', 'STRUCTURE.md', 'TEMPLATE.md'].includes(entry)) continue;

      const raw = readFileSync(full, 'utf8').replace(/\r\n/g, '\n');
      const cut = raw.startsWith('---') ? raw.indexOf('\n---', 3) : -1;
      found.push({
        path: full,
        head: cut === -1 ? '' : raw.slice(4, cut),
        body: cut === -1 ? raw : raw.slice(cut + 4),
        raw,
      });
    }
  };

  walk(join(VAULTS, slug));
  return found;
}

/** Every note title of the vault, to tell a resolved link from a pending one. */
function titlesOf(notes: Note[]): Set<string> {
  return new Set(
    notes.map((note) => /^title:\s*(.+)$/m.exec(note.head)?.[1]?.trim() ?? '').filter(Boolean),
  );
}

/** Whether any note of the vault demonstrates the notation of this id. */
type Detector = (notes: Note[]) => boolean;

const inBody =
  (pattern: RegExp): Detector =>
  (notes) =>
    notes.some((note) => pattern.test(note.body));

const inHead =
  (pattern: RegExp): Detector =>
  (notes) =>
    notes.some((note) => pattern.test(note.head));

const DETECTS: Record<string, Detector> = {
  wikilink: inBody(/(^|[^!\]])\[\[[^\]|#]+\]\]/m),
  'wikilink-alias': inBody(/\[\[[^\]]+\|[^\]]+\]\]/),
  'wikilink-anchor': inBody(/(^|[^!])\[\[[^\]]+#(?!\^)[^\]]+\]\]/m),
  embed: inBody(/!\[\[[^\]#|]+\]\]/),
  'block-embed': inBody(/!\[\[[^\]]+#\^[^\]]+\]\]/),
  'markdown-relative-link': inBody(/\[[^\]]+\]\((?!https?:)[^)]*\.md\)/),
  'external-link': inBody(/\[[^\]]+\]\(https?:\/\//),
  'link-in-code': inBody(/`[^`\n]*\[\[[^`\n]*`/),
  'frontmatter-enum': inHead(/^maturity:\s*\w+$/m),
  'frontmatter-list': inHead(/^tags:\s*\[[^\]]+\]$/m),
  'frontmatter-boolean': inHead(/^reviewed:\s*(true|false)$/m),
  // A date attribute the vault invented, not one of the reserved two.
  'frontmatter-date': inHead(/^(?!created|updated)[a-z_]+:\s*\d{4}-\d{2}-\d{2}$/m),
  'frontmatter-aliases': inHead(/^aliases:\s*\[[^\]]+\]$/m),
  'frontmatter-tags': inHead(/^tags:\s*\[/m),
  'frontmatter-created': inHead(/^created:\s*\d{4}-\d{2}-\d{2}$/m),
  'frontmatter-updated': inHead(/^updated:\s*\d{4}-\d{2}-\d{2}$/m),
  'frontmatter-title': inHead(/^title:\s*\S/m),
  'frontmatter-prose': inHead(/^[a-z_]+:\s*.{41,}$/m),
  'inline-tag': inBody(/(^|\s)#[a-z][a-z-]{2,}/m),
  callout: inBody(/^>\s*\[![a-z]+\]/m),
  mermaid: inBody(/^```mermaid$/m),
  transclusion: inBody(/!\[\[/),
  'pending-link-display': (notes) => {
    const titles = titlesOf(notes);
    return notes.some((note) =>
      [...note.body.matchAll(/(^|[^!])\[\[([^\]|#]+)/gm)].some(
        (match) => !titles.has((match[2] ?? '').trim()),
      ),
    );
  },
  'task-list': inBody(/^- \[[ xX]\] /m),
  highlight: inBody(/==[^=\n]+==/),
  comment: inBody(/%%[\s\S]*?%%/),
  'block-id': inBody(/[ \t]\^[a-z0-9-]+$/m),
  'math-inline': inBody(/(^|[^$])\$[^$\n]+\$([^$]|$)/m),
  'math-block': inBody(/^\$\$/m),
  'sub-sup': inBody(/~[^~\s]+~|\^[^\s^]+\^/),
  'raw-html': inBody(/<[a-z]+[\s>]/),
  // A table with a wikilink in a cell, which is the crossing worth showing: a
  // cell is a place text lives and not a boundary the extractor stops at.
  table: inBody(/^\|.*\[\[.*\|/m),
  strikethrough: inBody(/~~[^~\n]+~~/),
  // Bare, without the angle brackets. External either way, and never an edge.
  'autolink-extended': inBody(/(^|[^(<\]])https?:\/\//m),
};

/**
 * Notations that exist in the ecosystem and are NOT in this profile. A vault
 * carrying one of them would be teaching a reader something this product does
 * not do, which is the failure the second direction of this test guards.
 */
const UNDECLARED: Record<string, RegExp> = {
  'a dataview or query block': /^```(dataview|dataviewjs|query|tasks)$/m,
  'a footnote reference': /\[\^[A-Za-z0-9-]+\]/,
  'a templater expression': /<%[\s\S]*?%>/,
  'a handlebars placeholder': /\{\{[^}\n]+\}\}/,
  'an inline field, Dataview style': /^\s*[A-Za-z][A-Za-z ]*::\s*\S/m,
};

describe.each(DEMONSTRATION)('%s demonstrates the whole declared notation', (slug) => {
  const notes = notesOf(slug);

  it('is a vault somebody wrote, with notes in it', () => {
    expect(notes.length).toBeGreaterThan(2);
  });

  it.each(DEMANDED.map((entry) => entry.id))('shows %s in context', (id) => {
    const detect = DETECTS[id];
    // A declared notation with no detector here is a failure of this test and
    // not a gap to find later: the profile cannot grow an entry these vaults
    // are silently not demonstrating.
    expect(detect, `no detector written for the notation "${id}"`).toBeDefined();
    expect(detect?.(notes), `"${id}" is declared and appears nowhere in ${slug}`).toBe(true);
  });

  it.each(Object.entries(UNDECLARED))('demonstrates no %s', (_name, pattern) => {
    const offending = notes.filter((note) => pattern.test(note.body));
    expect(offending.map((note) => note.path)).toEqual([]);
  });

  it('carries its own guidance and a template in every folder', () => {
    const root = join(VAULTS, slug);
    expect(readdirSync(root)).toContain('GUIDANCE.md');
    expect(readdirSync(root)).toContain('STRUCTURE.md');

    const folders = readdirSync(root).filter((entry) => statSync(join(root, entry)).isDirectory());
    expect(folders.length).toBeGreaterThan(1);
    for (const folder of folders) {
      expect(readdirSync(join(root, folder)), `${folder} has no template`).toContain('TEMPLATE.md');
    }
  });

  it('writes the reserved keys in en-US, whatever language the vault is in', () => {
    // RN-DSC-030. The pt-BR vault is the one that proves this is a rule and
    // not an accident of both vaults happening to be English.
    for (const note of notes) {
      expect(note.head, note.path).toMatch(/^aliases:/m);
      expect(note.head, note.path).toMatch(/^tags:/m);
      expect(note.head, note.path).toMatch(/^created:/m);
      expect(note.head, note.path).toMatch(/^updated:/m);
    }
  });

  it('teaches the rejections next to what to write instead', () => {
    // The half of the profile no other vault will ever show: a vault written
    // by somebody using the product only contains what worked. Each rejection
    // has to be beside the thing to write in its place, or it is a list of
    // prohibitions and not an explanation.
    const all = notes.map((note) => note.body).join('\n');

    // The inline tag, and both alternatives named in the same passage.
    expect(all).toMatch(/`tags:`/);
    expect(all).toMatch(/wikilink/i);
    // Raw HTML, and the callout that replaces it.
    expect(all).toMatch(/callout/i);
    // Superscript and subscript, and the formula that replaces them.
    expect(all).toMatch(/\$H_2O\$/);
    // Prose in the frontmatter, said where somebody would have written it.
    expect(all).toMatch(/forty|quarenta/i);
  });
});

describe('the pair reads as two vaults and not as one typed twice', () => {
  it('does not repeat the subject matter of one in the other', () => {
    const [en, pt] = DEMONSTRATION.map((slug) =>
      notesOf(slug)
        .map((note) => /^title:\s*(.+)$/m.exec(note.head)?.[1]?.trim() ?? '')
        .sort(),
    );

    expect(en).not.toEqual(pt);
    expect(en?.some((title) => pt?.includes(title))).toBe(false);
  });

  it('keeps the vocabulary of each vault in its own language, beside the reserved keys', () => {
    const pt = notesOf('enologia');
    // `regiao` and `tipo` are this vault's own words, and nothing translates
    // them. The reserved four above are in en-US in the same file.
    expect(pt.every((note) => /^regiao:/m.test(note.head))).toBe(true);
    expect(pt.some((note) => /^tipo:/m.test(note.head))).toBe(true);
  });
});
