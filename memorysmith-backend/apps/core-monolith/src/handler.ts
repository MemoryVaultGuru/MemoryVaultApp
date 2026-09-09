/**
 * Lambda entrypoint of the core deployable: the one place that knows this runs
 * on Lambda, and the one place that wires the AWS-backed adapters.
 *
 * Everything above it is transport-agnostic, which is what makes the same code
 * run under `vitest` against in-memory adapters and under Lambda against
 * DynamoDB and S3.
 */

import { handle } from 'hono/aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { S3Client } from '@aws-sdk/client-s3';
import {
  DomainError,
  VaultId,
  type SubscriptionContext,
  type SubscriptionId,
} from '@memorysmith/kernel';
import { CognitoTokenVerifier } from '@memorysmith/svc-access/adapters/auth';
import type { AccessRequest, AccessUseCases } from '@memorysmith/svc-access/adapters/http';
import {
  GetSession,
  RequestSubscription,
  SwitchActiveSubscription,
} from '@memorysmith/svc-access/application/onboarding';
import {
  ListPlatformQueue,
  ReviewSubscription,
} from '@memorysmith/svc-access/application/platform';
import {
  AcceptInvite,
  ChangeMemberRole,
  ListMembers,
  InviteMember,
  RemoveMember,
  TransferOwnership,
} from '@memorysmith/svc-access/application/members';
import type { KnowledgeRequest, KnowledgeUseCases } from '@memorysmith/svc-knowledge/adapters/http';
import {
  ClearVaultRoleLimit,
  CreateVault,
  DeleteVault,
  GetVault,
  GetVaultContext,
  ListVaults,
  PutGuidance,
  RenameVault,
  RestoreVault,
  SetVaultRoleLimit,
} from '@memorysmith/svc-knowledge/application/vaults';
import {
  CreateFolder,
  GetTemplate,
  PatchFolder,
  PutTemplate,
  RemoveFolder,
  ReorderFolder,
} from '@memorysmith/svc-knowledge/application/folders';
import {
  CreateNote,
  DeleteNote,
  ListNotes,
  MoveNote,
  ReadNote,
  ReorderNote,
  RestoreNote,
  UpdateNote,
} from '@memorysmith/svc-knowledge/application/notes';
import type { AuditUseCases } from '@memorysmith/svc-audit/adapters/http';
import { GetNoteHistory, GetVaultActivity, ReadRevision } from '@memorysmith/svc-audit/application';
import type { DiscoveryUseCases } from '@memorysmith/svc-discovery/adapters/http';
import {
  Backlinks,
  GetFacetStats,
  RelatedNotes,
  SearchNotes,
  VaultGraphQuery,
  VaultHealth,
} from '@memorysmith/svc-discovery/application/queries';
import type { PortabilityUseCases } from '@memorysmith/svc-portability/adapters/http';
import { ExportVault } from '@memorysmith/svc-portability/application';
import { createZip } from '@memorysmith/svc-portability/adapters/zip';
import { S3ArchiveStore } from '@memorysmith/svc-portability/adapters/s3';
import { createApp } from './app.js';
import {
  authorshipFor,
  buildAccess,
  buildAudit,
  buildDiscovery,
  buildKnowledge,
  readStorageBudget,
  roleOf,
  type Infrastructure,
} from './composition-root.js';
import { KnowledgeNoteCatalog } from './note-catalog.js';
import { KnowledgeExportSource } from './export-source.js';

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

const infra: Infrastructure = {
  db: DynamoDBDocumentClient.from(new DynamoDBClient({}), {
    marshallOptions: { removeUndefinedValues: true },
  }),
  s3: new S3Client({}),
  knowledgeTable: required('KNOWLEDGE_TABLE'),
  accessTable: required('ACCESS_TABLE'),
  auditTable: required('AUDIT_TABLE'),
  discoveryTable: required('DISCOVERY_TABLE'),
  contentBucket: required('CONTENT_BUCKET'),
};

const verifier = new CognitoTokenVerifier(required('COGNITO_ISSUER'));

/** The Access use cases, each built from the subscription of this request. */
const accessUseCases: AccessUseCases = {
  requestSubscription: (request) => {
    const { onboarding, links } = buildAccess(infra, request.context);
    return new RequestSubscription(onboarding, links);
  },
  getSession: (request) => {
    const { links, platform, scoped } = buildAccess(infra, request.context);
    const context = request.context;
    return new GetSession(
      links,
      scoped?.subscriptions ?? null,
      async (id: SubscriptionId) => {
        const found = await platform.findById(id);
        return found
          ? { status: found.status.name, type: found.type.name, quota: found.quota.name }
          : null;
      },
      // The stored bytes live in the Knowledge table, which Access does not
      // read; the root is what joins them (composition-root.ts).
      async () => (context ? (await readStorageBudget(infra, context)).usedBytes : 0),
    );
  },
  switchSubscription: (request) =>
    new SwitchActiveSubscription(buildAccess(infra, request.context).links),
  listPlatformQueue: (request) =>
    new ListPlatformQueue(buildAccess(infra, request.context).platform),
  reviewSubscription: (request) =>
    new ReviewSubscription(buildAccess(infra, request.context).platform),
  listMembers: (request) => new ListMembers(scopedOrThrow(request).subscriptions),
  inviteMember: (request) => {
    const scoped = scopedOrThrow(request);
    return new InviteMember(scoped.subscriptions, scoped.invites);
  },
  acceptInvite: (request) => {
    const scoped = scopedOrThrow(request);
    return new AcceptInvite(
      scoped.invites,
      scoped.subscriptions,
      buildAccess(infra, request.context).links,
    );
  },
  changeMemberRole: (request) => new ChangeMemberRole(scopedOrThrow(request).subscriptions),
  removeMember: (request) => {
    const scoped = scopedOrThrow(request);
    return new RemoveMember(scoped.subscriptions, buildAccess(infra, request.context).links);
  },
  transferOwnership: (request) => {
    const scoped = scopedOrThrow(request);
    return new TransferOwnership(scoped.subscriptions, buildAccess(infra, request.context).links);
  },
};

function scopedOrThrow(request: AccessRequest) {
  const { scoped } = buildAccess(infra, request.context);
  if (!scoped) {
    // Unreachable through the routes, which check first; kept as an assertion
    // that a platform session cannot build a subscription-scoped repository.
    throw new Error('This session carries no subscription');
  }
  return scoped;
}

const knowledgeUseCases: KnowledgeUseCases = {
  createVault: (request) => new CreateVault(buildKnowledge(infra, request.subscription)),
  listVaults: (request) => new ListVaults(buildKnowledge(infra, request.subscription)),
  getVault: (request) => new GetVault(buildKnowledge(infra, request.subscription)),
  renameVault: (request) => new RenameVault(buildKnowledge(infra, request.subscription)),
  deleteVault: (request) => new DeleteVault(buildKnowledge(infra, request.subscription)),
  restoreVault: (request) => new RestoreVault(buildKnowledge(infra, request.subscription)),
  putGuidance: (request) => new PutGuidance(buildKnowledge(infra, request.subscription)),
  getVaultContext: (request) => new GetVaultContext(buildKnowledge(infra, request.subscription)),
  setVaultLimit: (request) => new SetVaultRoleLimit(buildKnowledge(infra, request.subscription)),
  clearVaultLimit: (request) =>
    new ClearVaultRoleLimit(buildKnowledge(infra, request.subscription)),
  createFolder: (request) => new CreateFolder(buildKnowledge(infra, request.subscription)),
  patchFolder: (request) => new PatchFolder(buildKnowledge(infra, request.subscription)),
  reorderFolder: (request) => new ReorderFolder(buildKnowledge(infra, request.subscription)),
  removeFolder: (request) => new RemoveFolder(buildKnowledge(infra, request.subscription)),
  putTemplate: (request) => new PutTemplate(buildKnowledge(infra, request.subscription)),
  getTemplate: (request) => new GetTemplate(buildKnowledge(infra, request.subscription)),
  listNotes: (request) => new ListNotes(buildKnowledge(infra, request.subscription)),
  readNote: (request) => new ReadNote(buildKnowledge(infra, request.subscription)),
  createNote: (request) => new CreateNote(buildKnowledge(infra, request.subscription)),
  updateNote: (request) => new UpdateNote(buildKnowledge(infra, request.subscription)),
  reorderNote: (request) => new ReorderNote(buildKnowledge(infra, request.subscription)),
  moveNote: (request) => new MoveNote(buildKnowledge(infra, request.subscription)),
  deleteNote: (request) => new DeleteNote(buildKnowledge(infra, request.subscription)),
  restoreNote: (request) => new RestoreNote(buildKnowledge(infra, request.subscription)),
};

const auditUseCases: AuditUseCases = {
  noteHistory: (request) => new GetNoteHistory(buildAudit(infra, request.subscription).trail),
  vaultActivity: (request) => new GetVaultActivity(buildAudit(infra, request.subscription).trail),
  readRevision: (request) => {
    const built = buildAudit(infra, request.subscription);
    return new ReadRevision(built.trail, built.revisions);
  },
};

const discoveryUseCases: DiscoveryUseCases = {
  related: (request) => new RelatedNotes(discoveryFor(request.subscription)),
  backlinks: (request) => new Backlinks(discoveryFor(request.subscription)),
  health: (request) => new VaultHealth(discoveryFor(request.subscription)),
  graph: (request) => new VaultGraphQuery(discoveryFor(request.subscription)),
  search: (request) => new SearchNotes(discoveryFor(request.subscription)),
  facets: (request) => new GetFacetStats(discoveryFor(request.subscription)),
};

/**
 * The export reads the vault through Knowledge and writes the archive into the
 * same content bucket, under the subscription prefix. Nothing new is stored:
 * an export is derived, and the bucket rule expires it by tag.
 */
const portabilityUseCases: PortabilityUseCases = {
  exportVault: (request) =>
    new ExportVault(
      new KnowledgeExportSource(buildKnowledge(infra, request.subscription)),
      new S3ArchiveStore(infra.s3, infra.contentBucket),
      createZip,
      request.subscription.subscriptionId.value,
    ),
};

function discoveryFor(context: SubscriptionContext) {
  const built = buildDiscovery(infra, context);
  return {
    graph: built.graph,
    facets: built.facets,
    content: built.index,
    catalog: new KnowledgeNoteCatalog(buildKnowledge(infra, context)),
  };
}

const app = createApp({
  verifier,
  accessUseCases,
  knowledgeUseCases,
  auditUseCases,
  discoveryUseCases,
  portabilityUseCases,
  resolveContext: async (request: AccessRequest) => {
    const context = request.context;
    if (!context) {
      return {
        ok: false as const,
        error: DomainError.forbidden('This session carries no active subscription'),
      };
    }
    const { scoped } = buildAccess(infra, context);
    if (!scoped) {
      return {
        ok: false as const,
        error: DomainError.forbidden('This session carries no active subscription'),
      };
    }
    const authorizer = new (
      await import('@memorysmith/svc-access/application/context')
    ).ResolveRequestContext(scoped.subscriptions);
    const resolved = await authorizer.execute(context);
    if (!resolved.ok) return { ok: false as const, error: resolved.error };

    const knowledgeRequest: KnowledgeRequest = {
      ctx: resolved.value,
      subscription: context,
      // The agent identity comes from the client_id of the token itself.
      authorship: authorshipFor(context.userId, request.profile.userId.value),
      subscriptionRole: roleOf(resolved.value),
    };
    return { ok: true as const, value: knowledgeRequest };
  },
  canReadVault: async (request, vaultId) => {
    const parsed = VaultId.create(vaultId);
    if (!parsed.ok) return false;
    const vault = await buildKnowledge(infra, request.subscription).vaults.findById(parsed.value);
    // A deleted vault is unreadable to every context, not only to Knowledge:
    // Discovery and Portability ask this question, and both must get a no.
    if (!vault || vault.isDeleted) return false;
    return request.ctx.isOwner || request.subscriptionRole.canRead();
  },
});

export const handler = handle(app);
