/**
 * The address this interface gives a note, and the label inside it.
 *
 * ```
 * /vaults/:vaultSlug/root/<folder slugs>/<label>--<noteId>
 * /vaults/enologia/root/01-castas/indice--01j8x2k9qz3m4n5p6r7s8t9v0w
 * ```
 *
 * **The identifier is the address; everything before it is decoration.** A URL
 * is an address: the product writes it, a person copies it, and pasting it
 * back has to land on the note it was copied from. A wikilink is a name, and a
 * name may be carried by several notes — that ambiguity is the model
 * (RN-KNW-037) and it has an address of its own, under `/links/`. Putting the
 * title in the last segment made the address inherit the ambiguity of the
 * name, which is the merge this design undoes (RN-DSC-045, RN-DSC-055).
 *
 * **The label is a slug and it must not be called `slugify`.** The defect this
 * cycle paid off was two copies of `slugify` that disagreed about what a note
 * was called. A decorative label cannot disagree with anything, because
 * **nothing reads it**: it is never compared, never stored and never sent to
 * the API. That distinction survives only if the name says it — called
 * `slugify`, it would be compared with the kernel's again within the year.
 */

const MAX_LABEL_LENGTH = 60;
const ULID = /^[0-9a-hjkmnp-tv-z]{26}$/i;

/**
 * A readable label for a title. Its only job is to let a person tell what an
 * address points at; a stale one, a wrong one or none at all still lands on
 * the note, which is what "decoration" means.
 */
export function decorativeLabel(title: string | null): string {
  if (!title) return '';
  return title
    .normalize('NFD')
    .replace(/(\d)[.,](\d)/g, '$1$2')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_LABEL_LENGTH)
    .replace(/-+$/g, '');
}

/**
 * The last segment of a note address: the label, then `--`, then the
 * identifier. With no label it is the bare identifier, which is the address of
 * a note with no addressable title (RN-KNW-036) — the degenerate case of the
 * same rule rather than a second scheme.
 */
export function noteSegment(title: string | null, noteId: string): string {
  const label = decorativeLabel(title);
  const id = noteId.toLowerCase();
  return label ? `${label}--${id}` : id;
}

/**
 * The identifier a segment addresses, or `null` when it addresses no note.
 *
 * **Split at the LAST `--`.** A label never contains one — runs of
 * non-alphanumerics collapse into a single hyphen — but splitting at the last
 * costs nothing and holds even if that ever changes. The identifier is written
 * in lower case and upper-cased before it is parsed, because Crockford base32
 * is case-insensitive and an address somebody looks at should not shout.
 */
export function noteIdOf(segment: string): string | null {
  const cut = segment.lastIndexOf('--');
  const id = cut === -1 ? segment : segment.slice(cut + 2);
  return ULID.test(id) ? id.toUpperCase() : null;
}

/** The whole address of a note, which is what every surface links to. */
export function noteAddress(
  vaultSlug: string,
  folderSlugPath: string,
  title: string | null,
  noteId: string,
): string {
  const trail = folderSlugPath ? `${folderSlugPath}/` : '';
  return `/vaults/${vaultSlug}/root/${trail}${noteSegment(title, noteId)}`;
}

/**
 * The address of a link target, which is where a name legitimately gets
 * encoded: a route reached by clicking and never by typing (RN-DSC-046).
 */
export function linkTargetAddress(vaultSlug: string, target: string): string {
  return `/vaults/${vaultSlug}/links/${encodeURIComponent(target.normalize('NFC'))}`;
}
