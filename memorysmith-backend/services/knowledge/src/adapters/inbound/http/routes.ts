/**
 * HTTP surface of svc-knowledge (architecture-guide.md, section 14.1).
 * Consumed by the UI; the public contract is the MCP surface.
 *
 * No route receives a subscriptionId. The RequestContext on the request was
 * injected by the authorizer, and each use case authorizes against the vault
 * it just loaded, which is stage 2 of section 14.2.
 */

import { Hono, type Context } from 'hono';
import {
  type Authorship,
  type DomainError,
  FolderId,
  httpStatusFor,
  NoteId,
  UserId,
  VaultId,
  type Result,
  type Role,
  type SubscriptionContext,
} from '@memorysmith/kernel';
import type { RequestContext } from '../../../domain/access/AuthorizationPolicy.js';
import type {
  ClearVaultRoleLimit,
  CreateVault,
  DeleteVault,
  GetVault,
  GetVaultContext,
  ListVaults,
  PutGuidance,
  RenameVault,
  RestoreVault,
  SetVaultRoleLimit,
} from '../../../application/vaults.js';
import type {
  CreateFolder,
  GetTemplate,
  PatchFolder,
  PutTemplate,
  RemoveFolder,
  ReorderFolder,
} from '../../../application/folders.js';
import type {
  CreateNote,
  DeleteNote,
  ListNotes,
  MoveNote,
  ReadNote,
  ReorderNote,
  RestoreNote,
  UpdateNote,
} from '../../../application/notes.js';
import { noteToDto, noteToSummary, vaultToDetail, vaultToSummary } from './presenters.js';

/** What the composition root puts on every authenticated request. */
export interface KnowledgeRequest {
  readonly ctx: RequestContext;
  readonly subscription: SubscriptionContext;
  readonly authorship: Authorship;
  /** The role this session holds in the subscription, already resolved. */
  readonly subscriptionRole: Role;
}

export interface KnowledgeUseCases {
  readonly createVault: (request: KnowledgeRequest) => CreateVault;
  readonly listVaults: (request: KnowledgeRequest) => ListVaults;
  readonly getVault: (request: KnowledgeRequest) => GetVault;
  readonly renameVault: (request: KnowledgeRequest) => RenameVault;
  readonly deleteVault: (request: KnowledgeRequest) => DeleteVault;
  readonly restoreVault: (request: KnowledgeRequest) => RestoreVault;
  readonly putGuidance: (request: KnowledgeRequest) => PutGuidance;
  readonly getVaultContext: (request: KnowledgeRequest) => GetVaultContext;
  readonly setVaultLimit: (request: KnowledgeRequest) => SetVaultRoleLimit;
  readonly clearVaultLimit: (request: KnowledgeRequest) => ClearVaultRoleLimit;
  readonly createFolder: (request: KnowledgeRequest) => CreateFolder;
  readonly patchFolder: (request: KnowledgeRequest) => PatchFolder;
  readonly reorderFolder: (request: KnowledgeRequest) => ReorderFolder;
  readonly removeFolder: (request: KnowledgeRequest) => RemoveFolder;
  readonly putTemplate: (request: KnowledgeRequest) => PutTemplate;
  readonly getTemplate: (request: KnowledgeRequest) => GetTemplate;
  readonly listNotes: (request: KnowledgeRequest) => ListNotes;
  readonly readNote: (request: KnowledgeRequest) => ReadNote;
  readonly createNote: (request: KnowledgeRequest) => CreateNote;
  readonly updateNote: (request: KnowledgeRequest) => UpdateNote;
  readonly reorderNote: (request: KnowledgeRequest) => ReorderNote;
  readonly moveNote: (request: KnowledgeRequest) => MoveNote;
  readonly deleteNote: (request: KnowledgeRequest) => DeleteNote;
  readonly restoreNote: (request: KnowledgeRequest) => RestoreNote;
}

type Variables = { knowledge: KnowledgeRequest };

function fail(c: Context, error: DomainError): Response {
  return c.json(
    {
      code: error.code,
      message: error.message,
      ...(error.details ? { details: error.details } : {}),
    },
    httpStatusFor(error) as 400,
  );
}

function present<T, U>(
  c: Context,
  result: Result<T, DomainError>,
  map: (value: T) => U,
  status = 200,
): Response {
  return result.ok ? c.json(map(result.value) as object, status as 200) : fail(c, result.error);
}

function noContent(c: Context, result: Result<unknown, DomainError>): Response {
  return result.ok ? new Response(null, { status: 204 }) : fail(c, result.error);
}

function parseVaultId(raw: string | undefined): Result<VaultId, DomainError> {
  return VaultId.create(raw ?? '');
}

export function createKnowledgeRoutes(useCases: KnowledgeUseCases): Hono<{ Variables: Variables }> {
  const app = new Hono<{ Variables: Variables }>();

  app.get('/vaults', async (c) => {
    const request = c.get('knowledge');
    const listed = await useCases.listVaults(request).execute({ ctx: request.ctx });
    return present(c, listed, (vaults) =>
      vaults.map((vault) => vaultToSummary(vault, request.subscriptionRole)),
    );
  });

  app.post('/vaults', async (c) => {
    const request = c.get('knowledge');
    const body = (await c.req.json().catch(() => ({}))) as {
      name?: string;
      description?: string;
    };

    const created = await useCases.createVault(request).execute({
      ctx: request.ctx,
      name: String(body.name ?? ''),
      description: String(body.description ?? ''),
      subscriptionId: request.subscription.subscriptionId,
      by: request.authorship,
    });
    return present(c, created, (vault) => vaultToSummary(vault, request.subscriptionRole), 201);
  });

  app.get('/vaults/:v', async (c) => {
    const request = c.get('knowledge');
    const vaultId = parseVaultId(c.req.param('v'));
    if (!vaultId.ok) return fail(c, vaultId.error);

    const found = await useCases
      .getVault(request)
      .execute({ ctx: request.ctx, vaultId: vaultId.value });
    return present(c, found, ({ vault, guidance, role }) => vaultToDetail(vault, role, guidance));
  });

  app.patch('/vaults/:v', async (c) => {
    const request = c.get('knowledge');
    const vaultId = parseVaultId(c.req.param('v'));
    if (!vaultId.ok) return fail(c, vaultId.error);
    const body = (await c.req.json().catch(() => ({}))) as { name?: string };

    return noContent(
      c,
      await useCases.renameVault(request).execute({
        ctx: request.ctx,
        vaultId: vaultId.value,
        name: String(body.name ?? ''),
        by: request.authorship,
      }),
    );
  });

  /**
   * Soft delete: the vault leaves every listing, its name goes back to being
   * available and not one byte is destroyed (RN-KNW-033).
   */
  app.delete('/vaults/:v', async (c) => {
    const request = c.get('knowledge');
    const vaultId = parseVaultId(c.req.param('v'));
    if (!vaultId.ok) return fail(c, vaultId.error);

    return noContent(
      c,
      await useCases.deleteVault(request).execute({
        ctx: request.ctx,
        vaultId: vaultId.value,
        by: request.authorship,
      }),
    );
  });

  app.post('/vaults/:v/restore', async (c) => {
    const request = c.get('knowledge');
    const vaultId = parseVaultId(c.req.param('v'));
    if (!vaultId.ok) return fail(c, vaultId.error);

    return noContent(
      c,
      await useCases.restoreVault(request).execute({
        ctx: request.ctx,
        vaultId: vaultId.value,
        by: request.authorship,
      }),
    );
  });

  /** The composed document the agent reads (software-vision.md, 9.2). */
  app.get('/vaults/:v/context', async (c) => {
    const request = c.get('knowledge');
    const vaultId = parseVaultId(c.req.param('v'));
    if (!vaultId.ok) return fail(c, vaultId.error);

    const composed = await useCases
      .getVaultContext(request)
      .execute({ ctx: request.ctx, vaultId: vaultId.value });
    if (!composed.ok) return fail(c, composed.error);
    return c.text(composed.value, 200, { 'content-type': 'text/markdown; charset=utf-8' });
  });

  app.put('/vaults/:v/guidance', async (c) => {
    const request = c.get('knowledge');
    const vaultId = parseVaultId(c.req.param('v'));
    if (!vaultId.ok) return fail(c, vaultId.error);
    const body = (await c.req.json().catch(() => ({}))) as {
      content?: string;
      baseRevision?: string | null;
    };

    const written = await useCases.putGuidance(request).execute({
      ctx: request.ctx,
      vaultId: vaultId.value,
      content: String(body.content ?? ''),
      baseRevision: body.baseRevision ?? null,
      by: request.authorship,
    });
    return present(c, written, (ref) => ({ revision: ref.toJSON() }));
  });

  // ---- Folders -------------------------------------------------------------

  app.post('/vaults/:v/folders', async (c) => {
    const request = c.get('knowledge');
    const vaultId = parseVaultId(c.req.param('v'));
    if (!vaultId.ok) return fail(c, vaultId.error);
    const body = (await c.req.json().catch(() => ({}))) as {
      parentFolderId?: string | null;
      name?: string;
      description?: string;
      afterFolderId?: string | null;
    };

    const parent = body.parentFolderId ? FolderId.create(body.parentFolderId) : null;
    if (parent && !parent.ok) return fail(c, parent.error);
    const after = body.afterFolderId ? FolderId.create(body.afterFolderId) : null;
    if (after && !after.ok) return fail(c, after.error);

    const created = await useCases.createFolder(request).execute({
      ctx: request.ctx,
      vaultId: vaultId.value,
      parentFolderId: parent?.ok ? parent.value : null,
      name: String(body.name ?? ''),
      description: String(body.description ?? ''),
      afterFolderId: after?.ok ? after.value : null,
      by: request.authorship,
    });
    return present(
      c,
      created,
      (folder) => ({
        folderId: folder.id.value,
        parentFolderId: folder.parentFolderId?.value ?? null,
        name: folder.name.value,
        slug: folder.slug.value,
        description: folder.description.value,
        position: folder.position.value,
        hasTemplate: folder.hasTemplate,
        noteCount: 0,
      }),
      201,
    );
  });

  app.patch('/vaults/:v/folders/:f', async (c) => {
    const request = c.get('knowledge');
    const vaultId = parseVaultId(c.req.param('v'));
    if (!vaultId.ok) return fail(c, vaultId.error);
    const folderId = FolderId.create(c.req.param('f') ?? '');
    if (!folderId.ok) return fail(c, folderId.error);

    const body = (await c.req.json().catch(() => ({}))) as {
      name?: string;
      description?: string;
      parentFolderId?: string | null;
      afterFolderId?: string | null;
    };
    const parent =
      body.parentFolderId === undefined
        ? undefined
        : body.parentFolderId === null
          ? null
          : FolderId.create(body.parentFolderId);
    if (parent && parent !== null && !parent.ok) return fail(c, parent.error);
    const after = body.afterFolderId ? FolderId.create(body.afterFolderId) : null;

    return noContent(
      c,
      await useCases.patchFolder(request).execute({
        ctx: request.ctx,
        vaultId: vaultId.value,
        folderId: folderId.value,
        name: body.name,
        description: body.description,
        parentFolderId:
          parent === undefined
            ? undefined
            : parent === null
              ? null
              : parent.ok
                ? parent.value
                : null,
        afterFolderId: after?.ok ? after.value : null,
        by: request.authorship,
      }),
    );
  });

  app.post('/vaults/:v/folders/:f/reorder', async (c) => {
    const request = c.get('knowledge');
    const vaultId = parseVaultId(c.req.param('v'));
    if (!vaultId.ok) return fail(c, vaultId.error);
    const folderId = FolderId.create(c.req.param('f') ?? '');
    if (!folderId.ok) return fail(c, folderId.error);

    const body = (await c.req.json().catch(() => ({}))) as { afterFolderId?: string | null };
    const after = body.afterFolderId ? FolderId.create(body.afterFolderId) : null;
    if (after && !after.ok) return fail(c, after.error);

    return noContent(
      c,
      await useCases.reorderFolder(request).execute({
        ctx: request.ctx,
        vaultId: vaultId.value,
        folderId: folderId.value,
        afterFolderId: after?.ok ? after.value : null,
        by: request.authorship,
      }),
    );
  });

  app.delete('/vaults/:v/folders/:f', async (c) => {
    const request = c.get('knowledge');
    const vaultId = parseVaultId(c.req.param('v'));
    if (!vaultId.ok) return fail(c, vaultId.error);
    const folderId = FolderId.create(c.req.param('f') ?? '');
    if (!folderId.ok) return fail(c, folderId.error);

    // No implicit default: the policy travels in the query (RN-KNW-007).
    const removed = await useCases.removeFolder(request).execute({
      ctx: request.ctx,
      vaultId: vaultId.value,
      folderId: folderId.value,
      policy: c.req.query('policy') ?? '',
      by: request.authorship,
    });
    return present(c, removed, (ids) => ({ removedFolderIds: ids.map((id) => id.value) }));
  });

  app.put('/vaults/:v/folders/:f/template', async (c) => {
    const request = c.get('knowledge');
    const vaultId = parseVaultId(c.req.param('v'));
    if (!vaultId.ok) return fail(c, vaultId.error);
    const folderId = FolderId.create(c.req.param('f') ?? '');
    if (!folderId.ok) return fail(c, folderId.error);
    const body = (await c.req.json().catch(() => ({}))) as {
      content?: string;
      baseRevision?: string | null;
    };

    /**
     * Answers the revision this write produced, as the guidance route already
     * did. It used to answer 204, so a caller that wrote twice without
     * reloading had nothing to base the second write on and echoed a revision
     * its own first write had retired (RN-AGT-005).
     */
    const written = await useCases.putTemplate(request).execute({
      ctx: request.ctx,
      vaultId: vaultId.value,
      folderId: folderId.value,
      content: String(body.content ?? ''),
      baseRevision: body.baseRevision ?? null,
      by: request.authorship,
    });
    return present(c, written, (ref) => ({ revision: ref.toJSON() }));
  });

  app.get('/vaults/:v/folders/:f/template', async (c) => {
    const request = c.get('knowledge');
    const vaultId = parseVaultId(c.req.param('v'));
    if (!vaultId.ok) return fail(c, vaultId.error);
    const folderId = FolderId.create(c.req.param('f') ?? '');
    if (!folderId.ok) return fail(c, folderId.error);

    const template = await useCases
      .getTemplate(request)
      .execute({ ctx: request.ctx, vaultId: vaultId.value, folderId: folderId.value });
    if (!template.ok) return fail(c, template.error);
    if (!template.value) return c.json({ content: null }, 200);
    return c.json(template.value, 200);
  });

  // ---- Notes ---------------------------------------------------------------

  app.get('/vaults/:v/notes', async (c) => {
    const request = c.get('knowledge');
    const vaultId = parseVaultId(c.req.param('v'));
    if (!vaultId.ok) return fail(c, vaultId.error);

    const folderParam = c.req.query('folderId');
    const folderId = folderParam ? FolderId.create(folderParam) : null;
    if (folderId && !folderId.ok) return fail(c, folderId.error);

    const listed = await useCases.listNotes(request).execute({
      ctx: request.ctx,
      vaultId: vaultId.value,
      ...(folderId?.ok ? { folderId: folderId.value } : {}),
    });
    return present(c, listed, (notes) => notes.map(noteToSummary));
  });

  app.post('/vaults/:v/notes', async (c) => {
    const request = c.get('knowledge');
    const vaultId = parseVaultId(c.req.param('v'));
    if (!vaultId.ok) return fail(c, vaultId.error);
    const body = (await c.req.json().catch(() => ({}))) as {
      folderId?: string;
      content?: string;
      afterNoteId?: string | null;
    };
    const folderId = FolderId.create(String(body.folderId ?? ''));
    if (!folderId.ok) return fail(c, folderId.error);
    const after = body.afterNoteId ? NoteId.create(body.afterNoteId) : null;

    const created = await useCases.createNote(request).execute({
      ctx: request.ctx,
      vaultId: vaultId.value,
      folderId: folderId.value,
      content: String(body.content ?? ''),
      afterNoteId: after?.ok ? after.value : null,
      by: request.authorship,
    });
    return present(c, created, (note) => noteToSummary(note), 201);
  });

  app.get('/vaults/:v/notes/:n', async (c) => {
    const request = c.get('knowledge');
    const vaultId = parseVaultId(c.req.param('v'));
    if (!vaultId.ok) return fail(c, vaultId.error);
    const noteId = NoteId.create(c.req.param('n') ?? '');
    if (!noteId.ok) return fail(c, noteId.error);

    const read = await useCases
      .readNote(request)
      .execute({ ctx: request.ctx, vaultId: vaultId.value, noteId: noteId.value });
    return present(c, read, ({ note, content }) => noteToDto(note, content));
  });

  app.put('/vaults/:v/notes/:n', async (c) => {
    const request = c.get('knowledge');
    const vaultId = parseVaultId(c.req.param('v'));
    if (!vaultId.ok) return fail(c, vaultId.error);
    const noteId = NoteId.create(c.req.param('n') ?? '');
    if (!noteId.ok) return fail(c, noteId.error);

    const body = (await c.req.json().catch(() => ({}))) as {
      content?: string;
      baseRevision?: string;
    };
    const content = String(body.content ?? '');
    const updated = await useCases.updateNote(request).execute({
      ctx: request.ctx,
      vaultId: vaultId.value,
      noteId: noteId.value,
      content,
      baseRevision: String(body.baseRevision ?? ''),
      by: request.authorship,
    });
    /**
     * The full DTO, so the answer carries THE REVISION THIS WRITE PRODUCED.
     *
     * It used to answer a summary, which has none, so a caller had no way to
     * learn what to base its next edit on and could only echo the revision it
     * loaded with. A second write then arrived claiming a revision the first
     * one had already retired, and the person conflicted with themselves
     * (RN-AGT-005, RN-KNW-028).
     *
     * The content costs nothing to include: it is what the caller just sent,
     * so no blob is read to answer.
     */
    return present(c, updated, (note) => noteToDto(note, content));
  });

  app.post('/vaults/:v/notes/:n/reorder', async (c) => {
    const request = c.get('knowledge');
    const vaultId = parseVaultId(c.req.param('v'));
    if (!vaultId.ok) return fail(c, vaultId.error);
    const noteId = NoteId.create(c.req.param('n') ?? '');
    if (!noteId.ok) return fail(c, noteId.error);

    const body = (await c.req.json().catch(() => ({}))) as { afterNoteId?: string | null };
    const after = body.afterNoteId ? NoteId.create(body.afterNoteId) : null;

    return noContent(
      c,
      await useCases.reorderNote(request).execute({
        ctx: request.ctx,
        vaultId: vaultId.value,
        noteId: noteId.value,
        afterNoteId: after?.ok ? after.value : null,
        by: request.authorship,
      }),
    );
  });

  app.post('/vaults/:v/notes/:n/move', async (c) => {
    const request = c.get('knowledge');
    const vaultId = parseVaultId(c.req.param('v'));
    if (!vaultId.ok) return fail(c, vaultId.error);
    const noteId = NoteId.create(c.req.param('n') ?? '');
    if (!noteId.ok) return fail(c, noteId.error);

    const body = (await c.req.json().catch(() => ({}))) as {
      toVaultId?: string;
      toFolderId?: string;
      afterNoteId?: string | null;
    };
    const toFolderId = FolderId.create(String(body.toFolderId ?? ''));
    if (!toFolderId.ok) return fail(c, toFolderId.error);
    const toVaultId = body.toVaultId ? VaultId.create(body.toVaultId) : null;
    if (toVaultId && !toVaultId.ok) return fail(c, toVaultId.error);
    const after = body.afterNoteId ? NoteId.create(body.afterNoteId) : null;

    const moved = await useCases.moveNote(request).execute({
      ctx: request.ctx,
      vaultId: vaultId.value,
      noteId: noteId.value,
      toVaultId: toVaultId?.ok ? toVaultId.value : null,
      toFolderId: toFolderId.value,
      afterNoteId: after?.ok ? after.value : null,
      by: request.authorship,
    });
    return present(c, moved, (note) => noteToSummary(note));
  });

  app.delete('/vaults/:v/notes/:n', async (c) => {
    const request = c.get('knowledge');
    const vaultId = parseVaultId(c.req.param('v'));
    if (!vaultId.ok) return fail(c, vaultId.error);
    const noteId = NoteId.create(c.req.param('n') ?? '');
    if (!noteId.ok) return fail(c, noteId.error);

    return noContent(
      c,
      await useCases.deleteNote(request).execute({
        ctx: request.ctx,
        vaultId: vaultId.value,
        noteId: noteId.value,
        by: request.authorship,
      }),
    );
  });

  app.post('/vaults/:v/notes/:n/restore', async (c) => {
    const request = c.get('knowledge');
    const vaultId = parseVaultId(c.req.param('v'));
    if (!vaultId.ok) return fail(c, vaultId.error);
    const noteId = NoteId.create(c.req.param('n') ?? '');
    if (!noteId.ok) return fail(c, noteId.error);

    return noContent(
      c,
      await useCases.restoreNote(request).execute({
        ctx: request.ctx,
        vaultId: vaultId.value,
        noteId: noteId.value,
        by: request.authorship,
      }),
    );
  });

  // ---- Vault role ceilings -------------------------------------------------

  app.put('/vaults/:v/limits/:user', async (c) => {
    const request = c.get('knowledge');
    const vaultId = parseVaultId(c.req.param('v'));
    if (!vaultId.ok) return fail(c, vaultId.error);
    const userId = UserId.create(c.req.param('user') ?? '');
    if (!userId.ok) return fail(c, userId.error);

    const body = (await c.req.json().catch(() => ({}))) as { limit?: string };
    return noContent(
      c,
      await useCases.setVaultLimit(request).execute({
        ctx: request.ctx,
        vaultId: vaultId.value,
        userId: userId.value,
        limit: String(body.limit ?? ''),
        subscriptionRole: request.subscriptionRole,
        by: request.authorship,
      }),
    );
  });

  app.delete('/vaults/:v/limits/:user', async (c) => {
    const request = c.get('knowledge');
    const vaultId = parseVaultId(c.req.param('v'));
    if (!vaultId.ok) return fail(c, vaultId.error);
    const userId = UserId.create(c.req.param('user') ?? '');
    if (!userId.ok) return fail(c, userId.error);

    return noContent(
      c,
      await useCases.clearVaultLimit(request).execute({
        ctx: request.ctx,
        vaultId: vaultId.value,
        userId: userId.value,
        by: request.authorship,
      }),
    );
  });

  return app;
}
