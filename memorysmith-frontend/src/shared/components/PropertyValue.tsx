import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { DRAWN_RESERVED_KEYS, TITLE_KEY } from '@memorysmith/contracts';
import { resolveNoteUrl } from '../api/source';

// Frontmatter values are vault content, so they may carry [[wikilinks]],
// markdown links and raw URLs. This renderer makes them navigable without
// interpreting anything else.
const TOKEN =
  /\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\]|\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)|(https?:\/\/[^\s,]+)/g;

interface PropertyValueProps {
  value: string;
  /** The vault wrote this one as a list, so it is drawn as chips. */
  list: boolean;
  vaultSlug: string;
}

/**
 * Which icon names the property, by the shape of its value and never by its
 * key. It is the same reading the facet projector does (FacetExtractor.ts):
 * the vocabulary of a vault belongs to its Guidance, so a list of blessed key
 * names here would be this layer deciding what `status` means.
 */
/**
 * The keys the specification reserves, minus the one that names the note:
 * `title` is drawn as the title and never as a property, because a note is not
 * a category of itself (RN-DSC-050, RN-DSC-051).
 *
 * The list is not written here. It is derived from the pinned specification,
 * in the contracts package, so this file cannot drift from the extractor or
 * from the version the product implements — which is what it did while three
 * copies of it existed (RN-DSC-030).
 */
const RESERVED = DRAWN_RESERVED_KEYS;

/**
 * How a property is LABELLED. The reserved keys may be shown translated; every
 * other attribute keeps the name whoever wrote the note gave it, in whatever
 * language they gave it.
 *
 * The translation stops at the label and never reaches the bytes. A vault
 * written in Portuguese still stores `created`, still exports `created`, and
 * still answers `created:2026-09` in the search — the word on screen is the
 * only thing that changes, which is the same line PP4 draws everywhere else.
 */
export function propertyLabel(key: string, t: (key: string) => string): string {
  return RESERVED.includes(key) ? t(`reserved.${key}`) : key;
}

/**
 * The properties in the order they are drawn: the reserved keys first, in the
 * order the specification declares them, and then the vocabulary of the vault
 * in the order the note wrote it (RN-DSC-051).
 *
 * That is the honest shape of the block. The first group is the same in every
 * vault of every language and is what the product can say something about; the
 * second belongs to the Guidance, and the product knows nothing about it
 * beyond the shape of its value. Drawing them shuffled together, which is what
 * the written order did, asked the reader to know which was which.
 */
export function orderedProperties(
  entries: ReadonlyArray<readonly [string, string]>,
): Array<readonly [string, string]> {
  const rank = (key: string): number => {
    const at = RESERVED.indexOf(key);
    return at === -1 ? RESERVED.length : at;
  };
  return entries
    .filter(([key]) => key !== TITLE_KEY)
    .map((entry, index) => ({ entry, index }))
    .sort((left, right) => {
      const byGroup = rank(left.entry[0]) - rank(right.entry[0]);
      return byGroup !== 0 ? byGroup : left.index - right.index;
    })
    .map(({ entry }) => entry);
}

export function propertyType(value: string, list: boolean): 'list' | 'date' | 'checkbox' | 'text' {
  if (list) return 'list';
  if (/^(true|false|yes|no)$/i.test(value.trim())) return 'checkbox';
  if (/^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2})?$/.test(value.trim())) return 'date';
  return 'text';
}

function renderRich(value: string, vaultSlug: string, pendingHint: string): ReactNode[] {
  const parts: ReactNode[] = [];
  let cursor = 0;
  let key = 0;
  for (const match of value.matchAll(TOKEN)) {
    const index = match.index ?? 0;
    if (index > cursor) parts.push(value.slice(cursor, index));
    const [whole, wikiTarget, wikiLabel, mdLabel, mdUrl, rawUrl] = match;

    if (wikiTarget) {
      const label = (wikiLabel ?? wikiTarget).trim();
      const target = wikiTarget.split('#')[0]?.trim() ?? '';
      const url = target ? resolveNoteUrl(vaultSlug, target.normalize('NFC')) : null;
      parts.push(
        url ? (
          <Link key={key++} className="wikilink" to={url}>
            {label}
          </Link>
        ) : (
          <span key={key++} className="wikilink-pending" title={pendingHint}>
            {label}
          </span>
        ),
      );
    } else if (mdUrl) {
      parts.push(
        <a key={key++} href={mdUrl} target="_blank" rel="noreferrer">
          {mdLabel}
        </a>,
      );
    } else if (rawUrl) {
      parts.push(
        <a key={key++} href={rawUrl} target="_blank" rel="noreferrer">
          {rawUrl}
        </a>,
      );
    }
    cursor = index + whole.length;
  }
  if (cursor < value.length) parts.push(value.slice(cursor));
  return parts;
}

export function PropertyValue({ value, list, vaultSlug }: PropertyValueProps) {
  const { t } = useTranslation();

  if (list) {
    return (
      <span className="prop-tags">
        {value
          .split(/,\s*/)
          .filter(Boolean)
          .map((tag) => (
            <span key={tag} className="prop-tag">
              {tag}
            </span>
          ))}
      </span>
    );
  }

  return <>{renderRich(value, vaultSlug, t('note.pendingLink'))}</>;
}
