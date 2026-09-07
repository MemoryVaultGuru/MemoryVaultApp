/**
 * Which addresses the reading surface will follow (RN-DSC-039).
 *
 * `react-markdown` normally passes every URL through a filter that keeps the
 * safe schemes and drops the rest, and this surface had it **switched off** —
 * `urlTransform={(url) => url}`. There was a reason: an unresolved wikilink is
 * rendered as `[text](pending:target)`, and the stock filter does not know
 * `pending:`, so it erased the pending link from the page. A whole protection
 * was traded for one scheme.
 *
 * This is that trade undone. The list says what passes, never what is
 * refused, because a vault is written by several people and by agents, and a
 * denylist is a promise to have thought of everything.
 *
 * **What passes, and why:**
 *
 * - `pending:` — ours, and the reason the filter was off in the first place.
 * - A path of the application (`/`), a relative one (`./`, `../`) and an
 *   anchor of the page (`#`).
 * - `http:` and `https:` — the web, which is what a note cites.
 * - `mailto:` — a person, which is what a note cites next most often.
 *
 * **What does not, and why each one:**
 *
 * - **`obsidian://`, and any other scheme of an editor. Decided, not
 *   overlooked.** It opens the vault of whoever has that editor installed and
 *   that vault on that machine, so the link works for the person who wrote it
 *   and does nothing at all for everybody else who opens the note — a promise
 *   the product cannot keep on behalf of a tool it does not run. The product
 *   serves a vault to whoever reads it, and an address only its author can
 *   follow is not an address.
 * - `data:` — a whole page carried inside the address. `data:text/html` is a
 *   script running in the reader's session, offered by whoever wrote the note.
 * - `javascript:` and `vbscript:` — script written where an address goes.
 *   React blocks the first one on its own; that it does is not a reason to
 *   hand it the chance.
 * - `file:` — the disk of whoever is reading, addressed by somebody else.
 *
 * A refused address is not silently swallowed: the text stays on the page and
 * stops being clickable, which is what `MarkdownAnchor` does with an empty
 * href. An author sees they got nothing, the same answer the profile gives to
 * a notation it does not implement.
 */

const ALLOWED_SCHEME = /^(https?|mailto|pending):/i;

/** Anything of the shape `word:`, which is what makes an address absolute. */
const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

/**
 * The address as it will be written, or the empty string when this surface
 * will not follow it.
 *
 * An address with no scheme is a path, an anchor or a relative target, and it
 * cannot reach outside the page on its own: those pass untouched, which is
 * what keeps `./note.md`, `/v/a-vault/note/x` and `#a-heading` working.
 */
export function followable(url: string): string {
  const trimmed = url.trim();
  if (!HAS_SCHEME.test(trimmed)) return url;
  return ALLOWED_SCHEME.test(trimmed) ? url : '';
}
