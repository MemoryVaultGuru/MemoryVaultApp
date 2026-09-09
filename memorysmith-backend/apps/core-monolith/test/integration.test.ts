/**
 * The full slice, over HTTP, across four contexts: a vault is authored, the
 * events it produced feed the audit trail and the discovery projections, and
 * the reads come back through the API the UI and the connector use.
 *
 * This is what "the whole thing works" means before any of it is deployed.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { buildTestApp } from './wiring.js';

type App = ReturnType<typeof buildTestApp>;
let harness: App;
const TOKEN = 'token-owner';

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

/** Drains what the writes published into the projections, as the bus would. */
async function drainEvents(): Promise<void> {
  const envelopes = harness.events.published.map((event) => ({
    eventId: event.eventId,
    type: event.type,
    occurredAt: event.occurredAt.toISOString(),
    subscriptionId: event.subscriptionId.value,
    subject: event.subject,
    subjectId: event.subjectId,
    authorship: event.authorship.toJSON(),
    contentRef: event.contentRef ? event.contentRef.toJSON() : null,
    payload: event.payload,
  }));

  await harness.auditConsumer.consume(envelopes);

  for (const event of harness.events.published) {
    const payload = event.payload as Record<string, string>;
    if (event.type === 'VaultCreated') {
      await harness.projectStructure.onVault(String(payload['vaultId']), String(payload['name']));
    }
    if (event.type === 'FolderAdded') {
      await harness.projectStructure.onFolder(String(payload['vaultId']), {
        folderId: String(payload['folderId']),
        name: String(payload['name']),
        description: String(payload['description']),
        parentFolderId: payload['parentFolderId'] ? String(payload['parentFolderId']) : null,
      });
    }
    if (event.type === 'NoteCreated' || event.type === 'NoteUpdated') {
      await harness.projectNote.onWritten({
        vaultId: String(payload['vaultId']),
        noteId: String(payload['noteId']),
        folderId: String(payload['folderId']),
        contentRef: event.contentRef
          ? { contentId: event.contentRef.contentId.value, versionId: event.contentRef.versionId }
          : null,
      });
      /**
       * Lexical search reads the note catalog, which in production is the
       * Knowledge context answering what it already holds. The harness stands
       * in for it here, or the search would answer over an empty index and
       * every assertion about it would be vacuous.
       */
      const vaultId = String(payload['vaultId']);
      const known = await harness.discovery.catalog.listNotes(vaultId);
      // The title travels on the event because the write read it from the
      // content, and the aliases come from the frontmatter of the same body.
      // Both are what a link resolves against (RN-DSC-041, RN-DSC-052).
      const title = payload['title'] === null ? '' : String(payload['title']);
      const entry = {
        noteId: String(payload['noteId']),
        title,
        aliases: [] as string[],
        folderId: String(payload['folderId']),
        folderName: '',
      };
      harness.discovery.catalog.set(vaultId, [
        ...known.filter((note) => note.noteId !== entry.noteId),
        entry,
      ]);
    }
  }
  harness.events.published.length = 0;
}

async function seed(): Promise<{
  vaultId: string;
  folderId: string;
  notes: Record<string, string>;
}> {
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
      body: { name: 'Normas', description: 'Texto normativo por artigo. Uma norma por nota.' },
    })
  ).json()) as { folderId: string };

  const achado = (await (
    await call(`/knowledge/vaults/${vault.vaultId}/notes`, {
      method: 'POST',
      body: {
        folderId: folder.folderId,
        content:
          '---\nmaturity: seed\nreviewed: false\n---\n\n# Achado 12\n\nFundamento: [[Lei 14.133]].',
      },
    })
  ).json()) as { noteId: string };

  const lei = (await (
    await call(`/knowledge/vaults/${vault.vaultId}/notes`, {
      method: 'POST',
      body: {
        folderId: folder.folderId,
        content: '---\nmaturity: evergreen\nreviewed: true\n---\n\n# Lei 14.133\n\nArt. 75.',
      },
    })
  ).json()) as { noteId: string };

  await drainEvents();
  return {
    vaultId: vault.vaultId,
    folderId: folder.folderId,
    notes: { achado: achado.noteId, lei: lei.noteId },
  };
}

beforeEach(async () => {
  harness = buildTestApp();
  harness.verifier.issue(TOKEN, { sub: 'user-owner', email: 'owner@example.com' });

  const created = await call('/access/subscriptions', { method: 'POST', body: {} });
  const { subscriptionId } = (await created.json()) as { subscriptionId: string };

  harness.verifier.issue('platform-token', {
    sub: 'platform-admin',
    email: 'admin@memorysmith.app',
    groups: ['platform-admin'],
  });
  await call(`/access/platform/subscriptions/${subscriptionId}/approve`, {
    method: 'POST',
    body: { status: 'active' },
    token: 'platform-token',
  });
  harness.verifier.issue(TOKEN, {
    sub: 'user-owner',
    email: 'owner@example.com',
    subscription_id: subscriptionId,
    subscription_status: 'active',
  });
});

describe('Discovery answers over the API', () => {
  it('resolves a link written before its target existed', async () => {
    const { vaultId, notes } = await seed();

    const backlinks = (await (
      await call(`/discovery/vaults/${vaultId}/notes/${notes['lei']}/backlinks`)
    ).json()) as { backlinks: Array<{ noteId: string }> };

    // The link was pending when the achado was written and resolved on its own
    // when the lei was created (RN-DSC-004).
    expect(backlinks.backlinks.map((note) => note.noteId)).toEqual([notes['achado']]);
  });

  it('walks the dependency tree from a note', async () => {
    const { vaultId, notes } = await seed();
    const tree = (await (
      await call(`/discovery/vaults/${vaultId}/notes/${notes['achado']}/graph?depth=2`)
    ).json()) as { note: { noteId: string }; children: Array<{ note: { noteId: string } }> };

    expect(tree.note.noteId).toBe(notes['achado']);
    expect(tree.children.map((child) => child.note.noteId)).toEqual([notes['lei']]);
  });

  it('searches the body of the note, not only how it is named', async () => {
    /**
     * `Art. 75` is written in the body of one note and appears in no title, in
     * no folder name and in no facet. Finding it is the whole point of the
     * content index.
     */
    const { vaultId, notes } = await seed();
    const byBody = (await (
      await call(`/discovery/vaults/${vaultId}/search`, {
        method: 'POST',
        body: { query: 'Art. 75' },
      })
    ).json()) as {
      mode: string;
      hits: Array<{ noteId: string; section: string | null; excerpt: string }>;
    };

    expect(byBody.mode).toBe('lexical');
    expect(byBody.hits.map((hit) => hit.noteId)).toEqual([notes['lei']]);
    expect(byBody.hits[0]?.excerpt).toContain('Art. 75');
  });

  it('narrows the search with a field and with a facet of the vault', async () => {
    const { vaultId, notes } = await seed();

    const byTitle = (await (
      await call(`/discovery/vaults/${vaultId}/search`, {
        method: 'POST',
        body: { query: 'title:achado' },
      })
    ).json()) as { hits: Array<{ noteId: string }> };
    expect(byTitle.hits.map((hit) => hit.noteId)).toEqual([notes['achado']]);

    // `maturity` is frontmatter the vault wrote, never a field the code knows.
    const byFacet = (await (
      await call(`/discovery/vaults/${vaultId}/search`, {
        method: 'POST',
        body: { query: 'maturity:evergreen' },
      })
    ).json()) as { hits: Array<{ noteId: string }> };
    expect(byFacet.hits.map((hit) => hit.noteId)).toEqual([notes['lei']]);
  });

  it('refuses a query it cannot parse instead of answering with everything', async () => {
    const { vaultId } = await seed();
    const response = await call(`/discovery/vaults/${vaultId}/search`, {
      method: 'POST',
      body: { query: '"nunca fecha' },
    });
    expect(response.status).toBe(400);
  });

  it('counts the curation facets of the vault', async () => {
    const { vaultId } = await seed();
    const stats = (await (await call(`/discovery/vaults/${vaultId}/facets`)).json()) as {
      noteCount: number;
      facets: Array<{ facet: string; values: Array<{ value: string; count: number }> }>;
    };

    expect(stats.noteCount).toBe(2);
    const maturity = stats.facets.find((facet) => facet.facet === 'maturity');
    expect(maturity?.values.map((value) => value.value).sort()).toEqual(['evergreen', 'seed']);
    const reviewed = stats.facets.find((facet) => facet.facet === 'reviewed');
    expect(reviewed?.values).toHaveLength(2);
  });

  it('answers 404 for a vault of another subscription', async () => {
    const { vaultId } = await seed();
    harness.verifier.issue('token-b', { sub: 'user-b', email: 'b@example.com' });
    const other = await call('/access/subscriptions', {
      method: 'POST',
      body: {},
      token: 'token-b',
    });
    const { subscriptionId } = (await other.json()) as { subscriptionId: string };
    await call(`/access/platform/subscriptions/${subscriptionId}/approve`, {
      method: 'POST',
      body: { status: 'active' },
      token: 'platform-token',
    });
    harness.verifier.issue('token-b', {
      sub: 'user-b',
      email: 'b@example.com',
      subscription_id: subscriptionId,
      subscription_status: 'active',
    });

    const attempt = await call(`/discovery/vaults/${vaultId}/facets`, { token: 'token-b' });
    expect(attempt.status).toBe(404);
  });
});

describe('Audit answers over the API', () => {
  it('serves the timeline of a note with authorship', async () => {
    const { notes } = await seed();
    const history = (await (await call(`/audit/notes/${notes['lei']}/history`)).json()) as {
      entries: Array<{ type: string; authorship: { userId: string; agent: unknown } }>;
    };

    expect(history.entries.map((entry) => entry.type)).toContain('NoteCreated');
    expect(history.entries[0]?.authorship.userId).toBe('user-owner');
    // Written through the UI, so no agent (section 12.1).
    expect(history.entries[0]?.authorship.agent).toBeNull();
  });

  it('records the whole authoring cycle, not only the notes', async () => {
    const { vaultId } = await seed();
    const activity = (await (await call(`/audit/vaults/${vaultId}/activity`)).json()) as {
      entries: Array<{ type: string }>;
    };
    const types = activity.entries.map((entry) => entry.type);
    expect(types).toContain('VaultCreated');
    expect(types).toContain('FolderAdded');
    expect(types).toContain('NoteCreated');
  });

  it('keeps the timeline after the note is deleted', async () => {
    const { vaultId, notes } = await seed();
    await call(`/knowledge/vaults/${vaultId}/notes/${notes['lei']}`, { method: 'DELETE' });
    await drainEvents();

    // The note is gone from the listings and the history is still there.
    expect((await call(`/knowledge/vaults/${vaultId}/notes/${notes['lei']}`)).status).toBe(404);
    const history = (await (await call(`/audit/notes/${notes['lei']}/history`)).json()) as {
      entries: Array<{ type: string }>;
    };
    expect(history.entries.map((entry) => entry.type)).toContain('NoteDeleted');
  });
});

describe('Portability answers over the API', () => {
  it('exports the vault as one document, reachable by a link', async () => {
    const { vaultId } = await seed();

    const job = (await (
      await call(`/portability/vaults/${vaultId}/export`, { method: 'POST' })
    ).json()) as {
      exportId: string;
      status: string;
      downloadUrl: string;
      noteCount: number;
      bytes: number;
    };

    expect(job.status).toBe('ready');
    expect(job.noteCount).toBe(2);
    expect(job.bytes).toBeGreaterThan(0);
    // The archive is never the body of the response: a vault of two thousand
    // notes would not fit in one, and the link is what the browser follows.
    expect(job.downloadUrl).toContain(job.exportId);

    // Every key of this system begins with the subscription, this one too.
    const [key] = [...harness.archives.keys()];
    expect(key).toMatch(/^s\/[0-9A-HJKMNP-TV-Z]{26}\/exports\/[0-9A-HJKMNP-TV-Z]{26}\.vault$/);

    // What came out is a real ZIP carrying ONE document (RN-PRT-009): the
    // local file header is its first bytes, and the only entry is the vault.
    const archive = harness.archives.get(key ?? '') as Buffer;
    expect(archive.subarray(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
    const inside = archive.toString('latin1');
    expect(inside).toContain('vault.json');
    expect(inside).not.toContain('GUIDANCE.md');
    expect(inside).not.toContain('STRUCTURE.md');
  });

  it('takes a .vault back and writes the vault it describes', async () => {
    // The round trip is the test (RN-PRT-012): a vault exported and imported
    // comes back the same in everything the document carries.
    const { vaultId } = await seed();
    await call(`/portability/vaults/${vaultId}/export`, { method: 'POST' });
    const [exportKey] = [...harness.archives.keys()];
    const archive = harness.archives.get(exportKey ?? '') as Buffer;

    const prepared = (await (await call('/portability/imports', { method: 'POST' })).json()) as {
      uploadKey: string;
      uploadUrl: string;
    };
    expect(prepared.uploadUrl).toContain(prepared.uploadKey);
    // Under the subscription prefix, like everything else (rule 1).
    expect(prepared.uploadKey).toMatch(
      /^s\/[0-9A-HJKMNP-TV-Z]{26}\/imports\/[0-9A-HJKMNP-TV-Z]{26}\.vault$/,
    );
    harness.uploads.set(prepared.uploadKey, archive);

    const job = (await (
      await call('/portability/imports/apply', {
        method: 'POST',
        // The subscription holds each vault name once (RN-KNW-032), and this
        // document came from this very subscription: naming the copy is what
        // makes "the same file twice gives two vaults" true without the server
        // inventing a suffix.
        body: { uploadKey: prepared.uploadKey, name: 'Normas e Legislacao (copia)' },
      })
    ).json()) as { vaultId: string; status: string; folderCount: number; noteCount: number };

    expect(job.status).toBe('imported');
    expect(job.noteCount).toBe(2);
    // A new vault, never the one it came from (RN-PRT-012).
    expect(job.vaultId).not.toBe(vaultId);
    // And the upload is discarded once the import ends.
    expect(harness.uploads.has(prepared.uploadKey)).toBe(false);

    const [original, imported] = await Promise.all(
      [vaultId, job.vaultId].map(
        async (id) =>
          (await (await call(`/knowledge/vaults/${id}`)).json()) as {
            name: string;
            folders: Array<{ name: string; description: string; hasTemplate: boolean }>;
            guidance: { content: string } | null;
          },
      ),
    );

    expect(imported?.name).toBe('Normas e Legislacao (copia)');
    expect(imported?.guidance?.content).toBe(original?.guidance?.content);
    expect(imported?.folders.map((folder) => [folder.name, folder.description])).toEqual(
      original?.folders.map((folder) => [folder.name, folder.description]),
    );

    // Every body byte for byte, in the order the document carried.
    const bodies = async (id: string): Promise<string[]> => {
      const notes = (await (await call(`/knowledge/vaults/${id}/notes`)).json()) as Array<{
        noteId: string;
      }>;
      return Promise.all(
        notes.map(
          async (note) =>
            (
              (await (await call(`/knowledge/vaults/${id}/notes/${note.noteId}`)).json()) as {
                content: string;
              }
            ).content,
        ),
      );
    };
    expect(await bodies(job.vaultId)).toEqual(await bodies(vaultId));
  });

  it('refuses a document it cannot read, and creates nothing', async () => {
    // RN-PRT-014: refused whole, with the reason, before the first write.
    const before = (await (await call('/knowledge/vaults')).json()) as unknown[];

    const prepared = (await (await call('/portability/imports', { method: 'POST' })).json()) as {
      uploadKey: string;
    };
    harness.uploads.set(prepared.uploadKey, Buffer.from('not a zip at all'));

    const refused = await call('/portability/imports/apply', {
      method: 'POST',
      body: { uploadKey: prepared.uploadKey },
    });
    expect(refused.status).toBe(400);
    expect(((await refused.json()) as { message: string }).message).toContain('.vault');

    const after = (await (await call('/knowledge/vaults')).json()) as unknown[];
    expect(after.length).toBe(before.length);
  });

  it('answers 404 for an upload of another subscription', async () => {
    const refused = await call('/portability/imports/apply', {
      method: 'POST',
      body: { uploadKey: 's/01JBXR8Z5T7QK9M2N4P6R8S0T2/imports/01JBXR8Z5T7QK9M2N4P6R8S0T2.vault' },
    });
    expect(refused.status).toBe(404);
  });

  it('answers 404 for a vault this session cannot read', async () => {
    // A vault that is not ours is indistinguishable from one that does not
    // exist: a 403 here would confirm it exists (rule 9).
    const response = await call('/portability/vaults/01JBXR8Z5T7QK9M2N4P6R8S0T2/export', {
      method: 'POST',
    });
    expect(response.status).toBe(404);
  });
});

describe('Deleting a vault takes it out of reach without destroying it', () => {
  it('removes it from every listing and from every context', async () => {
    const { vaultId, notes } = await seed();

    expect((await call(`/knowledge/vaults/${vaultId}`, { method: 'DELETE' })).status).toBe(204);

    // Out of the listing, and out of Knowledge, Discovery and Portability
    // alike: a deleted vault answers like one that never existed (rule 9).
    const listed = (await (await call('/knowledge/vaults')).json()) as Array<{ vaultId: string }>;
    expect(listed.map((vault) => vault.vaultId)).not.toContain(vaultId);
    expect((await call(`/knowledge/vaults/${vaultId}`)).status).toBe(404);
    expect((await call(`/knowledge/vaults/${vaultId}/notes/${notes['lei']}`)).status).toBe(404);
    expect((await call(`/discovery/vaults/${vaultId}/graph`)).status).toBe(404);
    expect((await call(`/portability/vaults/${vaultId}/export`, { method: 'POST' })).status).toBe(
      404,
    );

    // Nothing was destroyed: the history of a note inside it still answers.
    const history = (await (await call(`/audit/notes/${notes['lei']}/history`)).json()) as {
      entries: Array<{ type: string }>;
    };
    expect(history.entries.map((entry) => entry.type)).toContain('NoteCreated');
  });

  it('frees the name and gives it back on restore', async () => {
    const { vaultId } = await seed();
    await call(`/knowledge/vaults/${vaultId}`, { method: 'DELETE' });

    // The slug is available again, exactly as a deleted note frees its own.
    const twin = await call('/knowledge/vaults', {
      method: 'POST',
      body: { name: 'Normas e Legislacao', description: 'Outro' },
    });
    expect(twin.status).toBe(201);

    // And restoring is refused while the name belongs to someone else.
    const refused = await call(`/knowledge/vaults/${vaultId}/restore`, { method: 'POST' });
    expect(refused.status).toBe(409);

    const { vaultId: twinId } = (await twin.json()) as { vaultId: string };
    await call(`/knowledge/vaults/${twinId}`, { method: 'DELETE' });
    expect((await call(`/knowledge/vaults/${vaultId}/restore`, { method: 'POST' })).status).toBe(
      204,
    );
    expect((await call(`/knowledge/vaults/${vaultId}`)).status).toBe(200);
  });

  it('records the deletion in the trail, with authorship', async () => {
    const { vaultId } = await seed();
    await call(`/knowledge/vaults/${vaultId}`, { method: 'DELETE' });
    await drainEvents();

    const activity = (await (await call(`/audit/vaults/${vaultId}/activity`)).json()) as {
      entries: Array<{ type: string; authorship: { userId: string } }>;
    };
    const deleted = activity.entries.find((entry) => entry.type === 'VaultDeleted');
    expect(deleted?.authorship.userId).toBe('user-owner');
  });
});

/**
 * The storage quota of the plan, over HTTP (RN-SUB-019, RN-SUB-021).
 *
 * The counter is maintained by the relay in production; here the harness moves
 * it with the same deltas the events declare, which is the same arithmetic on
 * the same numbers.
 */
describe('The plan limits how much a subscription can store', () => {
  it('refuses a write that would cross the line, and says what the numbers are', async () => {
    const { vaultId, folderId } = await seed();
    harness.storage.record(harness.events.published);

    // A ceiling just above what is already stored: enough for a short note,
    // not for a long one.
    harness.storage.limitBytes = harness.storage.usedBytes + 200;

    const refused = await call(`/knowledge/vaults/${vaultId}/notes`, {
      method: 'POST',
      body: { folderId, content: 'x'.repeat(500) },
    });
    expect(refused.status).toBe(413);
    const body = (await refused.json()) as { code: string; details?: Record<string, number> };
    expect(body.code).toBe('LIMIT_EXCEEDED');
    expect(body.details).toMatchObject({ limitBytes: harness.storage.limitBytes });

    // And nothing was written: the check runs before the content reaches the
    // store, so a refused write leaves no orphan revision behind.
    const listed = (await (
      await call(`/knowledge/vaults/${vaultId}/notes?folderId=${folderId}`)
    ).json()) as Array<{ title: string }>;
    expect(listed.map((note) => note.title)).not.toContain('Nota longa');
  });

  it('still admits the writes that get you back under it', async () => {
    const { vaultId, folderId, notes } = await seed();
    harness.storage.record(harness.events.published);
    harness.storage.limitBytes = 1; // hopelessly over

    const read = (await (
      await call(`/knowledge/vaults/${vaultId}/notes/${notes['lei']}`)
    ).json()) as { revision: { versionId: string } };

    // Shortening a note is admitted, and so is deleting one: being over the
    // limit must not trap someone inside it.
    const shortened = await call(`/knowledge/vaults/${vaultId}/notes/${notes['lei']}`, {
      method: 'PUT',
      body: { content: 'Curta.', baseRevision: read.revision.versionId },
    });
    expect(shortened.status).toBe(200);
    expect(
      (await call(`/knowledge/vaults/${vaultId}/notes/${notes['achado']}`, { method: 'DELETE' }))
        .status,
    ).toBe(204);

    // Growing one is not.
    const grown = await call(`/knowledge/vaults/${vaultId}/notes`, {
      method: 'POST',
      body: { folderId, content: 'y'.repeat(100) },
    });
    expect(grown.status).toBe(413);
  });
});
