import { describe, expect, it } from 'vitest';
import {
  QuerySyntaxError,
  excerptAround,
  matches,
  normalize,
  parseQuery,
  score,
  type Candidate,
} from '../src/domain/SearchQuery.js';

function note(overrides: Partial<Candidate> = {}): Candidate {
  return {
    title: normalize('Lei 14.133'),
    folder: normalize('Normas'),
    content: normalize('Art. 75. A contratacao direta observa o prazo de vigencia.'),
    sections: [normalize('Vigência')],
    facets: { maturity: ['evergreen'], reviewed: ['true'], tags: ['licitacao', 'federal'] },
    ...overrides,
  };
}

describe('The query language parses what a vault user already types', () => {
  it('treats several bare terms as all of them having to match', () => {
    const query = parseQuery('lei contratacao');
    expect(matches(query, note())).toBe(true);
    expect(matches(query, note({ content: normalize('outro assunto') }))).toBe(false);
  });

  it('reads a quoted phrase as one literal string', () => {
    // Without quotes these are two terms that may sit anywhere in the note.
    expect(matches(parseQuery('"contratacao direta"'), note())).toBe(true);
    expect(matches(parseQuery('"direta contratacao"'), note())).toBe(false);
  });

  it('negates with a leading dash', () => {
    expect(matches(parseQuery('lei -rascunho'), note())).toBe(true);
    expect(matches(parseQuery('lei -contratacao'), note())).toBe(false);
  });

  it('does not read a dash inside a word as a negation', () => {
    // `lei-14133` is a slug someone typed, not a negation of `14133`.
    const query = parseQuery('lei-14133');
    expect(query).toEqual({ kind: 'term', field: null, value: 'lei-14133' });
  });

  it('accepts OR and parentheses, with OR binding loosest', () => {
    expect(matches(parseQuery('portaria OR lei'), note())).toBe(true);
    expect(matches(parseQuery('portaria OR decreto'), note())).toBe(false);
    // Without the group this would be `portaria` AND `vigencia`.
    expect(matches(parseQuery('(portaria OR lei) vigencia'), note())).toBe(true);
  });

  it('refuses a query it cannot parse instead of guessing', () => {
    expect(() => parseQuery('   ')).toThrow(QuerySyntaxError);
    expect(() => parseQuery('"nunca fecha')).toThrow(QuerySyntaxError);
    expect(() => parseQuery('(lei')).toThrow(QuerySyntaxError);
    expect(() => parseQuery('lei)')).toThrow(QuerySyntaxError);
    expect(() => parseQuery('lei OR')).toThrow(QuerySyntaxError);
    expect(() => parseQuery('-')).toThrow(QuerySyntaxError);
  });
});

describe('Fields restrict where a term is looked for', () => {
  it('separates title, folder, content and section', () => {
    expect(matches(parseQuery('title:lei'), note())).toBe(true);
    expect(matches(parseQuery('title:vigencia'), note())).toBe(false);

    expect(matches(parseQuery('folder:normas'), note())).toBe(true);
    expect(matches(parseQuery('folder:lei'), note())).toBe(false);

    expect(matches(parseQuery('content:prazo'), note())).toBe(true);
    expect(matches(parseQuery('content:normas'), note())).toBe(false);

    expect(matches(parseQuery('section:vigencia'), note())).toBe(true);
    expect(matches(parseQuery('section:prazo'), note())).toBe(false);
  });

  it('reads a quoted value after a field', () => {
    expect(matches(parseQuery('content:"contratacao direta"'), note())).toBe(true);
    expect(matches(parseQuery('content:"direta contratacao"'), note())).toBe(false);
  });

  it('looks everywhere when no field is given', () => {
    expect(matches(parseQuery('lei'), note())).toBe(true); // title
    expect(matches(parseQuery('normas'), note())).toBe(true); // folder
    expect(matches(parseQuery('prazo'), note())).toBe(true); // content
    expect(matches(parseQuery('vigencia'), note())).toBe(true); // section
  });
});

describe('Any attribute of the vault becomes a filter, with no code for it', () => {
  /**
   * RN-DSC-020: the vocabulary belongs to the guidance. The backend never
   * holds a list of facet names, so a vault that invents one gets the filter
   * the same day it starts writing it.
   */
  it('filters by the facets the product declares', () => {
    expect(matches(parseQuery('maturity:evergreen'), note())).toBe(true);
    expect(matches(parseQuery('maturity:seed'), note())).toBe(false);
    expect(matches(parseQuery('reviewed:true'), note())).toBe(true);
  });

  it('filters by a facet the vault invented, unknown to the code', () => {
    const invented = note({ facets: { norma: ['federal'], instancia: ['segunda'] } });
    expect(matches(parseQuery('norma:federal'), invented)).toBe(true);
    expect(matches(parseQuery('instancia:primeira'), invented)).toBe(false);
  });

  it('matches any value of a list facet, as tags usually are', () => {
    expect(matches(parseQuery('tags:federal'), note())).toBe(true);
    expect(matches(parseQuery('tags:licitacao'), note())).toBe(true);
    expect(matches(parseQuery('tags:municipal'), note())).toBe(false);
  });

  it('answers false for a facet the note does not carry, never throws', () => {
    expect(matches(parseQuery('inexistente:valor'), note())).toBe(false);
  });

  it('combines a facet filter with a content term', () => {
    expect(matches(parseQuery('maturity:evergreen prazo'), note())).toBe(true);
    expect(matches(parseQuery('maturity:seed prazo'), note())).toBe(false);
  });
});

describe('A word invented inside one note is findable, which is the point', () => {
  /**
   * The behaviour observed in the vault editors and reproduced here: a term
   * that is neither a link nor a tag nor part of the title, written once in
   * the body, comes back pointing at its note.
   */
  const invented = note({
    content: normalize('Um paragrafo qualquer com xpto010101 escrito no meio.'),
  });

  it('finds it by the whole word', () => {
    expect(matches(parseQuery('xpto010101'), invented)).toBe(true);
  });

  it('finds it by a fragment, because matching is by substring and not by token', () => {
    expect(matches(parseQuery('xpto01'), invented)).toBe(true);
    expect(matches(parseQuery('pto0101'), invented)).toBe(true);
  });

  it('does not find it in a note that does not carry it', () => {
    expect(matches(parseQuery('xpto010101'), note())).toBe(false);
  });

  it('combines it with a field filter', () => {
    expect(matches(parseQuery('content:xpto010101 maturity:evergreen'), invented)).toBe(true);
    expect(matches(parseQuery('title:xpto010101'), invented)).toBe(false);
  });
});

describe('Accents and case do not decide whether a note is found', () => {
  it('folds case and strips diacritics on both sides', () => {
    const accented = note({ content: normalize('O prazo de vigência é de 12 meses.') });
    expect(matches(parseQuery('VIGÊNCIA'), accented)).toBe(true);
    expect(matches(parseQuery('vigencia'), accented)).toBe(true);
    expect(matches(parseQuery('Vigencia'), accented)).toBe(true);
  });
});

describe('Ranking is simple enough to explain to whoever asks', () => {
  it('puts a hit in the title above a hit in the body', () => {
    const inTitle = note({ title: normalize('Prazo de vigencia'), content: normalize('nada') });
    const inBody = note({ title: normalize('Outra'), content: normalize('fala de prazo') });
    expect(score(parseQuery('prazo'), inTitle)).toBeGreaterThan(score(parseQuery('prazo'), inBody));
  });

  it('puts an exact title above a title that merely contains the term', () => {
    const exact = note({ title: normalize('prazo') });
    const partial = note({ title: normalize('prazo de vigencia') });
    expect(score(parseQuery('prazo'), exact)).toBeGreaterThan(score(parseQuery('prazo'), partial));
  });

  it('does not let a negated term add to the score', () => {
    const query = parseQuery('lei -inexistente');
    expect(score(query, note())).toBe(score(parseQuery('lei'), note()));
  });
});

describe('The excerpt shows the passage, not the beginning of the note', () => {
  it('cuts around the match', () => {
    const content = `${'a '.repeat(200)}xpto010101${' b'.repeat(200)}`;
    const excerpt = excerptAround(content, normalize(content), 'xpto010101');
    expect(excerpt).toContain('xpto010101');
    expect(excerpt.length).toBeLessThan(200);
    expect(excerpt.startsWith('…')).toBe(true);
    expect(excerpt.endsWith('…')).toBe(true);
  });

  it('falls back to the head of the note when the term is not in the body', () => {
    expect(excerptAround('um corpo curto', 'um corpo curto', 'ausente')).toBe('um corpo curto');
  });

  it('cuts the ORIGINAL text, accents and capitals intact', () => {
    // The term is found in the normalized copy; the reader gets what was written.
    const original = 'O prazo de vigência é de 12 meses, conforme o Artigo 75.';
    const excerpt = excerptAround(original, normalize(original), 'vigencia');
    expect(excerpt).toContain('vigência');
    expect(excerpt).toContain('Artigo');
  });

  it('keeps positions aligned between the original and its normalized copy', () => {
    // A naive NFD over the whole string shifts every offset after an accent.
    const original = 'ÁÉÍÓÚ marcador çãõ';
    expect(normalize(original).length).toBe(original.length);
    expect(normalize(original).indexOf('marcador')).toBe(original.indexOf('marcador'));
  });
});

describe('The query has a declared ceiling', () => {
  it('refuses a query longer than the limit instead of scanning with it', () => {
    expect(() => parseQuery('a'.repeat(501))).toThrow(QuerySyntaxError);
  });
});
