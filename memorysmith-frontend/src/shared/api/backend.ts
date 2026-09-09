// The HTTP-backed source. It answers exactly the same shapes the seed source
// answers, which is what lets the components stay unchanged: swapping the
// backend in is choosing a different implementation of this contract, not
// rewriting the screens.
//
// The frontend navigates by SLUG, because that is what a link and a URL carry,
// while the API addresses by identifier. Resolving one to the other happens
// here, once, and is cached by the query client above it.

import type {
  ExportJobDto,
  FolderDto,
  ContentDto,
  NoteDto,
  NoteSummaryDto,
  ResolvedTargetDto,
  SessionDto,
  FacetStatsDto,
  VaultDetailDto,
  VaultGraphDto,
  VaultHealthDto,
  VaultSummaryDto,
} from '@memorysmith/contracts';
import type {
  FolderNode,
  NoteDetail,
  SearchHit,
  TemplateDetail,
  VaultStructure,
  VaultSummary,
} from '../types/api';
import { splitFrontmatter, statedInFrontmatter } from './markdown';
import { request } from './http';
import { ApiError } from './error-mapper';

export async function getSession(): Promise<SessionDto> {
  return request<SessionDto>('/access/session');
}

function toSummary(vault: VaultSummaryDto): VaultSummary {
  return {
    id: vault.vaultId,
    slug: vault.slug,
    name: vault.name,
    description: vault.description,
    noteCount: vault.noteCount,
    updatedAt: vault.updatedAt,
  };
}

export async function listVaults(): Promise<VaultSummary[]> {
  const vaults = await request<VaultSummaryDto[]>('/knowledge/vaults');
  return vaults.map(toSummary);
}

/** Slug to identifier, from the listing the shell already loads. */
async function vaultIdOf(vaultSlug: string): Promise<string> {
  const vaults = await request<VaultSummaryDto[]>('/knowledge/vaults');
  const found = vaults.find((vault) => vault.slug === vaultSlug || vault.vaultId === vaultSlug);
  if (!found) throw new ApiError('NOT_FOUND', 'Vault not found', 404);
  return found.vaultId;
}

/**
 * The API returns the tree flat and in the defined order, with a fractional
 * position key. The UI wants it nested, and it wants a number to sort by, so
 * the index within the level is the number: the key itself is storage detail.
 */
function nest(folders: FolderDto[], notes: NoteSummaryDto[]): FolderNode[] {
  const byParent = new Map<string | null, FolderDto[]>();
  for (const folder of folders) {
    const siblings = byParent.get(folder.parentFolderId) ?? [];
    siblings.push(folder);
    byParent.set(folder.parentFolderId, siblings);
  }

  const build = (parentId: string | null, parentSlugPath: string): FolderNode[] =>
    (byParent.get(parentId) ?? []).map((folder, index) => {
      const slugPath = parentSlugPath ? `${parentSlugPath}/${folder.slug}` : folder.slug;
      return {
        id: folder.folderId,
        parentId: folder.parentFolderId,
        name: folder.name,
        slug: folder.slug,
        slugPath,
        description: folder.description,
        position: index,
        hasTemplate: folder.hasTemplate,
        noteCount: folder.noteCount,
        notes: notes
          .filter((note) => note.folderId === folder.folderId)
          .map((note) => ({
            id: note.noteId,
            title: note.title,
            folderId: note.folderId,
          })),
        children: build(folder.folderId, slugPath),
      };
    });

  return build(null, '');
}

export async function getVaultStructure(vaultSlug: string): Promise<VaultStructure> {
  const vaultId = await vaultIdOf(vaultSlug);
  const [detail, notes] = await Promise.all([
    request<VaultDetailDto>(`/knowledge/vaults/${vaultId}`),
    request<NoteSummaryDto[]>(`/knowledge/vaults/${vaultId}/notes`),
  ]);

  return {
    vault: toSummary(detail),
    guidance: detail.guidance?.content ?? null,
    guidanceRevision: detail.guidance?.revision.versionId ?? null,
    effectiveRole: detail.effectiveRole,
    folders: nest(detail.folders, notes),
  };
}

/**
 * What one wikilink target resolves to in this vault: the notes it reaches and
 * whether a title or an alias answered (RN-DSC-046). Resolution belongs to
 * Discovery, which is the context that holds the index a vault answers with.
 */
export async function resolveLinkTarget(
  vaultSlug: string,
  target: string,
): Promise<ResolvedTargetDto> {
  const vaultId = await vaultIdOf(vaultSlug);
  return request<ResolvedTargetDto>(
    `/discovery/vaults/${vaultId}/links/${encodeURIComponent(target)}`,
  );
}

export async function getNote(vaultSlug: string, noteId: string): Promise<NoteDetail> {
  const vaultId = await vaultIdOf(vaultSlug);
  const [note, detail] = await Promise.all([
    /**
     * Typed by the DTO the API publishes, and NOT by a shape retyped here.
     *
     * The local shape declared `revision: string`, and the DTO says it is a
     * `ContentRef` — an object. So the whole object was carried into
     * `NoteDetail.revision` and sent back as `baseRevision`, which the API
     * requires to be a string: every task-box write was refused at validation
     * and never reached the conflict check. The guidance and the template
     * read `.versionId` and worked, which is why only the note was broken.
     *
     * A hand-written mirror of a published contract is a claim the compiler
     * cannot check. Taking the DTO is what makes the next divergence a build
     * error instead of a screen that fails.
     */
    request<NoteDto>(`/knowledge/vaults/${vaultId}/notes/${noteId}`),
    request<VaultDetailDto>(`/knowledge/vaults/${vaultId}`),
  ]);

  // The breadcrumb wants the names of the folders above it.
  const byId = new Map(detail.folders.map((folder) => [folder.folderId, folder]));
  const folderNames: string[] = [];
  let current = byId.get(note.folderId);
  while (current) {
    folderNames.unshift(current.name);
    current = current.parentFolderId ? byId.get(current.parentFolderId) : undefined;
  }

  const { frontmatter, lists, body } = splitFrontmatter(note.content);
  return {
    id: note.noteId,
    vaultSlug,
    folderId: note.folderId,
    title: note.title,
    // Which step of the chain answered, which decides who draws the title
    // (RN-DSC-054). The frontmatter is part of the body, so the interface can
    // see it without asking: `title:` there is what the chain read first.
    titleFrom:
      note.title === null ? null : statedInFrontmatter(note.content) ? 'frontmatter' : 'heading',
    folderNames,
    frontmatter,
    listProperties: [...lists],
    body,
    raw: note.content,
    // The version, which is what a write echoes back (RN-AGT-005).
    revision: note.revision.versionId,
  };
}

export async function getTemplate(
  vaultSlug: string,
  folderId: string,
): Promise<TemplateDetail | null> {
  const vaultId = await vaultIdOf(vaultSlug);
  /**
   * The route answers `{ content: null }` when the folder carries no template
   * yet, and the published `ContentDto` when it does. That union is the
   * contract, so it is written as one instead of as a shape with everything
   * made optional — which is how the note DTO drifted.
   */
  const template = await request<ContentDto | { content: null }>(
    `/knowledge/vaults/${vaultId}/folders/${folderId}/template`,
  );
  return template.content === null
    ? null
    : { folderId, body: template.content, revision: template.revision.versionId };
}

/** The composed document the agent reads, shown in the connect screen. */
/**
 * The two Discovery reads the dashboard aggregates. Both take an identifier,
 * not a slug, because the caller already listed the vaults and holds it: going
 * back through the slug would be a second round trip for something it knows.
 */
export async function getFacetsById(vaultId: string): Promise<FacetStatsDto> {
  return request<FacetStatsDto>(`/discovery/vaults/${vaultId}/facets`);
}

export async function getHealthById(vaultId: string): Promise<VaultHealthDto> {
  return request<VaultHealthDto>(`/discovery/vaults/${vaultId}/health`);
}

/**
 * The whole link graph of a vault, drawn by the graph view. The API answers
 * with edges as index pairs, and the note identifiers it names are resolved
 * against the structure the screen already loaded, so a click can open a note
 * without another round trip.
 */
export async function getVaultGraph(vaultSlug: string): Promise<VaultGraphDto> {
  const vaultId = await vaultIdOf(vaultSlug);
  return request<VaultGraphDto>(`/discovery/vaults/${vaultId}/graph`);
}

/**
 * The export of a whole vault, as a folder of Markdown inside a ZIP. The API
 * answers with a short-lived link rather than with the bytes, so what comes
 * back here is where to fetch it and until when.
 */
export async function exportVault(vaultSlug: string): Promise<ExportJobDto> {
  const vaultId = await vaultIdOf(vaultSlug);
  return request<ExportJobDto>(`/portability/vaults/${vaultId}/export`, { method: 'POST' });
}

// ---- Writes ----------------------------------------------------------------

export async function createVault(input: {
  name: string;
  description: string;
}): Promise<VaultSummary> {
  return toSummary(
    await request<VaultSummaryDto>('/knowledge/vaults', { method: 'POST', body: input }),
  );
}

export async function createFolder(
  vaultSlug: string,
  input: { parentFolderId: string | null; name: string; description: string },
): Promise<FolderDto> {
  const vaultId = await vaultIdOf(vaultSlug);
  return request<FolderDto>(`/knowledge/vaults/${vaultId}/folders`, {
    method: 'POST',
    body: input,
  });
}

export async function putGuidance(
  vaultSlug: string,
  content: string,
  baseRevision: string | null,
  options: { keepalive?: boolean } = {},
): Promise<string> {
  const vaultId = await vaultIdOf(vaultSlug);
  // The revision this write produced, which the next write has to name.
  const written = await request<{ revision: { versionId: string } }>(
    `/knowledge/vaults/${vaultId}/guidance`,
    { method: 'PUT', body: { content, baseRevision }, ...options },
  );
  return written.revision.versionId;
}
export async function putTemplate(
  vaultSlug: string,
  folderId: string,
  content: string,
  baseRevision: string | null,
  options: { keepalive?: boolean } = {},
): Promise<string> {
  const vaultId = await vaultIdOf(vaultSlug);
  const written = await request<{ revision: { versionId: string } }>(
    `/knowledge/vaults/${vaultId}/folders/${folderId}/template`,
    { method: 'PUT', body: { content, baseRevision }, ...options },
  );
  return written.revision.versionId;
}

export async function createNote(
  vaultSlug: string,
  input: { folderId: string; title: string; content: string },
): Promise<NoteSummaryDto> {
  const vaultId = await vaultIdOf(vaultSlug);
  return request<NoteSummaryDto>(`/knowledge/vaults/${vaultId}/notes`, {
    method: 'POST',
    body: input,
  });
}

export async function updateNote(
  vaultSlug: string,
  noteId: string,
  input: { content: string; baseRevision: string; title?: string },
  options: { keepalive?: boolean } = {},
): Promise<NoteDto> {
  const vaultId = await vaultIdOf(vaultSlug);
  // The answer carries the revision this write produced, which is what the
  // NEXT write has to be based on.
  return request<NoteDto>(`/knowledge/vaults/${vaultId}/notes/${noteId}`, {
    method: 'PUT',
    body: input,
    ...options,
  });
}

// ---- Discovery and audit ----------------------------------------------------

export interface BacklinkDto {
  noteId: string;
  title: string;
  slug: string;
  folderId: string;
}

export async function backlinksOf(vaultSlug: string, noteId: string): Promise<BacklinkDto[]> {
  const vaultId = await vaultIdOf(vaultSlug);
  const found = await request<{ backlinks: BacklinkDto[] }>(
    `/discovery/vaults/${vaultId}/notes/${noteId}/backlinks`,
  );
  return found.backlinks;
}

/**
 * The search of the Discovery context, which reads the text of the whole vault
 * and answers the query language of `SearchQuery` (software-vision.md 10.2).
 * The screen sends what the person typed, verbatim: the fields, the quotes,
 * the exclusions and the facets are parsed by the backend, not here.
 */
export async function searchVault(
  vaultSlug: string,
  query: string,
  k: number,
): Promise<SearchHit[]> {
  const vaultId = await vaultIdOf(vaultSlug);
  const found = await request<{ mode: string; hits: SearchHit[] }>(
    `/discovery/vaults/${vaultId}/search`,
    { method: 'POST', body: { query, k } },
  );
  return found.hits;
}

export interface HistoryEntryDto {
  occurredAt: string;
  type: string;
  authorship: { userId: string; agent: { clientName: string } | null };
  contentRef: { versionId: string } | null;
}

export async function noteHistory(noteId: string): Promise<HistoryEntryDto[]> {
  const history = await request<{ entries: HistoryEntryDto[] }>(`/audit/notes/${noteId}/history`);
  return history.entries;
}
