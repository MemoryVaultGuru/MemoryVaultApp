/**
 * Where the reading stopped, per vault, in this browser.
 *
 * It is deliberately NOT in the product. Remembering across devices would mean
 * a write on every note opened — on the hottest path of the reading surface,
 * against the quota, and carrying an `Authorship` that reading does not have,
 * since design rule 7 requires one for every change of state. The convenience
 * does not pay for that. So this lives in `localStorage`, never leaves the
 * machine, is never exported and is never seen by anybody else.
 *
 * Everything here is inside a try/catch, because a browser can refuse storage
 * outright and none of this may ever keep somebody from opening a vault.
 */

const KEY = 'memorysmith.lastNote';

type Remembered = Record<string, string>;

function read(): Remembered {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    // Anything but an object of strings is somebody else's data or a version
    // of ours that no longer exists. Starting over costs one navigation.
    if (typeof parsed !== 'object' || parsed === null) return {};
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).filter(
        ([, value]) => typeof value === 'string',
      ),
    ) as Remembered;
  } catch {
    return {};
  }
}

function write(next: Remembered): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage refused or full: the vault still opens, at the tree.
  }
}

/** The path of the note inside the vault, as `root/*` spells it. */
export function rememberNote(vaultSlug: string, path: string): void {
  if (!vaultSlug || !path) return;
  const current = read();
  if (current[vaultSlug] === path) return; // no write per re-render
  write({ ...current, [vaultSlug]: path });
}

export function lastNoteOf(vaultSlug: string): string | null {
  return read()[vaultSlug] ?? null;
}

export function forgetNote(vaultSlug: string): void {
  const current = read();
  if (!(vaultSlug in current)) return;
  const { [vaultSlug]: _removed, ...rest } = current;
  write(rest);
}
