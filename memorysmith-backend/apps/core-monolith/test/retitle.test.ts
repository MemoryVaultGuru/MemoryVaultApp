/**
 * The retitling migration (#102), asserted against the readers it exists to
 * satisfy.
 *
 * A migration is only right if the product agrees with it, so nearly every
 * assertion here ends by handing the migrated body to `noteTitle` and to
 * `extractLinks` — the same two functions 0.6.0 will read it with — rather
 * than to a string this test happens to expect. A rule that changes takes
 * these tests with it, which is the point.
 */

import { describe, expect, it } from 'vitest';
import { noteTitle } from '@memorysmith/kernel';
import { extractLinks } from '@memorysmith/svc-discovery/domain/links';
import { oldSlug, retargetLinks, unaddressable, withStatedTitle } from '../src/retitle.js';

/** What a vault of three notes answered to, under the rule that retired. */
const VAULT = new Map([
  ['lei-14133', 'Lei 14.133'],
  ['recovery-time-objective', 'Recovery Time Objective'],
  ['reuniao-de-time', 'Reunião de Time'],
]);

function titlesPointedAt(markdown: string): string[] {
  return extractLinks(markdown).map((link) => link.title);
}

describe('the retired slug rule', () => {
  it('folds a title the way the deployed version folded it', () => {
    expect(oldSlug('Lei 14.133')).toBe('lei-14133');
    expect(oldSlug('Recovery Time Objective')).toBe('recovery-time-objective');
    expect(oldSlug('Reunião de Time')).toBe('reuniao-de-time');
  });

  it('is what makes a link written in any casing find its note', () => {
    expect(oldSlug('recovery time objective')).toBe(oldSlug('Recovery Time Objective'));
  });
});

describe('writing the stored title into the frontmatter', () => {
  it('creates the block when the note has none, leaving the body byte for byte', () => {
    const body = 'Uma nota sem frontmatter.\n\nCom dois parágrafos.\n';
    const written = withStatedTitle(body, 'Lei 14.133');

    expect(written.changed).toBe(true);
    expect(written.content).toBe(`---\ntitle: Lei 14.133\n---\n\n${body}`);
    expect(written.content.endsWith(body)).toBe(true);
    expect(noteTitle(written.content)).toBe('Lei 14.133');
  });

  it('inserts the key when there is a block, keeping every other key and the body', () => {
    const body = [
      '---',
      'maturity: draft',
      'tags: [processo, licitação]',
      '---',
      '',
      'O corpo da nota.',
      '',
    ].join('\n');
    const written = withStatedTitle(body, 'Lei 14.133');

    expect(written.content).toBe(
      [
        '---',
        'title: Lei 14.133',
        'maturity: draft',
        'tags: [processo, licitação]',
        '---',
        '',
        'O corpo da nota.',
        '',
      ].join('\n'),
    );
    expect(noteTitle(written.content)).toBe('Lei 14.133');
  });

  it('states the title even when the body already opens with a heading', () => {
    // The stored title is what every link in the vault was written against,
    // and the heading the author typed says something shorter.
    const body = '# A lei\n\nO corpo.\n';
    const written = withStatedTitle(body, 'Lei 14.133');

    expect(written.content).toBe(`---\ntitle: Lei 14.133\n---\n\n${body}`);
    expect(noteTitle(written.content)).toBe('Lei 14.133');
  });

  it('keeps the stored title when the frontmatter states another, and reports both', () => {
    const body = '---\ntitle: A lei\nmaturity: draft\n---\n\nO corpo.\n';
    const written = withStatedTitle(body, 'Lei 14.133');

    expect(written.existing).toBe('A lei');
    expect(noteTitle(written.content)).toBe('Lei 14.133');
    expect(written.content).toContain('maturity: draft');
  });

  it('changes nothing on a second run', () => {
    const body = '---\nmaturity: draft\n---\n\nO corpo.\n';
    const once = withStatedTitle(body, 'Lei 14.133');
    const twice = withStatedTitle(once.content, 'Lei 14.133');

    expect(twice.changed).toBe(false);
    expect(twice.content).toBe(once.content);
    expect(twice.existing).toBeNull();
  });

  it('quotes a title the reader would otherwise give back changed', () => {
    // A title that looks like a YAML list cannot reach here: `[` and `]` are
    // two of the four delimiters, so such a note has no address at all and is
    // reported instead.
    for (const title of ['"Aspas"', "'Simples'", 'Espaço à direita ']) {
      const written = withStatedTitle('O corpo.\n', title);
      expect(noteTitle(written.content)).toBe(title.trim().normalize('NFC'));
    }
  });

  it('takes the dash list of a title away with its key', () => {
    // A `title:` written as a list states no title, and leaving its items
    // behind would attach them to the key above.
    const body = '---\nmaturity: draft\ntitle:\n  - um\n  - dois\n---\n\nO corpo.\n';
    const written = withStatedTitle(body, 'Lei 14.133');

    expect(written.content).toBe('---\ntitle: Lei 14.133\nmaturity: draft\n---\n\nO corpo.\n');
    expect(noteTitle(written.content)).toBe('Lei 14.133');
  });
});

describe('retargeting the links', () => {
  it('rewrites a wikilink to the exact title of the note it used to reach', () => {
    const written = retargetLinks('Ver [[lei-14133]].', VAULT);

    expect(written.content).toBe('Ver [[Lei 14.133]].');
    expect(written.rewritten).toBe(1);
    expect(titlesPointedAt(written.content)).toEqual(['Lei 14.133']);
  });

  it('carries the alias, the anchor and the block identifier across untouched', () => {
    const body = [
      '[[lei-14133|a lei]]',
      '[[lei-14133#Artigo 5]]',
      '![[lei-14133]]',
      '![[lei-14133#^b3f2a1]]',
    ].join('\n');
    const written = retargetLinks(body, VAULT);

    expect(written.content).toBe(
      [
        '[[Lei 14.133|a lei]]',
        '[[Lei 14.133#Artigo 5]]',
        '![[Lei 14.133]]',
        '![[Lei 14.133#^b3f2a1]]',
      ].join('\n'),
    );
    expect(new Set(titlesPointedAt(written.content))).toEqual(new Set(['Lei 14.133']));
  });

  it('resolves a target written in another casing, as the retired rule did', () => {
    const written = retargetLinks('[[recovery time objective]]', VAULT);
    expect(written.content).toBe('[[Recovery Time Objective]]');
    expect(titlesPointedAt(written.content)).toEqual(['Recovery Time Objective']);
  });

  it('rewrites the Markdown form so the reader reaches the same note', () => {
    const written = retargetLinks('Ver [a lei](../leis/lei-14133.md).', VAULT);

    expect(written.rewritten).toBe(1);
    expect(titlesPointedAt(written.content)).toEqual(['Lei 14.133']);
  });

  it('rewrites a destination declared apart from the link that uses it', () => {
    const body = 'Ver [a lei][lei].\n\n[lei]: ../leis/lei-14133.md\n';
    const written = retargetLinks(body, VAULT);

    expect(titlesPointedAt(written.content)).toEqual(['Lei 14.133']);
  });

  it('never touches a link inside a code span or a fenced block', () => {
    const body = [
      'Escreva `[[lei-14133]]` para citar a lei.',
      '',
      '```markdown',
      '[[lei-14133]]',
      '```',
      '',
      'E aqui [[lei-14133]] vale.',
    ].join('\n');
    const written = retargetLinks(body, VAULT);

    expect(written.rewritten).toBe(1);
    expect(written.content).toContain('`[[lei-14133]]`');
    expect(written.content).toContain('```markdown\n[[lei-14133]]\n```');
    expect(written.content).toContain('E aqui [[Lei 14.133]] vale.');
  });

  it('leaves what did not resolve exactly as written, and reports it', () => {
    const written = retargetLinks('Ver [[uma-nota-que-nao-existe]].', VAULT);

    expect(written.content).toBe('Ver [[uma-nota-que-nao-existe]].');
    expect(written.rewritten).toBe(0);
    expect(written.pending).toEqual(['uma-nota-que-nao-existe']);
  });

  it('leaves an external link and an image alone', () => {
    const body = 'Veja [o texto](https://www.planalto.gov.br/lei-14133) e ![curva](./curva.png).';
    expect(retargetLinks(body, VAULT).content).toBe(body);
  });

  it('never points a link at a title no link could name', () => {
    // The note exists and renders; what it has no more is an address, and a
    // link rewritten to it would resolve to nothing.
    const vault = new Map([['plano-b', 'Plano [B]']]);
    const written = retargetLinks('Ver [[plano-b]].', vault);

    expect(written.content).toBe('Ver [[plano-b]].');
    expect(written.pending).toEqual(['plano-b']);
    expect(unaddressable('Plano [B]')).toBe(true);
  });

  it('changes nothing on a second run', () => {
    const body = 'Ver [[lei-14133]] e [a lei](lei-14133.md).';
    const once = retargetLinks(body, VAULT);
    const twice = retargetLinks(once.content, VAULT);

    expect(twice.content).toBe(once.content);
    // Nothing to do, and the report says so: `rewritten` counts targets that
    // CHANGED, and a destination this job wrote is not a link left pending
    // just because the retired rule can make nothing of it.
    expect(twice.rewritten).toBe(0);
    expect(twice.pending).toEqual([]);
  });
});

describe('a whole note, migrated', () => {
  it('is read by 0.6.0 as the vault meant it', () => {
    const body = [
      '---',
      'maturity: draft',
      '---',
      '',
      '# A lei',
      '',
      'A [[lei-14133]] revogou a anterior, e o [[recovery time objective]] mudou.',
      '',
      'Ver também [a reunião](../atas/reuniao-de-time.md).',
      '',
      '```',
      'não [[lei-14133]]',
      '```',
    ].join('\n');

    const stated = withStatedTitle(body, 'Lei 14.133');
    const migrated = retargetLinks(stated.content, VAULT);

    expect(noteTitle(migrated.content)).toBe('Lei 14.133');
    expect(new Set(titlesPointedAt(migrated.content))).toEqual(
      new Set(['Lei 14.133', 'Recovery Time Objective', 'Reunião de Time']),
    );
    // The prose is untouched below the frontmatter, heading included.
    expect(migrated.content).toContain('# A lei');
    expect(migrated.content).toContain('```\nnão [[lei-14133]]\n```');
  });
});
