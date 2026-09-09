/**
 * The discovery projector: EventBridge rule to SQS to this function, with a
 * dead-letter queue (architecture-guide.md, section 11.3).
 *
 * The queue is what absorbs a batch ingestion burst, and it is why a retry or
 * a failure of the projector never touches the hot path of the write.
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { SubscriptionId } from '@memorysmith/kernel';
import { parseEvent } from '@memorysmith/contracts';
import {
  DynamoContentIndex,
  DynamoFacetIndex,
  DynamoLinkGraph,
  DynamoStructureProjection,
} from '../adapters/aws.js';
import { ProjectNote, ProjectStructure } from '../application/projections.js';

interface QueueEvent {
  detail?: unknown;
  Records?: Array<{ body?: string }>;
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

const db = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});
const s3 = new S3Client({});
const table = required('DISCOVERY_TABLE');
const bucket = required('CONTENT_BUCKET');

/** Every projection is built per subscription, like every repository (PE2). */
function projectorsFor(subscriptionId: SubscriptionId) {
  const content = {
    read: async (ref: { contentId: string; versionId: string }): Promise<string> => {
      const response = await s3.send(
        new GetObjectCommand({
          Bucket: bucket,
          Key: `s/${subscriptionId.value}/c/${ref.contentId}.md`,
          VersionId: ref.versionId,
        }),
      );
      return (await response.Body?.transformToString('utf-8')) ?? '';
    },
  };

  return {
    note: new ProjectNote({
      graph: new DynamoLinkGraph(subscriptionId, db, table),
      facets: new DynamoFacetIndex(subscriptionId, db, table),
      index: new DynamoContentIndex(subscriptionId, db, table),
      structure: new DynamoStructureProjection(subscriptionId, db, table),
      content,
    }),
    structure: new ProjectStructure(new DynamoStructureProjection(subscriptionId, db, table)),
  };
}

export async function handler(event: QueueEvent): Promise<void> {
  const raw = event.Records
    ? event.Records.map((record) => {
        const parsed = JSON.parse(record.body ?? '{}') as { detail?: unknown };
        return parsed.detail ?? parsed;
      })
    : [event.detail].filter((detail) => detail !== undefined);

  for (const each of raw) {
    // Validated against the contract on this side too: an envelope only the
    // producer knows is how a projection starts lying quietly (section 19).
    const envelope = parseEvent(each);
    const subscriptionId = SubscriptionId.fromClaim(envelope.subscriptionId);
    if (!subscriptionId.ok) continue;

    const projectors = projectorsFor(subscriptionId.value);
    const payload = envelope.payload as Record<string, string>;
    const contentRef = envelope.contentRef
      ? { contentId: envelope.contentRef.contentId, versionId: envelope.contentRef.versionId }
      : null;

    switch (envelope.type) {
      case 'VaultCreated':
      case 'VaultRenamed':
        await projectors.structure.onVault(String(payload['vaultId']), String(payload['name']));
        break;

      case 'FolderAdded':
      case 'FolderRenamed':
      case 'FolderDescribed':
      case 'FolderMoved':
        await projectors.structure.onFolder(String(payload['vaultId']), {
          folderId: String(payload['folderId']),
          name: String(payload['name'] ?? ''),
          description: String(payload['description'] ?? ''),
          parentFolderId: payload['toParentFolderId'] ?? payload['parentFolderId'] ?? null,
        });
        break;

      case 'FolderRemoved':
        await projectors.structure.onFoldersRemoved(
          String(payload['vaultId']),
          (envelope.payload['removedFolderIds'] as string[]) ?? [],
        );
        break;

      case 'NoteCreated':
      case 'NoteUpdated':
        await projectors.note.onWritten({
          vaultId: String(payload['vaultId']),
          noteId: String(payload['noteId']),
          folderId: String(payload['folderId']),
          contentRef,
        });
        break;

      case 'NoteMoved':
        // The folder is part of the embedded prefix, so a move reindexes the
        // note even though its words did not change (RN-DSC-012).
        await projectors.note.onMoved({
          vaultId: String(payload['toVaultId']),
          fromVaultId: String(payload['fromVaultId']),
          noteId: String(payload['noteId']),
          folderId: String(payload['toFolderId']),
          contentRef,
        });
        break;

      case 'NoteDeleted':
        await projectors.note.onDeleted({
          vaultId: String(payload['vaultId']),
          noteId: String(payload['noteId']),
          folderId: String(payload['folderId']),
          contentRef: null,
        });
        break;

      case 'NoteRestored':
        await projectors.note.onRestored({
          vaultId: String(payload['vaultId']),
          noteId: String(payload['noteId']),
          folderId: String(payload['folderId']),
          contentRef,
        });
        break;

      default:
        // Everything else on the bus is somebody else's business.
        break;
    }
  }
}
