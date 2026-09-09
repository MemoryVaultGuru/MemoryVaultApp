/**
 * The chain that reads the title of a note (§5.3), and the frontmatter reader
 * it stands on (§6.1, §6.2).
 *
 * The fifteen `title/` cases of the published conformance suite are here by
 * hand, because the suite arrives with the pin of the specification later in
 * this cycle (#97) and this function is written before it. Each of them is a
 * decision two implementations would otherwise take differently; the suite
 * asserts them again against the same function once it is pinned.
 */

import { describe, expect, it } from 'vitest';
import { noteTitle } from '../src/note-title.js';
import { bodyWithoutFrontmatter, frontmatterBlock, frontmatterOf } from '../src/frontmatter.js';

describe('noteTitle: the heading step of the chain', () => {
  it('is the plain text of the heading, after inline parsing', () => {
    expect(noteTitle('# **Lei** 14.133\n\nThe general rule.\n')).toBe('Lei 14.133');
  });

  it('reads a Setext heading as the same title', () => {
    expect(noteTitle('Lei 14.133\n==========\n\nThe general rule.\n')).toBe('Lei 14.133');
  });

  it('is not displaced by frontmatter that states no title', () => {
    expect(noteTitle('---\ntags: [contracts]\n---\n\n# Lei 14.133\n\nThe general rule.\n')).toBe(
      'Lei 14.133',
    );
  });

  it('does not read a heading written inside a fence', () => {
    expect(noteTitle('```markdown\n# Lei 14.133\n```\n')).toBeNull();
  });

  it('has none when the note carries no level-1 heading', () => {
    expect(noteTitle('## Article 75\n\nThe exception.\n')).toBeNull();
  });

  it('leaves no addressable title when the heading carries a delimiter', () => {
    expect(noteTitle('# C# basics\n\nNotes on the language.\n')).toBeNull();
  });

  it('reads the first level-1 heading, and the second is an ordinary heading', () => {
    expect(noteTitle('# Lei 14.133\n\nThe general rule.\n\n# Article 75\n\nThe exception.\n')).toBe(
      'Lei 14.133',
    );
  });
});

describe('noteTitle: the frontmatter step of the chain', () => {
  it('wins over the heading', () => {
    expect(noteTitle('---\ntitle: Lei 14.133\n---\n\n# The general rule\n\nThe body.\n')).toBe(
      'Lei 14.133',
    );
  });

  it('answers when there is no heading at all', () => {
    expect(noteTitle('---\ntitle: Lei 14.133\n---\n\nThe general rule.\n')).toBe('Lei 14.133');
  });

  it('falls back to the heading when it is empty', () => {
    expect(noteTitle('---\ntitle:\n---\n\n# Lei 14.133\n\nThe general rule.\n')).toBe('Lei 14.133');
  });

  it('falls back to the heading when it is a list, and is never an error', () => {
    expect(
      noteTitle('---\ntitle:\n  - Lei 14.133\n  - Lei 14133\n---\n\n# Lei 14.133\n\nThe rule.\n'),
    ).toBe('Lei 14.133');
  });

  it('ends the chain when it carries a delimiter, and does not fall through', () => {
    expect(
      noteTitle('---\ntitle: Lei 14.133 [revogada]\n---\n\n# Lei 14.133\n\nThe general rule.\n'),
    ).toBeNull();
  });

  it('is no title when neither the frontmatter nor a heading states one', () => {
    expect(noteTitle('---\ntags: [contracts]\n---\n\nThe general rule.\n')).toBeNull();
  });

  it('is not capped at forty characters', () => {
    expect(
      noteTitle(
        '---\ntitle: Plano de continuidade de negócios e recuperação de desastres\n---\n\n# PCN\n\nO plano.\n',
      ),
    ).toBe('Plano de continuidade de negócios e recuperação de desastres');
  });

  it('reads a title written in pt-BR as a title', () => {
    expect(noteTitle('---\ntitle: Recuperação de desastre\n---\n\n# RD\n\nO plano.\n')).toBe(
      'Recuperação de desastre',
    );
  });
});

describe('noteTitle: what the chain says about a title once it is read', () => {
  it('normalises to NFC, so one note is not two', () => {
    const decomposed = '# Ação\n';
    expect(noteTitle(decomposed)).toBe('Ação'.normalize('NFC'));
    expect(noteTitle(decomposed)?.normalize('NFD')).toBe(decomposed.slice(2, -1));
  });

  it('folds nothing else: case is exact', () => {
    expect(noteTitle('# Lei\n')).toBe('Lei');
    expect(noteTitle('# lei\n')).toBe('lei');
  });

  it('accepts a slash, because folders play no part in identity', () => {
    expect(noteTitle('# Reunião 03/09/2026\n')).toBe('Reunião 03/09/2026');
    expect(noteTitle('---\ntitle: and/or\n---\n')).toBe('and/or');
  });

  it('trims the title and strips one layer of quotes from a stated one', () => {
    expect(noteTitle('#    Lei 14.133   \n')).toBe('Lei 14.133');
    expect(noteTitle('---\ntitle: "Lei 14.133"\n---\n')).toBe('Lei 14.133');
  });

  it('reads a heading whatever its indentation up to three spaces, and its closing hashes', () => {
    expect(noteTitle('   # Lei 14.133 ###\n')).toBe('Lei 14.133');
  });

  it('does not read a hash that opens no heading', () => {
    expect(noteTitle('#hashtag is not a heading\n')).toBeNull();
    expect(noteTitle('Text\n\n#hashtag\n')).toBeNull();
  });

  it('reads a code span, a link and a strikethrough as the text they render', () => {
    expect(noteTitle('# The `create_note` tool\n')).toBe('The create_note tool');
    expect(noteTitle('# The [general rule](./lei.md)\n')).toBe('The general rule');
    expect(noteTitle('# ~~Old~~ New\n')).toBe('Old New');
  });

  it('leaves a word with underscores alone, because it is a word and not an emphasis', () => {
    expect(noteTitle('# snake_case_name\n')).toBe('snake_case_name');
    expect(noteTitle('# _emphasised_ title\n')).toBe('emphasised title');
  });

  it('puts an escaped character back as an ordinary character of the title', () => {
    expect(noteTitle('# 2 \\* 3\n')).toBe('2 * 3');
    expect(noteTitle('# C\\# basics\n')).toBeNull();
  });

  it('resolves a character reference', () => {
    expect(noteTitle('# Fish &amp; Chips\n')).toBe('Fish & Chips');
  });

  it('leaves a wikilink in a heading unaddressable', () => {
    expect(noteTitle('# [[Lei 14.133]]\n')).toBeNull();
  });
});

describe('the frontmatter block', () => {
  it('is read only when the document opens with it', () => {
    expect(frontmatterBlock('---\ntitle: Lei\n---\n\nBody.\n')).toBe('title: Lei');
    expect(frontmatterBlock('\n---\ntitle: Lei\n---\n')).toBeNull();
    expect(frontmatterBlock('Body.\n\n---\n\nMore body.\n')).toBeNull();
  });

  it('takes no part in the body', () => {
    expect(bodyWithoutFrontmatter('---\ntitle: Lei\n---\n\n# Lei\n')).toBe('\n# Lei\n');
    expect(bodyWithoutFrontmatter('# Lei\n')).toBe('# Lei\n');
  });

  it('reads scalars, inline lists and dash lists, and carries the written form out', () => {
    const frontmatter = frontmatterOf(
      '---\ntitle: Lei 14.133\ntags: [contracts, budget]\naliases:\n  - Lei de licitações\nempty:\n---\n',
    );
    expect(frontmatter['title']).toEqual({ written: 'scalar', values: ['Lei 14.133'] });
    expect(frontmatter['tags']).toEqual({ written: 'list', values: ['contracts', 'budget'] });
    expect(frontmatter['aliases']).toEqual({ written: 'list', values: ['Lei de licitações'] });
    expect(frontmatter['empty']).toEqual({ written: 'scalar', values: [] });
  });

  it('tells a list of one item from a scalar, because they are not the same attribute', () => {
    expect(frontmatterOf('---\ntags: [contracts]\n---')['tags']?.written).toBe('list');
    expect(frontmatterOf('---\ntags: contracts\n---')['tags']?.written).toBe('scalar');
  });

  it('is empty when there is no block', () => {
    expect(frontmatterOf('# Lei 14.133\n')).toEqual({});
  });
});
