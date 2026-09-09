// Translates local file-based vaults into MemorySmith vault trees, written
// in the product's export format (software-vision.md §12): numeric prefixes
// encode folder order, GUIDANCE.md carries the guidance and STRUCTURE.md the
// annotated folder tree, both at the vault root, and TEMPLATE.md carries the
// folder template. Note bodies are copied byte for byte — the backend never
// interprets content (PP4), and neither does this script. The only exception is the frontmatter head, where
// the cross-vault authoring standard is applied: `maturity` (seed | growing |
// evergreen) and `reviewed` (whether the current revision has passed human
// review) — see normalizeFrontmatter for the per-vault derivation.
//
// The three real vaults are sourced from the author's machine and are NOT part
// of the repository; the five fictional ones live in ./fictional. Either way
// the committed artifact is the generated tree under deploy-aws/vaults/, which
// is what onboard.ps1 writes into a fresh environment.
//
// Usage: node deploy-aws/vault-sources/build-vaults.mjs

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HOME = process.env.USERPROFILE ?? process.env.HOME;
const SOURCE_DIR = resolve(fileURLToPath(import.meta.url), '..');
const AUTHORING = join(SOURCE_DIR, 'authoring');
const FICTIONAL = join(SOURCE_DIR, 'fictional');
const OUT_ROOT = resolve(SOURCE_DIR, '..', 'vaults');

const IGNORED_DIRS = new Set(['.obsidian', '.git', '.trash']);

/** @typedef {{src?: string, out: string, desc: string, template?: string, children?: FolderSpec[], childDesc?: (name: string) => string, childTemplate?: string}} FolderSpec */

const VAULTS = [
  {
    slug: 'engineering-knowledge',
    name: 'Engineering Knowledge Vault',
    sourceRoot: join(HOME, 'Code', 'GitHub', 'Knowledge-Vault'),
    folders: [
      {
        out: '01 Literature',
        desc: 'Notas de fonte, presas ao material original: uma nota por capítulo, parte ou módulo e um índice por obra. Nunca são reescritas depois da leitura: são o registro do que a fonte disse.',
        children: [
          {
            src: '01 Literature/Books',
            out: '01 Books',
            desc: 'Livros lidos. Uma subpasta por livro, com o índice da obra e uma nota por capítulo ou parte.',
            childDesc: (n) =>
              `Leitura de "${n}": um índice da obra e uma nota por capítulo ou parte.`,
            childTemplate: 'literature',
          },
          {
            src: '01 Literature/Courses',
            out: '02 Courses',
            desc: 'Treinamentos e cursos. Uma subpasta por curso, com o índice e uma nota por módulo.',
            childDesc: (n) => `Leitura de "${n}": um índice do curso e uma nota por módulo.`,
            childTemplate: 'literature',
          },
          {
            src: '01 Literature/Use Cases',
            out: '03 Use Cases',
            desc: 'Bibliotecas web de casos de uso e documentação. Uma subpasta por coleção, com o índice e uma nota por bloco de leitura.',
            childDesc: (n) =>
              `Leitura de "${n}": um índice da coleção e uma nota por bloco de leitura.`,
            childTemplate: 'literature',
          },
        ],
      },
      {
        out: '02 Permanent Notes',
        desc: 'O conhecimento que ficou, independente da fonte que o originou. Conceitos dizem o que uma coisa É; práticas dizem como uma coisa é FEITA.',
        children: [
          {
            src: '02 Permanent Notes/Concepts',
            out: '01 Concepts',
            desc: 'Conceitos atômicos, independentes da fonte. Só entra o que tem valor fora do livro que o originou e faz sentido sozinho, meses depois. Se responde "como fazer", pertence a Practices.',
            template: 'concept',
          },
          {
            src: '02 Permanent Notes/Practices',
            out: '02 Practices',
            desc: 'Técnicas, dinâmicas e atividades executáveis: passos, regras, template de aplicação. Se responde "o que é", pertence a Concepts.',
            template: 'practice',
          },
        ],
      },
      {
        src: '03 Maps of Content (MOCs)',
        out: '03 Maps of Content',
        desc: 'Índices navegáveis, um por domínio de estudo. Um MOC não contém conhecimento novo: organiza o que existe e registra as lacunas conhecidas do domínio.',
        template: 'moc',
      },
      {
        src: '04 Projects',
        out: '04 Projects',
        desc: 'Aplicação prática e estudos de caso: onde a teoria foi exercitada. Toda nota referencia as práticas e conceitos usados.',
        template: 'project',
      },
    ],
  },
  {
    slug: 'regulacao-energia',
    name: 'Regulação de Energia',
    sourceRoot: join(
      HOME,
      'Claude Cowork',
      'KnowledgeGraph - Regulação de Energia',
      'knowledge-vault',
    ),
    extraRoots: {
      context: join(
        HOME,
        'Claude Cowork',
        'KnowledgeGraph - Regulação de Energia',
        'context-vault',
      ),
    },
    folders: [
      {
        src: '00 Plano',
        out: '01 Plano',
        desc: 'Plano de trabalho e auditorias do grafo: o que falta ler, o que foi auditado e quando. Registros de curadoria, não de conhecimento normativo.',
      },
      {
        out: '02 Literature',
        desc: 'Fonte normativa: o registro de leitura de cada norma, preso ao texto original daquela versão. Nunca é reescrito quando a norma muda: a alteração vira nota nova.',
        children: [
          {
            src: '01 Literature/Normas',
            out: '01 Normas',
            desc: 'Uma subpasta por norma, com o índice e uma nota por título, capítulo ou anexo relevante. A identificação oficial (número e ano) é o nome da subpasta.',
            childDesc: (n) =>
              `Leitura de "${n}": um índice da norma e uma nota por título, capítulo ou anexo relevante.`,
            childTemplate: 'norma',
          },
          {
            src: '01 Literature/Briefings',
            out: '02 Briefings',
            desc: 'Sínteses de contexto que atravessam mais de uma norma: o estado de um tema em uma data, com as fontes citadas.',
          },
        ],
      },
      {
        out: '03 Permanent Notes',
        desc: 'O que a norma diz, decomposto em conhecimento permanente: conceitos que a regulação institui e ritos que ela exige.',
        children: [
          {
            src: '02 Permanent Notes/Concepts',
            out: '01 Concepts',
            desc: 'Conceitos atômicos, independentes da norma que os originou, sempre com a base normativa citada por dispositivo. "Consumidor Livre" é conceito; "o art. 12 diz X" é literatura.',
            template: 'concept',
          },
          {
            src: '02 Permanent Notes/Practices',
            out: '02 Practices',
            desc: 'Procedimentos e ritos executáveis: passos, prazos, responsáveis e formulários, com o dispositivo normativo de cada regra.',
            template: 'practice',
          },
        ],
      },
      {
        src: '03 Datasets',
        out: '04 Datasets',
        desc: 'Fichas de conjuntos de dados abertos: o que o conjunto contém, quem publica, granularidade, cadência, campos e como obter. A ficha descreve a fonte e nunca cita valor extraído dela.',
        template: 'dataset',
      },
      {
        src: '04 Convenções',
        out: '05 Convenções',
        desc: 'A gramática das fontes de dados: prefixos de campo, tipagem, chaves de junção e formatos recorrentes. Cada convenção vale para dezenas de conjuntos, não para um específico.',
        template: 'convention',
      },
      {
        src: '05 Projects',
        out: '06 Projects',
        desc: 'Onde a regra foi exercitada: análise de caso, simulação tarifária, avaliação de impacto normativo.',
      },
      {
        src: '06 Maps of Content (MOCs)',
        out: '07 Maps of Content',
        desc: 'Navegação dos dois eixos num lugar só. "MOC - …" navega o eixo normativo; "Dados - …" navega o eixo de dados. Nenhum mapa contém conhecimento novo.',
        template: 'moc',
      },
      {
        root: 'context',
        src: '01 Indicadores',
        out: '08 Indicadores',
        desc: 'Medidas pontuais: um número ou recorte com significado próprio, na data da última atualização. Toda nota linka a ficha do dataset de origem e o conceito que mede, e vence pela cadência declarada.',
        template: 'indicador',
      },
      {
        root: 'context',
        src: '02 Séries Temporais',
        out: '09 Séries Temporais',
        desc: 'Medidas em trajetória: histórico, tabela e leitura de tendência, quando o valor só significa algo ao longo do tempo. Vencem pela cadência declarada.',
        template: 'serie',
      },
      {
        root: 'context',
        src: '03 Insights',
        out: '10 Insights',
        desc: 'Leituras interpretadas: conclusões que só existem porque alguém confrontou indicador, série e norma. Sempre ancoradas em medida já publicada, nunca em número solto.',
        template: 'insight',
      },
    ],
  },
  {
    slug: 'glpi-discovery',
    name: 'GLPI 11 - Descoberta',
    sourceRoot: join(
      HOME,
      'Claude Cowork',
      'Extração de Requisitos v4 - GLPI',
      'docs',
      'knowledge-vault',
    ),
    folders: [
      {
        src: '01 Overview',
        out: '01 Overview',
        desc: 'O que o sistema é: visão geral, glossário e requisitos de plataforma. A porta de entrada de quem nunca viu o GLPI.',
      },
      {
        src: '02 Business Knowledge',
        out: '02 Business Knowledge',
        desc: 'Por que o sistema existe: os processos de negócio que ele realiza (incidentes, mudanças, ativos, contratos), as regras que os governam e as capacidades transversais.',
        template: 'process',
      },
      {
        src: '03 Structural Knowledge',
        out: '03 Structural Knowledge',
        desc: 'Do que o sistema é composto: os componentes, suas heranças e composições. Toda afirmação cita a evidência que a sustenta.',
        template: 'component',
      },
      {
        src: '04 Behavioral Knowledge',
        out: '04 Behavioral Knowledge',
        desc: 'Como o sistema funciona: ciclos de vida, máquinas de estado, fluxos entre componentes e efeitos colaterais observados.',
      },
      {
        src: '05 Source Code',
        out: '05 Source Code',
        desc: 'Como foi implementado: notas sobre a organização do código-fonte que não pertencem a um componente específico.',
      },
      {
        src: '06 Data',
        out: '06 Data',
        desc: 'Que informações o sistema manipula: entidades de dados, campos, dicionários e relações, na visão de quem precisa extrair requisitos.',
      },
      {
        src: '07 Integrations',
        out: '07 Integrations',
        desc: 'Com quem o sistema se comunica: APIs, agentes, coletores de e-mail, protocolos e autenticação de cada integração.',
      },
      {
        src: '08 Operational Architecture',
        out: '08 Operational Architecture',
        desc: 'Como opera em produção: instalação, cron, cache, saúde, segurança operacional e requisitos de infraestrutura.',
      },
      {
        src: '09 Evidence',
        out: '09 Evidence',
        desc: 'Os artefatos que sustentam tudo: citações literais de código ou documentação, com referência exata de arquivo e linhas. Cada evidência lista as notas de conhecimento que dependem dela.',
        template: 'evidence',
      },
      {
        src: '10 Decisions',
        out: '10 Decisions',
        desc: 'Conclusões e premissas de trabalho, declaradas como tais: o único lugar do vault onde entra julgamento, sempre separado da descrição neutra.',
      },
      {
        src: '11 Investigations',
        out: '11 Investigations',
        desc: 'O que falta investigar: perguntas que as fontes não responderam, com identificador estável, o porquê de importarem e o próximo passo sugerido.',
        template: 'investigation',
      },
      {
        src: '12 Views',
        out: '12 Views',
        desc: 'Como visualizar: diagramas e visões de conjunto que atravessam domínios, derivados das notas de conhecimento.',
      },
      {
        src: '13 MOCs',
        out: '13 MOCs',
        desc: 'Como navegar: um mapa por domínio funcional, ligando componentes, processos, evidências e investigações abertas.',
        template: 'moc',
      },
    ],
  },
  // Fictional vaults: small, self-contained, and sourced from inside the repo
  // (seed/fictional/). They exist to exercise the catalog, the dashboard and
  // the navigation with more than three vaults; same pipeline, same rules.
  {
    slug: 'runbooks-producao',
    name: 'Runbooks de Produção',
    sourceRoot: join(FICTIONAL, 'runbooks-producao'),
    folders: [
      {
        src: 'Runbooks',
        out: '01 Runbooks',
        desc: 'Um procedimento executável por página: pré-condições, passos numerados e verificação final. Passo que exige julgamento linka a nota que explica o critério.',
        template: 'runbook',
      },
      {
        src: 'Postmortems',
        out: '02 Postmortems',
        desc: 'Um incidente fechado por nota: linha do tempo, causa raiz e ações. Imutável depois de fechado; correção vira nota nova.',
      },
    ],
  },
  {
    slug: 'onboarding-engenharia',
    name: 'Onboarding de Engenharia',
    sourceRoot: join(FICTIONAL, 'onboarding-engenharia'),
    folders: [
      {
        src: 'Trilhas',
        out: '01 Trilhas',
        desc: 'O que fazer em cada semana e em que ordem. A trilha linka os guias; o conteúdo de referência não vive aqui.',
        template: 'trilha',
      },
      {
        src: 'Guias',
        out: '02 Guias',
        desc: 'Referência sem calendário: cada guia faz sentido para quem chega em qualquer semana.',
      },
    ],
  },
  {
    slug: 'pesquisa-mercado',
    name: 'Pesquisa de Mercado 2026',
    sourceRoot: join(FICTIONAL, 'pesquisa-mercado'),
    folders: [
      {
        src: 'Entrevistas',
        out: '01 Entrevistas',
        desc: 'O que foi dito, com citações, identificado pela persona e nunca pelo nome. Interpretação não entra aqui.',
        template: 'entrevista',
      },
      {
        src: 'Insights',
        out: '02 Insights',
        desc: 'Leituras que atravessam mais de uma entrevista, sempre citando as entrevistas que as sustentam.',
      },
    ],
  },
  {
    slug: 'fermentacao',
    name: 'Caderno de Fermentação',
    sourceRoot: join(FICTIONAL, 'fermentacao'),
    folders: [
      {
        src: 'Receitas',
        out: '01 Receitas',
        desc: 'O que já repete resultado: ingredientes, processo e o que não variar.',
        template: 'receita',
      },
      {
        src: 'Experimentos',
        out: '02 Experimentos',
        desc: 'Uma variável isolada por nota, com o resultado e o link para a receita base. Experimento que estabiliza é promovido a receita.',
      },
    ],
  },
  // The two demonstration vaults of the Markdown Profile (#69). They are not
  // translations of each other: the same notations carried by different
  // subject matter, so the pair reads as two vaults and shows the reserved
  // keys in en-US on both sides while everything around them is in the
  // language of whoever keeps the vault. A guard test asserts both directions.
  {
    slug: 'continuity-engineering',
    name: 'Continuity Engineering',
    sourceRoot: join(FICTIONAL, 'continuity-engineering'),
    folders: [
      {
        src: 'Objectives',
        out: '01 Objectives',
        desc: 'What each service promises to survive, agreed with whoever owns it. One objective per page, with the unit it is stated in and the review that exercised it.',
        template: 'objective',
      },
      {
        src: 'Runbooks',
        out: '02 Runbooks',
        desc: 'One procedure per page, written for somebody who has not read it before. Every step that needs judgement links the page with the criterion.',
        template: 'runbook',
      },
      {
        src: 'Reviews',
        out: '03 Reviews',
        desc: 'What an exercise actually measured. It is the only place a figure may be asserted, and it is what turns an objective from a target into a capability.',
        template: 'review',
      },
    ],
  },
  {
    slug: 'enologia',
    name: 'Enologia',
    sourceRoot: join(FICTIONAL, 'enologia'),
    folders: [
      {
        src: 'Castas',
        out: '01 Castas',
        desc: 'O que a planta é e o que ela exige, uma casta ou uma medida por página. O que se faz com ela vive em Protocolos.',
        template: 'casta',
      },
      {
        src: 'Protocolos',
        out: '02 Protocolos',
        desc: 'O caminho da uva ao vinho, escrito para quem chega na safra sem ter feito a anterior. Passo que exige julgamento linka o critério.',
        template: 'protocolo',
      },
      {
        src: 'Safras',
        out: '03 Safras',
        desc: 'Registro e não opinião: a curva, a decisão tomada e o motivo. É onde os números entram e onde uma decisão contra o protocolo se escreve.',
        template: 'registro',
      },
    ],
  },
  {
    slug: 'jurisprudencia-tributaria',
    name: 'Jurisprudência Tributária',
    sourceRoot: join(FICTIONAL, 'jurisprudencia-tributaria'),
    folders: [
      {
        src: 'Acórdãos',
        out: '01 Acórdãos',
        desc: 'O que o tribunal decidiu: tema, relator e trecho literal. Leitura própria pertence às teses.',
        template: 'acordao',
      },
      {
        src: 'Teses',
        out: '02 Teses',
        desc: 'A aplicação sustentada a partir dos acórdãos, com o grau de consolidação declarado na maturity.',
      },
    ],
  },
];

const warnings = [];
const stats = [];

function listMd(dir) {
  return readdirSync(dir).filter((f) => f.endsWith('.md') && statSync(join(dir, f)).isFile());
}

function listDirs(dir) {
  return readdirSync(dir).filter(
    (f) => !IGNORED_DIRS.has(f) && statSync(join(dir, f)).isDirectory(),
  );
}

function slugify(name) {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// The description of a folder is an attribute of the folder, not a document:
// it goes into the single STRUCTURE.md of the vault, never into a file of its
// own inside the folder (RN-PRT-003).
const descriptions = new Map();

function recordDesc(dir, desc) {
  if (desc.length < 1 || desc.length > 500)
    warnings.push(`description out of 1..500 chars (${desc.length}): ${dir}`);
  descriptions.set(dir, desc);
}

/**
 * The annotated tree, written once at the vault root, in the exact line format
 * of the `## Structure` section of the Vault Context (software-vision.md 9.2)
 * and of the STRUCTURE.md the export writes. The three have to agree, and the
 * document is what keeps them honest: this script cannot import the product.
 */
function writeStructure(outDir, vaultName) {
  const lines = [`# Structure: ${vaultName}`, ''];

  const render = (dir, prefix) => {
    listDirs(dir)
      .sort((a, b) => folderOrder(a) - folderOrder(b) || a.localeCompare(b))
      .forEach((entry, index) => {
        const full = join(dir, entry);
        const numbering = prefix ? `${prefix}${index + 1}` : `${index + 1}`;
        const indent = '   '.repeat(numbering.split('.').filter(Boolean).length - 1);
        const name = entry.replace(/^\d+\s+/, '');
        const label = listDirs(full).length > 0 ? `${name}/` : name;
        const notes = listMd(full).filter((f) => f !== 'TEMPLATE.md').length;
        const annotations = [`${notes} ${notes === 1 ? 'note' : 'notes'}`];
        if (existsSync(join(full, 'TEMPLATE.md'))) annotations.push('has TEMPLATE.md');
        const desc = descriptions.get(full) ?? '';
        lines.push(`${indent}${numbering}. **${label}**: ${desc} (${annotations.join(', ')})`);
        render(full, `${numbering}.`);
      });
  };

  render(outDir, '');
  writeFileSync(join(outDir, 'STRUCTURE.md'), lines.join('\n') + '\n', 'utf8');
}

function folderOrder(entry) {
  const match = /^(\d+)\s/.exec(entry);
  return match ? Number(match[1]) : 0;
}
function writeTemplate(dir, vaultSlug, templateName) {
  const src = join(AUTHORING, vaultSlug, 'templates', `${templateName}.md`);
  if (!existsSync(src)) {
    warnings.push(`missing template "${templateName}" for ${vaultSlug}`);
    return;
  }
  writeFileSync(join(dir, 'TEMPLATE.md'), readFileSync(src, 'utf8'), 'utf8');
}

const WIKILINK = /\[\[([^\]|]+?)(?:\|[^\]]+?)?\]\]/g;

function parseTags(head) {
  const inline = /^tags:\s*\[([^\]]*)\]/m.exec(head);
  if (inline) {
    return inline[1]
      .split(',')
      .map((t) => t.trim().replace(/^["']|["']$/g, ''))
      .filter(Boolean);
  }
  const block = /^tags:\s*\n((?:[ \t]+-[ \t]+.*\n?)+)/m.exec(head);
  if (!block) return [];
  return block[1]
    .split('\n')
    .map((line) => line.replace(/^[ \t]+-[ \t]+/, '').trim())
    .filter(Boolean);
}

// Applies the cross-vault frontmatter standard to a note head, leaving the
// body untouched. engineering-knowledge and regulacao-energia already use the
// maturity vocabulary under the `status` key, so the key is renamed and
// `reviewed` is seeded from the vault's own definition of evergreen ("madura,
// revisada"). glpi-discovery's evidence `status` is dropped after deriving
// `maturity` from it; its notes are agent-produced, so `reviewed` starts
// false everywhere.
const GLPI_MATURITY_BY_STATUS = {
  confirmed: 'evergreen',
  superseded: 'evergreen',
  inferred: 'growing',
  draft: 'seed',
  open: 'seed',
};

function normalizeFrontmatter(raw, vaultSlug) {
  if (!raw.startsWith('---')) return raw;
  const end = raw.indexOf('\n---', 3);
  if (end === -1) return raw;
  let head = raw.slice(0, end);
  const rest = raw.slice(end);

  if (vaultSlug === 'glpi-discovery') {
    const status = /^status:\s*(\S+)/m.exec(head)?.[1];
    const maturity = GLPI_MATURITY_BY_STATUS[status] ?? 'seed';
    if (/^status:/m.test(head)) {
      head = head.replace(/^status:[^\n]*$/m, `maturity: ${maturity}\nreviewed: false`);
    } else {
      head += `\nmaturity: ${maturity}\nreviewed: false`;
    }
  } else if (/^status:/m.test(head)) {
    head = head.replace(
      /^status:(\s*)(\S+)[^\n]*$/m,
      (_, sp, value) =>
        `maturity:${sp}${value}\nreviewed: ${value === 'evergreen' ? 'true' : 'false'}`,
    );
  } else {
    head += '\nmaturity: seed\nreviewed: false';
  }
  return head + rest;
}

/**
 * The title of a note is read from the note: `title:` in the frontmatter
 * first, and the first level-1 heading when the frontmatter states none. A
 * tree exported from an editor keyed by file name carries that name nowhere
 * inside the file, so the name goes in as `title:` where the source states
 * none — the block is created when there is none, the key is inserted when
 * there is one, and the body is left byte for byte as it was.
 *
 * The frontmatter and not a heading, for the same reason the specification
 * reads it first: the file name is what the links of that vault were written
 * against, and injecting a heading would rewrite the top of every note whose
 * author opened with a paragraph.
 *
 * The four characters that address a note come out of the name: a title
 * carrying one of them is a title no link can name, which is no repair at all.
 */
export function stateTitle(raw, fileName) {
  const title = fileName.replace(/[#[\]|"\\]/g, '').trim() || 'Nota';

  if (!raw.startsWith('---')) return `---\ntitle: ${title}\n---\n\n${raw}`;

  const end = raw.indexOf('\n---', 3);
  if (end === -1) return `---\ntitle: ${title}\n---\n\n${raw}`;

  const head = raw.slice(4, end);
  // A `title:` with a value on the same line is a stated title. Anything else
  // — absent, empty, a list — is not, and falls to the repair.
  if (/^title:[ \t]*\S/m.test(head)) return raw;

  const withoutEmpty = head
    .split('\n')
    .filter((line) => !/^title:[ \t]*$/.test(line))
    .join('\n');
  return `---\ntitle: ${title}\n${withoutEmpty}${raw.slice(end)}`;
}

function collectNoteStats(raw, vault) {
  const head = raw.startsWith('---') ? raw.slice(0, raw.indexOf('\n---', 3)) : '';
  const type = /^type:\s*(\S+)/m.exec(head)?.[1] ?? 'none';
  const maturity = /^maturity:\s*(\S+)/m.exec(head)?.[1] ?? 'none';
  const reviewed = /^reviewed:\s*(\S+)/m.exec(head)?.[1] === 'true';
  const created = /^created:\s*(\d{4}-\d{2}-\d{2})/m.exec(head)?.[1];
  const tags = parseTags(head);
  vault.stats.byType[type] = (vault.stats.byType[type] ?? 0) + 1;
  vault.stats.byMaturity[maturity] = (vault.stats.byMaturity[maturity] ?? 0) + 1;
  if (reviewed) vault.stats.reviewed += 1;
  if (created) vault.stats.byCreatedDay[created] = (vault.stats.byCreatedDay[created] ?? 0) + 1;
  for (const tag of tags) vault.stats.byTag[tag] = (vault.stats.byTag[tag] ?? 0) + 1;

  for (const m of raw.matchAll(WIKILINK)) {
    const target = slugify((m[1].split('#')[0] ?? '').trim());
    if (!target) continue;
    vault.linkTargets.set(target, (vault.linkTargets.get(target) ?? 0) + 1);
  }
}

function copyNotes(srcDir, outDir, vault, counters, depth) {
  if (depth > 6) warnings.push(`depth > 6 at ${outDir}`);
  for (const f of listMd(srcDir)) {
    const title = f.replace(/\.md$/, '');
    // Two notes may carry one title, in one folder or in two, and nothing
    // refuses the second one. What used to be a warning here was reading the
    // vault against a rule the specification retired.
    vault.slugs.add(slugify(title));
    const raw = stateTitle(
      normalizeFrontmatter(readFileSync(join(srcDir, f), 'utf8'), vault.slug),
      title,
    );
    collectNoteStats(raw, vault);
    writeFileSync(join(outDir, f), raw, 'utf8');
    counters.notes += 1;
  }
}

// Unmapped subdirectories are carried over recursively, ordered by name, with a
// generated description (childDesc of the parent spec, or a generic fallback).
function copyAutoChildren(srcDir, outDir, vault, counters, depth, spec) {
  const dirs = listDirs(srcDir).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  dirs.forEach((name, i) => {
    const prefix = String(i + 1).padStart(2, '0');
    const childOut = join(outDir, `${prefix} ${name}`);
    mkdirSync(childOut, { recursive: true });
    counters.folders += 1;
    const desc = spec?.childDesc ? spec.childDesc(name) : `Notas de "${name}".`;
    recordDesc(childOut, desc);
    if (spec?.childTemplate) writeTemplate(childOut, vault.slug, spec.childTemplate);
    copyNotes(join(srcDir, name), childOut, vault, counters, depth + 1);
    copyAutoChildren(join(srcDir, name), childOut, vault, counters, depth + 1, undefined);
  });
}

function buildFolder(spec, parentOut, vault, counters, depth) {
  const outDir = join(parentOut, spec.out);
  mkdirSync(outDir, { recursive: true });
  counters.folders += 1;
  recordDesc(outDir, spec.desc);
  if (spec.template) writeTemplate(outDir, vault.slug, spec.template);

  if (spec.src) {
    const base = spec.root ? vault.def.extraRoots[spec.root] : vault.def.sourceRoot;
    const srcDir = join(base, spec.src);
    if (!existsSync(srcDir)) {
      warnings.push(`[${vault.slug}] missing source dir: ${srcDir}`);
      return;
    }
    copyNotes(srcDir, outDir, vault, counters, depth);
    copyAutoChildren(srcDir, outDir, vault, counters, depth, spec);
  }
  for (const child of spec.children ?? []) buildFolder(child, outDir, vault, counters, depth + 1);
}

for (const def of VAULTS) {
  const outDir = join(OUT_ROOT, def.slug);
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  const guidance = join(AUTHORING, def.slug, 'guidance.md');
  if (!existsSync(guidance)) {
    warnings.push(`missing guidance for ${def.slug}`);
    continue;
  }
  writeFileSync(join(outDir, 'GUIDANCE.md'), readFileSync(guidance, 'utf8'), 'utf8');

  const vault = {
    slug: def.slug,
    def,
    slugs: new Set(),
    linkTargets: new Map(),
    stats: { byType: {}, byMaturity: {}, byTag: {}, byCreatedDay: {}, reviewed: 0 },
  };
  const counters = { notes: 0, folders: 0 };

  const rootStray = listMd(def.sourceRoot).filter((f) => f !== 'README.md');
  if (rootStray.length)
    warnings.push(
      `[${def.slug}] skipped root-level notes (no folder in the model): ${rootStray.join(', ')}`,
    );

  for (const spec of def.folders) buildFolder(spec, outDir, vault, counters, 1);

  const heading = /^#\s+(.+)$/m.exec(readFileSync(guidance, 'utf8'));
  writeStructure(outDir, heading ? heading[1].trim() : def.name);

  if (counters.notes > 2000) warnings.push(`[${def.slug}] exceeds 2000 notes (${counters.notes})`);
  if (counters.folders > 200)
    warnings.push(`[${def.slug}] exceeds 200 folders (${counters.folders})`);

  let resolved = 0;
  let pending = 0;
  for (const [target, count] of vault.linkTargets) {
    if (vault.slugs.has(target)) resolved += count;
    else pending += count;
  }
  stats.push({
    vault: def.slug,
    name: def.name,
    notes: counters.notes,
    folders: counters.folders,
    byType: vault.stats.byType,
    byMaturity: vault.stats.byMaturity,
    byTag: vault.stats.byTag,
    byCreatedDay: vault.stats.byCreatedDay,
    reviewed: vault.stats.reviewed,
    links: { resolved, pending },
  });

}

console.table(stats);
if (warnings.length) {
  console.log('\nWarnings:');
  for (const w of warnings) console.log('  - ' + w);
} else {
  console.log('\nNo warnings.');
}
