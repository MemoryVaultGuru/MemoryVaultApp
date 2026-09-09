/**
 * The rebuild of the link graph (#102), and the one property the release is
 * checked against: after the retitling migration, NO EDGE IS LOST, and every
 * edge gained is one an alias explains.
 *
 * The vault below is the shape of the real thing: three notes that pointed at
 * each other by slug, migrated so each states its title, plus a note carrying
 * an alias that used to answer nothing.
 */

import { describe, expect, it } from 'vitest';
import { noteTitle } from '@memorysmith/kernel';
import { extractLinks } from '../src/domain/LinkExtractor.js';
import { extractFrontmatterAliases } from '../src/domain/Aliases.js';
import { resolveAll, type ReadNote } from '../src/adapters/reprojection.js';

/** A note as the rebuild reads it: from its bytes, by the current rules. */
function read(noteId: string, markdown: string): ReadNote {
  return {
    noteId,
    folderId: 'folder',
    title: noteTitle(markdown) ?? '',
    aliases: extractFrontmatterAliases(markdown),
    targets: extractLinks(markdown).map((link) => link.title),
  };
}

const edgesOf = (notes: ReadNote[]): string[] =>
  resolveAll(notes)
    .edges.map((edge) => `${edge.from}->${edge.to}`)
    .sort();

describe('rebuilding the graph of a migrated vault', () => {
  const vault = [
    read('lei', '---\ntitle: Lei 14.133\n---\n\nVer [[Recovery Time Objective]].\n'),
    read(
      'rto',
      '---\ntitle: Recovery Time Objective\naliases: [RTO, Objetivo de Recuperação]\n---\n\nVer [[Lei 14.133]].\n',
    ),
    read('ata', '---\ntitle: Reunião de Time\n---\n\nFalamos de [[RTO]] e da [[Lei 14.133]].\n'),
  ];

  it('finds every edge the vault used to have', () => {
    // What the retired rule found: the two links written with the exact name
    // of their target, which slugified to the same thing on both sides.
    const before = ['ata->lei', 'lei->rto', 'rto->lei'];
    expect(edgesOf(vault)).toEqual(expect.arrayContaining(before));
  });

  it('gains the edge an alias explains, and says which alias', () => {
    // `[[RTO]]` resolved to nothing under the retired rule, because no note was
    // called RTO. It is an edge now, and the report can name why.
    const gained = resolveAll(vault).edges.find((edge) => edge.by === 'alias');
    expect(gained).toEqual({ from: 'ata', to: 'rto', target: 'RTO', by: 'alias' });
  });

  it('lets a title take back what an alias was answering', () => {
    // Non-monotonic resolution, seen from the rebuild: a note written under the
    // title somebody else was aliasing takes the edge away (RN-DSC-053).
    const withOwner = [...vault, read('rto2', '---\ntitle: RTO\n---\n\nA sigla.\n')];
    const alias = resolveAll(withOwner).edges.filter((edge) => edge.by === 'alias');

    expect(alias).toEqual([]);
    expect(edgesOf(withOwner)).toContain('ata->rto2');
    expect(edgesOf(withOwner)).not.toContain('ata->rto');
  });

  it('writes one edge per note carrying the title, and never to itself', () => {
    // Two notes may carry one title (RN-KNW-037), and a link into both is two
    // edges, because there is no order to appeal to (RN-DSC-042).
    const twins = [
      read('a', '---\ntitle: Ata\n---\n\nVer [[Nota]].\n'),
      read('b', '---\ntitle: Nota\n---\n\nVer [[Nota]].\n'),
      read('c', '---\ntitle: Nota\n---\n\nOutra.\n'),
    ];
    expect(edgesOf(twins)).toEqual(['a->b', 'a->c', 'b->c']);
  });

  it('counts a target nothing answers to as pending, and makes no edge of it', () => {
    const orphan = [read('a', '---\ntitle: Ata\n---\n\nVer [[Uma nota que não existe]].\n')];
    const rebuilt = resolveAll(orphan);

    expect(rebuilt.edges).toEqual([]);
    expect(rebuilt.pending).toBe(1);
  });
});
