import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { resolveNoteUrl } from '../api/source';
import { slugify } from '../api/markdown';

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
 * The four keys the profile reserves, always written in en-US (RN-DSC-030).
 * The list is here because this is the layer allowed to know it: the backend
 * classifies every attribute by shape and knows no key at all.
 */
const RESERVED = ['aliases', 'tags', 'created', 'updated'] as const;

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
  return (RESERVED as readonly string[]).includes(key) ? t(`reserved.${key}`) : key;
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
      const url = target ? resolveNoteUrl(vaultSlug, slugify(target)) : null;
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
