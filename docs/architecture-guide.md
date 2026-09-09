# Architecture Guide
## Remote MCP Server + AWS Serverless · Hexagonal DDD · Isolation by subscription

This document is the source of truth for **how the product is built**. It describes the stack, the structure of the monorepo, the tactical domain model, ports and adapters, key design, transactions, projections, infrastructure, tests, CI/CD and the build sequence.

For **what** the product does and under which business rule, see [`software-vision.md`](software-vision.md). This document does not repeat `RN-XXX` rules, it only references them. For general facts of the domain (Markdown, MCP, RAG, auditing, data protection law), see [`knowledge-base.md`](knowledge-base.md).

---

## Contents

1. [Overview](#1-overview)
2. [Engineering principles](#2-engineering-principles)
3. [Bounded contexts and deployment shape](#3-bounded-contexts-and-deployment-shape)
4. [Technology stack](#4-technology-stack)
5. [Repository structure and the dependency rule](#5-repository-structure-and-the-dependency-rule)
6. [Domain model (tactical DDD)](#6-domain-model-tactical-ddd)
7. [Ports and adapters](#7-ports-and-adapters)
8. [Isolation by subscription](#8-isolation-by-subscription)
9. [Persistence: DynamoDB + S3](#9-persistence-dynamodb--s3)
10. [Transactions, concurrency and the outbox](#10-transactions-concurrency-and-the-outbox)
11. [Discovery: graph, search and facets](#11-discovery-graph-search-and-facets)
12. [Provenance and history](#12-provenance-and-history)
13. [MCP server](#13-mcp-server)
14. [Internal API and authorisation](#14-internal-api-and-authorisation)
15. [Error taxonomy](#15-error-taxonomy)
16. [Export](#16-export)
17. [Infrastructure](#17-infrastructure)
18. [Non-functional requirements](#18-non-functional-requirements)
19. [Testing strategy](#19-testing-strategy)
20. [CI/CD](#20-cicd)
21. [Anti-patterns](#21-anti-patterns)
22. [Checklist for a new feature](#22-checklist-for-a-new-feature)
23. [Versioning strategy](#23-versioning-strategy)
24. [The line between microservices and a modular monolith](#24-the-line-between-microservices-and-a-modular-monolith)
25. [Recorded implementation decisions](#25-recorded-implementation-decisions)
26. [Where the build sequence and the technical risks live](#26-where-the-build-sequence-and-the-technical-risks-live)

---

## 1. Overview

### 1.1 Founding decisions

| # | Decision | Alternative discarded |
|---|---|---|
| **D1** | **Agent access through a remote MCP server** (OAuth 2.1, Streamable HTTP) | REST with a manual token |
| **D2** | **DynamoDB holds all the meaning; S3 holds Markdown blobs with no meaning** | S3 only; PostgreSQL; one git repository per vault |
| **D3** | **Isolation by subscription from the first line**, with the `SubscriptionId` in the leading key of every item, in every service | Introducing the boundary later, which amounts to rekeying everything |
| **D4** | **Subscription → Vault**, where the subscription is the boundary, the unit of collaboration **and** the business object | A technical tenant separate from the subscription; an intermediate workspace level (removed, `software-vision.md` §4.3) |
| **D5** | **Tactical DDD plus Hexagonal, one deployable per bounded context** as the target design | A modular monolith (see §24) |
| **D6** | **Discovery by link graph, by text and by facets, the three projections of events.** The search is literal and scans the vault under the declared ceiling; the vector one was withdrawn in 0.2.0 (§11.2) | Search by title only |
| **D7** | **Provenance and immutable history in the core** | An application log; versioning in S3 only |

### 1.2 Topology

```
                    ┌───────────────────────────────────────────┐
   Agent clients    │   svc-agent   (MCP · OAuth 2.1)           │
   (web, desktop,   │   Agent Access Context — BFF/ACL          │
   CLI) ─────────  ▶└───┬───────────────────────────┬───────────┘
                        │ internal HTTP (IAM)       │
   Web UI ─────┐        ▼                           ▼
               │  ┌──────────────────┐        ┌──────────────────────────┐
               ├─▶│  svc-knowledge   │══════▶ │  svc-discovery           │
               │  │  Knowledge Ctx   │ events │  link graph              │
               │  │  ★ CORE DOMAIN   │  ║  ║  │  curation facets         │
               │  └────────┬─────────┘  ║  ║  └──────────────────────────┘
               │           │ authz      ║  ╚═▶┌──────────────────────────┐
               │           ▼            ║     │  svc-portability         │
               │  ┌──────────────────┐  ║     └──────────────────────────┘
               ├─▶│  svc-access      │══╝     ┌──────────────────────────┐
               │  │  Access Context  │═══════▶│  svc-audit  (append-only)│
               └─▶└──────────────────┘        └──────────────────────────┘
                     every event ─────────────────────▲
```

---

## 2. Engineering principles

The technical counterpart of the product principles (`software-vision.md` §2). Each one has a mechanism that makes it verifiable, because a principle without a mechanism is an intention.

| # | Principle | The mechanism that guarantees it |
|---|---|---|
| **PE1** | **The domain does not know AWS** | `domain/` and `application/` with not a single SDK `import`, with the dependency rule checked in CI (§5.5) |
| **PE2** | **The subscription is a type, not a convention** | Key builders accept only the `SubscriptionId` value object, which can only be created from the JWT claim (§8) |
| **PE3** | **The S3 key is entirely opaque** | The key encodes only a `ContentId`; renaming, moving and reordering have nothing in it to touch (§9.2) |
| **PE4** | **The past is immutable** | An IAM `Deny` on `UpdateItem` and `DeleteItem` on the audit table; no `purge` on the content port (§12) |
| **PE5** | **Discovery is derived** | Projections rebuildable from the events and the `.md` files; none of them is read by the core (§11) |
| **PE6** | **No anonymous mutation** | `Authorship` is a required argument of every aggregate operation that changes state (§6.1) |
| **PE7** | **An AWS error never reaches the domain** | The adapter translates an infrastructure exception into a typed `DomainError` (§15) |
| **PE8** | **The hot path has no single point of contention** | A note transaction does not write to the `META` item of the vault (§10.2) |

---

## 3. Bounded contexts and deployment shape

Six contexts (the map of responsibilities is in `software-vision.md` §6), **each the exclusive owner of its data**: one DynamoDB table per service, and no service reads the table of another.

| Service | Context | Table | Type |
|---|---|---|---|
| `svc-access` | Access | `mv-access` | Supporting |
| `svc-knowledge` | Knowledge | `mv-knowledge` | **Core** |
| `svc-discovery` | Discovery | `mv-discovery` | Supporting |
| `svc-audit` | Audit | `mv-audit` | Supporting |
| `svc-agent` | Agent Access | — (does not persist) | Supporting (ACL) |
| `svc-portability` | Portability | — (uses S3) | Generic |

### 3.1 Context map

- `svc-knowledge` → `svc-access`: **Customer/Supplier**. Knowledge consumes authorisation decisions; Access does not know Knowledge.
- `svc-agent` → the rest: **Anticorruption Layer**. MCP vocabulary never leaks into the domain (RN-AGT-008).
- `svc-discovery`, `svc-audit`, `svc-portability` ← everyone: **Published Language** through EventBridge events. None of them is consulted by the core, they only feed on it.
- **Shared Kernel** (`memorysmith-backend/packages/kernel`): only primitives with no rules, such as `SubscriptionId`, `Ulid`, `Slug`, `Authorship`, `Result`, `DomainEvent` and the error taxonomy. Deliberately tiny, because a large shared kernel is coupling in disguise.

### 3.2 Deployment shape

The target design is six deployables (D5). **0.1.0 ships as a modular monolith with `svc-audit` separate**, a decision detailed in §24, with the reversal lever spelled out. Contexts, aggregates, ports and folder structure are identical in both shapes; what changes is `composition-root.ts`.

---

## 4. Technology stack

### 4.1 Backend

| Layer | Choice | Note |
|---|---|---|
| Runtime | Node.js 22 (LTS), TypeScript strict | ARM64 |
| Compute | AWS Lambda, **one per service** and not one per route | Fewer cold starts, one composition root per deployable |
| Internal routing | Hono | Inside the Lambda of the service |
| API | API Gateway HTTP API per service, behind a single CloudFront | Routing by path |
| Structural data | DynamoDB on-demand, PITR enabled | One table per service |
| Content | S3 with versioning | Flat opaque keys |
| Content index | A `TEXT#` item in `mv-discovery`, scanned in the function | Sustained by the ceiling of 2,000 notes (§11.2) |
| Events | EventBridge (the `mv-events` bus) and DynamoDB Streams for the outbox | |
| Identity | An Amazon Cognito user pool with a *pre-token-generation* trigger | MCP client registration through a CIMD proxy (§13.3) |
| Validation | Zod, at the edge and in the event contracts | Never inside the domain |
| Observability | AWS Lambda Powertools | `subscriptionId` on every log line |
| IaC | AWS CDK (TypeScript) | A project of its own, `memorysmith-infra` (§5.1, §5.4) |

### 4.2 Frontend

| Layer | Choice |
|---|---|
| Framework | React + Vite (SPA) |
| Hosting | S3 + CloudFront |
| Server state | TanStack Query |
| Client state | Zustand |
| i18n | `en_US` canonical, `pt_BR` required (`CLAUDE.md` § Language policy) |
| Editor | A Markdown editor with side-by-side preview |

### 4.3 Tooling

pnpm (workspaces) · Vitest · `dependency-cruiser` (§5.5) · ESLint + Prettier · DynamoDB Local and MinIO for adapter tests.

---
## 5. Repository structure and the dependency rule

### 5.1 Three top-level projects

The repository is a pnpm monorepo with **three first-level projects**, named after the project identifier (`CLAUDE.md` → Project identifier):

| Project | Holds | Does **not** hold |
|---|---|---|
| **`memorysmith-backend/`** | The six bounded contexts, the shared kernel and the event contracts. All the domain, application and adapter code | Not a line of CDK, no stack name, no reference to an account or a region |
| **`memorysmith-frontend/`** | The React SPA: screens, state, i18n, HTTP client | Business rules; no decision that belongs to the domain |
| **`memorysmith-infra/`** | All the CDK: stacks, constructs, IAM policies, pipeline | No business rule, no handler |

> **Why infrastructure is a project of its own, and not a folder inside the backend.** Three reasons, in the order they show up in practice:
>
> 1. **Infra describes the three projects**, not one. It creates the bucket that serves the frontend, the user pool that authenticates both, and the pipeline that deploys everything. Living inside the backend puts it in a place that owns only part of what it declares.
> 2. **Deploy permission is not code permission.** Whoever writes domain code does not need the credentials that create the account; whoever operates the account does not need to read business rules. Separate projects make that split trivial in CI, in repository access and in review.
> 3. **The life cycles diverge.** An aggregate refactor does not republish a stack; an IAM policy change does not recompile the domain. Mixing them makes each one trigger the build of the other.

**The dependency rule between projects, in one direction:**

```
memorysmith-infra      →  references backend and frontend artifacts (bundling, deploy)
memorysmith-backend    →  knows nothing about infra, knows nothing about frontend
memorysmith-frontend   →  consumes @memorysmith/contracts (its types, and the constants
                          derived from the pinned specification) and the API at runtime
```

An `import` of `memorysmith-infra` inside `memorysmith-backend` is an architecture error, not a matter of taste: it would mean the service code knows the AWS account, the same leak PE1 prevents one layer below.

### 5.2 `memorysmith-backend/`

```
memorysmith-backend/
├── packages/
│   ├── kernel/              # SubscriptionId, Ulid, Slug, Authorship, Result, DomainEvent, errors
│   └── contracts/           # Zod schemas of the events and the DTOs: the only package the frontend imports
├── services/
│   ├── access/
│   ├── knowledge/
│   ├── discovery/
│   ├── audit/
│   ├── agent/
│   └── portability/
│       └── src/
│           ├── domain/          # aggregates, VOs, events, domain services, PORTS
│           ├── application/     # use cases: they orchestrate the domain and the ports
│           ├── adapters/
│           │   ├── inbound/     # HTTP (Hono), MCP, event consumers
│           │   └── outbound/    # DynamoDB, S3, EventBridge
│           └── main/
│               └── handler.ts   # the entrypoint infra bundles
├── apps/
│   └── core-monolith/           # the composition root of the main deployable (§24)
│       └── src/
│           ├── composition-root.ts   # the only piece that changes between monolith and microservice
│           ├── app.ts                # mounts the contexts under one prefix each
│           ├── handler.ts            # the API entrypoint
│           └── relay.handler.ts      # the entrypoint of the outbox relay
├── package.json
└── tsconfig.json
```

`apps/core-monolith` is the **only place that knows two contexts at once**, and that is why it exists instead of one service importing another: the rule of §5.5 still holds between `services/*`, and composition stays outside it, where it belongs.

Every service has exactly the same internal four-layer structure. Uniformity here is not aesthetics: it is what lets the dependency rule of §5.5 be a single configuration, valid for all six.

### 5.3 `memorysmith-frontend/`

```
memorysmith-frontend/
├── public/
├── src/
│   ├── main.tsx                        # bootstrap: auth, i18n, query client
│   ├── app/
│   │   ├── router.tsx                  # lazy per feature
│   │   └── query-client.ts
│   ├── features/                       # one folder per UI area (software-vision.md §13.1)
│   │   ├── vaults/                     # the vault catalogue
│   │   ├── structure/                  # the tree: folders, order, drag-and-drop
│   │   ├── guidance/                   # the editor of the vault Guidance
│   │   ├── template/                   # the editor of the folder Template
│   │   ├── note/                       # reading, editing, backlinks, related notes
│   │   ├── history/                    # the timeline and the diff between revisions
│   │   ├── search/                     # lexical, over title and folder
│   │   ├── health/                     # broken links and orphans
│   │   ├── members/                    # invitations and roles
│   │   └── connect/                    # the MCP URL and the walkthrough per client
│   ├── i18n/
│   │   └── locales/{en_US.json, pt_BR.json}
│   └── shared/
│       ├── api/                        # HTTP client, interceptors, error mapping (§15)
│       ├── auth/                       # the only module that knows the identity SDK
│       ├── components/                 # AppShell, tree, Markdown editor, ui/
│       ├── hooks/
│       ├── store/                      # Zustand: active subscription, theme, locale
│       └── types/
├── index.html
├── vite.config.ts
└── .env.example
```

**A query is never refetched on its own, and a write invalidates what it wrote.** `staleTime: Infinity` is the policy and it is deliberate: nothing in a vault changes without somebody writing it, so time is the wrong trigger for a read. The trigger is the write, and `WritableContent` invalidates its own query on success and on conflict alike. Leaving that half out is what made the screen keep showing content the application itself had just overwritten — a reload fixed it, because a reload drops the cache with the page. `retry: false` belongs to the same decision: a failed read is information, and retrying it silently turns a message into a wait.

**Every reading surface resolves its wikilinks before rendering.** `NoteContent`, `WritableContent` and `Transclusion` all do, and the third one did not: a `[[link]]` inside transcluded content reached the page with its brackets. It matters most for the link the one-level rule creates itself, since an embed found inside embedded content is demoted to a wikilink and §13.2 says it is drawn as a link to its target.

**A response is typed by the DTO the API publishes, never by a shape retyped beside it.** `@memorysmith/contracts` is the only thing the frontend takes from the backend (§5.1), and it is taken for exactly this: a hand-written mirror of a contract is a claim the compiler cannot check. One such mirror declared a note's `revision` as a `string` where the contract says `ContentRef`, so the whole object was echoed back as `baseRevision`, every task-box write was refused at validation, and the screen reported a conflict. Where a route answers something the DTO does not describe — `{ content: null }` for a folder with no template — the union is written as a union, and not as a shape with every field made optional, which is how the first one drifted.

The mapping from error to message lives in `shared/api/error-mapper.ts` and covers the whole taxonomy of §15. In particular, `FORBIDDEN` arrives as a `404` (§14.2) and the UI shows "not found": the interface may not be more informative than the API, or the leak the `404` prevents comes back through the screen.

**The token lifecycle has exactly two rules, and both are enforced in one place each.** `shared/auth/oauth.ts` is the only module that speaks to the identity provider, and what it persists after a token exchange **keeps the refresh token when the answer carries none**: Cognito returns `refresh_token` on the authorization-code exchange and never on a refresh, so a missing field means the held credential is still valid and not that it was revoked. `shared/api/http.ts` is the only module that reacts to a session that cannot authenticate: a token that cannot be renewed and a `401` from the API are the same fact, and both call the `onUnauthenticated` handler the bootstrap wires to `app/session-expiry.ts`, which discards the credential, empties the session store and returns the browser to the sign-in screen with the reason (RN-SUB-022). **No screen carries any part of that**, and no screen may present a query that has failed as a query still loading: `shared/api/query-state.ts` separates the three states, because `isLoading || !data` collapses two of them whenever retries are off.

### 5.4 `memorysmith-infra/`

```
memorysmith-infra/
├── bin/app.ts
├── stacks/
│   ├── network.stack.ts             # Route 53 (hosted zone), CloudFront, ACM certificates (§17)
│   ├── identity.stack.ts            # Cognito user pool + pre-token-generation (§8.3)
│   ├── storage.stack.ts             # the content bucket (versioned)
│   ├── events.stack.ts              # the EventBridge bus mv-events
│   ├── access.stack.ts              # the mv-access table + Lambda + authorizer
│   ├── knowledge.stack.ts           # the mv-knowledge table + Lambda + outbox stream
│   ├── discovery.stack.ts           # the mv-discovery table + projector Lambda
│   ├── audit.stack.ts               # the mv-audit table + Lambda with an APPEND-ONLY role (§12.2)
│   ├── agent.stack.ts               # MCP server + OAuth resource server + CIMD proxy (§13.3)
│   ├── portability.stack.ts
│   ├── frontend-hosting.stack.ts    # S3 + CloudFront OAC for memorysmith-frontend
│   └── pipeline.stack.ts            # CI/CD (§20)
├── constructs/
│   ├── service-lambda.ts            # Lambda + Powertools + mandatory alarms (§17)
│   ├── subscription-table.ts        # a DynamoDB table with PITR and streams
│   └── append-only-table.ts         # a table + a role with an explicit Deny on Update/Delete
├── cdk.json
└── package.json
```

Two constructs carry an architectural guarantee, not a convenience:

- **`append-only-table`** is where PE4 stops being policy and becomes permission. The explicit `Deny` on `UpdateItem` and `DeleteItem` lives here, and this is where the immutability test of §19 points.
- **`service-lambda`** guarantees that no service goes to production without Powertools and without the alarms of §17. Forgetting observability stops being possible by omission.

**One stack per service, plus the shared stacks.** When 0.1.0 ships as a modular monolith (§24), the service stacks collapse into two, one for the main deployable and one for `svc-audit`, without `stacks/` changing shape: what changes is which ones are instantiated in `bin/app.ts`.

### 5.5 The dependency rule between layers (checked in CI)

Inside each service of `memorysmith-backend/services/*`:

```
domain/       →  imports only from itself and from packages/kernel
application/  →  imports only from domain/ and packages/kernel
adapters/     →  imports from application/, domain/, kernel and SDKs
main/         →  imports from everything (it is the only place that knows the world)
```

Configured in `dependency-cruiser` and run on every pull request. **The build breaks if `domain/` imports an AWS SDK.** Without that check, hexagonal becomes folder naming in three sprints (PE1).

The same configuration declares the rules between the projects of §5.1: `memorysmith-backend` and `memorysmith-frontend` may not import from `memorysmith-infra`, and no service may import from another. Communication between contexts is over HTTP with IAM or through an event (§3.1), never through an `import`.

---
## 6. Domain model (tactical DDD)

### 6.1 `Vault`, Aggregate Root of the Knowledge Context

Consistency boundary: the vault and **its whole folder tree**.

```typescript
// memorysmith-backend/services/knowledge/src/domain/vault/Vault.ts — zero AWS imports
export class Vault {
  private constructor(
    private readonly id: VaultId,
    private name: VaultName,
    private description: ShortText,
    private guidance: ContentRef | null,       // opaque pointer; the aggregate never sees the Markdown
    private readonly folders: FolderTree,
    private version: number,
  ) {}

  static create(...): Result<Vault, DomainError>

  addFolder(parentId: FolderId | null, name: FolderName, description: FolderDescription, by: Authorship): Result<Folder>
  renameFolder(id: FolderId, name: FolderName, by: Authorship): Result<void>
  describeFolder(id: FolderId, description: FolderDescription, by: Authorship): Result<void>
  moveFolder(id: FolderId, newParentId: FolderId | null, after: FolderId | null, by: Authorship): Result<void>
  reorderFolder(id: FolderId, after: FolderId | null, by: Authorship): Result<void>
  removeFolder(id: FolderId, policy: RemovalPolicy, by: Authorship): Result<void>
  attachTemplate(id: FolderId, ref: ContentRef, by: Authorship): Result<void>
  setGuidance(ref: ContentRef, by: Authorship): Result<void>

  pullEvents(): DomainEvent[]
}
```

`Authorship` is a required argument of every operation that changes state (PE6). There is no anonymous mutation in the domain, because the method signature makes it impossible, and that is what guarantees the emitted event always knows who caused it.

**Invariants only the aggregate can guarantee**, and which therefore define the boundary:

| # | Invariant | Business rule |
|---|---|---|
| I1 | `slug` unique among siblings | RN-KNW-002 |
| I2 | Maximum depth of 6 | RN-KNW-003 |
| I3 | Moving a folder never creates a cycle | RN-KNW-004 |
| I4 | Every folder has a `Position` | RN-KNW-005 |
| I5 | Removing a folder with children requires an explicit `RemovalPolicy` | RN-KNW-007 |
| I6 | `Guidance` and `Template` are `ContentRef`s; the aggregate never carries the Markdown | PP4 |

### 6.2 `Note`, a separate Aggregate Root

```typescript
export class Note {
  private constructor(
    private readonly id: NoteId,
    private vaultId: VaultId,
    private folderId: FolderId,
    private title: string | null,       // read from the body (RN-KNW-035)
    private position: Position,         // order within the folder (§6.4)
    private body: ContentRef,           // opaque pointer to a Content Slot (§9.2)
    private readonly createdBy: Authorship,
    private updatedBy: Authorship,
    private deletedAt: Instant | null,  // soft delete (§12.4)
    private version: number,
  ) {}

  static create(...): Result<Note, DomainError>

  replaceBody(ref: ContentRef, body: string, by: Authorship): Result<boolean>
  reorder(after: NoteId | null, by: Authorship): Result<void>
  moveTo(vault: VaultId, folder: FolderId, by: Authorship): Result<void>
  delete(by: Authorship): Result<void>          // marks; does not destroy content
  pullEvents(): DomainEvent[]
}
```

> **Why did `Note` stay outside the `Vault` aggregate?** If it were inside, creating a note would require loading and locking the whole tree, and the structural invariants do not depend on the content of the notes. The rule "a folder with notes may not be removed without a policy" is **eventual consistency** (through an event), not a transactional invariant. It is the most important modelling decision of the system, because it is what keeps writing a note cheap and concurrent, and writing a note is the hot path through which the agent feeds the vault.

Details that follow from it:

- `vaultId` is **not `readonly`**: moving between vaults is a first-class operation and the `NoteId` is preserved (RN-KNW-023). That is what keeps the timeline intact in `svc-audit`, whose key is by subject and not by vault (§12.2). "Moving" implemented as delete plus create would lose the history exactly where it matters.
- **There is no `retitle`, and no `NoteTitle` to pass to one.** A note is named by what it says, and `replaceBody` is where the title is read (RN-KNW-035, RN-KNW-038). It takes the body **and** the reference to it, because a use case that passed a title in could pass one the content does not state: the derivation belongs inside the aggregate, where it cannot be skipped.
- **`moveTo` carries no conflict policy.** A title collides with nothing, in one vault or in two (RN-KNW-037), so a destination has nothing to refuse and `SlugConflictPolicy` is gone with the rule that motivated it (RN-KNW-022, removed).
- `replaceBody` takes a `ContentRef` that is already written: whoever talks to S3 is the use case, never the aggregate (§10.3).
- `delete` marks, it does not destroy: the `bodyRef` remains and the timeline stays readable by `NoteId`.

> **The separation of the aggregates only holds if persistence respects it.** Having `Note` outside `Vault` in the domain is worth nothing if every note write still writes to the item representing the vault. The rule that closes the argument is in §10.2: **a note transaction never touches the `META` item**. Without it, the decision of this section is a statement of intent.

### 6.3 The other aggregates

| Aggregate | Context | Invariants |
|---|---|---|
| `Subscription` | Access | Exactly one `owner` (RN-ACC-001), guaranteed by being a field and not a collection; status transitions valid only per the machine of `software-vision.md` §4.4; a mandatory reason on rejection; the `SubscriptionId` is `readonly` and no method touches it (§8.1) |
| `Subscription` | Access | Exactly one `OWNER`, always present; a unique e-mail among members; a pending invitation is not a member; a member role is `EDITOR` or `VIEWER`, since `OWNER` is not a membership (§9.4) |
| `NoteGraph` · `VaultIndex` | Discovery | Projections, rebuildable at any moment (PE5) |
| `AuditTrail` | Audit | Append-only: the only operation is `append` |

### 6.4 Value Objects

`SubscriptionId` `VaultId` `FolderId` `NoteId` `ContentId` (ULID) · `Slug` (of a vault and of a folder only) · `Position` · `FolderDescription` (1 to 500 characters, required) · `ContentRef` · `Revision` · `RemovalPolicy` · `ErasureReason` · `SubscriptionStatus` · `Role` · `VaultRoleLimit` · `Authorship` · `AgentIdentity` · `LinkTarget`.

`Role` is an **ordered** enumeration (`NONE < VIEWER < EDITOR < OWNER`) and exposes `Role.min(a, b)`. It is that ordering that lets the vault ceiling be written as a minimum (§14.2) instead of a chain of conditionals, and it is what makes it impossible, by type, for a ceiling to promote anyone.

All of them immutable, self-validating in the constructor, compared by value. **No raw `string` crosses the boundary of the domain.**

> `ContentRef` carries a `ContentId`, not a path. An S3 `key` is a concept shaped like S3, and having one inside a domain VO would scratch PE1 without the CI dependency rule complaining, because a `string` imports nothing. Assembling `s/{subscriptionId}/c/{contentId}.md` is the exclusive responsibility of the adapter.

#### `Position`, ordering by fractional index

Order is a product requirement (PP9) and it holds for folders among folders and for notes within a folder. The naive form, a dense integer `order` field, forces rewriting every sibling on each drag: in DynamoDB, N writes in a transaction with a ceiling of 100 items.

We use a **lexicographic fractional index**: each item keeps a string key, and inserting between `"a0"` and `"a1"` produces `"a0V"`. **Reordering is a single write on the moved item**, regardless of the number of siblings.

```typescript
Position.between(prev: Position | null, next: Position | null): Position
```

Ties, possible under concurrency, are broken by the ULID of the item, so the ordering is never undefined. When a key passes 12 characters, a rebalancing command redistributes the siblings; it is rare maintenance, not a hot path.

### 6.5 Domain events

```
Access:     SubscriptionRequested · SubscriptionApproved · SubscriptionRejected
            SubscriptionSuspended · SubscriptionReactivated · SubscriptionCanceled
            OwnershipTransferred · MemberInvited · MemberJoined
            MemberRoleChanged · MemberRemoved · VaultRoleLimitSet · VaultRoleLimitCleared
Knowledge:  VaultCreated · VaultRenamed · GuidanceUpdated · FolderAdded · FolderRenamed
            FolderDescribed · FolderMoved · FolderReordered · FolderRemoved · TemplateUpdated
            NoteCreated · NoteUpdated · NoteReordered · NoteMoved · NoteDeleted · NoteRestored
Discovery:  NoteLinksResolved · NoteIndexed · LinkBroken
```

Every event carries the `subscriptionId` and the `Authorship`. **Content events carry the complete `ContentRef`**, with `contentId`, `versionId`, `sha256` and `bytes`, and not only the `versionId`: that is what makes the audit trail a recovery index sufficient to rebuild the mapping between DynamoDB and S3 from zero (§9.2, §12.3). `NoteMoved` carries source and destination (`vaultId`, `folderId`), because whoever consumes it needs both sides.

Published through a **transactional outbox** (§10.4). Adding a consumer does not touch the core.

### 6.6 Domain services

- **`FolderTreePlacement`** resolves "place after X inside Y" into `(parentId, Position)`, validating I2 and I3.
- **`LinkExtractor`** extracts `[[wikilinks]]` and relative Markdown links from the **body** of the note. Universal syntax only: no field name, no vault convention (PP4). The resolution rule is in §11.1.
- **`VaultContextComposer`** assembles the Vault Context out of the aggregate and the `ContentStore`. **It lives in the domain because the format of that document is the product** (`software-vision.md` §9.2), not a presentation detail.
- **`AuthorizationPolicy`** decides `(role in the subscription, vault ceiling, action)`. It is a domain service, not an infrastructure port (§14.2).

---

## 7. Ports and adapters

### 7.1 Knowledge ports

```typescript
// domain/ports/VaultRepository.ts
export interface VaultRepository {
  findById(id: VaultId): Promise<Vault | null>;   // no subscriptionId in the argument — see §8
  save(vault: Vault): Promise<Result<void, ConcurrencyError>>;
}

// domain/ports/NoteRepository.ts
export interface NoteRepository {
  findById(vault: VaultId, id: NoteId): Promise<Note | null>;   // and by nothing else
  save(note: Note): Promise<Result<void, ConcurrencyError>>;
}

// domain/ports/ContentStore.ts
export interface ContentStore {
  create(markdown: string): Promise<ContentRef>;                       // a new slot, first revision
  overwrite(slot: ContentId, markdown: string): Promise<ContentRef>;   // a new revision of the same slot
  read(ref: ContentRef): Promise<string>;                              // the exact revision of the ref
}

// domain/ports/EventPublisher.ts
export interface EventPublisher { publish(events: DomainEvent[]): Promise<void>; }
```

**There is no `purge` on the `ContentStore` port, and the absence is deliberate.** No domain use case may destroy a revision: if one could, deleting a note would silently break the historical reconstruction §12.3 promises. Nothing else destroys one either: there is no administrative path to it anywhere in the product (§12.4, RN-AUD-006).

### 7.2 Adapters

| Port | Production adapter | Test adapter |
|---|---|---|
| `VaultRepository` · `NoteRepository` | `DynamoVaultRepository` · `DynamoNoteRepository` | `InMemory*` |
| `ContentStore` | `S3ContentStore` | `InMemoryContentStore` |
| `EventPublisher` | `OutboxEventPublisher` (writes in the same transaction) | `RecordingEventPublisher` |
| `LinkGraph` | `DynamoLinkGraph` | `InMemoryLinkGraph` |
| `ContentIndex` | `DynamoContentIndex` | `InMemoryContentIndex` |
| `AccessPolicy` | `HttpAccessPolicy` \| `LocalAccessPolicy` (§24) | `StubAccessPolicy` |

The Discovery domain knows `Edge`, `Depth`, `Facet` and `QueryNode`, and never knows AWS. The entire query language lives in `SearchQuery.ts`, with no I/O.

---
## 8. Isolation by subscription

Introducing the boundary later means rewriting every key, every index, every query and every S3 object, and that is why it comes before anything else (D3). The corresponding business rules: `software-vision.md` §4.8.

### 8.1 The identifier is perpetual

The subscription carries two roles: a business object with state and the isolation boundary (`software-vision.md` §4.2). The technical rule that makes that safe:

> **The `SubscriptionId` is issued once and never changes** (RN-SUB-005). No status transition, whether approving, suspending, cancelling or reactivating, writes into a key. `canceled` is a field of the `META` item, and the data stays exactly where it was, reachable the instant the subscription goes back to `active`.

A design consequence, and not an implementation detail: **no persistence code may consult the status to assemble a key.** Status is an authorisation decision (§14.2), and it lives at the edge. If one day a repository needs to know the status, the boundary has leaked into the wrong layer.

### 8.2 Three layers of isolation

**1. The leading key.** Every item of every service starts with `S#{subscriptionId}`. Every S3 key starts with `s/{subscriptionId}/`. No query exists without the prefix, so there is no query that could, even by mistake, cross subscriptions.

**2. A type, not discipline (PE2).** The repository ports take a `SubscriptionContext` in the constructor, and the key builders accept only a `SubscriptionId`, a value object creatable only from the JWT claim.

```typescript
// adapters/outbound/dynamodb/DynamoVaultRepository.ts
export class DynamoVaultRepository implements VaultRepository {
  constructor(private readonly sub: SubscriptionContext, private readonly db: DynamoDBDocumentClient) {}
  // the subscription belongs to the repository, resolved per request — never a method argument
}
```

The composition root instantiates the repositories **per request**, with the subscription coming from the token. There is no code path that builds a repository without a subscription: the compiler rejects it. That trades a rule depending on code review for one depending on `tsc`.

**3. The origin of the `SubscriptionId`: always the claim, never the request.** The `subscriptionId` comes out of the JWT (a custom claim, injected by the Cognito *pre-token-generation* trigger) and **never** out of the path, the query or the body (RN-SUB-002). That is what closes the IDOR door: asking for `/vaults/{id}` of another subscription answers `404`, because the assembled key does not even get there.

> **An extension point.** For customers requiring strong cryptographic isolation, the next step is an STS credential per request with `dynamodb:LeadingKeys` and an S3 prefix in the *session policy*, that is isolation in IAM and not in the application. The `SubscriptionContext` is already where the credential would be resolved; wiring it is configuration, not a redesign.

### 8.3 The two named exceptions

Two product questions have to cross the boundary. Neither reveals content, and both are declared here, because leaving them implicit would be worse than naming them.

**Exception 1: the links of the user.** Identity is global; a subscription is a link (RN-SUB-011). The `UserId` is the Cognito `sub` and belongs to no subscription:

```
Link      PK: USER#{userId}   SK: SUB#{subscriptionId}   { isOwner, joinedAt, isDefault }
```

It answers *"which subscriptions do I take part in?"* and nothing else (RN-SUB-003).

**Exception 2: the platform queue.** The `PLATFORM_ADMIN` has to list subscriptions by status to approve them. A GSI in `mv-access` solves it, projecting **metadata only**:

```
GSI2:  PK: PLATFORM#{status}   SK: REQUESTED#{timestamp}#{subscriptionId}
       projection: name, ownerEmail, status, requestedAt, memberCount
```

The projection is `INCLUDE`, not `ALL`, and the attribute list is the guarantee: **the index carries nothing beyond what the platform screen shows**. Widening it is a privacy decision, not an optimisation, and that is why the list is written here.

### 8.4 The platform session carries no subscription

The `PLATFORM_ADMIN` operates outside any subscription (`software-vision.md` §4.6), and the guarantee is structural:

> **A platform token has no `subscription_id` claim.** Since the `SubscriptionContext` can only be built from that claim, and every repository requires one in its constructor, **no Knowledge use case is even instantiable** under that session. The attempt fails at composition, before any role check.

It is the same mechanism of PE2 working in the opposite direction: the type that keeps a user from reaching the wrong subscription keeps the admin from reaching any. The corresponding test is in §19, and it verifies **why** it failed, because a test that passed because somebody wrote an `if` would not prove the property.

`svc-access` is the only service with routes accepting a platform session, and they read exclusively through the `GSI2` of §8.3.

### 8.5 The active subscription in the token

The *pre-token-generation* trigger reads the `active_subscription` attribute of the user, confirms a matching link exists and injects the `subscription_id` claim. Without a valid link, it falls back to the link marked `isDefault` (RN-SUB-012). Switching subscription is updating the attribute and refreshing the token (`POST /session/subscription`, §14.1). **No business request ever receives a `subscriptionId`**.

The trigger also injects the `subscription_status` claim, read from the `META` item. It exists so the authorizer can refuse access to a subscription outside `trial` or `active` (RN-SUB-007) without an extra read per request. Since it ages along with the token, a suspension takes the lifetime of the token to take effect, of the same nature as the 5-minute delay of §14.2 and declared for the same reason.

For the MCP connector, the `subscription_id` enters the access token at the moment of consent and does not change for the life of that token (RN-SUB-014). One connector, one subscription.

**The two lifetimes, and what ends a session.** The access token lives one hour and the refresh token thirty days, so a browser left open renews silently many times over the life of one sign-in. What the SPA does with those exchanges is in §5.3, and the rule that governs it is RN-SUB-022: the session ends when the credential can no longer be renewed, and it ends **once**, in one place, rather than being noticed by whichever screen happens to ask first. The connector does not share that path — the CIMD proxy passes the refresh through with rotation (§13.3), and its session is the token, not a browser.

---

## 9. Persistence: DynamoDB + S3

### 9.1 The split

| Where | What | Why |
|---|---|---|
| **DynamoDB** | **All the meaning**: structure, order, descriptions, the identity of the note (title, slug, folder, authorship), which blob is a guidance and which is a template, members, graph edges, the audit trail | Queryable, transactional, conditional |
| **S3** | **Markdown blobs with no meaning**, addressed by an opaque ID, in every revision | No 400 KB ceiling, native versioning, lower cost per GB |

The split is not "metadata here, content there". It is stronger: **S3 does not know what it holds.** A vault, a folder and a note are logical concepts existing entirely in DynamoDB; in S3 there is a flat pile of blobs, all alike.

### 9.2 Content Slots, the link between DynamoDB and S3

**The key.** One single shape, for every blob of the system:

```
s/{subscriptionId}/c/{contentId}.md
```

`contentId` is a ULID generated when the slot is created. `subscriptionId` is there because it is the isolation boundary in IAM (§8.1), not because it means anything about the content. The `.md` suffix is a courtesy to humans and to `Content-Type`; nothing reads it.

The key **does not encode the vault, the folder, the name or the role**. That is the difference between "opaque" as an intention and "opaque" as a structural property: renaming, moving or reordering cannot touch S3, because there is no field in the key those operations would change. It is not a rule to defend in every new operation, it is an impossibility (PE3).

**The link.** DynamoDB never stores Markdown; it stores a pointer to a **specific revision** of a slot:

```typescript
export class ContentRef {                      // immutable VO
  constructor(
    readonly contentId: ContentId,             // which slot
    readonly versionId: S3VersionId,           // which revision of it
    readonly sha256: Sha256,                   // integrity and "did it change or not" detection
    readonly bytes: number,                    // size, with no HEAD needed
  ) {}
}
```

| Field | The work it does |
|---|---|
| `contentId` | Addresses the slot. Stored explicitly, never derived from the `NoteId`: one day the same slot may be pointed at by another role |
| `versionId` | Turns "points at the content" into "points at the content **of that instant**". It is the basis of `read_note(asOf)` and of §12.3 |
| `sha256` | If the hash of the new content equals the current one, there is no write, no event and no reprojection (RN-KNW-028) |
| `bytes` | Size for the UI and for the limits, for free |

The `S3ContentStore` is the one that knows a `contentId` becomes `s/{subscriptionId}/c/{contentId}.md`, and it gets the `subscriptionId` from the `SubscriptionContext` of its constructor, never from an argument.

**A slot is never shared.** An opaque key pulls towards content addressing (`c/{sha256}.md`), with deduplication for free. We do not do it, for two reasons: dedup across subscriptions would share an object crossing the boundary of §8.1 and would give an existence oracle; dedup within a subscription would require reference counting and would turn "deleting a note" into an operation that may delete nothing. The `sha256` stays where it is, as an integrity field and not as an address.

**The cost of moving.** It is the property the design buys:

| Operation | S3 | DynamoDB | Projections |
|---|---|---|---|
| Rename / reorder a folder | 0 bytes | 1 transaction (2 writes): the `FOLDER` item + the optimistic lock of `META` | — |
| Reorder a note | **0 bytes** | 1 transaction (2 writes): `position` on the `NOTE` item, the event | — |
| Move a note between folders | **0 bytes** | 1 transaction (2 writes + 1 check): `folderId`/`position` on the `NOTE` item, a `ConditionCheck` on the destination folder, the event | Reprojection of the note (§11.2) |
| Move a note between vaults | **0 bytes** | 1 transaction (6 writes + 2 checks): `Delete`+`Put` of the `NOTE` item (the PK changes), `Delete`+`Put` of the slug guard, `ConditionCheck` on the destination vault and folder, the event | Reprojection + pruning of the edges at the source |
| Replace the body of a note | 1 `PutObject` | 1 transaction (2 writes): the `NOTE` item, the event | Reprojection of links and facets |

Moving between vaults is the **only operation in the system that writes to two vault partitions in the same transaction**. It locks neither of them: the tree does not change, so existence `ConditionCheck`s are enough. The slug guard of the source is deleted along with the item, and forgetting it would trap that slug in the source vault forever.

**The trade-off: the bucket becomes unreadable to humans.** Two answers, both cheap:

1. **Immutable metadata on `PutObject`**, with `subscription-id`, `content-id` and `created-at`. Only what never changes. We deliberately do **not** write `vaultId`, `folderId` or the title: they become lies on the first move, and keeping them up to date would give S3 back exactly the write we are eliminating.
2. **The audit trail is the recovery index.** Since every content event carries the complete `ContentRef` (§6.5), `svc-audit` holds every `(noteId, contentId, versionId)` tuple that has ever existed. With the Knowledge table lost beyond the PITR window, the mapping is rebuildable from it.

### 9.3 Single-table design: `mv-knowledge`

| Item | PK | SK | Attributes |
|---|---|---|---|
| Vault | `S#{s}#VAULT#{v}` | `META` | name, slug, description, **guidanceRef**, version |
| Folder | `S#{s}#VAULT#{v}` | `FOLDER#{folderId}` | parentFolderId, name, slug, description, position, **templateRef** |
| Folder counter | `S#{s}#VAULT#{v}` | `FSTAT#{folderId}` | noteCount, updatedAt (asynchronous projection, §10.3) |
| Subscription usage | `S#{s}#VAULTS` | `USAGE` | storedBytes, updatedAt (asynchronous projection, §10.3, RN-SUB-021) |
| Vault counter | `S#{s}#VAULT#{v}` | `FSTAT` | noteCount, updatedAt; indexed in `GSI1` as `VSTAT#{v}` |
| Role ceiling in the vault | `S#{s}#VAULT#{v}` | `LIMIT#{userId}` | limit (`VIEWER`), setBy, setAt: the demotion of §5.3 of the product |
| Note | `S#{s}#VAULT#{v}` | `NOTE#{noteId}` | folderId, title, slug, position, **bodyRef**, createdBy, updatedBy, version, `deletedAt?`, `deletedBy?` |
| Folder slug guard | `S#{s}#VAULT#{v}` | `SLUG#{parentId}#{slug}` | enforces I1 through `attribute_not_exists` |
| Projection dedup | `S#{s}#VAULT#{v}` | `SEEN#{eventUlid}` | ttl; makes the counter exactly-once |
| Outbox | `S#{s}#VAULT#{v}` | `EVENT#{ulid}` | payload, ttl |

The three `…Ref`s are a serialised `ContentRef`, **the only link to S3 in the whole system**.

**The lexicographic order of the sort keys is chosen, not accidental.** `FSTAT#` and `LIMIT#` fall between `FOLDER#` and `META`, so the whole aggregate, the counters **and** the role ceilings come in a single `Query`, in a single partition:

```
Query  PK = S#{s}#VAULT#{v}   AND   SK BETWEEN 'FOLDER#' AND 'META'
→ every folder + every counter + every ceiling + the META item
       FOLDER#…    FSTAT / FSTAT#…       LIMIT#…          META
```

`EVENT#` falls before the range; `NOTE#`, `SEEN#` and `SLUG#` fall after it. It is that property that makes `get_vault_context` return the annotated tree with the note count of each folder **without one query per folder**.

> **`LIMIT#` was named to fall in that range, and the name also describes what it is**, a ceiling and not a grant (the ceiling only lowers, RN-ACC-011). The alternative would be a second query per request, on the hottest path of the system, to answer an authorisation question that has to be answered **before** everything else (§14.2). The cost is loading the ceilings of every member along with the vault; since members number in the dozens and the partition is the same, it is free in latency.

| Index | PK | SK | Serves |
|---|---|---|---|
| `GSI1` | `S#{s}#VAULTS` | `VAULT#{v}` · `VSTAT#{v}` | listing the vaults of the subscription, with the count already |
| `GSI2` | `S#{s}#FOLDER#{f}` | `NOTE#{position}#{noteId}` | listing the notes of a folder, **in the defined order** |

`GSI2` is **sparse**: the attributes forming its key only exist while `deletedAt` does not. A deleted note disappears from the listings without a line of filtering anywhere (§12.4). Alphabetical ordering stays available as a display ordering, done in the client over the result.

### 9.4 `mv-access`

```
S#{s}              / META                  → subscription: ownerId, status, type, quota,
                                             requestedAt, reviewedBy, rejectionReason
S#{s}              / USER#{userId}          → a user known to the subscription
S#{s}              / INVITE#{token}         → a pending invitation (ttl = expiresAt)
S#{s}              / MEMBER#{userId}        → membership: role (EDITOR | VIEWER)
USER#{userId}      / SUB#{subscriptionId}   → the link (§8.3, exception 1)

GSI2:  PLATFORM#{status}     → REQUESTED#{timestamp}#{subscriptionId}  → the platform queue (§8.3, exception 2)
                               INCLUDE projection: ownerEmail, status, type, quota,
                               requestedAt, memberCount
```

**The `OWNER` is not a `MEMBER` item.** Ownership lives in `ownerId`, on the `META` item of the subscription: a single field, which is how RN-ACC-001 ("exactly one `OWNER`") stops being a rule to check and becomes the shape of the data. The transfer of ownership is a conditional `Update` on that field plus the `Put` of the `EDITOR` membership of the previous holder, in one transaction (RN-ACC-002).

The invitation has a TTL equal to its expiry: an expired invitation disappears on its own, with no cleanup job and no date check spread across every read.

---
## 10. Transactions, concurrency and the outbox

Every mutation is **one** `TransactWriteItems`, but there are **two shapes** of transaction, and the difference between them is what keeps writing a note cheap (§6.2).

### 10.1 Shape A: a tree mutation (the `Vault` aggregate)

Creating, renaming, describing, moving, reordering or removing a folder; replacing a guidance or a template.

1. An `Update` on the `META` item with `ConditionExpression: version = :expected`, which is the optimistic lock of the aggregate
2. A `Put`/`Update`/`Delete` on the affected folder items
3. A `Put` of the slug guard with `attribute_not_exists(PK)`, which puts I1 in the database and not only in memory
4. A `Put` of the domain events into the **outbox**, in the same transaction

### 10.2 Shape B: a note mutation (the `Note` aggregate)

Creating, editing, retitling, reordering, moving, deleting.

1. A `Put`/`Update`/`Delete` of the `NOTE` item with `ConditionExpression: version = :expected`, where the lock belongs to the item itself
2. A `ConditionCheck` with `attribute_exists` on the destination `FOLDER#{f}` item and, on a move between vaults, also on the `META` of the destination vault
3. A `Put` of the event into the outbox

There is no fourth write. The `NSLUG` guard held one name per vault, and a vault has no name to hold: nothing is reserved on a write and nothing is released on a delete (RN-KNW-037).

> **No note transaction writes to the `META` item** (PE8). It is this rule, and not the separation of the aggregates on its own, that keeps the hot path free of contention. `META` is a single item: an agent writing fifty notes in a row would turn it into the bottleneck of the whole vault, and the retry would only turn the contention into latency. The `ConditionCheck` gives the same guarantee that matters, *"the folder existed at the instant of the write"*, without writing to it, and the `FOLDER` item is only written when the folder is renamed or moved, which is a rare event.

A conflict produces a `TransactionCanceledException`, the repository translates it into a `ConcurrencyError` and the use case retries, up to 3 times. **The domain never sees an AWS exception** (PE7).

### 10.3 Counters

`FSTAT` and `FSTAT#{folderId}` are kept by the outbox relay, **outside** the user transaction. So as not to count twice when the stream reprocesses, the increment goes in a transaction with a dedup item:

```
TransactWriteItems
  Put     SK = SEEN#{eventUlid}    ConditionExpression: attribute_not_exists(SK)   (TTL 7d)
  Update  SK = FSTAT#{folderId}    ADD noteCount :delta
```

An eventually consistent count is acceptable on purpose: the number guides the agent and the UI, and takes part in no invariant.

**The storage usage of the subscription is kept by the same relay, in the same transaction** (RN-SUB-021). Every event declares how much current content it added or freed, in a `storageDelta` field of the envelope, and the relay adds that value into a single item per subscription:

```
TransactWriteItems
  Put     PK = S#{s}#VAULT#{v}   SK = SEEN#{eventUlid}   attribute_not_exists(SK)   (TTL 7d)
  Update  PK = S#{s}#VAULT#{v}   SK = FSTAT#{folderId}   ADD noteCount   :delta
  Update  PK = S#{s}#VAULTS      SK = USAGE              ADD storedBytes :bytes
```

The two counters travel in the **same** transaction because they share the dedup item: in two transactions, the second would be refused by the `SEEN` the first one wrote.

**The delta is declared by the aggregate, not derived from the event type.** `NoteUpdated` is emitted both by a rename, which moves no byte, and by a new body, which moves the difference between two revisions; only the aggregate knows which of the two happened. Deriving it from the type would make the counter grow on every rename, and the error would be silent: nothing would break, the number would merely stop being true.

**Why the counter does not live in the user transaction.** A single item per subscription touched by every note write is exactly the contention PE8 forbids for the `META` of the vault, and worse, because it is one item for the whole account. That is why it sits in the relay, and that is why quota enforcement is slightly delayed: a burst of writes may cross the line before the counter catches up. The trade-off is deliberate and the drift is bounded by what is in flight, since the check runs on every write.

**The counter is derived, and it is rebuildable.** Every projection of this system owes an answer to the same question, which is how it remakes itself when it is wrong (PE5), and the counter's answer is `deploy-aws/recount-storage.ps1`: it scans `mv-knowledge`, adds up the current content of each subscription and writes the `USAGE` item. It reports first and only writes with `-Apply`. It had to exist at least once for real, because the counter came into existence after the vaults, and every subscription older than it started at zero while holding a vault full of notes. A write happening during the scan may be counted by it **and** applied by the relay, and the write then discards the relay delta; the error is bounded by what was written while the job ran and disappears in the next recount, so it runs with the accounts idle.

**Whoever reads the counter does not know the limit.** The stored bytes are a fact of Knowledge and the ceiling is a fact of Access, and no context reads the table of the other: the one that joins the two halves at the `StorageBudget` port is the composition root (§24).

### 10.4 The outbox

DynamoDB Streams → a relay Lambda → EventBridge. It guarantees that the state change and the publication are atomic, because without it "I wrote but did not publish" happens and is silent. In a system whose audit trail lives on events, that silence would be a hole in the record.

### 10.5 Write order with S3

Content first, pointer afterwards:

```
1. PutObject on s/{subscriptionId}/c/{contentId}.md     → returns a versionId
2. assemble the ContentRef                        → { contentId, versionId, sha256, bytes }
3. TransactWriteItems                             → Update the item with the new …Ref
                                                  + Put the event into the outbox, with the ContentRef inside
```

**The order decides which failure is accepted.** If step 3 fails, what is left in S3 is a blob nobody references: invisible, harmless, collected by the weekly orphan job. The reverse order would produce a pointer to content that does not exist, an error the user sees, in the middle of the hot path.

The `ContentRef` travels **inside the event, in the same transaction**. Without that, `svc-audit` would record "the note changed" without being able to show into what, and `svc-discovery` would reindex "the current version" instead of the version that triggered the event, which under concurrency is not the same thing.

None of that happens in the aggregate: whoever talks to the `ContentStore` is the use case, which receives the finished `ContentRef` and hands it to the domain. The aggregate never knew S3 exists.

---

## 11. Discovery: graph, search and facets

Three projections over the same events. All of them **derived** (PE5): deleting and rebuilding from zero is a supported operation, and it is the recovery plan for all three. The business rules are in `software-vision.md` §10.

**There are three sanctioned readers of content, and the third one is not here.** `noteTitle`, in `packages/kernel`, reads the title of a note in the chain of the specification: `title:` of the frontmatter, then the first level-1 heading (RN-KNW-035). It lives in the kernel because **Knowledge needs it synchronously, on the write** — a listing cannot wait for a projection to know what a note is called — and Discovery needs the same answer when it resolves a link. One function, two contexts, and no way for them to disagree.

That amends the rule "only the two extractors read content", deliberately and in the open, and it is a smaller amendment than it looks: what the third reader reads is **the same frontmatter block §11.3 already reads**, plus a heading. The reason of the rule is untouched — what is read is the notation the specification declares and nothing else, never a vault convention and never a vocabulary this backend holds a list of (PP4).

The frontmatter block and the YAML subset of §6.2 live in the kernel with it, and `FacetExtractor` reads them from there. **There is exactly one function in this repository that finds the frontmatter of a body**, which is the property `slugify` lost by being written twice.

### 11.0 The notation, imported rather than declared

**The list of what the product reads is not written in this repository.** It is the [MemorySmith Markdown Profile](https://github.com/memorysmithapp/markdown-profile), a specification with a version of its own, carrying the same notation as prose (`SPEC.md`), as data (`profile.json`) and as an executable suite (`tests/conformance.json`). This build implements a version of it and says which (RN-AGT-022).

**How it enters the build.** It is an ordinary dependency, pinned to a git tag, and the version is declared **once**, in the `catalog:` of `pnpm-workspace.yaml`. Two packages consume it from there — `packages/contracts`, which re-exports it, and `memorysmith-frontend`, whose reading surface is proved against the same cases — and a catalog is what keeps them from pinning two versions of one specification. A bump is a deliberate commit whose proof is the suite going green.

`RECOGNISED_NOTATION` in `packages/contracts` is now a **projection of `profile.json`**, not a list beside it, and it lives there for the reason it always did: two contexts need it and may never import each other. Discovery reads the notation, in its two sanctioned extractors; Agent Access teaches it, in the skill, citing the version. The third reader, `noteTitle` in the kernel, reads one form of the same table (§11).

**Three layers, and each one is proved by a test of its own kind (RN-AGT-023):**

| Layer | Where it lives | What proves it |
|---|---|---|
| **Storage** | The bytes, untouched | Nothing to prove: the product does not interpret content (PP4) |
| **The two extractors** | `services/discovery`, §11.1 and §11.3 | `test/notation-conformance.test.ts`, running the **published cases**: a case the extractors fail breaks the build |
| **The reading surface** | `memorysmith-frontend`, the components | `shared/components/reading-surface-conformance.test.tsx`, running each `reading-surface` entry through the real renderer |

**What each layer is asked for, since profile v0.3.0 restated CommonMark and GFM as data.** The declared notation went from 31 entries to 54, and most of the new ones are forms a base parser already produces. The three layers do not answer that the same way, and the difference is a decision recorded here rather than a filter somebody added quietly:

- **The published suite** runs whatever the profile ships. Nothing is scoped: a case is a case.
- **The reading-surface expectations** and **the two demonstration vaults** are asked for everything the profile **adds** to what a base parser already does. Writing an expectation that emphasis renders as `<em>` asserts that react-markdown works, which is a claim about a library; forcing a setext heading and an indented code block into two hand-written vaults turns them into the list of specimens they exist to not be. CommonMark is the floor every renderer already stands on, and what these two prove is what this profile adds on top of it. GFM stays in: a table, a struck word and a bare address are not universal, and each carries a crossing of its own.
- **The skill** teaches the whole table, the inherited forms included, and that is the same decision reaching the opposite answer. In this profile an inherited entry does not restate the syntax, it states **where this profile changes what the syntax means** — a link inside a code span is not extracted, `![[x]]` is an embed and not an image, a wikilink in a table cell is an edge like any other. Those crossings are invisible from CommonMark alone and are exactly what an agent gets wrong, so the reader who most needs them is the one reading that table.

**Which forms those are is written in `packages/contracts`, and it used to be a field.** Profile v0.4.0 removed the ring, because an implementation is asked for the notation the document lists and not for a source *in full* — the version of that requirement that can be checked. The decision above survived the field, so `DELEGATED_TO_THE_BASE_PARSER` names the exempt entries and `DECLARED_SILENCE` carries what the product answers about forms the profile no longer describes at all (RN-DSC-033). Both are asserted against the profile rather than trusted: a stale id, a silence the specification started declaring, and an entry landing in neither list all fail the build, which is what the removed fields gave for free.

**A source is a lineage and not a compatibility claim, and the precedence is not uniform.** v0.4.0 names Obsidian as the third source, for the seven notation families that came from it, and states that where the profile and a vault editor differ **the profile governs** — the opposite of the deference CommonMark and GFM hold. The skill states both directions, because an agent that assumes one rule for all three is wrong about the half of the notation it is most confident in. `sources[].version` is optional for the same reason: Obsidian publishes documentation rather than a specification, and reading the field as required is how the skill served `Obsidian undefined`.

**The crossings are proved, and not only read.** Each layer carries a block of cases named after them: `a base notation that means something different here`, in the extractor suite and again on the reading surface. They are where reading the inherited entries paid for itself — three defects, all of them shipped, none of them reachable from a test somebody wrote about their own code.

**The reading surface is a stack of remark plugins, and each is a plugin rather than a pass over the string for one reason:** a `==` inside a code fence is not a highlight, and only the parser can tell the difference. `remark-callouts.ts` holds the callout; `remark-memorysmith-ring.ts` holds marked text, comments, block identifiers and the dollar rule. Three of them are worth naming here because each carries a decision:

- **`singleTilde: false` on `remark-gfm`.** GFM specifies strikethrough as `~~x~~`; GitHub also accepts one tilde, outside its own specification. Left on, it strikes the middle of `H~2~O` — a subscript is not notation here, so the characters are meant to stay on the page, and a form that renders wrongly is a worse answer than one that renders as itself. The profile stated the same conclusion from its side in v0.4.0, where `~~` became the only declared form.
- **`remarkMathDollarRule`, after `remark-math`.** The library opens a formula at any `$` and closes it at the next one, so two prices in one paragraph become mathematics. The plugin gives back to the text any inline formula whose delimiters break the profile's rule, reading the source through the node's position, because the delimiters are gone from the node by then.
- **No `rehype-raw`, and that absence is the boundary.** Raw HTML is escaped and shown as text, so a note carrying `<script>` is characters on a page. It is asserted with that payload rather than with a `<b>`.
- **Syntax highlighting, in `shared/api/highlight.ts`.** It is the one thing on this surface the profile does not ask for: a rendering rule is attached to exactly one info string, `mermaid`, and §8 leaves every other undescribed form to the implementation to draw as it likes. What the profile does constrain is the four things around it, and each is asserted: the bytes never change, an unknown language falls through to plain code rather than to nothing, `mermaid` is checked first so a highlighter cannot swallow a diagram, and **the tokens arrive as elements**. That last one is the §7.9 boundary held where a highlighter would otherwise breach it — a library returning an HTML string to be injected takes the body of a note as its input. `refractor` produces a hast tree and `toJsxRuntime` builds React from it, so nothing note-derived is ever parsed as markup. The grammars are enumerated rather than bundled, because Prism carries close to three hundred and a vault writes in a handful.
- **The remote-image disclosure, in `WritableContent` (RN-DSC-040).** §7.10 of the profile is the one section about what a Reader may *fetch* rather than what it renders, and it forbids exactly one answer: saying nothing. The destination of an image reaches `<img src>` and React preloads it, so this surface fetches, and the notice at the foot of a note that does is what makes that an answer instead of a silence. `remoteImageHosts` reads it off the raw body, outside code, because an image inside a fence is an example and asks nobody for anything.
- **`urlTransform` is `followable`, in `shared/api/address.ts` (RN-DSC-039).** It was the identity — the stock filter switched off — because an unresolved wikilink is rendered as `[text](pending:target)` and the stock filter does not know `pending:`, so it erased the pending link from the page. A whole protection had been traded for one scheme, and every other scheme reached the `href` with it: `javascript:` was stopped only by React itself, and `data:text/html` was not stopped at all. The list now says what passes, and a refused address keeps its text and loses its affordance.

A block embed resolves through `blockOf` in `transclusion.ts`, told apart from a section anchor by the `^` marker rather than by trying one and falling back — a section named `^x` and a block called `x` would otherwise answer for each other.

**The slug is computed twice, and that is a boundary with a price.** `packages/kernel/src/slug.ts` produces it for storage and for the link extractor; `memorysmith-frontend/src/shared/api/markdown.ts` produces it again to turn a wikilink into a URL, because the frontend takes types from `@memorysmith/contracts` and nothing else from the backend (§5.1), and sharing six lines is not worth dragging the kernel into the browser bundle. The price is that two copies of one rule drift in silence, and they did: the interface was missing the digit-separator step of the profile's §5.3, so `[[Lei 14.133]]` addressed `lei-14-133`, found no note, and drew a real edge as a pending link. **Neither implementation is pinned to the other; both are pinned to the published conformance cases**, which is the only arrangement where the drift is a failing build instead of a screen that lies.

The split is not tidiness. A rendering assertion cannot live in a JSON file — what a callout looks like is not something a suite can state — so those entries come from the profile and the expectation is written once, beside the components, and a declared entry with no expectation fails the test rather than being discovered later in a browser. That test earned its place on its first run, the same way the published suite did against the extractors.

### 11.1 The link graph

`LinkExtractor` (§6.6) runs on every `NoteCreated` and `NoteUpdated`. The target is reduced to the **basename without extension** and normalised into a `Slug`; resolution happens within the scope of the vault (RN-DSC-001 to RN-DSC-006).

**An image is not a link (RN-DSC-038).** The extractor matched `[alt](destination)` without looking at the `!` in front of it, so a picture became a note: `![Curve](./curve.png)` produced a pending link called `curve-png`. A public image never showed it, because an address with a scheme is external and dropped by RN-DSC-003 — the relative form is where it bit. The embed keeps its edge: it is read by the wikilink pattern, which requires no parenthesis, and the two patterns never meet.

**Three forms of one link, and code that is not a link.** The wikilink, the inline Markdown link and the **reference** form all produce the same edge, because the destination decides it and not the syntax that carried it (RN-DSC-037); a definition nobody used produces nothing, since it renders nothing where it stands. A link written inside a fenced block or a code span is an example and not a reference, and produces no edge (RN-DSC-036) — the same rule the reading surface applies before it rewrites a wikilink, which is why `` `[[Target]]` `` now survives on the page instead of being turned into a link to the note it was describing.

**The indented code block is the declared exception, and the reason is the cost of being wrong.** The profile says it suppresses notation exactly as a fenced block does. Neither sanctioned reader implements it, because telling four spaces of code from four spaces of a nested list item needs the block context only a parser has, and this reader has none by design (PP4). Of the two ways to be wrong, reading a link that was an example costs one spurious pending link; skipping a nested list item costs a **real edge**, which is the graph lying about what the vault says. The cheaper mistake is the one that stays, and it is asserted as behaviour so that nobody has to rediscover it.

**The `mv-discovery` table:**

| Item | PK | SK |
|---|---|---|
| Outgoing edge | `S#{s}#VAULT#{v}` | `OUT#{fromNoteId}#{toNoteId}` |
| Incoming edge (backlink) | `S#{s}#VAULT#{v}` | `IN#{toNoteId}#{fromNoteId}` |
| Pending link | `S#{s}#VAULT#{v}` | `PENDING#{slug}#{fromNoteId}` |

The edge is written in both directions: a backlink becomes a `Query`, not a scan. Traversal is BFS with a maximum depth of 3 and a ceiling of 200 nodes, deduplicating cycles (RN-DSC-007).

`NoteMoved` between folders **does not touch the graph**, because an edge is `noteId → noteId` and the folder takes no part in it. `NoteMoved` between vaults prunes the edges of the note in the source vault and re-resolves the outgoing ones against the slugs of the destination.

### 11.2 Search

The search is **literal over the text of the vault**, answered from one item per note in `mv-discovery`:

| Item | PK | SK |
|---|---|---|
| Searchable portrait | `S#{s}#VAULT#{v}` | `TEXT#{noteId}` |

The item holds the title, the folder, the headings, the facets and the body **twice**: normalised for matching, and as it was written for the excerpt. Normalisation is done character by character, and each character contributes exactly the size it occupied, so a position in the normalised text is the same position in the original. That is what makes it possible to cut the excerpt out of the text the person wrote: an `NFD` over the whole string shifts every offset after the first accent, and the reader would get a passage cut a few characters off, or lowered prose nobody typed.

**The scan covers the whole vault, and that is a choice, not a shortcut.** The ceiling is 2,000 notes per vault (`software-vision.md` §14), around 8 MB, and at that size scanning costs 1,061 read units per query, something like US$ 0.00027. An inverted index would be cheaper per query and far more expensive to keep correct: every write would have to update the postings of every term, and the difference in money, at the declared ceiling, is cents per month. The comparison with the vector index that left is the whole argument:

| | Bytes per vault at the ceiling | Amplification over the Markdown | Reads per query |
|---|---|---|---|
| `CHUNK#` with a vector (removed) | 82.8 MB | 10.6× | 10,597 RRU |
| `TEXT#` with the body | 8.3 MB | 1.06× | 1,061 RRU |

**What the scan may not do is stop early.** `scanVault` walks every page of the `Query`, and there is a test with nine fake pages proving it. It is not an optimisation detail: it was exactly a `Query` stopping at the first 1 MB page that broke the previous search, and 8 MB is eight pages.

**The query language** (`SearchQuery.ts`) is pure domain, with no AWS and no I/O, and therefore tested entirely without infrastructure. It knows four fields by name, `title`, `folder`, `content` and `section`, and resolves **any other prefix as a facet**. No list of facet names exists in the code, which is the same decision as in `FacetExtractor` (§11.3) carried through to the query: the vocabulary belongs to the Guidance, so a vault that starts writing `norma: federal` gets `norma:federal` as a filter the same day.

**What was there before, and why it left.** Up to 0.1.0 Discovery kept a vector index: notes were cut into chunks by heading, each chunk got a context prefix (`vault › folder › folder description › title`), went to Bedrock Titan Text Embeddings V2 at 1024 dimensions, and the vector was written as a list of `Number` in the `mv-discovery` table itself, in `CHUNK#{noteId}#{i}` items.

Three measurements taken in the real environment condemned the design:

| Measurement | Value | Consequence |
|---|---|---|
| The item of a chunk | 14,473 bytes, of which 14,175 are the vector | 1 GB of Markdown becomes 10.6 GB of items |
| Reads per query | The whole vault, with no `ProjectionExpression` | The cost per question grows with the size of the vault |
| The `Query` page | 1 MB, and the method did not paginate | The search saw 65 chunks and ignored the rest in silence |

The third item is the decisive one: the search **looked** like it worked because the 1 MB cut kept it fast, while it scanned less than 0.01% of a large vault. An index that lies silently is worse than the absence of one, which is declared.

**What is still absent is search by meaning**, the one that finds the note covering the subject in other words. That one does not come back through a scan: it requires a vector index with real retrieval, and the candidate is S3 Vectors, which stores a vector at US$ 0.06 per GB per month and does not read everything on every query. The difference from what left is that it will come back as an addition to a search that works, and not as the only search there is.

**Isolation:** any index replacing this one is **per subscription** (RN-SUB-015), never a global index filtered by metadata. A metadata filter is access control by convention; a separate index is a physical boundary.

### 11.3 Curation facets

The third projection, the one that serves the curation panel. The business rules are in `software-vision.md` §10.3.

`FacetExtractor` runs on every `NoteCreated`, `NoteUpdated`, `NoteDeleted` and `NoteRestored`: it loads the blob through the `ContentRef` of the event, reads **only the frontmatter block** and classifies each key-value pair by the **shape of the value**: a date, a boolean, a short enumerable value and a list of short values are aggregatable; free text is discarded (RN-DSC-020). There is no key list in the code and no per-vault configuration: the vocabulary belongs to the Guidance, and `maturity` and `reviewed`, the standard facets of the product, are to the extractor attributes like any other. It is the second sanctioned reader of content, next to `LinkExtractor`, and like it, it lives outside the core (PP4).

**The shape rule is a published contract, not a code comment.** What decides the kind is the **form the author wrote**, and never how many values that form happens to hold: a bracketed or dash list is a list at any length, and a scalar is an enum. `parseFrontmatter` therefore carries the written form out alongside the values, because flattening both into an array is what made a list of one item indistinguishable from a scalar — and adding a second value to an attribute must not change what the attribute is (RN-DSC-020).

**The first operator of the query language is in `SearchQuery.ts`, and its shape is a precedent** (RN-DSC-034). The comparison is the node — `{ kind: 'compare', facet, op, value }` — and the range is desugared into two of them **at parse time**, so everything past the parser sees one shape and there is one semantics to test. Comparison is lexicographic over the canonicalised date, cut to the length of the operand, which is what makes `created:<=2026-02` include the fifteenth of February instead of excluding most of the month. Two refusals are part of the operator rather than of the caller: a range with inverted ends is a `QuerySyntaxError` at parse time, and an interval over an attribute this vault does not hold as a date is refused in `SearchNotes`, once, against the kinds the scan already carries — because "is this attribute a date" is a fact about the vault and not about the query string.

**Four keys are reserved, and reserving is declaring** (RN-DSC-030). `aliases`, `tags`, `created` and `updated` are spelled in en-US in every vault, and this extractor still treats them like any other attribute: a reserved key of the wrong shape degrades instead of failing. Two of them reach further than the counts. The kind of every facet travels into the content index, because a facet of kind `date` is matched by **prefix** in the query language and not by substring (RN-DSC-031), and the values of `aliases` travel there as other spellings of the title, answering wherever the title does (RN-DSC-032). Both fields are optional on `IndexedNote`: an item written before they existed answers without them, so a search keeps working while the projection is rebuilt rather than going silent.

**Consumption:** an EventBridge rule → SQS → Lambda, with a DLQ. The queue absorbs a burst of batch ingestion, and a retry or a failure of the projector never touches the hot path of the write.

**The `mv-discovery` table:**

| Item | PK | SK | Attributes |
|---|---|---|---|
| Facet portrait of the note | `S#{s}#VAULT#{v}` | `FACET#{noteId}` | a map `{attribute: value(s)}` of the aggregatable ones, version |
| Aggregate counter | `S#{s}#VAULT#{v}` | `STAT#{facet}#{value}` | count |
| State of the attribute | `S#{s}#VAULT#{v}` | `FDEF#{facet}` | inferred type, distinctCount, `discarded?` |
| Event dedup | `S#{s}#VAULT#{v}` | `SEEN#{eventUlid}` | TTL 7d |

**The per-note portrait is what makes the delta exact.** An update and a deletion have to decrement the old value ("the note was `growing`, it became `evergreen`"), and the old value is not in the event: it is in the portrait. The projector reads `FACET#{noteId}`, computes the delta and applies everything in a single transaction, in the same pattern as the folder counters (§10.3): a `Put` of `SEEN#{eventUlid}` with `attribute_not_exists`, a `Put` of the new portrait and `ADD count :delta` on the affected counters. Reprocessing the queue is a no-op through the dedup; an out-of-order event loses to the higher `version` already portrayed.

One counter item **per facet value**, and not a single statistics item per vault: fifty notes written in parallel increment different counters, and the single item would become the same bottleneck the `META` rule (PE8) exists to avoid.

**The cardinality ceiling is the free-text detector** (RN-DSC-024). `FDEF#{facet}` tracks how many distinct values the attribute has produced in the vault; on passing the ceiling, the projector marks the attribute as `discarded`, deletes its `STAT#` items and starts ignoring it. That is how `title` and `source` never become statistics, with no exclusion list in the code: an attribute whose value is unique per note gives itself away through its cardinality.

**Assembling the panel is one `Query`** with the `STAT#` prefix per vault, without touching a single note. Rebuilding (PE5): delete the `FACET#` and `STAT#` items of the vault and reprocess the notes.

### 11.4 Ports

```typescript
export interface LinkGraph {
  replaceOutgoing(note: NoteId, links: LinkTarget[]): Promise<void>;
  dependencyTree(root: NoteId, depth: Depth): Promise<GraphNode>;
  backlinks(note: NoteId): Promise<NoteRef[]>;
  broken(vault: VaultId): Promise<BrokenLink[]>;
  orphans(vault: VaultId): Promise<NoteRef[]>;
}

export interface ContentIndex {
  replaceNote(vault: VaultId, note: IndexedNote): Promise<void>;
  removeNote(vault: VaultId, note: NoteId): Promise<void>;
  /** Every page. A partial scan that claims to be whole is worse than none. */
  scanVault(vault: VaultId): Promise<IndexedNote[]>;
}

export interface FacetExtractor { extract(frontmatter: string): FacetSnapshot; }

export interface FacetIndex {
  replaceFacets(note: NoteId, facets: FacetSnapshot | null): Promise<void>; // null: a deleted note
  vaultFacetStats(vault: VaultId): Promise<FacetStats>;
}
```

---
## 12. Provenance and history

The business rules are in `software-vision.md` §11.2.

### 12.1 `Authorship`

```typescript
export class Authorship {                    // immutable VO
  constructor(
    readonly user: UserId,                   // always a human: the owner of the token
    readonly agent: AgentIdentity | null,    // null = written through the UI
    readonly at: Instant,
  ) {}
}

export class AgentIdentity {
  constructor(readonly clientId: OAuthClientId, readonly clientName: string) {}
}
```

The one that fills it in is the inbound adapter: `McpToolAdapter` resolves the agent from the token, and the HTTP adapter of the UI leaves it null. The domain receives a finished, mandatory `Authorship` (PE6).

### 12.2 `svc-audit`

A consumer of **every** event on the bus, from every service.

| Item | PK | SK | Attributes |
|---|---|---|---|
| Audit Event | `S#{s}#{subject}#{subjectId}` | `AT#{timestamp}#{eventUlid}` | type, authorship, contentRef, payload |

with `subject ∈ {SUBSCRIPTION, MEMBER, VAULT, FOLDER, NOTE}`. One `Query` by `PK` returns the complete timeline of any object, in chronological order, with no scan.

The key is **by subject, not by vault**, and that is not a detail: it is what makes the timeline of a note survive it changing folder and vault, as long as the `NoteId` is preserved. It is the reason `moveTo` exists as a command instead of being implemented as delete plus create (§6.2).

**Immutability is not a convention (PE4): the role of the Lambda has an explicit `Deny` on `UpdateItem` and `DeleteItem` on the table.** There is no path, neither through a bug nor through an operator, that rewrites the past. It is the difference between "we do not alter the log" and "we cannot alter the log", and only the second one serves in front of a regulator.

### 12.3 Revisions and historical reconstruction

The bucket is versioned, so every write to a Content Slot produces an immutable `versionId`. **The event carries the complete `ContentRef`**, and that is the detail linking *"something happened"* to *"the content was this"*.

Reconstructing the note on a date:

1. in the log, the last event of that note with `timestamp ≤ date`
2. a `GET` on S3 at `s/{subscriptionId}/c/{contentId}.md` with the `versionId` of that event

No query to Knowledge is needed: **the present lives in `mv-knowledge`, the past lives in `mv-audit`**, and the event brings the `(contentId, versionId)` pair that is enough to fetch the byte. Since the key is opaque, moving or renaming the note afterwards does not affect the reconstruction: the slot is the same, and the revision history stays in a single S3 object instead of spread across objects created on every move.

### 12.4 Deleting is not destroying

**`NoteDeleted` is a soft delete.** The `NOTE` item gains `deletedAt` and `deletedBy`, and **loses the key attributes of `GSI2`**: since the index is sparse (§9.3), the note disappears from the listings without a line of filtering anywhere. The `bodyRef` stays intact, so `read_note(asOf)` and `note_history` keep answering by `NoteId`. Nothing else is written: there is no guard to release, because a vault reserves no name (RN-KNW-030, removed). Restoring is giving the index attributes back, which is free and becomes `NoteRestored`.

**There is no path that destroys content.** That is why `purge` does not exist on the `ContentStore` port (§7.1), and the absence is declared in the code itself as deliberate. Deleting hides the note and preserves the byte: no port, no route and no administrative act destroys what has already been written (RN-AUD-006, and RN-AUD-007, removed).

---

## 13. MCP server

Endpoint: `https://mcp.memorysmith.app/mcp` (Streamable HTTP, OAuth 2.1). The tool catalogue and the format of the Vault Context are in `software-vision.md` §9, because **the catalogue is a public contract and lives there, not here**.

### 13.1 `svc-agent` as an anticorruption layer

`McpToolAdapter` translates a tool call into a use case command and back, and resolves the `Authorship` from the token. No MCP vocabulary enters the core (RN-AGT-008), and swapping protocols tomorrow is swapping one adapter.

### 13.2 Authentication

Remote MCP requires OAuth 2.1 with *Protected Resource Metadata* (`knowledge-base.md` §3.4). **Cognito as the Authorization Server; `svc-agent` as the Resource Server and as the client registration proxy (§13.3).** The `subscriptionId` enters the token through the *pre-token-generation* trigger (§8.3), and the `client_id` of the connector becomes the `AgentIdentity` (§12.1).

### 13.3 Client registration: a CIMD proxy in front of Cognito

Cognito implements no automatic client registration mechanism, neither DCR nor CIMD (`knowledge-base.md` §3.4). The current MCP specification deprecated DCR and recommends CIMD, and the relevant agent clients support CIMD on desktop, web and CLI surfaces. The decision: **`svc-agent` implements CIMD, acting as an authorisation proxy in front of Cognito.** Cognito keeps issuing every token; the proxy resolves only client registration. No new infrastructure component: the proxy is code inside the `svc-agent` Lambda, which is already the Resource Server.

**The mechanism, end to end:**

1. **Discovery.** An unauthenticated request to the MCP endpoint answers `401` with `WWW-Authenticate: Bearer resource_metadata="https://mcp.memorysmith.app/.well-known/oauth-protected-resource"`. In the PRM document, the `resource` field is exactly the URL of the MCP endpoint as the user types it, and `authorization_servers` points at the issuer of `svc-agent` itself, not at Cognito.
2. **Authorization server metadata.** `svc-agent` serves the RFC 8414 document of its issuer announcing `client_id_metadata_document_supported: true` and `"none"` in `token_endpoint_auth_methods_supported`, both required for the client to pick CIMD, plus `code_challenge_methods_supported: ["S256"]`, with `authorization_endpoint` and `token_endpoint` pointing at the proxy itself.
3. **Authorisation.** On receiving a `client_id` in URL form, the proxy fetches the metadata document of the client and validates it before any redirect: HTTPS required, private address blocking on resolution (anti-SSRF), a size ceiling and a timeout on the fetch, the `client_id` inside the document identical to the URL, and the `redirect_uri` of the request present in the list of the document. Once validated, it forwards the browser to the Cognito authorization endpoint using the single pre-registered app client of the proxy, preserving the PKCE of the client and correlating the two legs by `state`. The accepted `redirect_uri`s include the callback of hosted clients and loopback (`localhost` and `127.0.0.1`) with the port ignored in the comparison, per RFC 8252.
4. **Token.** The token endpoint of the proxy exchanges the code with Cognito and returns the Cognito JWT **unchanged**: the proxy never issues or modifies a token. It accepts `application/x-www-form-urlencoded`, passes the refresh through with refresh token rotation, and the `subscription_id` and `subscription_status` claims keep entering through the trigger of §8.5. The CIMD `client_id`, the URL, is what becomes the `AgentIdentity` (§12.1).
5. **DCR deliberately absent.** The metadata does not expose a `registration_endpoint`. Besides being deprecated, DCR would create an app client in the user pool on every new connection, accumulating registration garbage and consuming quota. For a client that does not speak CIMD, the fallback is pre-registration: entering a `client_id` by hand in the connector configuration, which clients support by specification.
6. **Operational constraints that become tests.** Clients expect an answer from the discovery, authorisation and token endpoints within 10 seconds, so the OAuth path of the Lambda needs a comfortable p95 under that ceiling, cold start included. The discovery endpoints have to be reachable from the egress of the agent client providers, without a WAF blocking them.

**The removal lever.** The proxy exists because Cognito does not speak CIMD. If one day it does, the PRM starts pointing at the Cognito issuer and the proxy is removed with no migration: the CIMD `client_id` is a URL hosted by the client itself, portable between authorization servers by construction, so there is no registration state on our side to carry. Until then, the proxy is treated as a permanent component, held to the same security bar as the rest of the edge.

**The authentication spike that opened 0.1.0 validated this design, and it came before everything else:** a minimal proxy with a working CIMD connector end to end on a desktop client and on a web client, satisfying items 1 to 6. With the decision taken, the risk changes nature: it stops being a choice of direction and becomes integration conformance. The thesis, however, still depends on it (`software-vision.md` §1.4): if the friction persists even with the proxy, plan B is an identity provider with native CIMD (WorkOS AuthKit, Auth0), a swap contained in the identity stack and the proxy, without touching the domain.

**Normative and integration references:**

- Model Context Protocol, client registration: <https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization/client-registration>
- Anthropic, connector authentication: <https://claude.com/docs/connectors/building/authentication>
- OAuth Client ID Metadata Document, IETF draft: <https://datatracker.ietf.org/doc/draft-ietf-oauth-client-id-metadata-document/>
- RFC 9728 (Protected Resource Metadata) · RFC 8414 (Authorization Server Metadata) · RFC 8252 (native apps and loopback) · RFC 7636 (PKCE)

### 13.4 Idempotency and concurrency

Both solved with no new mechanism:

- **There is no idempotency, and its absence is the decision.** A note transaction writes no guard item, because a vault holds no key: two notes may carry one title (RN-KNW-037) and a repeated `create_note` writes a second note (RN-AGT-024). The tool says so, and declares itself as not idempotent, which is what lets a client tell a retry that costs nothing from one that costs a duplicate.
- **Concurrency.** `update_note` requires `baseRevision`, and a divergence answers `CONFLICT` with the current content attached (RN-AGT-005).

---

## 14. Internal API and authorisation

### 14.1 Routes

Consumed by the UI; **the public contract is MCP**.

```
svc-access       GET  /session   (the user, the links and the active subscription)
                 POST /session/subscription  { subscriptionId }
                 POST /subscriptions      { type?, quota? }  (pending_approval)
                 POST /subscriptions/:s/ownership          { toUserId }
                 GET  /members · POST /members             { email, role }
                 PATCH /members/:u  { role } · DELETE /members/:u
                 POST /invites/:token/accept
svc-access       GET  /platform/subscriptions?status=      ─┐  platform session:
 (platform)      POST /platform/subscriptions/:s/approve    ├─ no subscription_id claim,
                 POST /platform/subscriptions/:s/reject     │  reads only through GSI2 (§8.3, §8.4)
                 POST /platform/subscriptions/:s/suspend    │
                 POST /platform/subscriptions/:s/reactivate │
                 PUT  /platform/subscriptions/:s/status     │  administrative act: sets the
                 PATCH /platform/subscriptions/:s/plan     ─┘  status without the transition
                                                               machine (RN-SUB-018)
svc-knowledge    GET  /vaults · POST /vaults
                 GET|PATCH|DELETE /vaults/:v · POST /vaults/:v/restore   (RN-KNW-033)
                 GET  /vaults/:v/context   (structure and guidance in a single answer)
                 PUT  /vaults/:v/guidance
                 POST /vaults/:v/folders · PATCH|DELETE /vaults/:v/folders/:f
                 POST /vaults/:v/folders/:f/reorder   { afterFolderId | null }
                 GET|PUT /vaults/:v/folders/:f/template
                 GET|POST /vaults/:v/notes · GET|PUT|DELETE /vaults/:v/notes/:n
                 ── POST takes { folderId, content }: a note is created from its
                    content, and the title is read from it (RN-AGT-024)
                 ── the three writes of a Content Slot answer THE REVISION THEY
                    PRODUCED, so a caller can write twice without reloading
                    (RN-AGT-005): the guidance and the template as { revision },
                    the note as the full DTO. Answering less made a person
                    conflict with themselves on the second write.
                 POST /vaults/:v/notes/:n/reorder   { afterNoteId | null }
                 POST /vaults/:v/notes/:n/restore
                 POST /vaults/:v/notes/:n/move   { toVaultId?, toFolderId }
                 PUT|DELETE /vaults/:v/limits/:userId   { limit: VIEWER }   (§9.3)
svc-discovery    GET  /vaults/:v/graph   (the whole vault graph, edges from the index)
                 GET  /vaults/:v/notes/:n/graph?depth= · GET /vaults/:v/notes/:n/backlinks
                 GET  /vaults/:v/health   (broken links, orphans)
                 GET  /vaults/:v/facets  (content distribution, feeds the Overview)
                 POST /vaults/:v/search   { query, mode: lexical }
svc-audit        GET  /notes/:n/history
                 GET  /notes/:n/revisions · GET /notes/:n/revisions/:versionId
                 GET  /vaults/:v/activity?from=&to=
svc-portability  POST /vaults/:v/export   → the pre-signed URL comes back in the same answer
```

The authorizer of `svc-access` does not appear here because **it is not a route**: it is a
Lambda function the API Gateway invokes before any of them (§14.2). Neither do the OAuth
routes of `svc-agent`, which are not consumed by the UI and are described in §13.3.

**No route receives a `subscriptionId`**, which always comes from the token (§8.1).

Routing by path on a single CloudFront (`api.memorysmith.app/knowledge/*` and so on). Calls between services go through API Gateway with **IAM auth**, never over an open network.

### 14.2 Authorisation in two stages

Leaving this implicit is how authz holes are born. Each stage has an explicit owner:

1. **The authorizer (`svc-access`).** It validates the Cognito JWT, confirms the active subscription is in `trial` or `active` (RN-SUB-007), resolves ownership (`isOwner`) and the role of the user in the subscription, and injects all of it into the request context (5 min cache). **It does not know what a vault is**, nor could it: whoever holds the per-vault ceiling is Knowledge.
2. **The service that owns the resource.** The `AuthorizationPolicy`, a domain service and not an infrastructure port (§6.6), decides locally, with no network call.

**The stage 2 decision, in one expression.** The effective role is the lesser of the subscription role and the vault ceiling, and ownership overrides both:

```typescript
// domain/access/AuthorizationPolicy.ts — no I/O, no SDK
effectiveRole(ctx: RequestContext, vault: Vault): Role {
  if (ctx.isOwner) return Role.OWNER;                     // the holder reaches everything (RN-ACC-013)
  if (!ctx.role.canRead()) return Role.NONE;             // EDITOR | VIEWER | none
  return Role.min(ctx.role, vault.limitFor(ctx.user));   // the ceiling only lowers (RN-ACC-011)
}
```

The three inputs arrive at no extra cost: `isOwner` and the role come from the context injected by the authorizer, and the ceilings come from the **same `Query`** that already loaded the vault (§9.3). No additional query enters the hot path because of authorisation.

**A fixed rule, with no exception:** every Knowledge use case loads the vault and calls `policy.require(action, vault)` **before anything else**. And **a forbidden resource returns the same `404` as a non-existent one** (RN-SUB-004), because a `403` would confirm the existence of a vault the requester may not see.

> **One deliberate exception to the `404`:** a write refused by a vault ceiling returns a real `FORBIDDEN`, not a `404`. The member **already knows** the vault exists, because they see it in the list (RN-ACC-012: the ceiling never hides). Returning a `404` there would protect no information and would produce the worst possible experience: a vault that shows up on screen and disappears when written to. The `404` rule protects existence; where there is no existence to protect, it does not apply.

**Three clocks, all declared:**

| Change | Time until it takes effect | Why |
|---|---|---|
| Role in the subscription, vault ceiling, member removal | up to 5 min | the authorizer cache (RN-ACC-016) |
| Subscription status (suspension) | the life of the token | the `subscription_status` claim ages with it (§8.5) |
| Ownership transferred | up to 5 min | the same cache |

They are acceptable and they are declared. If a subscription requires immediate revocation, the extension point is a short denylist consulted by the authorizer, and it would cover all three cases at once.

---
## 15. Error taxonomy

One taxonomy only, in `memorysmith-backend/packages/kernel`, defined **before** the first line of a use case. Without it, each service invents its own and the edge becomes ad hoc translation.

```typescript
type ErrorCode =
  | 'VALIDATION' | 'NOT_FOUND' | 'FORBIDDEN' | 'CONFLICT'
  | 'PRECONDITION_FAILED' | 'LIMIT_EXCEEDED' | 'INTERNAL';

export class DomainError {
  constructor(readonly code: ErrorCode, readonly message: string, readonly details?: unknown) {}
}
```

| Code | HTTP | When |
|---|---|---|
| `VALIDATION` | 400 | a VO refused the value in its constructor |
| `NOT_FOUND` | 404 | it does not exist |
| `FORBIDDEN` | **404** | it exists and the requester may not see it, since a `403` would leak the existence |
| `CONFLICT` | 409 | optimistic lock, slug already taken, diverging `baseRevision` |
| `PRECONDITION_FAILED` | 412 | a required policy is missing (`RemovalPolicy`) |
| `LIMIT_EXCEEDED` | 413 / 429 | a note above the ceiling, the rate limit of the subscription |
| `INTERNAL` | 500 | the rest, and only the rest |

The domain returns `Result<T, DomainError>`; **exceptions exist only at the edge**. The adapter translates `TransactionCanceledException` into `CONFLICT`, and a `ConditionalCheckFailed` on the slug guard into `CONFLICT` with the existing `noteId` in `details`. Over MCP, every error becomes `isError` with actionable text, and the missing-argument one returns the template along with it (RN-AGT-003).

---

## 16. Export

`svc-portability` consumes the events, assembles the zip and returns a pre-signed URL. The tree format and the rules are in `software-vision.md` §12.

**Implementation:** the materialised tree is built from the `Vault` aggregate and the notes; the content comes from the `ContentStore` through the current `ContentRef`s. The numeric prefix is derived from the `Position` order at export time, and is not stored.

**This is where reserved names come back into existence.** In storage there is no name at all (§9.2); in the materialised tree, `GUIDANCE.md` and `TEMPLATE.md` are taken by the guidance and the template, and `STRUCTURE.md` by the annotated tree, written once at the root. The description of a folder is an attribute of the `FOLDER` item and never reached the `ContentStore`, so it travels in that document and not in one file per folder. A note whose slug collides with one of the three names is exported with a suffix, and the links to it are rewritten along with it (RN-PRT-005). It is the only concession of the export, and it belongs to the edge, not to the model.

---

## 17. Infrastructure

| Layer | Choice |
|---|---|
| Compute | **One Lambda per service** (Node.js 22, ARM64), internal routing with Hono |
| API | API Gateway HTTP API per service, behind a single CloudFront |
| Data | One DynamoDB table per service (on-demand, PITR), a versioned S3 bucket with flat opaque keys and an S3 Vectors bucket |
| Events | EventBridge (the `mv-events` bus) and DynamoDB Streams for the outbox |
| Identity | A Cognito user pool with a pre-token-generation trigger (the `subscription_id` claim) |
| DNS | Route 53: the hosted zone of `memorysmith.app` and every record created by the CDK in `network.stack` |
| Front end | React + Vite (SPA) on S3 + CloudFront |
| IaC | AWS CDK (TypeScript), one stack per service plus one for network and domain |
| Observability | Powertools for AWS Lambda; the `subscriptionId` on **every** log line and as a metric dimension |

> **One Lambda per service, not one per route:** fewer cold starts, one composition root per deployable, and the boundary that matters (the bounded context) stays the unit of deployment.

**Domains and DNS.** The domain `memorysmith.app` is registered. From it on, everything is declared by the CDK in `network.stack`: the public hosted zone in Route 53, the ACM certificates validated by DNS in that same zone (automatic issuance and renewal) and the records of each surface. No record is created by hand in the console.

| Host | Serves | Stack that creates the record |
|---|---|---|
| `memorysmith.app` | The SPA (S3 + CloudFront) | `frontend-hosting.stack` |
| `www.memorysmith.app` | A permanent redirect to the apex | `frontend-hosting.stack` |
| `api.memorysmith.app` | The internal API, routed by path on CloudFront (§14.1) | `network.stack` |
| `mcp.memorysmith.app` | The MCP server and the OAuth endpoints of the CIMD proxy (§13) | `agent.stack` |

Two cautions that belong to the instruction, not to the execution:

- **A CloudFront certificate lives in `us-east-1`.** It is a CloudFront requirement, not a choice. The CDK resolves it with a certificate stack in that region and a cross-region reference; the rest of the infrastructure stays in the main region.
- **If the domain registration is outside Route 53, delegation is a one-off manual act:** pointing the name servers at the registrar to the NS of the hosted zone the CDK created. It is the only DNS write done outside the code, and it happens once.

**Certificates.** All product TLS uses a public X.509 certificate issued by ACM, and nothing beyond that:

- **Issued by the CDK, validated by DNS in the hosted zone itself.** The certificate construct creates the validation records automatically; no manual challenge, no approval e-mail.
- **Automatic and transparent renewal.** ACM renews before expiry with no intervention. The maximum validity of a public certificate has dropped to 198 days by CA/Browser Forum mandate; that changes nothing operationally here, because renewal is managed, and it is one more reason never to administer a certificate by hand.
- **Non-exportable, on purpose.** The private key never leaves AWS; the certificate only associates with CloudFront and API Gateway. If one day a certificate has to leave (another provider, an appliance), that is a new decision, with a cost of its own, and not a default to change in silence.
- **One certificate per distribution, with SANs covering its hosts:** the one of the frontend distribution covers `memorysmith.app` and `www`; the one of the API distribution covers `api`; the one of MCP covers `mcp`. CloudFront distribution certificates are born in the `us-east-1` stack; API Gateway custom domain certificates are born in the main region.
- **No Private CA.** There is no use case for a certificate authority of our own in this design, and its fixed cost (US$ 400 per month) buys nothing here. Internal communication between services is authenticated by IAM (§14.1), not by mTLS.

**The cost of DNS and certificates**, at the prices published by AWS ([Route 53](https://aws.amazon.com/route53/pricing/), [ACM](https://aws.amazon.com/certificate-manager/pricing/)):

| Item | Price | In our design |
|---|---|---|
| Hosted zone | US$ 0.50 per zone/month (up to 25 zones) | 1 zone |
| Alias queries to AWS resources (CloudFront, S3) | Free | All our records are aliases; query cost is effectively zero |
| Standard queries | US$ 0.40 per million | Only if non-alias records appear |
| A non-exportable public ACM certificate | Free, issuance and renewal | All our certificates |
| An exportable public certificate | US$ 7 per FQDN, US$ 79 per wildcard, on issuance and on each renewal | We do not use one |
| AWS Private CA | US$ 400 per month (US$ 50 in short-lived mode) | We do not use one |

The fixed cost of the whole DNS and TLS layer is therefore the hosted zone: around US$ 0.50 per month. The registration and the annual renewal of the domain are billed by the registrar where `memorysmith.app` was bought and stay outside the AWS bill for as long as the domain is not transferred to Route 53.

**Periodic jobs:**

| Job | Frequency | What it does |
|---|---|---|
| S3 orphan collection | Weekly | Collects unreferenced blobs, born from a failure between steps 1 and 3 of §10.5 |
| `Position` rebalancing | On demand | Redistributes fractional keys that passed 12 characters (§6.4) |

**Mandatory alarms per Lambda:** error rate, p99 duration, throttles and the depth of the dead-letter queue of the outbox relay.

---

## 18. Non-functional requirements

Initial numbers, so they become tests and not folklore. The thesis of the product is "without friction", and without a number that is not verifiable. Product limits (note size, per-vault ceilings) are in `software-vision.md` §14.

| | Target |
|---|---|
| `get_vault_context` p95 | ≤ 400 ms warm · ≤ 1.5 s cold |
| `create_note` / `update_note` p95 | ≤ 600 ms (not counting the projection, which is asynchronous) |
| `read_note` p95 | ≤ 300 ms warm |
| Reindexing delay after a write | ≤ 30 s p95 |
| Outbox retention | TTL 7 days |
| Retention of the `SEEN#` dedup item | TTL 7 days |

---

## 19. Testing strategy

| Layer | How |
|---|---|
| Domain | Pure unit tests, **with no I/O and no framework mocks**. If an SDK mock is needed, the hexagon has leaked |
| Use cases | With `InMemory` adapters |
| Adapters | Against DynamoDB Local and MinIO |
| Event contracts | Zod schemas validated on both sides (producer and consumer) |
| End to end | Per vertical slice |

**Three tests that are not optional and exist from the first delivery that makes them possible:**

- **An isolation test per service:** two subscriptions, A's trying to read B's, expecting a `404` and not a `403`.
- **A platform session test:** a `PLATFORM_ADMIN` token, which carries no `subscription_id`, against any Knowledge route has to fail through the **impossibility of assembling the key**, not through a role check (RN-SUB-016).
- **An audit immutability test:** an attempted `UpdateItem` on the log has to fail **through IAM**, not through code. A test that passes because the application has no such method proves nothing.

---

## 20. CI/CD

### 20.1 Continuous integration

It runs on every pull request and on every push to `main`, defined in `.github/workflows/ci.yml`. There are five jobs, all mandatory and all in parallel:

```
quality           lint · format · typecheck on the three projects · dependency-cruiser
backend-unit      the domain, use cases with InMemory adapters, event contracts,
                  subscription isolation and the vertical slice
backend-adapters  adapters against DynamoDB Local and MinIO
frontend          production build of the SPA
infra             cdk synth with a fake account and region
```

No job is optional. `dependency-cruiser` in particular is what keeps "hexagonal" from becoming folder naming, and it is also where the single direction between the three projects (§5.1) is checked.

**Every job runs on every execution, with no filter by changed path.** The whole suite takes about a minute, and a filter that gets the slice wrong lets through exactly the change that needed checking. `infra` would have to run always anyway, because it references the artifacts of the other two and a change in them may invalidate the `synth`. When the execution time starts to hurt, slicing by changed project is the first optimisation to make, and not before that.

**The dependencies of the adapter tests have a single definition.** The job brings them up with `docker compose up -d --wait` over the `docker-compose.yml` at the root, the same file the machine of whoever develops uses, with the images pinned to an exact version and a healthcheck on both. Declaring the same containers a second time inside the workflow is what has already made the suite pass locally and fail in continuous integration over an image difference nobody had a reason to look for.

### 20.2 Delivery

**There is no automatic deployment, and that is a decision, not a gap.** The environment goes up and comes down through a script, from a workstation, with step-by-step supervision:

```
deploy-aws/deploy.ps1     checks the toolchain and the account, installs the workspace,
                          bootstraps the region when needed, synthesises, deploys the
                          backend stacks, writes the .env.local of the SPA from the real
                          outputs, builds the SPA, deploys the hosting and verifies the
                          result over HTTP
deploy-aws/onboard.ps1    creates the first account, the subscription and the first vault,
                          always through the API of the product
deploy-aws/destroy.ps1    tears the stacks down, preserves the data by default and reports
                          what survived
```

Every step is idempotent: when one fails, fix what the report points at and run it again.

Three reasons sustain the choice. There is no staging environment, and a pipeline deploying straight to production with no environment before it is worse than none. There is one person integrating, so there is no race between changes from different people, which is the problem automatic deployment solves. And `cdk deploy` over a domain, a certificate and a user pool has steps depending on external propagation, whose failure mode is cheaper to read in the terminal than in a runner log.

**What would change that decision**, in the order it probably happens: a second AWS account acting as staging, a second person integrating on `main`, or an end-to-end test against a running environment nobody wants to run by hand. While none of the three is true, automating the deployment adds a mechanism to maintain and removes no risk.

**End to end.** The vertical slice is verified in process, in the `backend-unit` job, with `InMemory` adapters and the routes mounted the way `core-monolith` mounts them. There is no end-to-end suite against a deployed environment, and `deploy.ps1` closes that gap in its own way: it finishes by verifying over HTTP that what went up answers.

---
## 21. Anti-patterns

### 21.1 Domain

- Importing an AWS SDK in `domain/` or `application/`, "just for a type" included.
- Passing a raw `string` where a value object exists.
- An aggregate carrying the Markdown instead of the `ContentRef`.
- A mutating operation without `Authorship`.
- Throwing an exception in the domain instead of returning a `Result`.
- A domain service that does I/O.

### 21.2 Persistence

- Building a key with a `subscriptionId` coming from the argument instead of the `SubscriptionContext`.
- A note transaction that writes to the `META` item (§10.2).
- A dense integer `order` field instead of a fractional `Position`.
- Writing Markdown into DynamoDB.
- Encoding the vault, the folder, the name or the role in the S3 key.
- Reading the table of another service.
- Filtering by subscription after the query instead of in the key.

### 21.3 Edge

- Accepting a `subscriptionId` in the path, the query or the body.
- Returning a `403` for a resource of another subscription.
- Leaking MCP vocabulary into the use case.
- An error returned to the agent with no actionable information (PP10).
- `update_note` without `baseRevision`.
- Generating an automatic suffix on a slug collision.

### 21.4 Projections

- Querying Discovery from Knowledge, since the direction is single.
- Treating the graph, the search or the facets as the source of truth.
- Leaving deleted content in any search index.
- Filtering by subscription inside a shared index instead of using an index per subscription.

---

## 22. Checklist for a new feature

**Before creating the first file**
- [ ] Is each new file in the right project (§5.1)? A stack or a construct in `memorysmith-infra`; a screen in `memorysmith-frontend`; a rule in `memorysmith-backend`.
- [ ] The change does not create a dependency against the single direction between projects.

**Domain**
- [ ] Does the concept have a term in the ubiquitous language (`software-vision.md` §3)? If not, define it before coding.
- [ ] Does the business rule have an `RN-XXX` code in `software-vision.md`?
- [ ] Which aggregate does the invariant belong to? If it crosses two, it is eventual consistency.
- [ ] Does every mutating operation take an `Authorship`?
- [ ] Value objects for every value with a rule.

**Persistence**
- [ ] Does the key start with `S#{subscriptionId}`?
- [ ] Is the transaction of shape A or shape B (§10)? If it is a note one, it does **not** touch `META`.
- [ ] Does it need a uniqueness guard? In which scope?
- [ ] Does the event carry the complete `ContentRef`, when content is involved?

**Edge**
- [ ] `policy.require(action, vault)` before anything else.
- [ ] A forbidden resource returns a `404`.
- [ ] The returned error is actionable.
- [ ] If it is a new MCP tool: it enters the catalogue of `software-vision.md` §9.1 and triggers a minor bump (§23).

**Projections**
- [ ] Which projections does the event invalidate? The graph? The search? The counters?
- [ ] Is the projection rebuildable from zero?

**Tests and documentation**
- [ ] A domain test with no I/O.
- [ ] An isolation test between subscriptions if the feature touches a new key.
- [ ] `CHANGELOG.md` updated in the same commit.
- [ ] The right document updated: a rule in `software-vision.md`, a mechanism here, a domain fact in `knowledge-base.md`.

---

## 23. Versioning strategy

Three layers, with distinct sources of truth. The operational bump flow is in `CLAUDE.md` § Versioning policy.

### 23.1 Layer 1: the product version (SemVer)

Source of truth: `CLAUDE.md` → Project identity → Base version. Propagated to every `package.json` and to `CHANGELOG.md`.

### 23.2 Layer 2: the contract version

Two contracts, with different rules:

| Contract | Versioning | A break means |
|---|---|---|
| **MCP** (public) | The tool catalogue is the contract. Removing a tool, renaming an argument or narrowing a return is **major** | Existing connectors stop working |
| **Internal API** (UI) | A `/v1` path prefix. Only the UI consumes it, so the migration is coordinated | A coordinated deployment of front and back |

Adding a tool, adding an optional argument or widening a return is **minor** in both cases.

### 23.3 Layer 3: the deployment version

Every CDK stack carries the tag `app:version` with the product version and `deploy:sha` with the commit. That is what makes it possible to answer "what was in production when this happened" from the environment itself.

---

## 24. The line between microservices and a modular monolith

The target design is microservices (D5). It is worth recording where the lever is, because hexagonal makes it cheap in both directions.

Contexts, aggregates, ports, adapters and folder structure are **identical** in both options. What changes:

| | Microservices (D5) | Modular monolith |
|---|---|---|
| Deployables | 6 Lambdas, 6 stacks, 6 tables | 1 Lambda, 1 stack, 1 table with prefixes per context |
| `AccessPolicy` | `HttpAccessPolicy` (network) | `LocalAccessPolicy` (in process) |
| Events | EventBridge | an in-process bus, the same `EventPublisher` interface |
| Cost | versioned contracts, distributed tracing, coordinated deployment | the boundary depends on discipline in CI |

**The swap is the `composition-root.ts` of each service**, and not a line of `domain/` or `application/` changes.

One caveat: **`svc-audit` is the only one that gains something real from physical separation**, because its restricted IAM role (§12.2) is what makes the log immutable. In a monolith, that guarantee would have to migrate to a table with a policy of its own and a dedicated role.

**The lever is pulled in 0.1.0:** the first version ships as a modular monolith with `svc-audit` apart, exactly the caveat above honoured. The split into six deployables happens when there is a reason for it (load, team, deployment cycle), and not before the first user. Since the cut line is the composition root, postponing charges no interest.

---

## 25. Recorded implementation decisions

Where the code diverges from the design described above, and why. Each of these decisions
was taken during construction, contradicts or extends something declared in an earlier
section, and still holds today.

- **The content index is a scan, not an inverted index** (§11.2). Under the ceiling of 2,000 notes per vault, scanning costs around 1,000 read units per query and saves keeping postings up to date on every write. The `ContentIndex` port is what makes swapping it for an inverted index, or for a managed service, an adapter change if the product ceiling ever rises.
- **Discovery keeps a projection of the vault structure of its own**, fed by vault and folder events. The Vault Context is answered from it, and querying Knowledge to get the vault name and the folder tree would invert the single direction of §3.1, which is what makes the projections rebuildable.
- **Discovery gained a sixth route, `GET /vaults/:v/graph`**, which returns the whole link graph of a vault. §14.1 declared only the tree from a note, under a depth ceiling, and this one answers a different question: the graph screen draws the whole vault, with no root. The link projection already held exactly that in the vault partition, so the route is a query by prefix and nothing new is stored. The edges come back as index pairs over the node list, and the ceiling of 2,000 nodes is declared in the answer, because a truncated graph claiming to be whole is worse than no graph.
- **The composition of the modular monolith lives in `memorysmith-backend/apps/core-monolith`**, and it is the only place that knows two contexts at once. The services still do not import each other, and the split into six deployables is a swap of that file (§24).

---

## 26. Where the build sequence and the technical risks live

This document describes **how the software is built**, and not in which order what is
missing will be built. The delivery order and the risks not yet addressed describe the
future, and that is why they left this file:

| What you are looking for | Where it is |
|---|---|
| Build order, deliveries, the scope of a version | The milestone of that version |
| Open technical risks, with the criterion that closes each one | Issues labelled `question` |
| What has been delivered, and when | `CHANGELOG.md` and the GitHub Releases |

The complete cycle, from the need to the merge, is in `development-process.md`.
