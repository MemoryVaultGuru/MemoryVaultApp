import { useEffect, useRef } from 'react';
import { Navigate, useOutletContext, useParams } from 'react-router-dom';
import { lastNoteOf, forgetNote } from '../../shared/store/last-note';
import { folderTrailForNote, noteAt } from './trail';
import { VaultContextPage } from './VaultContextPage';
import type { VaultOutletContext } from './VaultLayout';

/**
 * Entering a vault resumes where the reading stopped, and does not.
 *
 * The two halves are both required. Somebody arriving at a vault is almost
 * always going back to the note they had open, and making them walk the tree
 * again is the friction this exists to remove. But the name of the vault in
 * the sidebar is also the way BACK to the Vault Context, and a redirect that
 * fires every time would make that page unreachable from inside the vault:
 * resuming would have become a trap.
 *
 * So it fires on the FIRST arrival at this vault in this page session, and
 * never again. Asking for the Vault Context after that is a request, not an
 * arrival, and it is answered.
 */
const arrived = new Set<string>();

export function ResumeReading() {
  const { vaultSlug = '' } = useParams();
  const { structure } = useOutletContext<VaultOutletContext>();

  // Decided once per mount, in a ref rather than in state: it must survive a
  // re-render without being recomputed, and it must not be recomputed after
  // the effect below has marked this vault as arrived at.
  const target = useRef<string | null | undefined>(undefined);
  if (target.current === undefined) {
    target.current = arrived.has(vaultSlug) ? null : resumable(structure, vaultSlug);
  }

  useEffect(() => {
    arrived.add(vaultSlug);
  }, [vaultSlug]);

  if (target.current) {
    // `replace`, so the vault index is not left in the history: the back
    // button leaves the vault instead of bouncing into the note again.
    return <Navigate to={`/vaults/${vaultSlug}/root/${target.current}`} replace />;
  }
  return <VaultContextPage />;
}

/**
 * The remembered note, if it is still a note of this vault.
 *
 * The structure is already in hand, so this costs no request and cannot
 * flash, and a remembered address now **survives a retitle and a move**: it
 * carries the identifier, so what changed is the decoration and the route
 * corrects it (RN-DSC-045). Only a deleted note lands on the tree, and its
 * stale entry is dropped on the way, because it will never be right again.
 */
function resumable(structure: VaultOutletContext['structure'], vaultSlug: string): string | null {
  const path = lastNoteOf(vaultSlug);
  if (!path) return null;
  const noteId = noteAt(structure.folders, path);
  if (noteId && folderTrailForNote(structure.folders, noteId).length) return path;
  forgetNote(vaultSlug);
  return null;
}
