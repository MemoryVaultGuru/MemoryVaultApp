import { describe, expect, it } from 'vitest';
import { READING_PATH, TOOL_CATALOG, catalogIsWellFormed } from '../src/mcp/catalog.js';
import { McpToolAdapter } from '../src/mcp/tools.js';
import { GatewayError, type AgentCaller } from '../src/mcp/gateway.js';
import { handleMcpRequest } from '../src/mcp.js';
import { SKILLS, skillNamed } from '../src/mcp/skills.js';
import {
  DECLARED_SILENCE,
  MARKDOWN_PROFILE_SOURCES,
  RECOGNISED_NOTATION,
} from '@memorysmith/contracts';
import type { VerifiedAgentToken } from '../src/auth.js';
import pkg from '../package.json' with { type: 'json' };

const caller: AgentCaller = {
  userId: 'user-1',
  clientId: 'https://claude.ai/mcp',
  clientName: 'Claude',
  subscriptionId: '01JBQ2X0000000000000000000',
};

function gateways(overrides: Record<string, unknown> = {}) {
  const knowledge = {
    listVaults: async () => [
      { vaultId: 'v1', name: 'Normas', description: 'Texto normativo', noteCount: 48 },
    ],
    vaultContext: async () => '# Vault: Normas\n\n## Structure\n1. **Normas**: (48 notes)\n',
    template: async () => ({ content: '# Modelo\n\n## Vigencia', folderName: 'Normas' }),
    listNotes: async () => [
      { noteId: 'n1', title: 'Lei 14.133', slug: 'lei-14133', folderId: 'f1', position: 'a0' },
    ],
    readNote: async () => ({
      noteId: 'n1',
      title: 'Lei 14.133',
      content: '# Lei 14.133',
      revision: 'v3',
      updatedAt: '2026-03-20T10:00:00.000Z',
    }),
    createNote: async () => ({
      noteId: 'n2',
      title: 'Nova',
      content: '# Nova',
      revision: 'v1',
      updatedAt: '2026-03-21T10:00:00.000Z',
    }),
    updateNote: async () => ({
      noteId: 'n1',
      title: 'Lei 14.133',
      content: '# Atualizada',
      revision: 'v4',
      updatedAt: '2026-03-22T10:00:00.000Z',
    }),
    searchNotes: async () => [
      { noteId: 'n1', title: 'Lei 14.133', section: null, excerpt: 'Lei 14.133', score: 1 },
    ],
    createVault: async () => ({
      vaultId: 'v2',
      name: 'Achados',
      description: 'Achados de auditoria',
      noteCount: 0,
    }),
    deleteVault: async () => undefined,
    setGuidance: async () => undefined,
    guidance: async () => ({ content: '# Proposito', revision: 'v1' }),
    createFolder: async () => ({
      folderId: 'f2',
      parentFolderId: null,
      name: 'Achados',
      slug: 'achados',
      description: 'Achados de auditoria.',
    }),
    deleteFolder: async () => ({ removedFolderIds: ['f2'] }),
    setTemplate: async () => undefined,
    deleteNote: async () => undefined,
    ...((overrides['knowledge'] as object) ?? {}),
  };
  const discovery = {
    relatedNotes: async () => ({
      noteId: 'n1',
      title: 'Achado 12',
      depth: 0,
      children: [{ noteId: 'n2', title: 'Lei 14.133', depth: 1, children: [] }],
    }),
    backlinks: async () => [
      { noteId: 'n3', title: 'Achado 12', slug: 'achado-12', folderId: 'f2', position: 'a0' },
    ],
    ...((overrides['discovery'] as object) ?? {}),
  };
  const audit = {
    noteHistory: async () => [
      {
        occurredAt: '2026-03-20T10:00:00.000Z',
        type: 'NoteUpdated',
        userId: 'user-1',
        agentName: 'Claude',
        revision: 'v3',
      },
    ],
    revisionAt: async () => ({
      noteId: 'n1',
      title: '',
      content: '# Como estava em marco',
      revision: 'v2',
      updatedAt: '2026-03-10T10:00:00.000Z',
    }),
    ...((overrides['audit'] as object) ?? {}),
  };
  return new McpToolAdapter({ knowledge, discovery, audit } as never);
}

describe('The tool catalog is the public contract', () => {
  it('publishes the whole authoring surface, reads and writes', () => {
    // The catalog IS the public contract of the product: a tool leaving it, or
    // an argument changing shape, is a version bump and never a quiet edit.
    expect(TOOL_CATALOG.map((tool) => tool.name)).toEqual([
      'whoami',
      'get_skill',
      'list_vaults',
      'create_vault',
      'delete_vault',
      'get_vault_context',
      'get_guidance',
      'set_guidance',
      'create_folder',
      'delete_folder',
      'get_template',
      'set_template',
      'list_notes',
      'read_note',
      'create_note',
      'update_note',
      'delete_note',
      'search_notes',
      'related_notes',
      'backlinks',
      'note_history',
    ]);
  });

  it('gives every tool a title and a read-only or destructive hint', () => {
    // RN-AGT-009: without the hints a client asks the user on every call.
    expect(catalogIsWellFormed()).toBe(true);
    for (const tool of TOOL_CATALOG) {
      expect(tool.title.length).toBeGreaterThan(0);
      expect(tool.description.length).toBeGreaterThan(40);
    }
  });

  it('narrates a reading path made only of tools that exist', () => {
    /**
     * The help of `whoami` walks READING_PATH. A step naming a tool nobody
     * implements would send an agent down a path that fails on the first call,
     * which is worse than shipping no help at all.
     */
    const named = new Set(TOOL_CATALOG.map((tool) => tool.name));
    for (const step of READING_PATH) expect(named.has(step)).toBe(true);
  });

  it('never mixes reading and writing in one tool', () => {
    // RN-AGT-010: there is no generic tool parameterized by operation.
    const writers = TOOL_CATALOG.filter((tool) => tool.annotations.readOnlyHint === false);
    expect(writers.map((tool) => tool.name)).toEqual([
      'create_vault',
      'delete_vault',
      'set_guidance',
      'create_folder',
      'delete_folder',
      'set_template',
      'create_note',
      'update_note',
      'delete_note',
    ]);
    for (const tool of TOOL_CATALOG) {
      const readable = tool.annotations.readOnlyHint === true;
      const writable = tool.annotations.readOnlyHint === false;
      expect(readable !== writable).toBe(true);
    }
  });

  it('declares create_note as idempotent and update_note as destructive', () => {
    const create = TOOL_CATALOG.find((tool) => tool.name === 'create_note');
    const update = TOOL_CATALOG.find((tool) => tool.name === 'update_note');
    expect(create?.annotations.idempotentHint).toBe(true);
    expect(create?.annotations.destructiveHint).toBe(false);
    expect(update?.annotations.destructiveHint).toBe(true);
  });

  it('tells the agent to read the template before writing', () => {
    // RN-AGT-002: the server does not validate against the template, so the
    // description is what carries the instruction.
    const create = TOOL_CATALOG.find((tool) => tool.name === 'create_note');
    expect(create?.description).toContain('get_template');
  });
});

describe('whoami answers who is acting and how to write here', () => {
  it('names the person, the connector and the subscription', async () => {
    const result = await gateways().call(
      'whoami',
      {},
      {
        ...caller,
        email: 'heitor@example.com',
      },
    );
    expect(result.isError).toBe(false);

    const answer = result.content[0]?.text ?? '';
    expect(answer).toContain('heitor@example.com');
    expect(answer).toContain('Claude');
    expect(answer).toContain(caller.subscriptionId);
  });

  it('falls back to the identifier when the token carries no e-mail', async () => {
    const result = await gateways().call('whoami', {}, caller);
    expect(result.content[0]?.text ?? '').toContain('user-1');
  });

  it('lists the vaults actually within reach, not a description of them', async () => {
    const result = await gateways().call('whoami', {}, caller);
    const answer = result.content[0]?.text ?? '';
    expect(answer).toContain('Normas');
    expect(answer).toContain('48 note(s)');
  });

  it('says plainly when there is no vault yet', async () => {
    const empty = gateways({ knowledge: { listVaults: async () => [] } });
    const result = await empty.call('whoami', {}, caller);
    expect(result.content[0]?.text ?? '').toContain('No vault yet');
  });

  it('walks the reading path and names every tool of the catalog', async () => {
    const result = await gateways().call('whoami', {}, caller);
    const answer = result.content[0]?.text ?? '';

    // The path, in order, and each step where it belongs.
    for (const [index, step] of READING_PATH.entries()) {
      expect(answer).toContain(`${index + 1}. **\`${step}\`**`);
    }
    // And nothing in the catalog is left out of the surface it advertises.
    for (const tool of TOOL_CATALOG) expect(answer).toContain(`\`${tool.name}\``);
  });

  it('says the server does not validate content against guidance or template', async () => {
    // PP4: the backend never interprets a note. An agent that assumes it does
    // would trust a check that never runs.
    const result = await gateways().call('whoami', {}, caller);
    expect(result.content[0]?.text ?? '').toContain('does NOT validate');
  });
});

describe('The connector authors the vault, and not only its notes', () => {
  /** Each write tool reaches its own use case; none is parameterized by operation. */
  function spy(): { calls: string[]; adapter: ReturnType<typeof gateways> } {
    const calls: string[] = [];
    const adapter = gateways({
      knowledge: {
        createVault: async (_caller: unknown, input: { name: string }) => {
          calls.push(`createVault:${input.name}`);
          return { vaultId: 'v2', name: input.name, description: '', noteCount: 0 };
        },
        deleteVault: async (_caller: unknown, vaultId: string) => {
          calls.push(`deleteVault:${vaultId}`);
        },
        setGuidance: async (_caller: unknown, vaultId: string, content: string) => {
          calls.push(`setGuidance:${vaultId}:${content}`);
        },
        createFolder: async (
          _caller: unknown,
          input: { name: string; parentFolderId?: string },
        ) => {
          calls.push(`createFolder:${input.name}:${input.parentFolderId ?? 'root'}`);
          return {
            folderId: 'f9',
            parentFolderId: input.parentFolderId ?? null,
            name: input.name,
            slug: 'x',
            description: 'y',
          };
        },
        deleteFolder: async (_caller: unknown, input: { folderId: string; policy: string }) => {
          calls.push(`deleteFolder:${input.folderId}:${input.policy}`);
          return { removedFolderIds: [input.folderId] };
        },
        setTemplate: async (_caller: unknown, input: { folderId: string }) => {
          calls.push(`setTemplate:${input.folderId}`);
        },
        deleteNote: async (_caller: unknown, vaultId: string, noteId: string) => {
          calls.push(`deleteNote:${vaultId}:${noteId}`);
        },
      },
    });
    return { calls, adapter };
  }

  it('creates a vault, its guidance, a folder and its template', async () => {
    const { calls, adapter } = spy();
    await adapter.call('create_vault', { name: 'Achados', description: 'De auditoria' }, caller);
    await adapter.call(
      'set_guidance',
      { vault: 'v2', content: '# Proposito', baseRevision: null },
      caller,
    );
    await adapter.call(
      'create_folder',
      { vault: 'v2', name: '2026', description: 'Deste exercicio.', parent: 'f1' },
      caller,
    );
    await adapter.call(
      'set_template',
      { vault: 'v2', folder: 'f9', content: '# {{t}}', baseRevision: null },
      caller,
    );

    expect(calls).toEqual([
      'createVault:Achados',
      'setGuidance:v2:# Proposito',
      'createFolder:2026:f1',
      'setTemplate:f9',
    ]);
  });

  it('deletes a note, a folder and a vault, each through its own tool', async () => {
    const { calls, adapter } = spy();
    await adapter.call('delete_note', { vault: 'v1', note: 'n1' }, caller);
    await adapter.call('delete_folder', { vault: 'v1', folder: 'f2', policy: 'CASCADE' }, caller);
    await adapter.call('delete_vault', { vault: 'v1' }, caller);

    expect(calls).toEqual(['deleteNote:v1:n1', 'deleteFolder:f2:CASCADE', 'deleteVault:v1']);
  });

  it('refuses to remove a folder without an explicit policy', async () => {
    // RN-KNW-007: there is no implicit default, so the tool asks rather than
    // guessing between refusing and cascading over a subtree.
    const result = await gateways().call('delete_folder', { vault: 'v1', folder: 'f2' }, caller);
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('delete_folder requires the argument "policy"');
  });

  it('says plainly that a deletion destroyed nothing', async () => {
    const { adapter } = spy();
    const note = await adapter.call('delete_note', { vault: 'v1', note: 'n1' }, caller);
    const vault = await adapter.call('delete_vault', { vault: 'v1' }, caller);
    expect(note.content[0]?.text).toContain('history');
    expect(vault.content[0]?.text).toContain('Nothing was destroyed');
  });

  it('passes a refusal by role through, instead of pretending it wrote', async () => {
    // RN-AGT-006 generalized: a VIEWER is refused on every write tool, and the
    // refusal reaches the agent as an error with text it can act on.
    const adapter = gateways({
      knowledge: {
        createVault: async () => {
          throw new GatewayError('FORBIDDEN', 'Creating a vault requires the EDITOR role');
        },
      },
    });
    const result = await adapter.call('create_vault', { name: 'X', description: 'Y' }, caller);
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('EDITOR');
  });
});

describe('The tool adapter translates in both directions', () => {
  it('returns the vault context as Markdown, not as JSON', async () => {
    const result = await gateways().call('get_vault_context', { vault: 'v1' }, caller);
    expect(result.isError).toBe(false);
    expect(result.content[0]?.text).toContain('# Vault: Normas');
    expect(result.content[0]?.text).toContain('## Structure');
  });

  it('answers a missing argument with the schema of the tool', async () => {
    // RN-AGT-003: the error carries what the next attempt needs.
    const result = await gateways().call('create_note', { vault: 'v1' }, caller);
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('create_note requires the argument "folder"');
    expect(result.content[0]?.text).toContain('title');
  });

  it('passes ALREADY_EXISTS through with the identifier of the existing note', async () => {
    const adapter = gateways({
      knowledge: {
        createNote: async () => {
          throw new GatewayError('CONFLICT', 'A note with this slug already exists', {
            code: 'ALREADY_EXISTS',
            noteId: 'n1',
          });
        },
      },
    });
    const result = await adapter.call(
      'create_note',
      { vault: 'v1', folder: 'f1', title: 'Lei 14.133', content: '# Lei' },
      caller,
    );
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('ALREADY_EXISTS');
    expect(result.content[0]?.text).toContain('n1');
  });

  it('passes a revision conflict through with the current content', async () => {
    const adapter = gateways({
      knowledge: {
        updateNote: async () => {
          throw new GatewayError('CONFLICT', 'The note changed since your revision', {
            currentRevision: 'v9',
            currentContent: '# Conteudo atual',
          });
        },
      },
    });
    const result = await adapter.call(
      'update_note',
      { vault: 'v1', note: 'n1', content: '# Nova', baseRevision: 'v3' },
      caller,
    );
    expect(result.content[0]?.text).toContain('Conteudo atual');
  });

  it('reads a past revision through the audit trail when asOf is given', async () => {
    const result = await gateways().call(
      'read_note',
      { vault: 'v1', note: 'n1', asOf: '2026-03-15T00:00:00.000Z' },
      caller,
    );
    expect(result.content[0]?.text).toContain('Como estava em marco');
  });

  it('renders the dependency tree as an indented outline', async () => {
    const result = await gateways().call('related_notes', { vault: 'v1', note: 'n1' }, caller);
    expect(result.content[0]?.text).toBe('- Achado 12 (n1)\n  - Lei 14.133 (n2)');
  });

  it('says something useful when the connector reaches no vault', async () => {
    const adapter = gateways({ knowledge: { listVaults: async () => [] } });
    const result = await adapter.call('list_vaults', {}, caller);
    expect(result.isError).toBe(false);
    expect(result.content[0]?.text).toContain('reaches no vault yet');
  });
});

describe('The MCP transport', () => {
  const token: VerifiedAgentToken = {
    sub: 'user-1',
    clientId: 'https://claude.ai/mcp',
    subscriptionId: '01JBQ2X0000000000000000000',
    payload: {},
  };

  it('lists the catalog on tools/list', async () => {
    const response = await handleMcpRequest(
      { jsonrpc: '2.0', id: 1, method: 'tools/list' },
      token,
      gateways(),
    );
    expect(response).not.toBeNull();
    const tools = (response as { result: { tools: unknown[] } }).result.tools;
    expect(tools).toHaveLength(TOOL_CATALOG.length);
  });

  it('refuses a tool call from a token with no subscription', async () => {
    const unbound: VerifiedAgentToken = { sub: 'user-1', clientId: 'x', payload: {} };
    const response = await handleMcpRequest(
      { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'list_vaults' } },
      unbound,
      gateways(),
    );
    const result = (response as { result: { isError: boolean; content: Array<{ text: string }> } })
      .result;
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('not bound to a subscription');
  });

  it('announces the version of the service manifest on the handshake, never a literal', async () => {
    const response = await handleMcpRequest(
      { jsonrpc: '2.0', id: 1, method: 'initialize' },
      token,
      gateways(),
    );
    const { serverInfo } = (
      response as { result: { serverInfo: { name: string; version: string } } }
    ).result;
    expect(serverInfo.name).toBe('memorysmith-mcp');
    // Compared against the manifest, not against a number written here: a
    // literal in the test would have to be edited on every release, which is
    // the very failure this fixes.
    expect(serverInfo.version).toBe(pkg.version);
  });

  it('answers notifications with no body', async () => {
    const response = await handleMcpRequest(
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      token,
      gateways(),
    );
    expect(response).toBeNull();
  });
});

describe('skills: the method, indexed by whoami', () => {
  it('indexes every registered skill, derived from the registry', async () => {
    const result = await gateways().call('whoami', {}, caller);
    const help = result.content[0]?.text ?? '';

    // Derived, not transcribed: every skill in the registry shows up with the
    // task it teaches, and nothing else can (RN-AGT-018).
    for (const skill of SKILLS) {
      expect(help).toContain(skill.name);
      expect(help).toContain(skill.task);
    }
    expect(help).toContain('get_skill');
  });

  it('serves the body of a skill by name', async () => {
    const result = await gateways().call('get_skill', { name: 'design-vault' }, caller);

    expect(result.isError).toBe(false);
    expect(result.content[0]?.text).toBe(skillNamed('design-vault')?.body);
  });

  it('teaches the two mistakes that a vault designed without method makes', () => {
    const body = skillNamed('design-vault')?.body ?? '';

    // The evidence this skill exists for: a guidance opening with a heading
    // the Vault Context already emits, and a folder without a template while
    // the guidance declares mandatory frontmatter.
    expect(body).toContain('Do not open with a title');
    expect(body).toContain('template');
  });

  it('builds the notation skill from the declaration, never beside it', async () => {
    const body = skillNamed('write-notes')?.body ?? '';

    // Every declared form and its effect are in the text. Discovery tests the
    // same declaration against its extractors, so a notation that stops being
    // read stops being taught (RN-AGT-017).
    for (const entry of RECOGNISED_NOTATION) {
      expect(body).toContain(entry.syntax);
      expect(body).toContain(entry.effect);
    }
  });

  it('teaches what the product deliberately does not read', () => {
    const body = skillNamed('write-notes')?.body ?? '';

    // The half an agent gets wrong is not the notation it mistyped, it is the
    // one it believed in, so the list of what does nothing is part of the
    // skill and not an appendix.
    //
    // It was read off `recognised: false` until profile v0.4.0 stopped
    // carrying the field, and the assertion below is why that mattered: the
    // list went empty and this test said so instead of passing on nothing.
    expect(DECLARED_SILENCE.length).toBeGreaterThan(0);
    for (const entry of DECLARED_SILENCE) {
      expect(body).toContain(entry.syntax);
      expect(body).toContain(entry.effect);
    }
  });

  it('teaches the closing rule, which answers every form it does not list', () => {
    const body = skillNamed('write-notes')?.body ?? '';

    // §8 of the profile: a form outside the table may still be drawn, never
    // carries meaning, and never supports a conformance claim. It is the one
    // sentence that answers "I wrote something and got nothing" for every
    // undescribed form at once, which is why the profile traded a catalogue
    // for it in v0.4.0 and why the skill states it rather than a list.
    expect(body).toContain('is not part of the notation');
    expect(body).toContain('never carries meaning');
  });

  it('names each source of the notation, and survives one without a version', () => {
    const body = skillNamed('write-notes')?.body ?? '';

    // Obsidian is credited without a version because it publishes
    // documentation and not a specification. Reading `version` as required is
    // how the skill served `Obsidian undefined`.
    for (const source of MARKDOWN_PROFILE_SOURCES) {
      expect(body).toContain(source.name);
      expect(body).toContain(source.url);
    }
    expect(body).not.toContain('undefined');
  });
  it('answers an unknown skill with the ones that exist, not with a bare refusal', async () => {
    const result = await gateways().call('get_skill', { name: 'no-such-skill' }, caller);

    expect(result.isError).toBe(true);
    const text = result.content[0]?.text ?? '';
    expect(text).toContain('NOT_FOUND');
    expect(text).toContain('design-vault');
  });

  it('refuses a call with no name, saying which argument is missing', async () => {
    const result = await gateways().call('get_skill', {}, caller);

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('name');
  });
});

describe('the connector hands over the Markdown the author wrote (RN-AGT-015)', () => {
  it('never expands an embed: read_note returns the notation verbatim', async () => {
    const body = 'The rule in full:\n\n![[Lei 14.133#Article 75]]\n';
    const adapter = gateways({
      knowledge: {
        readNote: async () => ({
          noteId: 'n1',
          title: 'Direct contracting',
          content: body,
          revision: 'v3',
          updatedAt: '2026-03-20T10:00:00.000Z',
        }),
      },
    });

    const result = await adapter.call('read_note', { vault: 'v1', note: 'n1' }, caller);
    const text = result.content[0]?.text ?? '';

    // The agent that wants the target reads the target. Expanding here would
    // hand it content it never asked for, and hide whose words those are.
    expect(text).toContain('![[Lei 14.133#Article 75]]');
  });
});

describe('writing guidance and template carries the revision (RN-AGT-016)', () => {
  it('refuses set_guidance with no baseRevision, and says what is missing', async () => {
    const result = await gateways().call('set_guidance', { vault: 'v1', content: '# New' }, caller);

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('baseRevision');
  });

  it('accepts an explicit null, which is what an empty slot asserts', async () => {
    const result = await gateways().call(
      'set_guidance',
      { vault: 'v1', content: '# New', baseRevision: null },
      caller,
    );

    // Null is not the absence of the argument: it is a claim about the state,
    // and the server checks it like any other revision.
    expect(result.isError).toBe(false);
  });

  it('refuses set_template with no baseRevision', async () => {
    const result = await gateways().call(
      'set_template',
      { vault: 'v1', folder: 'f1', content: '# T' },
      caller,
    );

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('baseRevision');
  });

  it('reads the guidance with the revision a write has to echo back', async () => {
    const result = await gateways({
      knowledge: {
        guidance: async () => ({ content: '# Proposito', revision: 'v7' }),
      },
    }).call('get_guidance', { vault: 'v1' }, caller);

    expect(result.isError).toBe(false);
    expect(result.content[0]?.text).toContain('v7');
  });

  it('says what to do when the vault has no guidance yet', async () => {
    const result = await gateways({ knowledge: { guidance: async () => null } }).call(
      'get_guidance',
      { vault: 'v1' },
      caller,
    );

    expect(result.content[0]?.text).toContain('baseRevision: null');
  });
});
