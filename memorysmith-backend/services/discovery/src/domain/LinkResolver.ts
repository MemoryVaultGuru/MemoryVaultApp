/**
 * What a target becomes, once there is a vault to resolve it against.
 *
 * Resolution used to be a lookup: one slug, one note, one edge. Specification
 * 0.6.0 makes it a question with three answers and, for the first one, a
 * count — because two notes may carry one title (RN-KNW-037) and a link into
 * both is two edges, never the first one, since there is no order to appeal
 * to (RN-DSC-042).
 *
 * **Step 7 before step 8 is the whole of what keeps the frontmatter out of the
 * graph.** A title always wins; an alias resolves ONLY what no title matched
 * (RN-DSC-052). The objection that used to keep aliases out of resolution
 * entirely was that one could move an edge invisibly — editing a third note,
 * neither end of the link, to take a link away from the note it had landed on.
 * An alias that may only take what nothing holds cannot do that. What it can
 * do is create an edge where a pending link was, and lose it again the day
 * somebody writes the note that owns the title (RN-DSC-053).
 *
 * **And that is the price: resolution is no longer monotonic.** Writing a note
 * used to only ever create edges. Now it can destroy one, in a note nobody
 * touched, so whoever holds the projection has to re-resolve what it holds by
 * alias whenever a title appears, changes or goes.
 */

/** What a vault answers to: its titles, its aliases and its attachments. */
export interface VaultNames {
  /** Note identifiers by the title they carry. Several notes may share one. */
  readonly byTitle: ReadonlyMap<string, readonly string[]>;
  /** Note identifiers by each alias they declare (RN-DSC-052). */
  readonly byAlias: ReadonlyMap<string, readonly string[]>;
  /** The names of the files that are not notes, extension included (§5.8). */
  readonly attachments: ReadonlySet<string>;
}

export type ResolutionKind = 'note' | 'attachment' | 'pending';

export interface Resolution {
  readonly target: string;
  readonly kind: ResolutionKind;
  /** Whether the notes were found by title or by alias; `null` when neither. */
  readonly by: 'title' | 'alias' | null;
  /** Every note the target resolves to. Two notes with one title are two. */
  readonly noteIds: readonly string[];
}

/** A name is compared after NFC and folded in no other way (§5.3). */
const asName = (raw: string): string => raw.normalize('NFC');

/**
 * Builds the index a vault is resolved against. The titles come from the chain
 * of the specification, read by the kernel, and the aliases from the
 * frontmatter — which is the reason resolution stopped being the business of
 * one extractor: a note points with its body and answers with both.
 */
export function vaultNames(
  notes: ReadonlyArray<{
    readonly noteId: string;
    readonly title: string | null;
    readonly aliases?: readonly string[];
  }>,
  attachments: readonly string[] = [],
): VaultNames {
  const byTitle = new Map<string, string[]>();
  const byAlias = new Map<string, string[]>();

  for (const note of notes) {
    if (note.title) {
      const key = asName(note.title);
      byTitle.set(key, [...(byTitle.get(key) ?? []), note.noteId]);
    }
    for (const alias of note.aliases ?? []) {
      const key = asName(alias);
      if (key.length === 0) continue;
      byAlias.set(key, [...(byAlias.get(key) ?? []), note.noteId]);
    }
  }

  return { byTitle, byAlias, attachments: new Set(attachments.map(asName)) };
}

/**
 * One target, resolved by the order the specification fixes: every note whose
 * TITLE matches, then — only if none did — every note whose ALIAS matches,
 * then an attachment, then nothing.
 *
 * An attachment reference renders and is never an edge (RN-DSC-044): the graph
 * is between notes, and a name matching nothing is reported as pending rather
 * than treated as an error.
 */
export function resolveTarget(target: string, names: VaultNames): Resolution {
  const key = asName(target);

  const byTitle = names.byTitle.get(key);
  if (byTitle && byTitle.length > 0) {
    return { target: key, kind: 'note', by: 'title', noteIds: byTitle };
  }

  const byAlias = names.byAlias.get(key);
  if (byAlias && byAlias.length > 0) {
    return { target: key, kind: 'note', by: 'alias', noteIds: byAlias };
  }

  if (names.attachments.has(key)) {
    return { target: key, kind: 'attachment', by: null, noteIds: [] };
  }

  return { target: key, kind: 'pending', by: null, noteIds: [] };
}

/** Every target of one note, resolved against the same vault. */
export function resolveTargets(
  targets: readonly string[],
  names: VaultNames,
): readonly Resolution[] {
  return targets.map((target) => resolveTarget(target, names));
}
