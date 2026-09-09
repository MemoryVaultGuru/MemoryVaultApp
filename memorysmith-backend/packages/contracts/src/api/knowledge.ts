/**
 * DTOs of svc-knowledge, the core context (architecture-guide.md, 14.1).
 *
 * Two shapes deserve attention:
 *  - A folder DTO carries `hasTemplate`, not the template itself: the template
 *    is a Content Slot fetched on its own, and the tree is read far more often
 *    than the templates are.
 *  - A note DTO carries the `revision`, which is the ContentRef the caller must
 *    echo back as `baseRevision` on update (RN-AGT-005). Blind overwrite is not
 *    accepted in a vault that sustains auditing.
 */

import { z } from 'zod';
import {
  contentRefSchema,
  authorshipSchema,
  instantSchema,
  positionSchema,
  removalPolicySchema,
  roleSchema,
  slugSchema,
  ulidSchema,
} from '../common.js';

export const vaultSummarySchema = z.object({
  vaultId: ulidSchema,
  name: z.string(),
  slug: slugSchema,
  description: z.string(),
  noteCount: z.number().int().nonnegative(),
  hasGuidance: z.boolean(),
  updatedAt: instantSchema,
  /** min(subscription role, vault ceiling), owner above both (RN-ACC-011). */
  effectiveRole: roleSchema,
});

export const folderSchema = z.object({
  folderId: ulidSchema,
  parentFolderId: ulidSchema.nullable(),
  name: z.string(),
  slug: slugSchema,
  /** Mandatory, 1 to 500 characters: it is what steers the agent (RN-KNW-006). */
  description: z.string().min(1).max(500),
  position: positionSchema,
  hasTemplate: z.boolean(),
  noteCount: z.number().int().nonnegative(),
});

export const vaultDetailSchema = vaultSummarySchema.extend({
  folders: z.array(folderSchema),
  guidance: z.object({ content: z.string(), revision: contentRefSchema }).nullable(),
});

export const createVaultRequestSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(500).default(''),
});

export const renameVaultRequestSchema = z.object({
  name: z.string().min(1).max(120),
});

export const putContentRequestSchema = z.object({
  content: z.string().max(1_048_576),
  /**
   * The revision this write is based on, or null when the slot is still
   * empty. Blind overwrite is not accepted in a vault that sustains auditing:
   * the guidance is the most shared document of a vault and the likeliest to
   * be written by two hands at once, one on the web and one over MCP
   * (RN-KNW-034).
   */
  baseRevision: z.string().nullable(),
});

export const contentSchema = z.object({
  content: z.string(),
  revision: contentRefSchema,
});

export const createFolderRequestSchema = z.object({
  parentFolderId: ulidSchema.nullable().default(null),
  name: z.string().min(1).max(120),
  description: z.string().min(1).max(500),
  afterFolderId: ulidSchema.nullable().default(null),
});

export const patchFolderRequestSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().min(1).max(500).optional(),
  parentFolderId: ulidSchema.nullable().optional(),
});

export const reorderFolderRequestSchema = z.object({
  afterFolderId: ulidSchema.nullable(),
});

export const removeFolderRequestSchema = z.object({
  /** No implicit default: an explicit policy is required (RN-KNW-007). */
  policy: removalPolicySchema,
});

export const noteSummarySchema = z.object({
  noteId: ulidSchema,
  vaultId: ulidSchema,
  folderId: ulidSchema,
  /**
   * What the chain read out of the content (§5.3), and `null` when the note
   * has no title a link could name (RN-KNW-036). A surface that shows a title
   * has to say so rather than draw an empty string.
   */
  title: z.string().min(1).nullable(),
  position: positionSchema,
  bytes: z.number().int().nonnegative(),
  updatedAt: instantSchema,
  updatedBy: authorshipSchema,
});

export const noteSchema = noteSummarySchema.extend({
  content: z.string(),
  revision: contentRefSchema,
  createdBy: authorshipSchema,
  deletedAt: instantSchema.nullable(),
});

/**
 * A note is created from its content and nothing else: the title is read out
 * of what was written, in the frontmatter or in the first level-1 heading
 * (RN-AGT-024). A repeated call writes a second note, because nothing in a
 * vault is a key.
 */
export const createNoteRequestSchema = z.object({
  folderId: ulidSchema,
  content: z.string().max(1_048_576),
  afterNoteId: ulidSchema.nullable().default(null),
});

/**
 * There is no title here either, and no route that renames a note: a note is
 * retitled by editing its content (RN-KNW-038).
 */
export const updateNoteRequestSchema = z.object({
  content: z.string().max(1_048_576),
  /** The revision the edit was based on; divergence answers CONFLICT. */
  baseRevision: z.string().min(1),
});

export const reorderNoteRequestSchema = z.object({
  afterNoteId: ulidSchema.nullable(),
});

/**
 * Nothing collides on a move any more, in either direction: two notes may
 * carry one title in one vault (RN-KNW-037), so a destination has nothing to
 * refuse and no policy to be given (RN-KNW-022, removed).
 */
export const moveNoteRequestSchema = z.object({
  toVaultId: ulidSchema.optional(),
  toFolderId: ulidSchema,
  afterNoteId: ulidSchema.nullable().default(null),
});

export type VaultSummaryDto = z.infer<typeof vaultSummarySchema>;
export type FolderDto = z.infer<typeof folderSchema>;
export type VaultDetailDto = z.infer<typeof vaultDetailSchema>;
export type ContentDto = z.infer<typeof contentSchema>;
export type NoteSummaryDto = z.infer<typeof noteSummarySchema>;
export type NoteDto = z.infer<typeof noteSchema>;
export type CreateVaultRequest = z.infer<typeof createVaultRequestSchema>;
export type RenameVaultRequest = z.infer<typeof renameVaultRequestSchema>;
export type PutContentRequest = z.infer<typeof putContentRequestSchema>;
export type CreateFolderRequest = z.infer<typeof createFolderRequestSchema>;
export type PatchFolderRequest = z.infer<typeof patchFolderRequestSchema>;
export type ReorderFolderRequest = z.infer<typeof reorderFolderRequestSchema>;
export type RemoveFolderRequest = z.infer<typeof removeFolderRequestSchema>;
export type CreateNoteRequest = z.infer<typeof createNoteRequestSchema>;
export type UpdateNoteRequest = z.infer<typeof updateNoteRequestSchema>;
export type ReorderNoteRequest = z.infer<typeof reorderNoteRequestSchema>;
export type MoveNoteRequest = z.infer<typeof moveNoteRequestSchema>;
