/**
 * The skill registry: method, not operation.
 *
 * The product rests on a premise, that a vault carries its own instructions
 * and an agent that reads them writes like the owner would. There is exactly
 * one task where the premise cannot hold: CREATING the vault, because the
 * guidance is what is being produced. That is where the only quality lever the
 * product has is absent, and it is where it would pay off most.
 *
 * What is missing there is not an operation. `create_vault`, `set_guidance`,
 * `create_folder` and `set_template` already exist and are enough. What is
 * missing is METHOD: which questions to ask, in what order, what makes a
 * guidance good, and when to stop asking and start writing.
 *
 * The index of these skills is served by `whoami` and DERIVED FROM THIS
 * REGISTRY, never written beside it (RN-AGT-018): a hand-kept list drifts on
 * the first rename, and an index pointing at a skill nobody wrote sends the
 * agent down a path that fails. It is the same discipline RN-AGT-013 imposes
 * on the help itself.
 */

import {
  MARKDOWN_PROFILE_BASE,
  MARKDOWN_PROFILE_NAME,
  MARKDOWN_PROFILE_URL,
  MARKDOWN_PROFILE_VERSION,
  RECOGNISED_NOTATION,
  type RecognisedNotation,
} from '@memorysmith/contracts';

export interface Skill {
  /** Stable identifier, and the argument `get_skill` takes. */
  readonly name: string;
  /** The task, phrased as the agent would want it, not as a feature. */
  readonly task: string;
  /** The method, in Markdown, served verbatim. */
  readonly body: string;
}

const DESIGN_VAULT = `# Designing a vault from scratch

You are about to create a vault. This is the one moment where the vault cannot
tell you what it is, because you are the one deciding it. Everything written
here is what the product would have told you if it could.

## Start from samples, never from a questionnaire

Do not ask "what is this vault for?". An abstract question about purpose
produces a generic vault, and a generic vault produces vague folder
descriptions, which is what makes an agent guess where a note goes.

Ask instead:

> Show me three things you want to keep in here.

Real material, as it exists today: a norm, a meeting note, a paper, an incident
report, a contract clause. You usually already have them in the conversation or
in the work at hand. The shape of a vault is derived from the material that
will live in it.

From three samples you can already see what a folder is, what a note is, and
which fields repeat. From a paragraph about purpose you can see none of that.

## Then decide, in this order

1. **What this vault is, in one paragraph.** What belongs, and what
   deliberately does not. The second half is the one that saves work later: a
   vault that never says what it excludes accumulates everything.
2. **The kinds of note it recognises.** Two or three, no more, each with a name
   the owner would use out loud. If a kind cannot be told apart from another by
   its content, it is one kind.
3. **The folders.** One folder per kind of material, ordered so the reading
   order means something (order is signal, not decoration). Every folder needs
   a description that answers a single question: what goes in here, and what
   goes somewhere else instead.
4. **The template of each folder that receives notes.** It is the shape of the
   note, and it is the only thing that keeps the tenth note looking like the
   first.

## Writing the guidance

The guidance is the document the next agent reads before writing. Write it for
that reader, not for a human browsing a wiki.

- **Do not open with a title.** The Vault Context already emits a heading with
  the vault name above whatever you write, so a \`# My vault\` at the top shows
  up twice. Start with the paragraph that says what this vault is.
- **Name the vocabulary.** If the owner calls something a "finding" and not an
  "issue", write that down. The vocabulary of the vault becomes the query
  language of the search: any frontmatter attribute is a filter.
- **State the naming convention** for note titles, and give one example of a
  good title and one of a bad one.
- **Declare the frontmatter you expect**, field by field, with the accepted
  values. If you declare it, every folder that receives notes needs a template
  carrying it.
- **Say what NOT to do.** A guidance that only describes the happy shape gets
  followed halfway.

The server never validates a note against the guidance. Nothing you write here
is enforced: it is read, and followed, and that is exactly why it has to be
unambiguous.

## Before you say it is done

Check these four, in order. The first two are the mistakes that actually
happened when this was done without a method:

1. Does the guidance open with a heading that repeats the vault name? Remove it.
2. Does every folder that receives notes have a template? A guidance that
   declares mandatory frontmatter and a folder without a template is a
   contradiction the next agent will resolve by guessing.
3. Does every folder description answer where a note goes, or does it merely
   name the folder again? "Norms" is a name; "the reading record of each norm,
   tied to the text of that version" is a description.
4. Write ONE real note, from one of the three samples, following the template.
   If you cannot fill the template from real material, the template is wrong,
   and it is cheaper to find that out now than on the fortieth note.

## When to stop asking

When you can write the first note without asking anything else. That is the
test. Two or three questions usually get you there; a fourth is often you
avoiding the decision the owner already gave you.
`;

/**
 * Built from RECOGNISED_NOTATION, never written beside it (RN-AGT-017). The
 * prose around the table is the part a person wrote; the table itself is the
 * declaration that Discovery tests against its own extractors, so a notation
 * that stops being read stops being taught in the same commit.
 *
 * **The whole declaration, base ring included, and that is a decision.**
 * Profile v0.3.0 restated CommonMark and GFM inside `profile.json`, taking the
 * table from 31 rows to 54, and the first reading was that twenty of them tell
 * an agent that a paragraph is a paragraph. They do not. Each base entry
 * states where THIS profile changes what the base means — that a link inside a
 * code span is not extracted, that `![[x]]` is an embed and not an image, that
 * a wikilink in a table cell is an edge like any other, that `_` does not
 * emphasise inside a word. Those crossings are invisible from CommonMark
 * alone and are exactly what an agent gets wrong, so the reader who most
 * needs them is the one reading this table. The two guards that were scoped
 * instead — the reading-surface expectations and the demonstration vaults —
 * were scoped for reasons that do not apply here.
 */
function notationTable(): string {
  const row = (entry: RecognisedNotation): string =>
    `| \`${entry.syntax}\` | ${entry.ring} | ${entry.recognised ? 'yes' : '**no**'} | ${entry.effect} |`;

  return [
    '| Form | Ring | Read? | What happens |',
    '| --- | --- | --- | --- |',
    ...RECOGNISED_NOTATION.map(row),
  ].join('\n');
}

/**
 * The three rings, named with the versions this build implements.
 *
 * It comes first in the skill, because "which Markdown is this" is the
 * question underneath every other one an agent has about writing here, and
 * answering it with a specification and a version is a different answer from
 * a list of forms (RN-AGT-022). It is generated from the profile, so it cannot
 * cite a version this build does not carry.
 */
function rings(): string {
  const base = MARKDOWN_PROFILE_BASE.map(
    (spec) => `- **${spec.name} ${spec.version}** — ${spec.url}`,
  );

  return [
    `This product implements the **${MARKDOWN_PROFILE_NAME} ${MARKDOWN_PROFILE_VERSION}**, a`,
    `published specification: ${MARKDOWN_PROFILE_URL}`,
    '',
    'It has three rings, and which one a form belongs to tells you how much you',
    'can rely on it elsewhere:',
    '',
    ...base,
    '- **The MemorySmith ring**, specified by the profile above: the wikilink, the embed,',
    '  the frontmatter vocabulary, the callout. This is the part no base',
    '  specification covers and that every tool means something slightly different',
    '  by, which is why it is written down.',
    '',
    'Every form in the table below belongs to one of those rings, and the table is',
    'generated from the profile itself: it cannot describe a notation this build',
    'does not implement.',
    '',
    '**Read the inherited rows too.** They are there because the profile says',
    'where it changes what they mean, and that is the part you cannot get from',
    'knowing Markdown: a link inside a code span is not read, `![[note]]` is an',
    'embed and not an image, a wikilink inside a table cell is an edge like any',
    'other, and `_` does not emphasise in the middle of a word.',
  ].join('\n');
}

const CONVERT_INLINE_TAGS = `# Bringing a vault that used inline tags

A vault written in an editor that reads \`#subject\` in the body as metadata
arrives here intact. Nothing breaks and no note is refused. But the curation
those tags carried is **lost**: here they are ordinary text, countable by
nobody, and the person who spent a year filing notes with them has a vault that
looks the same and answers nothing.

That is the declared cost of a decision, and it is paid at the door by whoever
is arriving. This is how you offer to pay it for them.

## Why the product does not do this itself

You are reading a method and not calling a tool, and that is deliberate.

Reading \`#subject\` for meaning would make the server a third reader of the
content of a note, which is exactly what this product refuses: the frontmatter
and the link are the only two things it reads, and everything else in a note is
text it stores and never interprets. Adding a parser here to pay for a
notation the profile rejects would spend the guarantee to buy back the cost of
having made it.

**And \`#\` is treacherous.** In one survey of 1,562 notes, one of the three
inline matches was a hex colour. A false positive is cheap here **only because
a person reads your proposal before anything is written** — that is the whole
reason this is safe, so it is the one thing you may never skip.

## What is not a tag

Before you propose anything, rule these out. Every one of them is written by
somebody every day:

| Looks like a tag | Is | How to tell |
|---|---|---|
| \`# Heading\` | a heading | \`#\` at the start of a line, followed by a space |
| \`#ff0000\` | a colour | all hex digits, three or six of them |
| \`C#\`, \`F#\` | a language | the \`#\` is at the END of a word |
| \`#1\`, \`#42\` | an issue or a number | all digits |
| \`https://x.org/a#section\` | a URL fragment | the \`#\` is inside a link |
| \`#tag\` inside \`\\\`code\\\`\` or a fence | an example | it is code |

What is left is a \`#\` preceded by whitespace or line start, followed by a
letter, running to whitespace or punctuation. Nested forms like
\`#area/subject\` are one tag, not two.

## The method

1. **Find the candidates.** \`search_notes\` reads the body, so a query for the
   marker narrows the vault to the notes worth reading. Read them with
   \`read_note\`.
2. **Read the guidance first.** The vault may already say what its frontmatter
   vocabulary is. A tag that contradicts it is a question for the owner, not a
   write.
3. **Propose, per note, in full.** Show the note, the tags you found, and the
   \`tags:\` you would write. If the vault already has a \`tags:\` on that note,
   show the MERGED list: you are adding to curation, never replacing it.
   List separately anything you rejected and why, because a rejection you got
   wrong is invisible unless you say it out loud.
4. **Wait.** Not "proceeding unless told otherwise". Acceptance is a person
   saying yes to what they read.
5. **Write one note at a time**, with \`update_note\`, carrying the
   \`baseRevision\` the read returned. Each note is an ordinary authored write:
   it lands in the history under the person who accepted it, with a revision of
   its own, and \`note_history\` shows it like any other. There is no migration
   mode and no silent pass.
6. **Leave the body alone.** The \`#subject\` stays exactly where it was
   written. You are adding the subject somewhere it counts, not editing
   somebody's prose, and leaving it makes the whole thing reversible by
   deleting one line of frontmatter.

## What to say when it is done

Say how many notes you wrote, how many you proposed and they declined, and what
you found and did not propose. A conversion nobody can audit afterwards is a
migration, which is the thing this is not.

## What not to do

- Do not run it over a vault without being asked to.
- Do not write a note the person did not see.
- Do not "finish the rest the same way" after one acceptance. Each note is a
  note somebody wrote.
- Do not remove the inline tags. They are the author's bytes.
`;

const WRITE_NOTES = `# Writing a note this product can read

The body of a note is Markdown, and it is stored exactly as you send it. Almost
all of it is text the product never looks at, which is deliberate: what a
convention means belongs to the vault, not to the server.

There are exactly two places where the product DOES read your content, and this
is the whole list. Everything else you write is text, and nothing more.

## Which Markdown this is

${rings()}

## The notation

${notationTable()}

## What none of this changes

- **The server never validates a note.** It does not check your frontmatter
  against the guidance, does not check the shape against the template, and does
  not refuse a note for any of it. The Markdown you send is the Markdown that
  gets stored.
- **The frontmatter is not searched.** It is what facets are built from, and
  keeping it in the searchable text would make every note match its own
  metadata. Write in the body what you want found by searching.
- **No key is special.** \`maturity\` and \`reviewed\` are attributes like any
  other: the vocabulary belongs to the guidance of the vault you are writing in.
  Read it before inventing a field.

## What is NOT read, and is worth knowing before you rely on it

- A tag written in the body, like \`#procurement\`. Only the frontmatter becomes
  a facet.
- A block identifier, like \`^abc123\`. That is a convention of a desktop
  editor, not universal Markdown.
- A heading. Headings are searchable text and give a section name to a link
  anchor; they carry no other meaning.
- Anything the guidance of the vault invented and the server was never told
  about. Conventions are for the humans and agents reading the vault, and they
  work because everyone follows them, not because anything enforces them.

## Searching what you wrote

\`search_notes\` reads the body, not the frontmatter, and its query language is
the other half of this: \`"exact phrase"\`, \`-exclusion\`, \`OR\`, parentheses,
and the fields \`title:\`, \`folder:\`, \`section:\` and \`content:\`. Any other
prefix is read as a frontmatter attribute, which is what makes
\`maturity:evergreen\` a valid filter without a line of code about it. The
vocabulary of the vault becomes the query language of the vault.
`;
/**
 * One skill per task, and only tasks that fall OUTSIDE the common path. The
 * reading path that `whoami` already teaches covers almost every session and
 * stays inline: spending a round trip to learn it would be friction against
 * the very thesis of the connector.
 */
export const SKILLS: readonly Skill[] = [
  {
    name: 'design-vault',
    task: 'Design a vault from scratch: its guidance, its folders and their templates',
    body: DESIGN_VAULT,
  },
  {
    name: 'write-notes',
    task: 'Write a note this product can read: the notation it interprets, and the notation it does not',
    body: WRITE_NOTES,
  },
  {
    name: 'convert-inline-tags',
    task: 'Bring a vault that used inline #tags: propose the equivalent frontmatter, note by note',
    body: CONVERT_INLINE_TAGS,
  },
];

export function skillNamed(name: string): Skill | undefined {
  return SKILLS.find((skill) => skill.name === name);
}
