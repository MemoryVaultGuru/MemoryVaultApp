/**
 * VaultContextComposer builds the Vault Context: the guidance in full plus the
 * annotated tree, in one document (software-vision.md, section 9.2).
 *
 * It lives in the DOMAIN because the shape of this document IS the product,
 * not a presentation detail: it is the exact equivalent of what an agent gets
 * today by reading the guidance and running `ls -R` on a local folder,
 * in a single call.
 *
 * Four decisions are visible in the format:
 *  - the description of each folder comes along, because it is what steers
 *    where the agent writes, and that is why it is mandatory (RN-KNW-006);
 *  - the order is the DEFINED order, numbered, because it is signal (PP9);
 *  - the note count comes along, so the agent knows where the mass is before
 *    asking for any listing;
 *  - the IDENTIFIER of each folder comes along (RN-AGT-020), because it is the
 *    argument every folder tool takes and the only stable address a folder
 *    has. The numbering is derived from the current position among siblings,
 *    so reordering changes it and it can never serve as an address. Without
 *    the identifier here it is returned exactly once, by `create_folder`, and
 *    a session that created nothing can read this vault and not write in it;
 *  - and the RESERVED VOCABULARY comes along (RN-AGT-025), because an agent
 *    landing in a vault has no other way to tell an attribute name that means
 *    something everywhere from one that belongs to this vault alone.
 *
 * The vocabulary arrives as an argument and is never read here: the domain
 * knows no specification, and the pinned list reaches this function from the
 * composition root, which is the one layer allowed to know which version the
 * product implements.
 *
 * The labels are en-US because the MCP surface is the public contract and the
 * canonical locale is en_US (CLAUDE.md, language policy). The vault content
 * itself is whatever language its authors write in.
 */

import type { FolderId } from '@memorysmith/kernel';
import type { Vault } from '../vault/Vault.js';
import type { Folder } from '../vault/Folder.js';
import { VAULT_LIMITS } from '../values.js';

export interface VaultContextInput {
  readonly vault: Vault;
  /** The guidance Markdown, already read from the ContentStore by the use case. */
  readonly guidance: string | null;
  /**
   * The attribute names the specification reserves, in the order it declares
   * them, read from the pin by whoever wired this up.
   */
  readonly reservedVocabulary: readonly string[];
}

export function composeVaultContext(input: VaultContextInput): string {
  const { vault, guidance, reservedVocabulary } = input;
  const lines: string[] = [`# Vault: ${vault.name.value}`];

  if (guidance && guidance.trim().length > 0) {
    lines.push('', guidance.trim());
  } else {
    lines.push(
      '',
      '_This vault has no guidance yet. Ask the vault owner to write one before ' +
        'creating notes, since it is what declares the conventions of this vault._',
    );
  }

  lines.push(...reservedSection(reservedVocabulary));
  lines.push('', '## Structure');

  const folders = vault.folders;
  if (folders.size === 0) {
    lines.push('', '_This vault has no folders yet._');
    return lines.join('\n') + '\n';
  }

  let rendered = 0;
  let truncated = false;

  const render = (parentId: FolderId | null, prefix: string): void => {
    if (truncated) return;
    const children = folders.childrenOf(parentId);
    children.forEach((folder, index) => {
      if (truncated) return;
      if (rendered >= VAULT_LIMITS.maxFolders) {
        truncated = true;
        return;
      }
      rendered += 1;
      const numbering = prefix ? `${prefix}${index + 1}` : `${index + 1}`;
      lines.push(
        `${indentFor(numbering)}${numbering}. ${describe(folder, vault, folders.childrenOf(folder.id).length > 0)}`,
      );
      render(folder.id, `${numbering}.`);
    });
  };

  render(null, '');

  if (truncated) {
    // Above the folder ceiling the context is truncated WITH AN EXPLICIT
    // WARNING rather than silently (RN-KNW-010).
    lines.push(
      '',
      `_Truncated: this vault holds more than ${VAULT_LIMITS.maxFolders} folders, ` +
        'so the tree above is incomplete._',
    );
  }

  return lines.join('\n') + '\n';
}

/**
 * What the frontmatter reserves, and what two of those names mean HERE.
 *
 * The specification says `author` and `co-author` are what the author
 * **states**, and that nothing derives them from a session or an account
 * (§6.4); the audit trail of this product answers a different question and
 * stays authoritative for the file (non-negotiable rule 7). So this is a
 * convention the product teaches and never a value the product writes: an
 * agent that puts them in a note is stating something, and nothing in the
 * backend reconciles that statement with the history.
 */
function reservedSection(vocabulary: readonly string[]): string[] {
  if (vocabulary.length === 0) return [];
  return [
    '',
    '## Reserved attributes',
    '',
    'These attribute names mean the same thing in every vault, in every ' +
      'language, and are always written in en-US: ' +
      vocabulary.map((key) => `\`${key}\``).join(', ') +
      '. Every other attribute belongs to this vault, and its name is whatever ' +
      'the Guidance says it is.',
    '',
    'Reserving a name is a guarantee, not a prohibition: a vault may keep ' +
      'writing `autor:` and it stays indexed like any other attribute. What ' +
      'the reserved name buys is that a tool reading two vaults can offer one ' +
      'column over both.',
    '',
    'Here, `author` is **the person who authorized the connection** and ' +
      '`co-author` is **the connector that executed the write** — the two ' +
      '`whoami` names. They are what the note states about itself, not what ' +
      'the server observed: this product records who wrote what in its audit ' +
      'trail, answers it through `note_history`, and never writes an ' +
      'attribute into the body of a note. Whether this vault asks for them at ' +
      'all is its Guidance to say.',
  ];
}

/** One level of the numbering is one level of indentation. */
function indentFor(numbering: string): string {
  const depth = numbering.split('.').filter((part) => part.length > 0).length;
  return '   '.repeat(Math.max(0, depth - 1));
}

function describe(folder: Folder, vault: Vault, hasChildren: boolean): string {
  const name = hasChildren ? `${folder.name.value}/` : folder.name.value;
  const notes = vault.noteCountOf(folder.id);
  const annotations = [`${notes} ${notes === 1 ? 'note' : 'notes'}`];
  if (folder.hasTemplate) annotations.push('has TEMPLATE.md');
  // The identifier is fenced as code so that reading it and copying it into
  // the next call are the same gesture (RN-AGT-020).
  return `**${name}** \`${folder.id.value}\`: ${folder.description.value} (${annotations.join(', ')})`;
}
