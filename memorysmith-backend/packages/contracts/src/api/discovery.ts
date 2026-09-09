/**
 * DTOs of svc-discovery: the projections over the same events
 * (architecture-guide.md, section 11).
 *
 * A hit always carries the note it came from (RN-DSC-010): whoever consumes it
 * decides with the source in sight, which is the answer to plausible-but-wrong
 * retrieval. `section` is kept nullable so a future index that cuts notes into
 * parts can fill it without moving the contract.
 */

import { z } from 'zod';
import { instantSchema, ulidSchema } from '../common.js';

/**
 * A note as the projections name it. There is no slug: a link resolves against
 * the title (RN-DSC-041) and the interface addresses a note by its identifier
 * (RN-DSC-045), so what travels is what each of the two reads.
 */
export const noteRefSchema = z.object({
  noteId: ulidSchema,
  title: z.string(),
  aliases: z.array(z.string()),
  folderId: ulidSchema,
});

/**
 * What one wikilink target resolves to: every note whose title matches it or —
 * when none does — every note carrying it as an alias, with which of the two
 * answered. The two are not equally durable, and the interface says so
 * (RN-DSC-046, RN-DSC-053).
 */
export const resolvedTargetSchema = z.object({
  target: z.string().min(1),
  kind: z.enum(['note', 'attachment', 'pending']),
  by: z.enum(['title', 'alias']).nullable(),
  notes: z.array(noteRefSchema),
});

/** BFS from a note: depth capped at 3, 200 nodes, cycles deduplicated. */
export const graphNodeSchema: z.ZodType<{
  note: z.infer<typeof noteRefSchema>;
  depth: number;
  children: unknown[];
}> = z.lazy(() =>
  z.object({
    note: noteRefSchema,
    depth: z.number().int().min(0).max(3),
    children: z.array(graphNodeSchema),
  }),
);

/**
 * A node of the whole-vault graph: the note, plus the portrait the facet
 * projection keeps of it, so a reader can color the graph by an attribute the
 * vault itself declares. The values were classified BY SHAPE (RN-DSC-019), so
 * the backend still interprets nothing: what an attribute means is a decision
 * of whoever authored the vault. A note with no frontmatter carries `{}`.
 */
export const graphNoteRefSchema = noteRefSchema.extend({
  facets: z.record(z.string(), z.array(z.string())),
});

/**
 * The whole link graph of a vault. Edges are index pairs into `nodes`, because
 * a graph repeats every identifier twice per edge and an index is two bytes
 * where a ULID is twenty-six.
 */
export const vaultGraphSchema = z.object({
  nodes: z.array(graphNoteRefSchema),
  edges: z.array(z.tuple([z.number().int().nonnegative(), z.number().int().nonnegative()])),
  pending: z.array(
    z.object({ from: z.number().int().nonnegative(), targetTitle: z.string().min(1) }),
  ),
  /** True when the node ceiling cut the graph short. Never truncate silently. */
  truncated: z.boolean(),
});

export const backlinksSchema = z.object({
  note: noteRefSchema,
  backlinks: z.array(noteRefSchema),
});

export const brokenLinkSchema = z.object({
  fromNote: noteRefSchema,
  targetTitle: z.string().min(1),
});

export const vaultHealthSchema = z.object({
  brokenLinks: z.array(brokenLinkSchema),
  orphans: z.array(noteRefSchema),
  /** A link whose target does not exist YET is pending, not broken (RN-DSC-004). */
  pendingLinks: z.array(brokenLinkSchema),
});

export const searchRequestSchema = z.object({
  query: z.string().min(1).max(500),
  mode: z.enum(['lexical']).default('lexical'),
  folderId: ulidSchema.optional(),
  k: z.number().int().min(1).max(50).default(10),
});

export const searchHitSchema = z.object({
  note: noteRefSchema,
  /** The heading a hit was cut at, when the index knows one. */
  section: z.string().nullable(),
  excerpt: z.string(),
  score: z.number(),
});

export const searchResultSchema = z.object({
  mode: z.enum(['lexical']),
  hits: z.array(searchHitSchema),
});

/** The curation panel: one Query over the STAT# items, no note is scanned. */
export const facetStatsSchema = z.object({
  facets: z.array(
    z.object({
      facet: z.string(),
      kind: z.enum(['date', 'boolean', 'enum', 'list']),
      values: z.array(z.object({ value: z.string(), count: z.number().int().nonnegative() })),
      discarded: z.boolean(),
    }),
  ),
  noteCount: z.number().int().nonnegative(),
  updatedAt: instantSchema,
});

export type NoteRefDto = z.infer<typeof noteRefSchema>;
export type ResolvedTargetDto = z.infer<typeof resolvedTargetSchema>;
export type GraphNodeDto = z.infer<typeof graphNodeSchema>;
export type GraphNoteRefDto = z.infer<typeof graphNoteRefSchema>;
export type VaultGraphDto = z.infer<typeof vaultGraphSchema>;
export type BacklinksDto = z.infer<typeof backlinksSchema>;
export type BrokenLinkDto = z.infer<typeof brokenLinkSchema>;
export type VaultHealthDto = z.infer<typeof vaultHealthSchema>;
export type SearchRequest = z.infer<typeof searchRequestSchema>;
export type SearchHitDto = z.infer<typeof searchHitSchema>;
export type SearchResultDto = z.infer<typeof searchResultSchema>;
export type FacetStatsDto = z.infer<typeof facetStatsSchema>;
