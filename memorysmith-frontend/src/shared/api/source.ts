// The single source that answers the screens: the product API.
//
// There used to be a second one here, a bundled seed the app fell back to when
// VITE_API_ORIGIN was unset, and it was how the interface was designed before
// the API existed. It is gone on purpose. A fallback that answers with
// different data, silently, is worse than no answer: the screen looks right
// and is showing something else, and every bug found that way is found twice.
//
// So a missing origin is now a configuration error, and it says so.

import type { ExportJobDto } from '@memorysmith/contracts';
import * as backend from './backend';
import type {
  NoteDetail,
  SearchHit,
  TemplateDetail,
  VaultStructure,
  VaultSummary,
} from '../types/api';

const configuredOrigin = (import.meta.env['VITE_API_ORIGIN'] as string | undefined)?.replace(
  /\/$/,
  '',
);

if (!configuredOrigin) {
  throw new Error(
    'VITE_API_ORIGIN is not set. The interface reads and writes through the product API and ' +
      'has no offline mode; copy .env.example to .env.local and point it at the API.',
  );
}

export const apiOrigin: string = configuredOrigin;

/**
 * Walks the loaded structure, so a link needs no extra request.
 *
 * A target is a TITLE, compared after NFC and folded in no other way
 * (RN-DSC-041): a near miss is a pending link and never a landing. What the
 * interface does with a title carried by two notes is #98; here the first one
 * answers, and the address itself is still derived from the title until that
 * issue replaces it with the identifier.
 */
function resolveFromStructure(
  vaultSlug: string,
  target: string,
  structure: VaultStructure | undefined,
): string | null {
  if (!structure) return null;
  const wanted = target.normalize('NFC');
  const walk = (nodes: VaultStructure['folders']): string | null => {
    for (const node of nodes) {
      const found = node.notes.find((note) => (note.title ?? '').normalize('NFC') === wanted);
      if (found) return `/vaults/${vaultSlug}/root/${node.slugPath}/${found.slug}`;
      const deeper = walk(node.children);
      if (deeper) return deeper;
    }
    return null;
  };
  return walk(structure.folders);
}

/**
 * The structures the screens have already loaded. A wikilink resolves against
 * this instead of asking the API again: the tree it needs is the tree the page
 * is already showing.
 */
const loaded = new Map<string, VaultStructure>();

export function listVaults(): Promise<VaultSummary[]> {
  return backend.listVaults();
}

export async function getVaultStructure(vaultSlug: string): Promise<VaultStructure> {
  const structure = await backend.getVaultStructure(vaultSlug);
  loaded.set(vaultSlug, structure);
  return structure;
}

export function getNote(vaultSlug: string, noteSlug: string): Promise<NoteDetail> {
  return backend.getNote(vaultSlug, noteSlug);
}

export function getTemplate(vaultSlug: string, folderId: string): Promise<TemplateDetail | null> {
  return backend.getTemplate(vaultSlug, folderId);
}

/** Null means the target does not exist yet, which the UI shows as pending. */
export function resolveNoteUrl(vaultSlug: string, target: string): string | null {
  return resolveFromStructure(vaultSlug, target, loaded.get(vaultSlug));
}

/** The whole vault as a downloadable archive, prepared on demand. */
export function exportVault(vaultSlug: string): Promise<ExportJobDto> {
  return backend.exportVault(vaultSlug);
}

export function searchNotes(vaultSlug: string, query: string, k: number): Promise<SearchHit[]> {
  return backend.searchVault(vaultSlug, query, k);
}

/**
 * The three writes the reading surface makes. They are the whole write surface
 * of the UI today, and each carries the revision it is based on: a vault that
 * sustains auditing does not accept blind overwrite (RN-KNW-034).
 */
export function updateNote(
  vaultSlug: string,
  noteId: string,
  input: { content: string; baseRevision: string },
  options: { keepalive?: boolean } = {},
): Promise<string> {
  // The version the write produced. Every writer of a Content Slot answers
  // it, so the caller can chain a second write without reloading the note.
  return backend
    .updateNote(vaultSlug, noteId, input, options)
    .then((note) => note.revision.versionId);
}

export function putGuidance(
  vaultSlug: string,
  content: string,
  baseRevision: string | null,
  options: { keepalive?: boolean } = {},
): Promise<string> {
  return backend.putGuidance(vaultSlug, content, baseRevision, options);
}

export function putTemplate(
  vaultSlug: string,
  folderId: string,
  content: string,
  baseRevision: string | null,
  options: { keepalive?: boolean } = {},
): Promise<string> {
  return backend.putTemplate(vaultSlug, folderId, content, baseRevision, options);
}

/**
 * Who may tick a box: whoever may write in THIS vault. The effective role is
 * min(subscription role, vault ceiling), and it is the only thing that decides
 * (section 5.3). Never the role in the subscription, which would let an EDITOR
 * demoted in this vault write here.
 */
export function canWrite(effectiveRole: string): boolean {
  return effectiveRole === 'OWNER' || effectiveRole === 'EDITOR';
}
