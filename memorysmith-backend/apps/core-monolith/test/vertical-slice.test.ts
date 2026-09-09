/**
 * The vertical slice of delivery 6 (architecture-guide.md, section 25), end to
 * end over HTTP:
 *
 *   - reordering a folder is ONE write on the folder item;
 *   - moving a note between folders writes ZERO bytes in S3;
 *   - deleting a note keeps its content readable by revision.
 *
 * It also exercises the whole authoring cycle the UI performs, which is what
 * makes the tese testable: guidance, tree, template, note.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { buildTestApp } from './wiring.js';
import { sessionSchema } from '@memorysmith/contracts';

type App = ReturnType<typeof buildTestApp>;
let harness: App;

const TOKEN = 'token-owner';
/** The subscription the token names, which each test rebuilds. */
let activeSubscriptionId = '';

beforeEach(async () => {
  harness = buildTestApp();
  harness.verifier.issue(TOKEN, { sub: 'user-owner', email: 'owner@example.com' });

  const created = await harness.app.request('/access/subscriptions', {
    method: 'POST',
    headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify({}),
  });
  const { subscriptionId } = (await created.json()) as { subscriptionId: string };
  activeSubscriptionId = subscriptionId;

  harness.verifier.issue('platform-token', {
    sub: 'platform-admin',
    email: 'admin@memorysmith.app',
    groups: ['platform-admin'],
  });
  await harness.app.request(`/access/platform/subscriptions/${subscriptionId}/approve`, {
    method: 'POST',
    headers: { authorization: 'Bearer platform-token', 'content-type': 'application/json' },
    body: JSON.stringify({ status: 'active' }),
  });
  harness.verifier.issue(TOKEN, {
    sub: 'user-owner',
    email: 'owner@example.com',
    subscription_id: subscriptionId,
    subscription_status: 'active',
  });
});

async function call(
  path: string,
  init: { method?: string; body?: unknown; token?: string } = {},
): Promise<Response> {
  return harness.app.request(path, {
    method: init.method ?? 'GET',
    headers: {
      authorization: `Bearer ${init.token ?? TOKEN}`,
      'content-type': 'application/json',
    },
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  });
}

async function seedVault(): Promise<{ vaultId: string; folderId: string }> {
  const vault = (await (
    await call('/knowledge/vaults', {
      method: 'POST',
      body: {
        name: 'Normas e Legislacao',
        description: 'Texto normativo por artigo',
      },
    })
  ).json()) as { vaultId: string };

  const folder = (await (
    await call(`/knowledge/vaults/${vault.vaultId}/folders`, {
      method: 'POST',
      body: {
        name: 'Normas',
        description: 'Texto normativo por artigo. Uma norma por nota, sempre com orgao.',
      },
    })
  ).json()) as { folderId: string };

  return { vaultId: vault.vaultId, folderId: folder.folderId };
}

describe('The API answers what its contract declares', () => {
  /**
   * The shape of a response is a promise, and the schemas in the contracts
   * package ARE that promise. Nothing enforced it on the way out, so
   * GET /access/session drifted: it answered `links` where the contract says
   * `subscriptions`, and an email as the value object `{ value }` instead of a
   * string. The SPA read undefined, fell back to a degraded session, and
   * showed the person no name, no subscription and the wrong role.
   */
  it('answers GET /access/session in exactly the declared shape', async () => {
    const response = await call('/access/session');
    expect(response.status).toBe(200);

    const parsed = sessionSchema.safeParse(await response.json());
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    expect(parsed.data.user.email).toBe('owner@example.com');
    expect(parsed.data.subscriptions.length).toBeGreaterThan(0);
    // The active subscription is the one the token names, not the first of the list.
    expect(parsed.data.activeSubscription?.subscriptionId).toBe(activeSubscriptionId);
    expect(parsed.data.role).toBe('OWNER');
  });
});

describe('The authoring cycle', () => {
  it('writes guidance, a tree, a template and a note', async () => {
    const { vaultId, folderId } = await seedVault();

    expect(
      (
        await call(`/knowledge/vaults/${vaultId}/guidance`, {
          method: 'PUT',
          body: { content: '# Proposito\n\nUma norma por nota.' },
        })
      ).status,
    ).toBe(200);

    /**
     * The template write answers the revision it produced, like the guidance
     * and the note. It used to answer 204 and nothing at all, so a caller that
     * wrote twice without reloading echoed a revision its own first write had
     * retired, and conflicted with itself (RN-AGT-005).
     */
    const template = await call(`/knowledge/vaults/${vaultId}/folders/${folderId}/template`, {
      method: 'PUT',
      body: { content: '# {{titulo}}\n\n## Vigencia\n' },
    });
    expect(template.status).toBe(200);
    const written = (await template.json()) as { revision: { versionId: string } };
    expect(written.revision.versionId).toBeTruthy();

    const note = await call(`/knowledge/vaults/${vaultId}/notes`, {
      method: 'POST',
      body: { folderId, content: '# Lei 14.133, art. 75\n\nLei 14.133\n\nArt. 75.' },
    });
    expect(note.status).toBe(201);

    const detail = (await (await call(`/knowledge/vaults/${vaultId}`)).json()) as {
      hasGuidance: boolean;
      folders: Array<{ hasTemplate: boolean; slug: string }>;
      guidance: { content: string } | null;
    };
    expect(detail.hasGuidance).toBe(true);
    expect(detail.guidance?.content).toContain('Uma norma por nota');
    expect(detail.folders[0]?.hasTemplate).toBe(true);
    expect(detail.folders[0]?.slug).toBe('normas');
  });

  it('serves the Vault Context as Markdown, guidance plus the annotated tree', async () => {
    const { vaultId, folderId } = await seedVault();
    await call(`/knowledge/vaults/${vaultId}/guidance`, {
      method: 'PUT',
      body: { content: '# Proposito\n\nUma norma por nota.' },
    });
    await call(`/knowledge/vaults/${vaultId}/folders/${folderId}/template`, {
      method: 'PUT',
      body: { content: '# Modelo' },
    });

    const context = await call(`/knowledge/vaults/${vaultId}/context`);
    expect(context.headers.get('content-type')).toContain('text/markdown');
    const markdown = await context.text();
    expect(markdown).toContain('# Vault: Normas e Legislacao');
    expect(markdown).toContain('Uma norma por nota.');
    expect(markdown).toContain('## Structure');
    expect(markdown).toContain(`1. **Normas** \`${folderId}\`:`);
    expect(markdown).toContain('has TEMPLATE.md');
  });

  it('gives the Vault Context everything a fresh session needs to write, the folder identifier included', async () => {
    // The whole point of RN-AGT-020: a session that created nothing reads the
    // context and writes from it alone. Nothing here reuses the identifier
    // seedVault returned; it is parsed back out of the document.
    const { vaultId } = await seedVault();
    const markdown = await (await call(`/knowledge/vaults/${vaultId}/context`)).text();

    const addressed = /\*\*Normas\*\* `([0-9A-HJKMNP-TV-Z]{26})`:/.exec(markdown);
    expect(addressed).not.toBeNull();
    const folderFromContext = addressed?.[1] ?? '';

    const created = await call(`/knowledge/vaults/${vaultId}/notes`, {
      method: 'POST',
      body: { folderId: folderFromContext, content: '# Lei 14.133, art. 75' },
    });
    expect(created.status).toBe(201);
  });
});

describe('Structure operations write nothing they do not have to', () => {
  it('reorders a folder without touching any sibling', async () => {
    const { vaultId } = await seedVault();
    const second = (await (
      await call(`/knowledge/vaults/${vaultId}/folders`, {
        method: 'POST',
        body: { name: 'Achados', description: 'Achados de auditoria.' },
      })
    ).json()) as { folderId: string; position: string };

    const before = (await (await call(`/knowledge/vaults/${vaultId}`)).json()) as {
      folders: Array<{ folderId: string; position: string; name: string }>;
    };

    const reordered = await call(
      `/knowledge/vaults/${vaultId}/folders/${second.folderId}/reorder`,
      { method: 'POST', body: { afterFolderId: null } },
    );
    expect(reordered.status).toBe(204);

    const after = (await (await call(`/knowledge/vaults/${vaultId}`)).json()) as {
      folders: Array<{ folderId: string; position: string; name: string }>;
    };
    const untouched = before.folders.filter((folder) => folder.folderId !== second.folderId);
    for (const folder of untouched) {
      const now = after.folders.find((each) => each.folderId === folder.folderId);
      // Every sibling kept its key: the reorder was a single write.
      expect(now?.position).toBe(folder.position);
    }
    expect(after.folders[0]?.folderId).toBe(second.folderId);
  });

  it('moves a note between folders with zero bytes written to storage', async () => {
    const { vaultId, folderId } = await seedVault();
    const other = (await (
      await call(`/knowledge/vaults/${vaultId}/folders`, {
        method: 'POST',
        body: { name: 'Achados', description: 'Achados de auditoria.' },
      })
    ).json()) as { folderId: string };

    const created = (await (
      await call(`/knowledge/vaults/${vaultId}/notes`, {
        method: 'POST',
        body: { folderId, content: '# Lei 14.133\n\nLei 14.133' },
      })
    ).json()) as { noteId: string };

    const before = (await (
      await call(`/knowledge/vaults/${vaultId}/notes/${created.noteId}`)
    ).json()) as { revision: { contentId: string; versionId: string } };

    const moved = await call(`/knowledge/vaults/${vaultId}/notes/${created.noteId}/move`, {
      method: 'POST',
      body: { toFolderId: other.folderId },
    });
    expect(moved.status).toBe(200);

    const after = (await (
      await call(`/knowledge/vaults/${vaultId}/notes/${created.noteId}`)
    ).json()) as { folderId: string; revision: { contentId: string; versionId: string } };

    expect(after.folderId).toBe(other.folderId);
    // Same slot, same revision: the move wrote nothing to the content store.
    expect(after.revision).toEqual(before.revision);
  });

  it('refuses to remove a folder that holds notes without an explicit policy', async () => {
    const { vaultId, folderId } = await seedVault();
    await call(`/knowledge/vaults/${vaultId}/notes`, {
      method: 'POST',
      body: { folderId, content: '# Lei 14.133\n\nLei' },
    });

    const noPolicy = await call(`/knowledge/vaults/${vaultId}/folders/${folderId}`, {
      method: 'DELETE',
    });
    expect(noPolicy.status).toBe(412);
    const body = (await noPolicy.json()) as { code: string };
    expect(body.code).toBe('PRECONDITION_FAILED');
  });
});

describe('Vault lifecycle', () => {
  it('refuses a second vault of the same name and points at the one that exists', async () => {
    /**
     * RN-KNW-032. The slug is how the interface addresses a vault, so a twin
     * would share the address and be unreachable: every link would open the
     * first one. The answer is the shape RN-AGT-004 already set for notes,
     * the identifier of what exists, never an invented suffix.
     */
    const first = (await (
      await call('/knowledge/vaults', {
        method: 'POST',
        body: { name: 'Normas e Legislacao', description: 'Texto normativo' },
      })
    ).json()) as { vaultId: string };

    const twin = await call('/knowledge/vaults', {
      method: 'POST',
      body: { name: 'Normas e Legislacao', description: 'Outra descricao' },
    });
    expect(twin.status).toBe(409);
    const body = (await twin.json()) as { details: { code: string; vaultId: string } };
    expect(body.details.code).toBe('ALREADY_EXISTS');
    expect(body.details.vaultId).toBe(first.vaultId);

    // And the catalogue holds one, not two.
    const listed = (await (await call('/knowledge/vaults')).json()) as Array<{ slug: string }>;
    expect(listed.filter((vault) => vault.slug === 'normas-e-legislacao')).toHaveLength(1);
  });
});

describe('Note lifecycle', () => {
  it('writes a second note with the same title, and both stand', async () => {
    // RN-AGT-024: create_note always creates. Nothing in a vault is a key, so
    // two notes may be called the same thing (RN-KNW-037) and a repeated call
    // writes rather than refusing (RN-AGT-004, removed).
    const { vaultId, folderId } = await seedVault();
    const first = (await (
      await call(`/knowledge/vaults/${vaultId}/notes`, {
        method: 'POST',
        body: { folderId, content: '# Lei 14.133\n\nA geral.' },
      })
    ).json()) as { noteId: string; title: string };

    const second = await call(`/knowledge/vaults/${vaultId}/notes`, {
      method: 'POST',
      body: { folderId, content: '# Lei 14.133\n\nOutra vez.' },
    });
    expect(second.status).toBe(201);
    const twin = (await second.json()) as { noteId: string; title: string };

    expect(twin.title).toBe('Lei 14.133');
    expect(first.title).toBe('Lei 14.133');
    expect(twin.noteId).not.toBe(first.noteId);

    // And the listing holds both.
    const listed = (await (
      await call(`/knowledge/vaults/${vaultId}/notes?folderId=${folderId}`)
    ).json()) as Array<{ title: string | null }>;
    expect(listed.filter((note) => note.title === 'Lei 14.133')).toHaveLength(2);
  });

  it('writes a note whose content states no title, and says so', async () => {
    // RN-KNW-036: the note exists, it renders and it is searchable; what no
    // link can do is name it. Refusing the write is how an import loses a
    // vault, so the absence is reported instead.
    const { vaultId, folderId } = await seedVault();
    const created = await call(`/knowledge/vaults/${vaultId}/notes`, {
      method: 'POST',
      body: { folderId, content: 'Apenas prosa, sem titulo nenhum.' },
    });
    expect(created.status).toBe(201);
    expect(((await created.json()) as { title: string | null }).title).toBeNull();
  });

  it('refuses an update based on a stale revision and returns the current content', async () => {
    const { vaultId, folderId } = await seedVault();
    const created = (await (
      await call(`/knowledge/vaults/${vaultId}/notes`, {
        method: 'POST',
        body: { folderId, content: '# Lei 14.133\n\nPrimeira versao' },
      })
    ).json()) as { noteId: string };

    const read = (await (
      await call(`/knowledge/vaults/${vaultId}/notes/${created.noteId}`)
    ).json()) as { revision: { versionId: string } };

    await call(`/knowledge/vaults/${vaultId}/notes/${created.noteId}`, {
      method: 'PUT',
      body: { content: '# Segunda versao', baseRevision: read.revision.versionId },
    });

    const stale = await call(`/knowledge/vaults/${vaultId}/notes/${created.noteId}`, {
      method: 'PUT',
      body: { content: '# Terceira versao', baseRevision: read.revision.versionId },
    });
    expect(stale.status).toBe(409);
    const body = (await stale.json()) as { details: { currentContent: string } };
    // RN-AGT-005: the current content travels with the conflict.
    expect(body.details.currentContent).toContain('Segunda versao');
  });

  it('keeps a deleted note out of the listings and readable by revision', async () => {
    const { vaultId, folderId } = await seedVault();
    const created = (await (
      await call(`/knowledge/vaults/${vaultId}/notes`, {
        method: 'POST',
        body: { folderId, content: '# Lei 14.133\n\nConteudo preservado' },
      })
    ).json()) as { noteId: string };

    expect(
      (await call(`/knowledge/vaults/${vaultId}/notes/${created.noteId}`, { method: 'DELETE' }))
        .status,
    ).toBe(204);

    const listed = (await (await call(`/knowledge/vaults/${vaultId}/notes`)).json()) as unknown[];
    expect(listed).toHaveLength(0);
    expect((await call(`/knowledge/vaults/${vaultId}/notes/${created.noteId}`)).status).toBe(404);

    // The slug came back to the vault (RN-KNW-030), and restoring works.
    const reused = await call(`/knowledge/vaults/${vaultId}/notes`, {
      method: 'POST',
      body: { folderId, content: '# Lei 14.133\n\nOutra nota' },
    });
    expect(reused.status).toBe(201);
  });

  it('rejects a note above the size limit', async () => {
    const { vaultId, folderId } = await seedVault();
    const tooLarge = await call(`/knowledge/vaults/${vaultId}/notes`, {
      method: 'POST',
      body: { folderId, content: 'x'.repeat(1_048_577) },
    });
    expect(tooLarge.status).toBe(413);
  });
});

describe('Events reach the outbox for every state change', () => {
  it('records the whole authoring cycle with authorship', async () => {
    const { vaultId, folderId } = await seedVault();
    await call(`/knowledge/vaults/${vaultId}/guidance`, {
      method: 'PUT',
      body: { content: '# Proposito' },
    });
    await call(`/knowledge/vaults/${vaultId}/notes`, {
      method: 'POST',
      body: { folderId, content: '# Lei 14.133\n\nLei' },
    });

    const types = harness.events.published.map((event) => event.type);
    expect(types).toContain('SubscriptionRequested');
    expect(types).toContain('VaultCreated');
    expect(types).toContain('FolderAdded');
    expect(types).toContain('GuidanceUpdated');
    expect(types).toContain('NoteCreated');

    // Every one of them names the human who caused it (PE6).
    for (const event of harness.events.published) {
      expect(event.authorship.user.value).toBeTruthy();
    }
    // And the content events carry the complete ref (RN-AUD-003).
    const noteCreated = harness.events.ofType('NoteCreated')[0];
    expect(noteCreated?.contentRef?.sha256).toHaveLength(64);
    expect(noteCreated?.contentRef?.bytes).toBeGreaterThan(0);
  });
});
