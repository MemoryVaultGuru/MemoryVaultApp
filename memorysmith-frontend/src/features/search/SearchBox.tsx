// The vault search.
//
// What it types goes to the source untouched: the whole query language lives
// in the backend (software-vision.md 10.2), and a box that pre-filtered here
// would either duplicate that grammar or quietly break it. The screen's job is
// to debounce, to show the passage the match came from and to resolve the note
// identifier of a hit into the URL the reader clicks.

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import type { FolderNode, SearchHit, VaultStructure } from '../../shared/types/api';
import { searchNotes } from '../../shared/api/source';
import { noteAddress } from '../../shared/api/note-address';
import { ApiError } from '../../shared/api/error-mapper';
import { highlight } from './highlight';

/** Long enough that a typed word is one request, short enough to feel live. */
const DEBOUNCE_MS = 250;
const MAX_HITS = 20;

interface FlatNote {
  id: string;
  /** Where the note lives, built from its identifier (RN-DSC-045). */
  address: string;
  title: string | null;
  folderPath: string;
}

function flatten(vaultSlug: string, folders: FolderNode[], trail: string[] = []): FlatNote[] {
  return folders.flatMap((folder) => {
    const path = [...trail, folder.name];
    return [
      ...folder.notes.map((note) => ({
        id: note.id,
        address: noteAddress(vaultSlug, folder.slugPath, note.title, note.id),
        title: note.title,
        folderPath: path.join(' / '),
      })),
      ...flatten(vaultSlug, folder.children, path),
    ];
  });
}

/**
 * The excerpt arrives as the note was written, which means Markdown: a heading
 * marker, a list bullet, a callout, a table row. Shown as one line of prose,
 * that punctuation reads as noise, so it comes off. Nothing is added and no
 * word is changed: the reader has to recognise the sentence when they open the
 * note.
 */
function readable(excerpt: string): string {
  return excerpt
    .split(/\r?\n/)
    .map((line) =>
      line
        .replace(/^\s*>\s*(?:\[![a-z]+\]\s*)?/i, '')
        .replace(/^\s*#{1,6}\s+/, '')
        .replace(/^\s*[-*+]\s+/, '')
        // A table separator carries no words at all.
        .replace(/^\s*\|?[\s|:-]*\|[\s|:-]*$/, '')
        .replace(/\|/g, ' '),
    )
    .join(' ')
    .replace(
      /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g,
      (_all, target: string, label?: string) => label ?? target,
    )
    .replace(/[*`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

interface SearchBoxProps {
  vaultSlug: string;
  structure: VaultStructure;
}

export function SearchBox({ vaultSlug, structure }: SearchBoxProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  // A hit names a note by identifier; the tree the page is already showing is
  // what turns it into a title, a path and a link.
  const byId = useMemo(
    () => new Map(flatten(vaultSlug, structure.folders).map((note) => [note.id, note])),
    [structure, vaultSlug],
  );

  const { data, isFetching, error } = useQuery({
    queryKey: ['vault-search', vaultSlug, debounced],
    queryFn: () => searchNotes(vaultSlug, debounced, MAX_HITS),
    enabled: debounced !== '',
    // The previous answer stays on screen while the next one is in flight, so
    // the list does not blink empty between two keystrokes.
    placeholderData: (previous: SearchHit[] | undefined) => previous,
    retry: false,
    staleTime: 30_000,
  });

  const results = useMemo(
    () =>
      (data ?? []).flatMap((hit) => {
        const note = byId.get(hit.noteId);
        return note ? [{ hit, note, url: note.address }] : [];
      }),
    [data, byId],
  );

  const typed = query.trim();
  const busy = isFetching || typed !== debounced;

  const failure =
    error instanceof ApiError && error.code === 'VALIDATION'
      ? t('search.invalid')
      : error
        ? t('search.failed')
        : null;

  return (
    <div className="search-box">
      <input
        type="search"
        value={query}
        placeholder={t('search.placeholder')}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setQuery('');
        }}
      />
      {typed !== '' && (
        <div className="search-results">
          {failure ? (
            <p className="search-empty">{failure}</p>
          ) : results.length > 0 ? (
            <ul>
              {results.map(({ hit, note, url }) => (
                <li key={hit.noteId}>
                  <Link to={url} onClick={() => setQuery('')}>
                    <span className="search-title">{note.title}</span>
                    <span className="search-path">
                      {note.folderPath}
                      {hit.section ? ` · ${hit.section}` : ''}
                    </span>
                    {hit.excerpt !== '' && (
                      <span className="search-excerpt">
                        {highlight(readable(hit.excerpt), debounced)}
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="search-empty">{busy ? t('search.searching') : t('search.empty')}</p>
          )}
          <p className="search-hint">{t('search.syntaxHint')}</p>
        </div>
      )}
    </div>
  );
}
