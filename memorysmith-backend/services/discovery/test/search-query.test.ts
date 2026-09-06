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
import { RESERVED_KEYS, isReserved } from '../src/domain/FacetExtractor.js';

function note(overrides: Partial<Candidate> = {}): Candidate {
  return {
    title: normalize('Lei 14.133'),
    folder: normalize('Normas'),
    content: normalize('Art. 75. A contratacao direta observa o prazo de vigencia.'),
    sections: [normalize('Vigência')],
    aliases: [],
    facets: { maturity: ['evergreen'], reviewed: ['true'], tags: ['licitacao', 'federal'] },
    facetKinds: { maturity: 'enum', reviewed: 'boolean', tags: 'list' },
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

describe('The reserved vocabulary of the profile (RN-DSC-030)', () => {
  it('reserves four keys, in en-US, and nothing else', () => {
    expect([...RESERVED_KEYS]).toEqual(['aliases', 'tags', 'created', 'updated']);
    expect(isReserved('tags')).toBe(true);
    expect(isReserved('created')).toBe(true);
  });

  it('does not reserve title, which is structural and never a key', () => {
    expect(isReserved('title')).toBe(false);
  });

  it('does not reserve a translated spelling: the label may travel, the bytes may not', () => {
    expect(isReserved('etiquetas')).toBe(false);
    expect(isReserved('criado')).toBe(false);
  });
});

describe('A date facet matches by prefix, never by substring (RN-DSC-031)', () => {
  const dated = (): Candidate =>
    note({
      facets: { created: ['2026-09-03'] },
      facetKinds: { created: 'date' },
    });

  it.each(['2026', '2026-09', '2026-09-03'])('matches the granularity asked for: %s', (value) => {
    expect(matches(parseQuery(`created:${value}`), dated())).toBe(true);
  });

  it('does not let a fragment of the middle stand for a date', () => {
    // The whole point: substring made `created:09` mean September and also the
    // year 2009, which is not a question anybody asked.
    expect(matches(parseQuery('created:09'), dated())).toBe(false);
    expect(matches(parseQuery('created:03'), dated())).toBe(false);
  });

  it('does not match a different month or a different year', () => {
    expect(matches(parseQuery('created:2026-08'), dated())).toBe(false);
    expect(matches(parseQuery('created:2025'), dated())).toBe(false);
  });

  it('keeps substring matching for every other kind', () => {
    // A vault that files `norma: federal-2026` still wants `norma:federal`.
    const other = note({ facets: { norma: ['federal-2026'] }, facetKinds: { norma: 'enum' } });
    expect(matches(parseQuery('norma:federal'), other)).toBe(true);
  });

  it('falls back to substring when the kind is not known', () => {
    // An index written before kinds were carried keeps answering rather than
    // going silent while the projection is rebuilt.
    const legacy = note({ facets: { created: ['2026-09-03'] }, facetKinds: {} });
    expect(matches(parseQuery('created:2026'), legacy)).toBe(true);
  });
});

describe('An alias is another name for the note (RN-DSC-032)', () => {
  const acronym = (): Candidate =>
    note({
      title: normalize('Recovery Time Objective'),
      content: normalize('The time a service may stay down.'),
      aliases: [normalize('RTO')],
    });

  it('finds the note by an alias, with no field given', () => {
    expect(matches(parseQuery('rto'), acronym())).toBe(true);
  });

  it('finds it under title:, because an alias is a name and not a body', () => {
    expect(matches(parseQuery('title:rto'), acronym())).toBe(true);
  });

  it('does not find it under content:, which is the body and nothing else', () => {
    expect(matches(parseQuery('content:rto'), acronym())).toBe(false);
  });

  it('ranks an alias hit as a title hit, not as a mention in a paragraph', () => {
    const byAlias = score(parseQuery('rto'), acronym());
    const mentioned = score(
      parseQuery('rto'),
      note({ title: normalize('Outra nota'), content: normalize('fala de rto de passagem') }),
    );

    expect(byAlias).toBeGreaterThan(mentioned);
  });

  it('finds nothing extra for a note carrying no aliases', () => {
    expect(matches(parseQuery('rto'), note())).toBe(false);
  });
});

describe('A date is searchable over an interval, not only at a point (RN-DSC-034)', () => {
  const on = (date: string): Candidate =>
    note({ facets: { created: [date] }, facetKinds: { created: 'date' } });

  it('accepts the four comparison operators', () => {
    expect(matches(parseQuery('created:>=2026-02-01'), on('2026-02-15'))).toBe(true);
    expect(matches(parseQuery('created:>2026-02-15'), on('2026-02-15'))).toBe(false);
    expect(matches(parseQuery('created:<=2026-02-15'), on('2026-02-15'))).toBe(true);
    expect(matches(parseQuery('created:<2026-02-15'), on('2026-02-15'))).toBe(false);
  });

  it('reads a range as two comparisons, both ends inclusive', () => {
    const quarter = parseQuery('created:2026-01-01..2026-03-31');
    expect(matches(quarter, on('2026-01-01'))).toBe(true);
    expect(matches(quarter, on('2026-02-15'))).toBe(true);
    expect(matches(quarter, on('2026-03-31'))).toBe(true);
    expect(matches(quarter, on('2025-12-31'))).toBe(false);
    expect(matches(quarter, on('2026-04-01'))).toBe(false);
  });

  it('desugars the range into the comparisons, so there is one semantics', () => {
    expect(parseQuery('created:2026-01-01..2026-03-31')).toEqual({
      kind: 'and',
      nodes: [
        { kind: 'compare', facet: 'created', op: '>=', value: '2026-01-01' },
        { kind: 'compare', facet: 'created', op: '<=', value: '2026-03-31' },
      ],
    });
  });

  it('keeps the prefix granularity, so a month is a legal end of an interval', () => {
    // The fifteenth is INSIDE February, so `<=2026-02` has to hold. Comparing
    // the whole string would put most of the month outside the month somebody
    // asked for, and it would look like an empty result rather than a defect.
    expect(matches(parseQuery('created:<=2026-02'), on('2026-02-15'))).toBe(true);
    expect(matches(parseQuery('created:>=2026-02'), on('2026-02-15'))).toBe(true);
    expect(matches(parseQuery('created:>2026-02'), on('2026-02-15'))).toBe(false);
    expect(matches(parseQuery('created:>2026-02'), on('2026-03-01'))).toBe(true);
    expect(matches(parseQuery('created:2026-01..2026-03'), on('2026-02-15'))).toBe(true);
  });

  it('composes with the boolean operators already there', () => {
    const query = parseQuery('created:>=2026-01-01 (maturity:evergreen OR maturity:growing)');
    const evergreen = note({
      facets: { created: ['2026-02-15'], maturity: ['evergreen'] },
      facetKinds: { created: 'date', maturity: 'enum' },
    });
    expect(matches(query, evergreen)).toBe(true);
  });

  it('does not match a note whose attribute is not a date', () => {
    const prose = note({ facets: { created: ['manually'] }, facetKinds: { created: 'enum' } });
    expect(matches(parseQuery('created:>=2026-01-01'), prose)).toBe(false);
  });

  it('refuses an inverted range instead of answering nothing', () => {
    // An empty result reads as "there is nothing filed under that". This means
    // "you asked something that has no answer", which is a different thing to
    // be told, and the difference decides whether you fix the query or doubt
    // the vault.
    expect(() => parseQuery('created:2026-03-31..2026-01-01')).toThrow(QuerySyntaxError);
  });

  it('refuses a range with a missing end', () => {
    expect(() => parseQuery('created:..2026-01-01')).toThrow(QuerySyntaxError);
    expect(() => parseQuery('created:2026-01-01..')).toThrow(QuerySyntaxError);
  });

  it('refuses a comparison with no date after it', () => {
    expect(() => parseQuery('created:>=')).toThrow(QuerySyntaxError);
  });

  it('does not read an ordinary value with a dot as a range', () => {
    // `norma:14.133` is a value somebody typed, not an interval.
    expect(parseQuery('norma:14.133')).toEqual({
      kind: 'facet',
      facet: 'norma',
      value: '14.133',
    });
  });

  it('scores an interval as a filter, the way a facet is scored', () => {
    // A filter says WHICH notes, never which one is most relevant.
    expect(score(parseQuery('created:>=2026-01-01'), on('2026-02-15'))).toBe(2);
  });
});
