/**
 * The answer of the `whoami` tool.
 *
 * It exists because of the thesis of the product: a vault carries its own
 * instructions, and an agent that reads them writes like the person who owns
 * the vault would. That only pays off if the agent knows the instructions are
 * there, and nothing in the MCP protocol tells it. So the connector says it,
 * once, in the one call an agent makes when it does not know where it landed.
 *
 * The help is GENERATED FROM THE CATALOG, never written beside it. A prose
 * copy of the tool list would drift the first time a tool is renamed, and a
 * help that names a tool nobody implements is worse than no help: it sends the
 * agent down a path that fails. The names it walks come from READING_PATH,
 * which `catalogIsWellFormed` checks against the catalog itself.
 */

import { READING_PATH, TOOL_CATALOG, type ToolDefinition } from './catalog.js';
import { SKILLS } from './skills.js';
import type { AgentCaller, VaultListing } from './gateway.js';

function byName(name: string): ToolDefinition | undefined {
  return TOOL_CATALOG.find((tool) => tool.name === name);
}

/** A tool that changes something, as the catalog itself declares it. */
function writes(tool: ToolDefinition): boolean {
  return tool.annotations.readOnlyHint === false || tool.annotations.destructiveHint === true;
}

function identity(caller: AgentCaller): string {
  return [
    '## Who is acting',
    '',
    `- **Person**: ${caller.email ?? caller.userId}`,
    `- **Connector**: ${caller.clientName} (\`${caller.clientId}\`)`,
    `- **Subscription**: \`${caller.subscriptionId}\``,
    '',
    'Every note you write records both of them: the person who authorized this',
    'connection and the connector that executed the write. Neither is a header you',
    'can set, and the subscription was fixed when consent was given, so no argument',
    'of any tool can move this connection to another one.',
  ].join('\n');
}

function reach(vaults: readonly VaultListing[]): string {
  if (vaults.length === 0) {
    return [
      '## What you can reach',
      '',
      'No vault yet. Whoever authorized this connector has not created one, or has',
      'not been given access to any. Nothing below will return content until then.',
    ].join('\n');
  }

  return [
    '## What you can reach',
    '',
    ...vaults.map(
      (vault) =>
        `- **${vault.name}** (\`${vault.vaultId}\`), ${vault.noteCount} note(s)` +
        (vault.description ? `: ${vault.description}` : ''),
    ),
  ].join('\n');
}

/** The path, narrated from the catalog so the two can never disagree. */
function path(): string {
  const steps = READING_PATH.map(byName).filter(
    (tool): tool is ToolDefinition => tool !== undefined,
  );

  return [
    '## How to write here',
    '',
    'This vault describes itself. Read it before writing, in this order:',
    '',
    ...steps.map((tool, index) => `${index + 1}. **\`${tool.name}\`** — ${tool.title}.`),
    '',
    'The guidance says what this vault is for and the conventions it keeps. The',
    'folder descriptions say what belongs in each folder, which is how you choose',
    'where a note goes instead of guessing. The template is the shape the notes of',
    'that folder take.',
    '',
    'The vault context also gives you the identifier of each folder, next to its',
    'name, and that is the argument every folder tool takes. You never have to have',
    'created a folder to write in it.',
    '',
    'The server does NOT validate what you write against any of them. It stores the',
    'Markdown you send, whatever it is. Following the guidance and the template is',
    'what keeps a vault coherent, and it is the whole reason they are readable.',
  ].join('\n');
}

/**
 * The index, derived from the registry (RN-AGT-018). A skill that exists is
 * announced; one that does not exist cannot be, because there is no prose copy
 * of this list anywhere.
 */
function skills(): string {
  if (SKILLS.length === 0) return '';

  return [
    '## Skills, for the tasks that leave the common path',
    '',
    'The path above is what almost every session needs. These are written methods',
    'for the tasks it does not cover. Read one with `get_skill` before you start,',
    'not after.',
    '',
    ...SKILLS.map((skill) => `- \`${skill.name}\` — ${skill.task}`),
  ].join('\n');
}
function surface(): string {
  const reading = TOOL_CATALOG.filter((tool) => !writes(tool));
  const writing = TOOL_CATALOG.filter(writes);
  const line = (tool: ToolDefinition): string => `- \`${tool.name}\` — ${tool.title}`;

  return [
    '## Every tool',
    '',
    '**Reading**',
    ...reading.map(line),
    '',
    '**Writing**',
    ...writing.map(line),
    '',
    'Reading and writing never share a tool, so a call that only reads can never',
    'change anything by accident.',
  ].join('\n');
}

export function whoAmI(caller: AgentCaller, vaults: readonly VaultListing[]): string {
  return [identity(caller), reach(vaults), path(), skills(), surface()]
    .filter((block) => block.length > 0)
    .join('\n\n');
}
