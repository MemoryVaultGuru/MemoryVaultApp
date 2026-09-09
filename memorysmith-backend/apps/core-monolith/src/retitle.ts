/**
 * Entrypoint of the retitling migration (#102), run against the version IN
 * PRODUCTION, before 0.6.0 goes up.
 *
 * Every note already written carries its title as an ATTRIBUTE of the note and
 * nothing in its content, and every link in it was written to be found by a
 * slug that folded case, accents and punctuation. The moment 0.6.0 is
 * deployed, both facts turn into the same failure: notes with no addressable
 * title, every wikilink pending, and a graph with no edges — a vault that looks
 * emptied to whoever keeps it, with nothing on screen saying why.
 *
 * And the deploy destroys the information the repair needs: the title has to
 * be written into the content FROM the stored title, and after the deploy
 * there is no stored title. So the order is fixed, and it is the whole point:
 *
 *   1. `deploy-aws/retitle-vaults.ps1`, against the version in production
 *   2. the deploy of 0.6.0
 *   3. `deploy-aws/reproject-links.ps1`
 *
 * A third entrypoint on the same bundle, next to `recount.ts`, and for the
 * same reason: it is triggered by an operator rather than by a request or a
 * stream. It reports before it writes and writes only with `--apply`, because
 * a job that silently rewrites content nobody looked at is how a wrong
 * migration becomes the new vault.
 *
 * WHY IT GOES THROUGH THE API. Everything here is an HTTP call to the product,
 * signed in as a person: a job that wrote into DynamoDB or S3 by hand would
 * produce a vault with no revisions, no domain events and no audit trail — the
 * three things that make a write of this product a write of this product. The
 * cost is one call per note, and it is the right cost. It is also why this one
 * is not a Scan like the recount: a migration of content is authored, and an
 * authored write needs an author (non-negotiable rule 7).
 *
 * WHAT IS PURE AND WHAT IS NOT. The three transformations — the retired slug
 * rule, the frontmatter insertion and the link retargeting — are exported and
 * tested; the driver below only reads, calls them, and writes back what they
 * returned.
 */

/** The versions of the note listing this job knows how to read. */
const REQUIRED_SUMMARY_FIELDS = ['noteId', 'title', 'slug'] as const;

// --- The retired rule, reproduced exactly ------------------------------------

const MAX_SLUG = 80;

/**
 * The slug the product computed from a title until 0.6.0, character for
 * character.
 *
 * It is copied here rather than imported because this job has to think the way
 * the DEPLOYED version thinks — that is the whole of what it is for — and the
 * version it migrates away from is the one that no longer exists in the
 * repository. A copy that cannot drift, because its original is gone.
 */
export function oldSlug(raw: string): string {
  return (
    raw
      .normalize('NFD')
      // A dot BETWEEN DIGITS belonged to the number: "Lei 14.133" became
      // "lei-14133", never "lei-14-133".
      .replace(/(\d)[.,](\d)/g, '$1$2')
      .replace(/\p{M}/gu, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, MAX_SLUG)
      .replace(/-+$/g, '')
  );
}

/**
 * The four delimiters of the form that addresses a note, as `note-title.ts`
 * declares them. A title carrying one of them has no addressable title, and no
 * link can be pointed at it.
 */
export function unaddressable(title: string): boolean {
  return /[#[\]|]/.test(title);
}

// --- The frontmatter -------------------------------------------------------

/** One layer of matching quotes, stripped the way the reader strips it. */
function unquote(value: string): string {
  return value.replace(/^["']|["']$/g, '').trim();
}

/**
 * The `title:` the frontmatter already states, read exactly as the kernel
 * reads it: the last one wins, a list is not a title, and an empty value
 * states none.
 */
function statedTitleOf(block: string): string | null {
  let found: string | null = null;
  for (const line of block.split(/\r?\n/)) {
    if (/^\s*#/.test(line) || line.trim().length === 0) continue;
    const pair = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(line);
    if (!pair || pair[1] !== 'title') continue;
    const raw = (pair[2] ?? '').trim();
    found = raw.length === 0 || (raw.startsWith('[') && raw.endsWith(']')) ? null : unquote(raw);
  }
  return found;
}

/**
 * The title written so the reader gives it back unchanged.
 *
 * The YAML subset of the specification trims the value, reads `[a, b]` as a
 * list and strips one layer of quotes, so a title that would come back
 * different is quoted and every other one is written plain — because a
 * frontmatter a person opens should read like a frontmatter a person wrote.
 */
function yamlScalar(value: string): string {
  const survives =
    value.trim() === value &&
    unquote(value) === value &&
    !(value.startsWith('[') && value.endsWith(']')) &&
    !value.includes('\n');
  return survives ? value : `"${value}"`;
}

export interface StatedTitle {
  readonly content: string;
  readonly changed: boolean;
  /** The title the frontmatter already carried, when it disagreed. */
  readonly existing: string | null;
}

/**
 * Writes `title: <the stored title>` into the frontmatter.
 *
 * The block is created where there is none and the key inserted where there is
 * one, in both cases leaving every other key and the whole body byte for byte
 * as they were. A `title:` already stating this title is left alone, which is
 * what makes a second run change nothing.
 *
 * It does this for EVERY note, including one whose body already opens with a
 * level-1 heading, because the stored title is what every link in that vault
 * was written against and a heading the author typed may say something shorter
 * or something else entirely. Leaving those notes to their heading is how a
 * note changes identity in silence, which is the one outcome this job exists
 * to prevent.
 */
export function withStatedTitle(content: string, title: string): StatedTitle {
  const opening = /^---\r?\n([\s\S]*?)\r?\n---/.exec(content);
  const block = opening?.[1] ?? null;
  const existing = block === null ? null : statedTitleOf(block);
  if (existing !== null && existing === title) {
    return { content, changed: false, existing: null };
  }

  const head = [`title: ${yamlScalar(title)}`, ...withoutTitleKey(block)].join('\n');
  const rebuilt =
    opening === null
      ? `---\n${head}\n---\n\n${content}`
      : `---\n${head}\n---${content.slice(opening[0].length)}`;
  return { content: rebuilt, changed: true, existing };
}

/**
 * The block without its `title:`, and without the dash list under it.
 *
 * The list matters: a `title:` written as a list is not a title, and dropping
 * only its key would leave the items behind to attach themselves to whatever
 * key came before — the one way this insertion could change a value it was
 * asked to preserve.
 */
function withoutTitleKey(block: string | null): string[] {
  if (block === null) return [];
  const lines = block.split(/\r?\n/);
  const kept: string[] = [];
  let dropping = false;
  for (const line of lines) {
    if (/^title\s*:/.test(line)) {
      dropping = true;
      continue;
    }
    if (dropping && /^\s*-\s/.test(line)) continue;
    dropping = false;
    kept.push(line);
  }
  return kept;
}

// --- The links -------------------------------------------------------------

/**
 * A link inside code is an example and never a reference, so it is left alone.
 * The pattern is the one both sanctioned readers use, character for
 * character: what this job rewrites has to be exactly what they read.
 */
const CODE = /```[\s\S]*?```|`[^`\n]*`/g;

/** The wikilink, split into what addresses and what only displays. */
const WIKILINK = /(!?)\[\[([^\]|#]*)((?:#[^\]|]*)?)((?:\|[^\]]*)?)\]\]/g;
/** A link and NOT an image: an attachment keeps the address it has. */
const MARKDOWN_LINK = /(?<!!)(\[[^\]]*\])\(([^)\s]+)((?:\s+"[^"]*")?)\)/g;
/** The destination declared apart from the link that uses it. */
const DEFINITION = /^( {0,3}\[[^\]\n]+\]:[ \t]*)<?([^\s>]+)>?/gm;
const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

export interface Retargeted {
  readonly content: string;
  readonly rewritten: number;
  /** The targets nothing answered to, as they were written. */
  readonly pending: string[];
}

/**
 * Rewrites every link target to the exact title of the note it used to reach.
 *
 * Resolution is the RETIRED one — slugify the target, look the slug up —
 * because that is what the links in this vault were written against. What did
 * not resolve is left exactly as written and reported, because a pending link
 * is a fact about the vault and not something to invent a target for.
 *
 * A link already pointing at the title it should is not counted: `rewritten`
 * says how many targets CHANGED, which is what makes a second run report
 * nothing to do.
 *
 * The notation the author chose is kept. A wikilink stays a wikilink and takes
 * the title plainly; the Markdown form stays the Markdown form and takes the
 * title percent-encoded, because its destination may not carry a space and the
 * reader percent-decodes it last, after the delimiters. An alias, an anchor
 * and a block identifier are carried across untouched: they are display and
 * position, never address.
 */
export function retargetLinks(content: string, titleBySlug: Map<string, string>): Retargeted {
  const pending = new Set<string>();
  const titles = new Set(titleBySlug.values());
  let rewritten = 0;

  /** The title a target used to reach, or `null` when nothing answered. */
  const answering = (target: string): string | null => {
    const title = titleBySlug.get(oldSlug(target));
    // A title carrying one of the four delimiters cannot be pointed at, so the
    // link is left as written and reported rather than rewritten into one that
    // resolves to nothing.
    return title !== undefined && !unaddressable(title) ? title : null;
  };

  const retarget = (segment: string): string =>
    segment
      .replace(WIKILINK, (whole, bang: string, target: string, anchor: string, alias: string) => {
        if (target.trim().length === 0) return whole;
        const title = answering(target.replace(/\\$/, '').trim());
        if (title === null) {
          pending.add(target.trim());
          return whole;
        }
        const retargeted = `${bang}[[${title}${anchor}${alias}]]`;
        if (retargeted !== whole) rewritten += 1;
        return retargeted;
      })
      .replace(MARKDOWN_LINK, (whole, label: string, destination: string, caption: string) => {
        const rewrittenTo = retargetDestination(destination, answering, titles, pending);
        if (rewrittenTo === null || rewrittenTo === destination) return whole;
        rewritten += 1;
        return `${label}(${rewrittenTo}${caption})`;
      })
      .replace(DEFINITION, (whole, head: string, destination: string) => {
        const rewrittenTo = retargetDestination(destination, answering, titles, pending);
        if (rewrittenTo === null || rewrittenTo === destination) return whole;
        rewritten += 1;
        return `${head}${rewrittenTo}`;
      });

  return { content: outsideCode(content, retarget), rewritten, pending: [...pending] };
}

/**
 * The Markdown-form destination, retargeted, or `null` when it is not a link
 * into the vault or nothing answered to it.
 */
function retargetDestination(
  destination: string,
  answering: (target: string) => string | null,
  titles: ReadonlySet<string>,
  pending: Set<string>,
): string | null {
  // A scheme or a host means the world and never the vault.
  if (HAS_SCHEME.test(destination) || destination.startsWith('//')) return null;

  const at = destination.indexOf('#');
  const path = at === -1 ? destination : destination.slice(0, at);
  const anchor = at === -1 ? '' : destination.slice(at);
  const basename = (path.split('/').pop() ?? path).replace(/\.mdx?$/i, '');
  if (basename.length === 0) return null;

  // A destination this job already retargeted reads, to the retired rule, like
  // a slug of nothing — so without this a second run would report every one of
  // them as a link left pending. What the CURRENT reader makes of it is the
  // answer, and it already names a note.
  if (titles.has(percentDecode(basename))) return destination;

  const title = answering(basename);
  if (title === null) {
    pending.add(destination);
    return null;
  }
  return `${encodeDestination(title)}${anchor}`;
}

/** An escape that is not one is left as written and is never an error. */
function percentDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * A title written where a destination goes.
 *
 * The reader splits the anchor, discards the path, drops a trailing `.md` and
 * only THEN percent-decodes, so everything that would be read as one of those
 * delimiters is encoded here — the trailing extension included, which is why a
 * note called `README.md` survives being linked to.
 */
function encodeDestination(title: string): string {
  return title
    .replace(
      /[%\s#()<>[\]"\\/]/g,
      (character) => `%${character.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`,
    )
    .replace(/\.(mdx?)$/i, '%2E$1');
}

/** Applies a transformation to everything that is not code, and to nothing else. */
function outsideCode(markdown: string, transform: (segment: string) => string): string {
  let out = '';
  let at = 0;
  for (const match of markdown.matchAll(CODE)) {
    out += transform(markdown.slice(at, match.index)) + match[0];
    at = match.index + match[0].length;
  }
  return out + transform(markdown.slice(at));
}

// --- The driver ------------------------------------------------------------

interface NoteSummary {
  readonly noteId: string;
  readonly title: string;
  readonly slug: string;
}

interface NoteDetail {
  readonly content: string;
  readonly revision: { readonly versionId: string };
}

interface VaultSummary {
  readonly vaultId: string;
  readonly name: string;
}

/** What one vault turned out to need, and what was done about it. */
interface VaultReport {
  readonly vault: string;
  readonly notes: number;
  titled: number;
  rewritten: number;
  readonly pending: Set<string>;
  readonly disagreed: Array<{ stored: string; stated: string }>;
  readonly unaddressable: string[];
  readonly repeated: Array<{ title: string; count: number }>;
}

class Api {
  constructor(
    private readonly origin: string,
    private readonly token: string,
  ) {}

  /**
   * One call to the product API.
   *
   * A vault of six hundred notes is six hundred calls, and a single throttle
   * or one bad gateway in the middle would throw the whole run away. Only 429
   * and 5xx are retried: a 4xx is an answer, and repeating it would ask the
   * same wrong question again.
   */
  async call<T>(method: string, path: string, body?: unknown): Promise<T> {
    for (let attempt = 1; ; attempt++) {
      const response = await fetch(`${this.origin}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.token}`,
          ...(body === undefined ? {} : { 'Content-Type': 'application/json; charset=utf-8' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      if (response.ok) return (await response.json()) as T;

      const retriable = response.status === 429 || response.status >= 500;
      const detail = await response.text();
      if (!retriable || attempt >= 4) {
        throw new Error(`${method} ${path} answered ${response.status}: ${detail}`);
      }
      console.warn(`  ${method} ${path} answered ${response.status}; retrying (${attempt} of 3)`);
      await new Promise((resume) => setTimeout(resume, 2 ** attempt * 1000));
    }
  }
}

/**
 * Refuses to run against a listing that no longer carries the stored title and
 * its slug, which is the shape this migration reads.
 *
 * It is the one guard worth having: run after the deploy, the job would find
 * no slug to resolve against, report every link pending, and write a
 * `title: undefined` into fifteen hundred notes. The information it needs is
 * gone by then, and the answer is to restore and run it in the right order.
 */
function assertMigratable(notes: readonly Record<string, unknown>[]): void {
  const first = notes[0];
  if (first === undefined) return;
  const missing = REQUIRED_SUMMARY_FIELDS.filter((field) => typeof first[field] !== 'string');
  if (missing.length > 0) {
    throw new Error(
      `The API is not the one this migration reads: a note listing carries no ${missing.join(', ')}. ` +
        'This job runs BEFORE the deploy of 0.6.0, against the version in production.',
    );
  }
}

async function migrateVault(api: Api, vault: VaultSummary, apply: boolean): Promise<VaultReport> {
  const notes = await api.call<Record<string, unknown>[]>(
    'GET',
    `/knowledge/vaults/${vault.vaultId}/notes`,
  );
  assertMigratable(notes);
  const summaries = notes as unknown as NoteSummary[];

  // The map the retired rule resolved with: one slug, one note. Where two
  // notes ever shared a slug the last one wins here, exactly as it did there.
  const titleBySlug = new Map(summaries.map((note) => [note.slug, note.title]));

  const report: VaultReport = {
    vault: vault.name,
    notes: summaries.length,
    titled: 0,
    rewritten: 0,
    pending: new Set<string>(),
    disagreed: [],
    unaddressable: summaries.filter((note) => unaddressable(note.title)).map((note) => note.title),
    repeated: repeatedTitles(summaries),
  };

  for (const summary of summaries) {
    const note = await api.call<NoteDetail>(
      'GET',
      `/knowledge/vaults/${vault.vaultId}/notes/${summary.noteId}`,
    );
    const stated = withStatedTitle(note.content, summary.title);
    const retargeted = retargetLinks(stated.content, titleBySlug);

    if (stated.changed) report.titled += 1;
    if (stated.existing !== null) {
      report.disagreed.push({ stored: summary.title, stated: stated.existing });
    }
    report.rewritten += retargeted.rewritten;
    for (const target of retargeted.pending) report.pending.add(target);

    if (apply && retargeted.content !== note.content) {
      await api.call('PUT', `/knowledge/vaults/${vault.vaultId}/notes/${summary.noteId}`, {
        content: retargeted.content,
        baseRevision: note.revision.versionId,
        // The stored title travels back unchanged: this job writes the title
        // into the content, it does not rename anything.
        title: summary.title,
      });
    }
  }
  return report;
}

/** The titles more than one note carries, which 0.6.0 allows and 0.5.x did not. */
function repeatedTitles(notes: readonly NoteSummary[]): Array<{ title: string; count: number }> {
  const counts = new Map<string, number>();
  for (const note of notes) counts.set(note.title, (counts.get(note.title) ?? 0) + 1);
  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([title, count]) => ({ title, count }));
}

function print(report: VaultReport): void {
  console.log('');
  console.log(`  ${report.vault}  -  ${report.notes} notes`);
  console.log(`    titles written        ${report.titled}`);
  console.log(`    links rewritten       ${report.rewritten}`);
  console.log(`    links left pending    ${report.pending.size}`);
  for (const target of [...report.pending].sort()) console.log(`      ${target}`);
  if (report.disagreed.length > 0) {
    console.log('    frontmatter stated another title, and the stored one wins:');
    for (const each of report.disagreed) console.log(`      ${each.stored}  <-  ${each.stated}`);
  }
  if (report.repeated.length > 0) {
    console.log('    titles carried by more than one note, which 0.6.0 allows:');
    for (const each of report.repeated) console.log(`      ${each.title} (${each.count})`);
  }
  if (report.unaddressable.length > 0) {
    console.log('    titles no link can name, with no repair available — rename them:');
    for (const title of report.unaddressable) console.log(`      ${title}`);
  }
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export async function main(argv: readonly string[]): Promise<number> {
  const apply = argv.includes('--apply');
  const api = new Api(required('API_ORIGIN'), required('ACCESS_TOKEN'));

  const vaults = await api.call<VaultSummary[]>('GET', '/knowledge/vaults');
  if (vaults.length === 0) {
    console.log('This account holds no vault: nothing to migrate.');
    return 0;
  }

  const reports: VaultReport[] = [];
  for (const vault of vaults) {
    const report = await migrateVault(api, vault, apply);
    reports.push(report);
    console.log(`  ${vault.name}: ${report.titled} titled, ${report.rewritten} links rewritten`);
  }

  console.log('');
  console.log('What this run found');
  for (const report of reports) print(report);

  console.log('');
  if (!apply) {
    console.log('Dry run: nothing was written. Pass --apply when the report reads right.');
    return 0;
  }
  console.log('Written. Deploy 0.6.0 next, then run ./deploy-aws/reproject-links.ps1');
  return 0;
}

const invokedDirectly = process.argv[1]?.endsWith('retitle.ts') === true;
if (invokedDirectly) {
  main(process.argv.slice(2))
    .then((code) => process.exit(code))
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : error);
      process.exit(1);
    });
}
