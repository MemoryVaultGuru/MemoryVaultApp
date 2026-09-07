/**
 * No text the product serves to an agent cites a business rule code
 * (RN-AGT-021).
 *
 * The codes address a line of `docs/software-vision.md`, a document whoever
 * reads the MCP surface does not have. Inside a served answer `RN-AGT-020` is
 * a symbol that does not resolve: an agent drops it as noise, or reads it as
 * something addressable — a vault, a folder, a rule to cite back — and spends
 * a step on it. The sentence around it always stated the whole fact anyway.
 *
 * The traceability is real and it stays where the other ~50 occurrences are:
 * in comments and docblocks, next to the implementation. This test only
 * separates the two audiences, and it exists because the boundary is easy to
 * cross by writing one honest-looking parenthesis.
 */

import { describe, expect, it } from 'vitest';
import { DECLARED_SILENCE, RECOGNISED_NOTATION } from '@memorysmith/contracts';
import { TOOL_CATALOG } from '../src/mcp/catalog.js';
import { SKILLS, skillNamed } from '../src/mcp/skills.js';
import { whoAmI } from '../src/mcp/whoami.js';
import type { AgentCaller, VaultListing } from '../src/mcp/gateway.js';

const RULE_CODE = /RN-[A-Z]{3}-\d{3}/;

const caller: AgentCaller = {
  userId: 'user-1',
  email: 'someone@example.test',
  clientId: 'https://claude.ai/mcp',
  clientName: 'Claude',
  subscriptionId: 'sub-1',
};

const vaults: readonly VaultListing[] = [
  { vaultId: 'v-1', name: 'Procurement', description: 'What we decided and why', noteCount: 12 },
];

/** Everything the connector puts in front of an agent, in one list. */
function servedText(): Array<{ where: string; text: string }> {
  return [
    { where: 'whoami', text: whoAmI(caller, vaults) },
    { where: 'whoami, with no vault to reach', text: whoAmI(caller, []) },
    ...TOOL_CATALOG.flatMap((tool) => [
      { where: `${tool.name}.title`, text: tool.title },
      { where: `${tool.name}.description`, text: tool.description },
      { where: `${tool.name}.inputSchema`, text: JSON.stringify(tool.inputSchema) },
    ]),
    ...SKILLS.flatMap((skill) => [
      { where: `skill ${skill.name}.task`, text: skill.task },
      { where: `skill ${skill.name}.body`, text: skill.body },
    ]),
    ...RECOGNISED_NOTATION.flatMap((entry) => [
      { where: `notation ${entry.id}.effect`, text: entry.effect },
      { where: `notation ${entry.id}.syntax`, text: entry.syntax },
      { where: `notation ${entry.id}.example`, text: entry.example },
    ]),
    // Written in this repository rather than imported, which is exactly why
    // they are checked here: the profile's own text was never going to cite an
    // `RN-` code, and ours could.
    ...DECLARED_SILENCE.flatMap((entry) => [
      { where: `silence ${entry.id}.effect`, text: entry.effect },
      { where: `silence ${entry.id}.syntax`, text: entry.syntax },
      { where: `silence ${entry.id}.example`, text: entry.example },
    ]),
  ];
}

describe('the MCP surface does not cite the repository at the agent', () => {
  it.each(servedText())('$where carries no rule code', ({ text }) => {
    expect(text).not.toMatch(RULE_CODE);
  });

  it('still says the whole fact the folder-identifier paragraph carried', () => {
    const text = whoAmI(caller, vaults);

    expect(text).toContain('the identifier of each folder');
    expect(text).toContain('never have to have');
    expect(text).toContain('created a folder to write in it');
  });

  it('checks something: the list of served text is not empty', () => {
    expect(servedText().length).toBeGreaterThan(20);
  });
});

/**
 * The conversion a vault arriving with inline tags is offered (RN-PRT-007).
 *
 * It is a SKILL and not a tool, for a structural reason: reading `#subject`
 * for meaning would make the backend a third sanctioned reader of content,
 * against PP4 and RN-DSC-033. So what is asserted here is that the method
 * carries the four things that make it safe, because a skill that teaches
 * half of them is worse than none — it would put an agent halfway through a
 * migration nobody agreed to.
 */
describe('the product teaches the conversion instead of performing it', () => {
  const skill = skillNamed('convert-inline-tags');

  it('exists, and whoami indexes it, because the index is derived', () => {
    expect(skill).toBeDefined();
    expect(whoAmI(caller, vaults)).toContain('convert-inline-tags');
  });

  it('teaches what is NOT a tag, which is where the false positives live', () => {
    const body = skill?.body ?? '';
    expect(body).toContain('# Heading');
    expect(body).toContain('#ff0000');
    expect(body).toContain('C#');
    expect(body).toMatch(/fragment/i);
  });

  it('requires a proposal, and a person accepting it', () => {
    const body = skill?.body ?? '';
    expect(body).toMatch(/propose/i);
    expect(body).toMatch(/accept/i);
    // "Proceeding unless told otherwise" is the failure mode, and it is named.
    expect(body).toContain('unless told otherwise');
  });

  it('requires an ordinary authored write, one note at a time', () => {
    const body = skill?.body ?? '';
    expect(body).toContain('update_note');
    expect(body).toContain('baseRevision');
    expect(body).toMatch(/one note at a time/i);
    expect(body).toMatch(/history/i);
  });

  it('forbids rewriting the body, because the inline tag is the author bytes', () => {
    expect(skill?.body ?? '').toMatch(/Do not remove the inline tags/i);
  });

  it('says why the product does not do it itself', () => {
    // A method that reads as an unexplained restriction gets worked around.
    expect(skill?.body ?? '').toMatch(/third reader/i);
  });
});
