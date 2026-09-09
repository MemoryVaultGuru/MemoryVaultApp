/**
 * THE composition root (architecture-guide.md, sections 24 and 8.2).
 *
 * This is the one file that changes between the modular monolith and six
 * deployables. Contexts, aggregates, ports and folder structure are identical
 * in both shapes; what differs is who is wired to whom and over what.
 *
 * Two properties are enforced here and nowhere else:
 *
 *  1. REPOSITORIES ARE BUILT PER REQUEST, from the subscription in the token.
 *     There is no code path that builds one without a subscription, and the
 *     compiler is what says so (PE2).
 *  2. A PLATFORM SESSION CARRIES NO SUBSCRIPTION, so buildKnowledge() cannot
 *     even be called under it. The failure is a composition failure, not a
 *     role check (RN-SUB-016).
 */

import { RESERVED_FRONTMATTER_KEYS } from '@memorysmith/contracts';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { S3Client } from '@aws-sdk/client-s3';
import {
  Authorship,
  AgentIdentity,
  Role,
  type SubscriptionContext,
  type UserId,
} from '@memorysmith/kernel';
import {
  DynamoInviteRepository,
  DynamoOnboarding,
  DynamoPlatformAdmin,
  DynamoSubscriptionRepository,
  DynamoUserLinkRepository,
} from '@memorysmith/svc-access/adapters/dynamodb';
import { NULL_OUTBOX_SINK } from '@memorysmith/svc-access/adapters/items';
import {
  CachedRequestContext,
  ResolveRequestContext,
  type ResolvedContext,
} from '@memorysmith/svc-access/application/context';
import { ACCESS_LIMITS, StorageQuota } from '@memorysmith/svc-access/domain/values';
import { DynamoNoteRepository } from '@memorysmith/svc-knowledge/adapters/notes';
import { DynamoVaultRepository } from '@memorysmith/svc-knowledge/adapters/vaults';
import { S3ContentStore } from '@memorysmith/svc-knowledge/adapters/content';
import { DynamoStorageMeter } from '@memorysmith/svc-knowledge/adapters/storage';
import type { StorageState } from '@memorysmith/svc-knowledge/domain';
import { DynamoAuditTrail } from '@memorysmith/svc-audit/adapters/trail';
import { S3RevisionReader } from '@memorysmith/svc-audit/adapters/content';
import {
  DynamoContentIndex,
  DynamoFacetIndex,
  DynamoLinkGraph,
  DynamoStructureProjection,
} from '@memorysmith/svc-discovery/adapters/aws';

export interface Infrastructure {
  readonly db: DynamoDBDocumentClient;
  readonly s3: S3Client;
  readonly knowledgeTable: string;
  readonly accessTable: string;
  readonly auditTable: string;
  readonly discoveryTable: string;
  readonly contentBucket: string;
}

/** Everything the Access routes need, for one request. */
export function buildAccess(infra: Infrastructure, context: SubscriptionContext | null) {
  const links = new DynamoUserLinkRepository(infra.db, infra.accessTable);
  const onboarding = new DynamoOnboarding(infra.db, infra.accessTable, NULL_OUTBOX_SINK);
  const platform = new DynamoPlatformAdmin(infra.db, infra.accessTable, NULL_OUTBOX_SINK);

  // Subscription-scoped repositories only exist when there IS a subscription.
  const scoped = context
    ? {
        subscriptions: new DynamoSubscriptionRepository(
          context,
          infra.db,
          infra.accessTable,
          NULL_OUTBOX_SINK,
        ),
        invites: new DynamoInviteRepository(context, infra.db, infra.accessTable, NULL_OUTBOX_SINK),
      }
    : null;

  return { links, onboarding, platform, scoped };
}

/**
 * Knowledge repositories. The signature is what carries the guarantee: it
 * takes a SubscriptionContext, so a platform session has nothing to pass.
 */
export function buildKnowledge(infra: Infrastructure, context: SubscriptionContext) {
  return {
    vaults: new DynamoVaultRepository(context, infra.db, infra.knowledgeTable),
    notes: new DynamoNoteRepository(context, infra.db, infra.knowledgeTable),
    content: new S3ContentStore(context, infra.s3, infra.contentBucket),
    storage: { current: () => readStorageBudget(infra, context) },
    // The one layer allowed to know which version of the specification the
    // product implements. The Vault Context declares these names to the agent
    // (RN-AGT-025), and neither the domain nor the application reads a
    // specification to find them.
    reservedVocabulary: RESERVED_FRONTMATTER_KEYS,
  };
}

/**
 * The two halves of the budget, joined HERE and nowhere else: how much is
 * stored is a Knowledge fact and how much is allowed is an Access one, and
 * neither context may read the other's table. Joining them is exactly what a
 * composition root is for.
 *
 * A subscription that cannot be read falls back to the default quota rather
 * than to zero: a transient read failure must not present itself to the person
 * writing as "your plan is full".
 */
export async function readStorageBudget(
  infra: Infrastructure,
  context: SubscriptionContext,
): Promise<StorageState> {
  const meter = new DynamoStorageMeter(context, infra.db, infra.knowledgeTable);
  const platform = new DynamoPlatformAdmin(infra.db, infra.accessTable, NULL_OUTBOX_SINK);
  const [usedBytes, subscription] = await Promise.all([
    meter.usedBytes(),
    platform.findById(context.subscriptionId).catch(() => null),
  ]);
  return { usedBytes, limitBytes: (subscription?.quota ?? StorageQuota.DEFAULT).bytes };
}

/** Audit reads. Writing is the consumer's job, in its own deployable. */
export function buildAudit(infra: Infrastructure, context: SubscriptionContext) {
  return {
    trail: new DynamoAuditTrail(infra.db, infra.auditTable, context.subscriptionId),
    revisions: new S3RevisionReader(context.subscriptionId, infra.s3, infra.contentBucket),
  };
}

export function buildDiscovery(infra: Infrastructure, context: SubscriptionContext) {
  return {
    graph: new DynamoLinkGraph(context.subscriptionId, infra.db, infra.discoveryTable),
    facets: new DynamoFacetIndex(context.subscriptionId, infra.db, infra.discoveryTable),
    index: new DynamoContentIndex(context.subscriptionId, infra.db, infra.discoveryTable),
    structure: new DynamoStructureProjection(
      context.subscriptionId,
      infra.db,
      infra.discoveryTable,
    ),
  };
}

/** Stage 1 of authorization, cached for the declared five minutes. */
export function buildAuthorizer(
  infra: Infrastructure,
  context: SubscriptionContext,
): CachedRequestContext {
  const access = buildAccess(infra, context);
  if (!access.scoped) throw new Error('unreachable: a context was provided');
  return new CachedRequestContext(
    new ResolveRequestContext(access.scoped.subscriptions),
    ACCESS_LIMITS.authorizerCacheSeconds,
  );
}

/**
 * A write through the UI carries no agent. A write through the MCP connector
 * arrives with the CIMD client_id in the token, and that is what becomes the
 * AgentIdentity: the authorship records the agent AND the human, with no side
 * channel to trust (RN-AGT-001, section 12.1).
 */
export function authorshipFor(user: UserId, clientId?: string | undefined): Authorship {
  const isConnector = Boolean(clientId && /^https?:\/\//i.test(clientId));
  if (!isConnector || !clientId) return Authorship.byHuman(user);

  const agent = AgentIdentity.create(clientId, clientId);
  return agent.ok ? Authorship.byAgent(user, agent.value) : Authorship.byHuman(user);
}

/** The role the session holds in the subscription, owner above every member. */
export function roleOf(resolved: ResolvedContext): Role {
  return resolved.isOwner ? Role.OWNER : resolved.role;
}
