/**
 * HTTP implementations of the gateways. svc-agent is its own deployable, on
 * its own host (mcp.memorysmith.app), so it reaches the other contexts over
 * the internal API (architecture-guide.md, section 14.1).
 *
 * It forwards THE CALLER'S OWN TOKEN rather than acting as itself. Two things
 * follow, and both are properties we want:
 *
 *  - the subscription reaching the core is the one fixed at consent, carried
 *    by the claim, exactly as it is for a browser session (RN-SUB-014);
 *  - the client_id inside that token is what the core turns into the
 *    AgentIdentity, so the authorship records the agent AND the human without
 *    any side channel to trust (RN-AGT-001).
 */

import {
  GatewayError,
  type AgentCaller,
  type AuditGateway,
  type DiscoveryGateway,
  type FolderListing,
  type HistoryEntry,
  type KnowledgeGateway,
  type NoteContent,
  type NoteListing,
  type RelatedNode,
  type SearchHit,
  type VaultListing,
} from '../mcp/gateway.js';

/** The bearer token travels with the caller, and only inside this process. */
export interface TokenCarrier extends AgentCaller {
  readonly bearerToken: string;
}

async function callApi<T>(
  origin: string,
  caller: AgentCaller,
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  const token = (caller as TokenCarrier).bearerToken;
  const response = await fetch(`${origin}${path}`, {
    method: init.method ?? 'GET',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  });

  if (response.status === 204) return undefined as T;
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    // The taxonomy travels intact, so the tool can say something actionable
    // instead of "request failed" (section 15).
    throw new GatewayError(
      String(payload['code'] ?? 'INTERNAL'),
      String(payload['message'] ?? `The request to ${path} failed`),
      payload['details'],
    );
  }
  return payload as T;
}

export class HttpKnowledgeGateway implements KnowledgeGateway {
  constructor(private readonly origin: string) {}

  async listVaults(caller: AgentCaller): Promise<VaultListing[]> {
    const vaults = await callApi<
      Array<{ vaultId: string; name: string; description: string; noteCount: number }>
    >(this.origin, caller, '/knowledge/vaults');
    return vaults.map((vault) => ({
      vaultId: vault.vaultId,
      name: vault.name,
      description: vault.description,
      noteCount: vault.noteCount,
    }));
  }

  async createVault(
    caller: AgentCaller,
    input: { name: string; description: string },
  ): Promise<VaultListing> {
    const created = await callApi<{ vaultId: string; name: string; description: string }>(
      this.origin,
      caller,
      '/knowledge/vaults',
      { method: 'POST', body: input },
    );
    return {
      vaultId: created.vaultId,
      name: created.name,
      description: created.description,
      noteCount: 0,
    };
  }

  async deleteVault(caller: AgentCaller, vaultId: string): Promise<void> {
    await callApi(this.origin, caller, `/knowledge/vaults/${vaultId}`, { method: 'DELETE' });
  }

  async setGuidance(
    caller: AgentCaller,
    vaultId: string,
    content: string,
    baseRevision: string | null,
  ): Promise<void> {
    await callApi(this.origin, caller, `/knowledge/vaults/${vaultId}/guidance`, {
      method: 'PUT',
      body: { content, baseRevision },
    });
  }

  /**
   * The guidance with its revision. The Vault Context is a document and cannot
   * carry one, so a write that has to echo the revision back needs this.
   */
  async guidance(
    caller: AgentCaller,
    vaultId: string,
  ): Promise<{ content: string; revision: string } | null> {
    const detail = await callApi<{
      guidance: { content: string; revision: { versionId: string } } | null;
    }>(this.origin, caller, `/knowledge/vaults/${vaultId}`);
    return detail.guidance
      ? { content: detail.guidance.content, revision: detail.guidance.revision.versionId }
      : null;
  }

  async createFolder(
    caller: AgentCaller,
    input: { vaultId: string; name: string; description: string; parentFolderId?: string },
  ): Promise<FolderListing> {
    return callApi<FolderListing>(
      this.origin,
      caller,
      `/knowledge/vaults/${input.vaultId}/folders`,
      {
        method: 'POST',
        body: {
          name: input.name,
          description: input.description,
          parentFolderId: input.parentFolderId ?? null,
        },
      },
    );
  }

  async deleteFolder(
    caller: AgentCaller,
    input: { vaultId: string; folderId: string; policy: string },
  ): Promise<{ removedFolderIds: string[] }> {
    // The policy travels in the query, and there is no default (RN-KNW-007).
    return callApi<{ removedFolderIds: string[] }>(
      this.origin,
      caller,
      `/knowledge/vaults/${input.vaultId}/folders/${input.folderId}?policy=${encodeURIComponent(input.policy)}`,
      { method: 'DELETE' },
    );
  }

  async setTemplate(
    caller: AgentCaller,
    input: { vaultId: string; folderId: string; content: string; baseRevision: string | null },
  ): Promise<void> {
    await callApi(
      this.origin,
      caller,
      `/knowledge/vaults/${input.vaultId}/folders/${input.folderId}/template`,
      { method: 'PUT', body: { content: input.content, baseRevision: input.baseRevision } },
    );
  }

  async deleteNote(caller: AgentCaller, vaultId: string, noteId: string): Promise<void> {
    await callApi(this.origin, caller, `/knowledge/vaults/${vaultId}/notes/${noteId}`, {
      method: 'DELETE',
    });
  }

  async vaultContext(caller: AgentCaller, vaultId: string): Promise<string> {
    const token = (caller as TokenCarrier).bearerToken;
    const response = await fetch(`${this.origin}/knowledge/vaults/${vaultId}/context`, {
      headers: { authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      throw new GatewayError(
        String(payload['code'] ?? 'INTERNAL'),
        String(payload['message'] ?? 'Vault not found'),
      );
    }
    return response.text();
  }

  async template(
    caller: AgentCaller,
    vaultId: string,
    folderId: string,
  ): Promise<{ content: string; folderName: string; revision: string } | null> {
    const found = await callApi<{
      content: string | null;
      folderName?: string;
      revision?: { versionId: string };
    }>(this.origin, caller, `/knowledge/vaults/${vaultId}/folders/${folderId}/template`);
    return found.content === null
      ? null
      : {
          content: found.content,
          folderName: found.folderName ?? '',
          revision: found.revision?.versionId ?? '',
        };
  }

  async listNotes(caller: AgentCaller, vaultId: string, folderId?: string): Promise<NoteListing[]> {
    const query = folderId ? `?folderId=${encodeURIComponent(folderId)}` : '';
    const notes = await callApi<
      Array<{ noteId: string; title: string | null; folderId: string; position: string }>
    >(this.origin, caller, `/knowledge/vaults/${vaultId}/notes${query}`);
    return notes;
  }

  async readNote(caller: AgentCaller, vaultId: string, noteId: string): Promise<NoteContent> {
    const note = await callApi<{
      noteId: string;
      title: string | null;
      content: string;
      revision: { versionId: string };
      updatedAt: string;
    }>(this.origin, caller, `/knowledge/vaults/${vaultId}/notes/${noteId}`);
    return {
      noteId: note.noteId,
      title: note.title,
      content: note.content,
      revision: note.revision.versionId,
      updatedAt: note.updatedAt,
    };
  }

  async createNote(
    caller: AgentCaller,
    input: { vaultId: string; folderId: string; content: string },
  ): Promise<NoteContent> {
    const created = await callApi<{
      noteId: string;
      title: string | null;
      updatedAt: string;
    }>(this.origin, caller, `/knowledge/vaults/${input.vaultId}/notes`, {
      method: 'POST',
      body: { folderId: input.folderId, content: input.content },
    });
    return this.readNote(caller, input.vaultId, created.noteId);
  }

  async updateNote(
    caller: AgentCaller,
    input: { vaultId: string; noteId: string; content: string; baseRevision: string },
  ): Promise<NoteContent> {
    await callApi(this.origin, caller, `/knowledge/vaults/${input.vaultId}/notes/${input.noteId}`, {
      method: 'PUT',
      body: { content: input.content, baseRevision: input.baseRevision },
    });
    return this.readNote(caller, input.vaultId, input.noteId);
  }

  async searchNotes(caller: AgentCaller, vaultId: string, query: string): Promise<SearchHit[]> {
    const found = await callApi<{ hits: SearchHit[] }>(
      this.origin,
      caller,
      `/discovery/vaults/${vaultId}/search`,
      { method: 'POST', body: { query } },
    );
    return found.hits;
  }
}

export class HttpDiscoveryGateway implements DiscoveryGateway {
  constructor(private readonly origin: string) {}

  async relatedNotes(
    caller: AgentCaller,
    input: { vaultId: string; noteId: string; depth?: number },
  ): Promise<RelatedNode> {
    const depth = input.depth ? `?depth=${input.depth}` : '';
    return callApi<RelatedNode>(
      this.origin,
      caller,
      `/discovery/vaults/${input.vaultId}/notes/${input.noteId}/graph${depth}`,
    );
  }

  async backlinks(caller: AgentCaller, vaultId: string, noteId: string): Promise<NoteListing[]> {
    const found = await callApi<{ backlinks: NoteListing[] }>(
      this.origin,
      caller,
      `/discovery/vaults/${vaultId}/notes/${noteId}/backlinks`,
    );
    return found.backlinks;
  }
}

export class HttpAuditGateway implements AuditGateway {
  constructor(private readonly origin: string) {}

  async noteHistory(
    caller: AgentCaller,
    _vaultId: string,
    noteId: string,
  ): Promise<HistoryEntry[]> {
    const history = await callApi<{
      entries: Array<{
        occurredAt: string;
        type: string;
        authorship: { userId: string; agent: { clientName: string } | null };
        contentRef: { versionId: string } | null;
      }>;
    }>(this.origin, caller, `/audit/notes/${noteId}/history`);

    return history.entries.map((entry) => ({
      occurredAt: entry.occurredAt,
      type: entry.type,
      userId: entry.authorship.userId,
      agentName: entry.authorship.agent?.clientName ?? null,
      revision: entry.contentRef?.versionId ?? null,
    }));
  }

  async revisionAt(
    caller: AgentCaller,
    input: { vaultId: string; noteId: string; asOf: string },
  ): Promise<NoteContent> {
    const revision = await callApi<{
      noteId: string;
      occurredAt: string;
      contentRef: { versionId: string };
      content: string;
    }>(
      this.origin,
      caller,
      `/audit/notes/${input.noteId}/revisions?asOf=${encodeURIComponent(input.asOf)}`,
    );
    return {
      noteId: revision.noteId,
      // A revision answers content, not identity: what the note is called now
      // is what its current content says, and this is an older one.
      title: null,
      content: revision.content,
      revision: revision.contentRef.versionId,
      updatedAt: revision.occurredAt,
    };
  }
}
