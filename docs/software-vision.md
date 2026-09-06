# Software Vision: the MemorySmith.app platform

This document is the source of truth for **what the product does and under which rule**. It describes the vision, the ubiquitous language, the subscription business model, the roles, the domain entities, the business rules (`RN-XXX`), the public MCP contract, the screens and the scope of each version.

Business rules are numbered `RN-{CONTEXT}-{NNN}`, where `CONTEXT` is the prefix of the bounded context the rule belongs to (§6). The codes are **append-only**: they are never renumbered nor reused, and a rule that stopped holding is marked as removed on its own line, keeping its number. The moment a number is reserved is in [`development-process.md`](development-process.md) §6.

For general facts of the domain (Markdown, MCP, auditing, data protection law), see [`knowledge-base.md`](knowledge-base.md). For how the product is built (keys, transactions, adapters, infrastructure), see [`architecture-guide.md`](architecture-guide.md). This document **does not repeat** the content of those two: it references them by section.

---

## Contents

1. [Product vision](#1-product-vision)
2. [Product principles](#2-product-principles)
3. [Ubiquitous language](#3-ubiquitous-language)
4. [Platform and subscriptions](#4-platform-and-subscriptions)
5. [Roles and permissions](#5-roles-and-permissions)
6. [Map of domains](#6-map-of-domains)
7. [Domain: Access](#7-domain-access)
8. [Domain: Knowledge](#8-domain-knowledge)
9. [Domain: Agent Access (the public contract)](#9-domain-agent-access-the-public-contract)
10. [Domain: Discovery](#10-domain-discovery)
11. [Domain: Audit](#11-domain-audit)
12. [Domain: Portability](#12-domain-portability)
13. [Application interface](#13-application-interface)
14. [Product limits](#14-product-limits)
15. [Where version scope, risks and open questions live](#15-where-version-scope-risks-and-open-questions-live)

---

## 1. Product vision

### 1.1 The problem

The focus of this software is to strengthen the **efficiency and effectiveness of the relationship between people and AI agents**, whatever AI platform is chosen and however large the team of people is.

**The memory of the work fragments in two directions at once.** A team runs a project: an audit, a regulatory process, a piece of research, a construction site, a product launch. None of that has to be software. Each person handles their part alongside an agent, and there is no AI platform of the team: one works in Claude, another in ChatGPT, a third in the assistant built into the tool they already used. The choice is personal, it changes over time, and there is no reason to make it uniform. That diversity would not be a problem if a shared layer of retention existed. Without one, the memory breaks along two dimensions at the same time:

1. **By time, the session.** The memory of the agent ends when the session ends, and the next conversation starts from zero, knowing about the subject only what fits in that window.
2. **By vendor, the silo.** What a platform retains about whoever uses it belongs to that platform and that person, does not leave it, and no agent of anyone else reads it.

Added together, the two produce as many partial and private memories as there are people multiplied by platforms, about work that is one single thing. What the team actually knows stays scattered across conversations, documents, spreadsheets, decision threads and the heads of whoever took part.

**The cost does not show up as a lost file. It shows up as three operational bottlenecks:**

1. **Rework from rebuilding context.** Every task starts by rebuilding the context, and the person spends more time redescribing to the agent what the team had already decided, slightly differently each time, than doing the work.
2. **Diverging premises.** Two people describe the same fact in two ways to their agents, and there is no central point to check which of the two versions holds.
3. **Erosion of trust.** The answer comes back without its source. Checking costs more than accepting, so it is accepted unchecked, and that is what erodes trust in everything the base comes to hold.

**The four practices that describe fluency in working with AI all degrade from the same root cause:** the absence of a shared body of knowledge, persistent and readable by both sides (*Delegation*, *Description*, *Discernment* and *Diligence*, detailed in `knowledge-base.md` §4.4). Without it, what gets delegated is the retyping of context instead of the task, the same scenario is described again every session, the answer is judged by plausibility instead of by source, and no trail is left to answer for what was produced. Hence the double requirement running through the product: the base has to be **cheap to write**, because whoever writes in it most is the agent during the work, and **cheap to read**, because the person has to curate and decide without switching tools.

**What is missing is a single source of truth, shared by people and agents**, that survives the session and belongs to no platform. It is built in three linked movements:

1. **Capture with evidence.** A norm, legislation, technical documentation, research, a decision taken in a meeting. What comes in records where it came from and who wrote it, human or agent, because a statement that cannot be traced to its source does not sustain a decision later.
2. **Curate.** Captured material is not knowledge yet. Someone has to judge what is worth keeping, reconcile what contradicts itself, connect the new to what already existed, and see what is mature and what is still a draft. Curation is human work assisted by an agent, never an automatic by-product of ingestion.
3. **Serve both sides with the same material.** The base is the source of truth for the agent, which reads it on every task instead of guessing, and the working surface for the person, who learns from it, corrects what is wrong and decides with it in sight. Two readers with different demands on exactly the same content.

**That source is alive.** It is neither the report written at the end nor the document frozen at the start: it grows and corrects itself while the project runs, and today's version is not the one from two weeks ago. That is the characteristic, not the defect, and it imposes the last requirement: the base has to be able to say what it said on the date someone decided based on it.

**Improvised arrangements for centralisation fail wholesale**, because they treat the base as a passive file repository and ignore what collaboration between people and agents demands:

1. **A monolith of information, with no granularity.** Concentrating knowledge in long documents charges both sides. For the person, search and reading become slow and inflexible. For the agent, long text fills the context window with noise, makes the evidence hard to locate, and prevents linking concept, decision and reference precisely (`knowledge-base.md` §4.1 and §5.3).
2. **Proprietary format and visual rigidity.** A document formatted for presentation, such as a PDF, a slide deck or a complex spreadsheet, makes structured context hard to extract and to write, and blocks interconnection between pieces of information (`knowledge-base.md` §1.4).
3. **Access incompatible with an agent.** Without a standard connector, the agent does not navigate the network of information, does not follow a dependency, does not validate metadata and does not write into the base autonomously and safely (`knowledge-base.md` §3.1).
4. **No governance metadata.** The layer of instruction that tells people and agents how to read and how to update the content is missing, and so are the date, the maturity (draft or settled) and the explicit authorship of each passage. Without those the base becomes a pile, and a pile induces error, hallucination and loss of traceability (`knowledge-base.md` §2.3 and §7.3).

**The arrangement that comes closest today, and where it stops.** The flow that already works is a local folder of `.md` files, with a document at the root explaining to the agent how to write in it, and a vault editor on top for navigating. It gets the essentials right, the format is readable by both sides and the structure is declared, but it belongs to one person and stops at three predictable points (detailed in `knowledge-base.md` §2.5):

1. **Collaboration:** the content is local, and two people do not work on the same body of knowledge.
2. **Shared navigation:** vault editors are local clients, poor as clients of a remote repository.
3. **Multiple vaults:** separating subjects requires loose folders, with no place listing them.

To those three add what the local folder never had and what curating and deciding actually require: a record of who wrote each thing, when, and with which agent.

### 1.2 The solution

**Knowledge vaults in Markdown, with declared structure, natively reachable by AI tools.**

MemorySmith.app is the remote knowledge infrastructure that sustains the persistence of context: vaults in plain Markdown, with declared structure, natively operable by AI agents and by people. It is the remote backend of the flow that already works, because it keeps the format (plain Markdown), keeps the practice (a Guidance at the root, a Template per folder) and solves the three points where the local folder stops, adding the four capabilities no improvised arrangement has:

- **Authenticated remote access.** One vault reached by several clients and agents, under a verified identity (§4).
- **Collaboration with roles.** Permission by role in the subscription and a per-vault role ceiling, holding equally for people and for agents (§5).
- **Auditable and immutable history.** Every change traceable to who wrote it, with which agent, and what the note said before (§11).
- **Relational and curation-driven discovery.** A graph of links over atomic notes, search over the text of the vault, and facets showing the distribution of the content (§10).

#### Interoperability through the protocol

Against fragmentation by vendor the product acts at the protocol layer, and not by adopting a proprietary tool: the vault is served by a remote MCP server, and MCP is an open standard spoken by clients from different makers (`knowledge-base.md` §3.5). Each person stays on the AI platform they prefer, and all of them reach the same vault, with the same content, under the same role and on the same version of the truth.

#### The concept

The name says the rest. A forge does not store metal, it works it: the raw material, which here is data, norms and decisions, goes in and comes out as a piece, hammered and checked while it is hot. That is the role of the product over the memory of a team, which is forged during the work, by people and agents over the same material, and not transcribed after the work is done.

### 1.3 The cycle of use

The agent acts in both directions: it reads the vault and it **feeds** it. The three movements of §1.1 appear here as the concrete case the product serves:

1. **Ingestion.** The agent reads a body of raw material, such as norms, legislation, technical documentation or research, and turns it into granular notes inside the vault, obeying the Guidance (what this vault is), the folder structure (where each thing goes) and the Template of the folder (how the note is shaped). Every write records who made it, with which agent, and what the note said before (§11).
2. **Curation.** People review what came in and drive the corrections, and the interface is where they read: the note and the structure as the agent receives them, the distribution of the vault through the curation panel (§10.3), and the count of pending links and orphan notes in the catalogue (§13).
3. **Consumption.** Later, at another moment of the project, such as an audit, an opinion or a report, agents and people use the same vault as the single source of truth to ground what they deliver.

**Three principles the cycle imposes on the whole product:**

- **Writing through the protocol is the primary path of ingestion.** Whoever populates the vault is the agent, by construction. Writing is not a secondary feature exposed by the internal API.
- **The Guidance, the folder structure and the Template are executable instructions, not documentation** (`knowledge-base.md` §4.2). They are what makes the agent write the right note, in the right folder, in the right shape. A weak Guidance or a vague folder description degrades the quality of what comes in, and the effect only shows up later, at consumption.
- **Governance and provenance are by design.** The vault sustains regulated and auditable work, so authorship and temporal traceability are a premise of the system (§11), and not compliance bolted on afterwards.

### 1.4 The thesis, in one sentence

The product is not storing `.md`, it is **delivering structured context to the agent without friction**. If consulting a hosted vault costs more effort than reading a local folder, the value proposition is compromised. That is why MCP is not an accessory: it is the primary integration layer, and the internal API exists to serve the interface.

The complementary pillar of the same thesis is human reading and curation. A base a person cannot navigate and validate stops being curated, and a base without curation loses the ability to serve as a trustworthy source for the agent (§13).

### 1.5 Value proposition

| Audience | The central pain | What the product delivers |
|---|---|---|
| Whoever works with an agent over a body of knowledge | Improvised arrangements are static, isolated or expensive to consult | A remote vault in plain Markdown, natively connected to the AI client |
| A team working with agents every day | Every new session rebuilds the context by hand | A shared memory between people and agents, written during the work and read on every task |
| A team where each person uses the AI platform they prefer | The vendor silo prevents sharing the context | One remote MCP server: the same vault, with the same role, in any client that speaks the protocol |
| Teams sharing one base | Syncing files solves neither concurrent editing nor access control | A subscription with roles, and writing with conflict detection |
| Regulated work (audit, legal, compliance) | There is no way to show which premises grounded a past opinion | History by revision, authorship of human and agent, an immutable trail |
| Whoever has many subjects | Loose folders, with no catalogue | A catalogue of vaults with descriptions, each one autonomous |
| Whoever fears lock-in | The base is a long-term asset, and a proprietary format traps it | Export of plain `.md`, with no proprietary format |
| Whoever has a sovereignty requirement over where the data lives | Hosting with a third party is a decision that does not rest on technology alone | The whole backend runs in the AWS account of whoever installed it, on the same code (§4.9) |

### 1.6 Slogan

**Structured knowledge, natively readable and writable by humans and agents.**

---

## 2. Product principles

Decisions that hold for the whole product and that any new feature has to answer to. The corresponding engineering principles are in `architecture-guide.md` §2.

| # | Principle | Practical consequence |
|---|---|---|
| **PP1** | **In the end it is all Markdown** | The backend organises and serves; it does not generate Markdown from a typed schema, and it does not impose structure on the content |
| **PP2** | **An autonomous vault** | Each vault describes itself in its own Guidance. No inheritance between vaults and therefore no links between vaults |
| **PP3** | **A mould is a suggestion, not a contract** | The Template guides the writing; a note is not required to follow it, and the server does not validate against it |
| **PP4** | **The backend does not interpret the content** | What goes inside a note, frontmatter included, is decided by the Guidance and the Template. The backend reads only universal Markdown syntax (links, headings), never a vault convention. The two sanctioned exceptions live in Discovery projections: the link extractor and the facet extractor (§10.3), which aggregate without assigning meaning and never feed a rule of the core |
| **PP5** | **Discovery is derived** | The graph, the search and the facets are never the source of truth; they are rebuildable from the `.md` files |
| **PP6** | **The past is immutable** | Deleting a note does not destroy the history. Destroying content is a recorded administrative act, never a side effect |
| **PP7** | **Portable by construction** | Export returns plain `.md` in a readable file tree, with no proprietary format |
| **PP8** | **A complete model, a progressive interface** | Subscriptions, roles and links exist from the first line; the UI only shows each one when the user reaches the case that requires it |
| **PP9** | **Order is signal, not decoration** | The order of folders and notes is content: it is what tells the agent where to start. That is why it is editable and why it survives even the export |
| **PP10** | **An error is interface** | Every refusal returned to the agent has to say what to do next: a missing argument returns the valid options, and a conflict returns the current content |

---

## 3. Ubiquitous language

One term per concept, from the code to the product. Divergence here is the beginning of every anaemic model. These terms appear in the code exactly as they are in the "Term" column.

| Term | Means | Do **not** confuse with |
|---|---|---|
| **Subscription** | The subscription: the isolation boundary, the unit of collaboration, the unit of billing and the root of everything. It has an owner, members and a state | A user account |
| **Platform Admin** | Whoever operates the platform and authorises subscriptions. **It is not a role inside any subscription** and it does not reach content | Owner, customer administrator |
| **Owner** | The holder of the subscription: responsible for payment, invites and removes members, edits everything. One per subscription | An editor with many rights |
| **Vault** | A self-describing knowledge vault | A repository, a root folder |
| **Guidance** | The **role** of "what this vault is for and how to structure its notes", played by a document the vault points at | A file named `GUIDANCE.md` |
| **Folder** | An ordered node of the vault tree, with a `description` saying *what is kept there*. The description is an attribute of the folder, never a Content Slot | A physical directory (there is none), a folder document |
| **Template** | The **role** of "the suggested layout of the notes of this folder", played by a document the folder points at | A schema, validation, a file named `TEMPLATE.md` |
| **Note** | A Markdown document; what goes inside it is decided by the Guidance and the Template | A record, a typed entity |
| **Position** | The key that orders siblings: folders among folders, notes within a folder | A dense index, an `order` field |
| **Link** | A reference from one note to another, extracted from the Markdown | An external hyperlink |
| **Edge** | A link already resolved to a target `NoteId` | A pending link |
| **Pending Link** | A link whose target does not exist yet; it resolves on its own when the target note is created | A broken link |
| **Facet** | A frontmatter attribute that can be aggregated for curation: the standard `maturity` and `reviewed`, plus whatever the Guidance of the vault defines, discovered by the shape of the value | A typed backend field, a note schema |
| **Authorship** | Who wrote: the human **and** the agent used | The logged-in user |
| **Revision** | The exact content of a note at one instant | An event, a change |
| **Audit Event** | An append-only record of what happened, with authorship and revision | An application log |
| **Vault Context** | A composed document (the Guidance plus the annotated tree) delivered to the agent. It is derived on every call and never stored | A dump of the vault, a document somebody edits |
| **Content Slot** | A stored Markdown document, addressed by an opaque identifier. A note, a guidance and a template are the **same** kind of thing; what differs is who points at it | A file, a path |
| **Content Role** | The meaning assigned to a slot: `body` (a note), `guidance` (a vault) or `template` (a folder) | A reserved file name |
| **Subscription Link** | The `(user, subscription)` relation that authorises that user to act in that subscription | Membership |
| **Active Subscription** | The subscription the session acts on behalf of right now, chosen among the links | The set of the user's subscriptions |
| **Membership** | The `(user, subscription)` relation with the role `EDITOR` or `VIEWER` | A Subscription Link, which only says the user reaches the subscription |
| **Vault Role Limit** | The role ceiling of a member in a specific vault. It only lowers, never promotes | A role of the vault's own |

---
## 4. Platform and subscriptions

### 4.1 Overview of the model

The subscription is not a feature: it is the shape of the product. A customer is a **Subscription**, and inside it people collaborate on **Vaults**.

```
Subscription  (boundary of isolation, collaboration, billing and identity: one owner, members, one state)
└── Vault  (the knowledge itself, autonomous, PP2)
    ├── Guidance
    └── Folder (ordered, with a description)
        ├── Template
        └── Note (ordered)
```

**Above the subscription there is only the platform**, operated by the `PLATFORM_ADMIN`. It is not a level of the data hierarchy: it is a separate surface, which authorises subscriptions and never reaches content (§4.6).

### 4.2 The subscription is the boundary, the status is the state

The subscription carries two roles that are usually kept apart: it is the business object (who pays, on which plan, with which status) **and** the isolation boundary of all the data. That is only safe under one rule:

> **The `SubscriptionId` is perpetual.** It is issued once, never reissued and never changed, whether the subscription is pending, active, suspended or cancelled. Cancelling changes a status field; it does not move, does not rekey and does not delete anything. Re-subscribing reactivates **the same subscription**, with the same identifier, and all the data becomes reachable again exactly where it was.

Without that rule, "cancelling" would become a data migration and "re-subscribing" an import, and the isolation boundary would come to depend on a state that changes. With it, the status governs **access**, never **address**.

**The subscription has no name** (RN-SUB-020): what identifies it is the `SubscriptionId`, and who answers for it is its owner. A name would be one more field to keep up to date with nothing keeping it honest, and it would distinguish nothing the owner's e-mail does not already distinguish.

Besides its status, the subscription declares **what it is and how much it may hold**: a `type`, which at this stage can only be `individual`, and a storage `quota`, which is `500MB`, `1GB` or `2GB` (RN-SUB-018, RN-SUB-019). Both are chosen when the subscription is requested and can be changed later by an act of the `PLATFORM_ADMIN`.

The quota **is enforced** (RN-SUB-021). What it measures is the **current content**: the current revision of every note not deleted, plus every `Guidance` and every `Template`. Replaced revisions remain stored, because destroying bytes is an administrative act with a door of its own, and they deliberately do not count: charging for them would make usage rise on every edit and never fall, and deleting a note would give nothing back. A vault in the bin keeps occupying what it occupies, for the same reason, and because it comes back whole when restored.

What the quota refuses is only what **grows** the current content. Creating a note, lengthening one, writing a bigger `Guidance` and restoring a deleted note are refused with `LIMIT_EXCEEDED` when they do not fit; reading, deleting, moving, reordering and shortening keep working even above the ceiling. The reason is simple: a limit that freezes everything traps the person inside it, unable to shorten the very note that took them there.

### 4.3 Hierarchy, and why it has two levels

| Level | Who is in charge | Exists for |
|---|---|---|
| **Subscription** | `OWNER` (one, the holder) and the members `EDITOR` · `VIEWER` | Isolation, collaboration, billing, identity domain |
| **Vault** | inherits the role from the subscription, with an optional ceiling (§5.3) | The knowledge itself |

**A conscious decision, with a declared cost.** There used to be a third level between the two, the workspace, and it was removed. It solved one case: two teams of the same customer that must not see each other. Without it, whoever is a member of the subscription reaches all its vaults, and the only granularity left is the per-vault ceiling, which lowers writing but never hides. Separating two groups now requires **two subscriptions**, and therefore two bills. The cost was weighed and accepted: one level fewer is worth more to whoever uses the product alone or in a single team, which is the case the product serves first, than the granularity would be worth for the case it does not serve yet.

### 4.4 Onboarding and the life cycle of a subscription

There is no automatic payment processing at this stage. Activation is an **administrative act** of the `PLATFORM_ADMIN`, which keeps the model complete while billing does not exist.

| Moment | What happens |
|---|---|
| **Signup** | Creates the user account. No subscription yet, no operational access. There is no open sign-up at this stage: the account is born by an act of platform operations |
| **Onboarding** | The user requests a subscription, choosing type and quota, and becomes its `OWNER`. Status: `pending_approval` |
| **Authorisation** | A `PLATFORM_ADMIN` approves (the status becomes `trial` or `active`) or rejects, with a mandatory reason |
| **Setup** | The `OWNER` creates vaults and writes the Guidance and the Templates |
| **Invitation** | The `OWNER` issues an invitation addressed to an e-mail, setting `EDITOR` or `VIEWER`. The product does not deliver the invitation: whoever invites passes the link on however they like |
| **Acceptance** | The invitee gains a link to that subscription. **It creates no subscription of their own and they pay nothing** |
| **Leaving** | Removing a member revokes access; the account, the other links and the authorship of what they wrote remain |
| **Suspension / cancellation** | Operational access ceases; the data stays under the same key (§4.2) |

**Subscription states:**

```
                    ┌──────────────┐
   onboarding ─────▶│pending_approval│
                    └───┬────────┬─┘
               approval │        │ rejection (reason required)
                        ▼        ▼
             ┌───────────────┐  ┌──────────┐
             │ trial │ active│  │ rejected │──▶ may request again
             └───┬───────────┘  └──────────┘
                 │
                 ├──▶ suspended  ──▶ back to active
                 └──▶ canceled   ──▶ back to active (same subscription, §4.2)
```

### 4.5 One user, more than one subscription

Whoever onboards is the holder of their subscription; whoever accepts an invitation from another organisation starts taking part in a second one. Since the subscription is the isolation boundary, this is not an interface detail.

- **Identity is global; a subscription is a link.** The user account belongs to no subscription. Taking part is a relation with a role of its own in each one.
- **The active subscription is chosen, not inferred.** The session acts on behalf of one subscription at a time, and switching is an explicit action.
- **The MCP connector fixes the subscription at consent.** It enters the connector's access the moment the user authorises it and does not change for the life of that access. Without that rule, an agent with a long session would switch subscriptions in the middle of an ingestion job, and the half already written would be in the wrong place. One connector, one subscription; whoever works in two authorises two connectors.

### 4.6 The platform is a separate surface

The `PLATFORM_ADMIN` operates the platform: it approves, rejects and suspends subscriptions. **It is not a role inside any subscription** and, by construction, it does not reach content:

> A platform session **carries no active subscription**. Since every data key of the system starts with the subscription, there is no key an admin credential can assemble. The impossibility is structural, not a check somebody has to remember to write.

What it sees is subscription metadata: the owner, the e-mail, the status, the type, the quota, the dates and the member count. Never a vault name, never note content.

It also has **two administrative operations**, which exist to operate an environment and not for the review flow: setting the status directly, without going through the transition machine of §4.4, and changing the type and the quota (RN-SUB-018, RN-SUB-019). Both are recorded as events of their own, distinct from the approval, rejection, suspension and reactivation events, precisely because they were not the common path: the trail has to say which of the two happened.

If a `PLATFORM_ADMIN` is also a user of some subscription, they act there like any other member, in a session of their own. The two roles never add up in the same session.

### 4.7 Progressive interface (PP8)

**The UI hides the member list while there is only the owner, and hides subscription switching while there is only one link.** The model is complete from the start, and it is the interface that appears in stages.

### 4.8 Business rules: subscription and isolation

- **RN-SUB-001:** Every piece of data in the system belongs to exactly one subscription; there is no data shared between subscriptions.
- **RN-SUB-002:** The subscription a request operates under is determined by the authenticated credential, never by a request parameter.
- **RN-SUB-003:** No query may return data from more than one subscription. Two questions cross the boundary and they are the only ones: *"which subscriptions does this user take part in?"* and the administrative listing of subscriptions by status. Neither reveals content.
- **RN-SUB-004:** A resource of another subscription is indistinguishable from a resource that does not exist: both answer `NOT_FOUND`.
- **RN-SUB-005:** The `SubscriptionId` is perpetual: issued once, never reissued, immutable across every status transition. Cancellation and reactivation use the same identifier.
- **RN-SUB-006:** Signup creates only the user account. No subscription is created automatically and no operational access is granted.
- **RN-SUB-007:** A subscription in `pending_approval`, `rejected`, `suspended` or `canceled` grants operational access to nobody, not even to its own `OWNER`, and not over MCP.
- **RN-SUB-008:** Only a `PLATFORM_ADMIN` approves, rejects, suspends or reactivates subscriptions.
- **RN-SUB-009:** Rejection requires a reason, which is communicated to the requester; they may request again.
- **RN-SUB-010:** Approval sets the status to `trial` or `active`, at the discretion of the `PLATFORM_ADMIN` according to the commercial agreement.
- **RN-SUB-011:** A user may be linked to multiple subscriptions; exactly one is the active subscription of the session.
- **RN-SUB-012:** One of the links is marked as the default and is assumed when no valid active subscription is found.
- **RN-SUB-013:** Switching the active subscription is an explicit user action; no business operation takes the subscription as an argument.
- **RN-SUB-014:** An authorised MCP connector always operates on the subscription fixed at the moment of consent, for the whole life of that authorisation.
- **RN-SUB-015:** Derived indexes (search, graph, facets, cache) respect the same subscription boundary as the source data.
- **RN-SUB-016:** A `PLATFORM_ADMIN` session carries no active subscription and therefore reaches no vault or note data.
- **RN-SUB-017:** Accepting an invitation creates no subscription for the invitee: they start acting inside the subscription of whoever invited them.
- **RN-SUB-018:** Every subscription declares a `type`, chosen at request time, whose only value at this stage is `individual`. Only a `PLATFORM_ADMIN` changes the type afterwards, and it is also the `PLATFORM_ADMIN` who may set the status directly, without following the transition machine of §4.4. A status set that way is recorded as an event of its own, and setting `rejected` through that path does not satisfy RN-SUB-009: rejecting a request somebody is waiting on still requires a reason.
- **RN-SUB-019:** Every subscription declares a storage `quota`, chosen at request time among `500MB`, `1GB` and `2GB`, and changeable later by a `PLATFORM_ADMIN`. It is enforced under the terms of RN-SUB-021. *(Up to 0.2.0 this rule said the quota was declared and not enforced.)*
- **RN-SUB-021:** The `quota` of RN-SUB-019 is enforced over the **current content** of the subscription: the current revision of every note not deleted, plus every `Guidance` and every `Template`. Replaced revisions stay stored and are not counted. A write that increases that total is refused with `LIMIT_EXCEEDED` when the resulting total would exceed the quota; a write that reduces it or keeps it the same is always accepted, even above the ceiling. The count is kept outside the write transaction and is therefore slightly delayed: a subscription may end up a little above the ceiling, never indefinitely above it.
- **RN-SUB-020:** The subscription has no name. It is identified by the `SubscriptionId`, and to whoever operates it, it is recognised by the owner's e-mail. No screen, route, event or storage item carries a subscription name.
- **RN-SUB-022:** A session whose token can no longer be renewed is **ended**, and the person returns to the sign-in screen with the message of their case. The browser never keeps a credential the provider or the API has refused, and no screen presents a request that has already failed as a wait: a failure to authenticate is the absence of a session, never a session with less in it.

---

### 4.9 Modes of operation

The product runs in **two modes over the same code**, and what differs between them is not functionality: it is who occupies each role.

In the **hosted service**, the `PLATFORM_ADMIN` is product operations, and the quota of the subscription is its commercial limit.

In a **self-hosted install**, whoever operates the platform is whoever installed it. The first member of the administration group is born in the onboarding of the install, and only the first. The quota stops being a commercial limit and becomes a choice of whoever operates it.

**In neither of them is any capability held back.** There is no edition fork anywhere in the code, so what runs on the hosted service is exactly what is in the repository, under the MIT licence. The step-by-step install path lives in `README.md`, not here.

---

## 5. Roles and permissions

### 5.1 Taxonomy

Four roles, on two planes that never mix in the same session:

| Role | Plane | Granted to | Count |
|---|---|---|---|
| `PLATFORM_ADMIN` | Platform | Whoever operates the service | Several |
| `OWNER` | Subscription | The holder, set at onboarding | **Exactly one per subscription** |
| `EDITOR` | Subscription | An invitee who writes | Several per subscription |
| `VIEWER` | Subscription | An invitee who only reads, an external reviewer included | Several per subscription |

The three customer roles belong to the **subscription**. The `OWNER` reaches all of its vaults without having to be invited to each one, and `EDITOR` and `VIEWER` reach all the vaults with the role they hold, as far as the ceiling of each vault allows (§5.3). A user has **one** role per subscription, not one role per slice.

**Transfer.** The `OWNER` may transfer ownership to another member of the subscription, and from then on becomes an `EDITOR`. The subscription is never left without a holder, because the transfer is atomic and is not "remove and then appoint".

### 5.2 Permission matrix

| Action | `PLATFORM_ADMIN` | `OWNER` | `EDITOR` | `VIEWER` |
|---|:---:|:---:|:---:|:---:|
| Approve / reject / suspend a subscription | ● | — | — | — |
| See subscription metadata (owner, status, dates) | ● | ●¹ | — | — |
| Invite a member, change a role, remove a member | — | ● | — | — |
| Set the role ceiling of a member in a vault (§5.3) | — | ● | — | — |
| Transfer ownership of the subscription | — | ● | — | — |
| Create a vault | — | ● | ● | — |
| Rename / delete a vault | — | ● | — | — |
| Create / edit / delete a note | — | ● | ● | — |
| Create / rename / move / reorder a folder | — | ● | ● | — |
| Edit the Guidance and the Template | — | ● | ● | — |
| Move a note between vaults | — | ● | ●² | — |
| Read the vault, folders, notes | — | ● | ● | ● |
| Search | — | ● | ● | ● |
| See the graph, backlinks and vault health | — | ● | ● | ● |
| See history and activity | — | ● | ● | ● |
| Export a vault | — | ● | ● | — |

¹ Of their own subscription only.
² Only when the `EDITOR` reaches both vaults involved with a writing role, which includes not being demoted in either of them (§5.3).

**The `PLATFORM_ADMIN` column is almost entirely empty, and that is the guarantee, not a gap** (§4.6). It operates the platform; the knowledge of the customers is out of its reach by construction.

### 5.3 Per-vault role ceiling

A subscription may hold vaults of differing sensitivity. For that the `OWNER` may **lower** the role of a member in a specific vault.

**The effective permission is always the lesser of the subscription role and the vault ceiling. It never promotes.**

| Role in the subscription | Ceiling in the vault | Effective |
|---|---|---|
| `EDITOR` | — (none) | `EDITOR` |
| `EDITOR` | `VIEWER` | `VIEWER` |
| `VIEWER` | — (none) | `VIEWER` |
| `VIEWER` | `VIEWER` | `VIEWER` |
| `VIEWER` | `EDITOR` | **refused**, because the ceiling does not promote |

There is only one ceiling value: `VIEWER`. There is no "no access", because **whoever is a member of the subscription sees all of its vaults**; what the ceiling controls is writing, not seeing. Taking a vault out of someone's reach requires a separate subscription (§4.3), which keeps the question "who sees what" answerable by looking at the member list alone.

The ceiling does not apply to the `OWNER`: they hold the subscription and reach everything.

### 5.4 Access business rules

- **RN-ACC-001:** Every subscription has, at any instant, exactly one `OWNER`. Removing the `OWNER` is refused; the only way out is a transfer of ownership.
- **RN-ACC-002:** The transfer of ownership is atomic: the new holder becomes `OWNER` and the previous one becomes `EDITOR` in the same operation.
- **RN-ACC-003:** The e-mail is unique among the members of a subscription.
- **RN-ACC-004:** A pending invitation grants no access; only acceptance creates the member.
- **RN-ACC-005:** The invitation is single-use, bound to the e-mail it addresses, and expires in 7 days.
- **RN-ACC-006:** Only the `OWNER` invites, changes roles, removes members and sets vault ceilings. An `EDITOR` does not invite.
- **RN-ACC-007:** *(removed)* It covered the creation, renaming and removal of workspaces. The workspace level no longer exists (§4.3). The number is preserved and will never be reused.
- **RN-ACC-008:** An invitation may only be issued by a subscription with status `trial` or `active`.
- **RN-ACC-009:** Removing a member revokes access to the subscription and fully preserves what they wrote, the recorded authorship included.
- **RN-ACC-010:** A `VIEWER`, whether by subscription role or by vault ceiling, is refused on any write operation, through the UI and through MCP alike.
- **RN-ACC-011:** The per-vault role ceiling only lowers. Setting a ceiling higher than the member's role in the subscription is refused with `VALIDATION`.
- **RN-ACC-012:** The only admitted ceiling value is `VIEWER`; there is no ceiling that removes visibility of the vault.
- **RN-ACC-013:** The vault ceiling does not apply to the `OWNER`.
- **RN-ACC-014:** Removing a member from the subscription also removes all of their vault ceilings.
- **RN-ACC-015:** Every authorisation decision is taken by the service that owns the resource, combining the user's role in the subscription with the ceiling of the vault.
- **RN-ACC-016:** Role changes, ceiling changes and removals may take up to 5 minutes to take effect on already authenticated sessions, because the authorizer decision is cached for that long.

---

## 6. Map of domains

Six bounded contexts. The separation is one of responsibility and vocabulary; the deployment shape is an engineering decision (`architecture-guide.md` §3 and §17).

| Context | Responsibility | Type | `RN` prefix |
|---|---|---|---|
| **Access** | Subscriptions and their life cycle, members, roles, vault ceilings, invitations, links, authorisation | Supporting | `SUB`, `ACC` |
| **Knowledge** | Vaults, guidance, folders, order, templates, notes | **Core** | `KNW` |
| **Discovery** | The link graph, the text index and the curation facets, three projections | Supporting | `DSC` |
| **Audit** | The append-only trail: authorship, revisions, reconstruction by date | Supporting | `AUD` |
| **Agent Access** | The MCP server; composes the Vault Context; translates domain ↔ tools | Supporting (anticorruption layer) | `AGT` |
| **Portability** | Export to a readable file tree | Generic | `PRT` |

The prefix is that of the context the rule belongs to. **Access carries two**, because it separates what belongs to the boundary from what belongs to whoever enters it: `SUB` for the subscription, its life cycle and isolation, `ACC` for members, roles, ceilings and invitations. No prefix is retired when a context changes shape, because the codes already issued stay referenced.

**Knowledge is the core domain**, because that is where the rule no competitor solves for free lives: declared structure, meaningful order, content roles and cheap concurrent writing. Everything else exists to serve it or to carry it.

**Discovery, Audit and Portability are never consulted by Knowledge.** They only feed on what it publishes. That single direction is what makes it possible to rebuild them from zero (PP5).

---
## 7. Domain: Access

### 7.1 Entities

#### Entity: `User` (global identity)

```
id,                          -- global identity; belongs to no subscription
email, name,
is_platform_admin (bool),    -- platform plane; never adds to a subscription role (section 4.6)
created_at, last_login?
```

#### Entity: `Subscription` (Aggregate Root)

```
id,                          -- PERPETUAL: issued once, never reissued (RN-SUB-005)
                             -- it has no name: what identifies it is the id, and who
                             -- answers for it is the owner (RN-SUB-020)
owner_id,                    -- exactly one, always present (RN-ACC-001)
status (pending_approval | trial | active | rejected | suspended | canceled),
type (individual),           -- what the subscription is, commercially (RN-SUB-018)
quota (500MB | 1GB | 2GB),   -- enforced over the current content (RN-SUB-019, RN-SUB-021)
requested_at,
reviewed_by_id?, reviewed_at?,
rejection_reason?,           -- required when status = rejected (RN-SUB-009)
created_at,
members: [{
  user_id,
  email,                     -- unique among the members of the subscription (RN-ACC-003)
  role (EDITOR | VIEWER),    -- OWNER is not a member: it reaches everything by ownership
  invited_by_id,
  joined_at
}]
```

The `status` field governs **access**, never **address** (§4.2). No status transition moves or rekeys any data.

#### Entity: `SubscriptionLink` (§4.5)

```
user_id, subscription_id,
is_owner (bool),
is_default (bool),
joined_at
```

#### Entity: `VaultRoleLimit`, the per-vault ceiling (§5.3)

```
vault_id, user_id,
limit (VIEWER),              -- the only admitted value (RN-ACC-012)
set_by_id, set_at
```

It lives next to the vault, not next to the member: whoever knows which vaults exist is Knowledge, and the authorisation decision has to be local (`architecture-guide.md` §14.2).

#### Entity: `Invite`

```
id, subscription_id,
invitee_email,
invitee_role (EDITOR | VIEWER),
invited_by_id,               -- always the OWNER (RN-ACC-006)
token,                       -- single use
status (pending | accepted | expired | revoked),
sent_at, expires_at, accepted_at?
```

### 7.2 Business rules

The Access rules are in §5.4 (`RN-ACC-XXX`), next to the permission matrix and the per-vault ceiling they govern. The subscription and isolation rules are in §4.8 (`RN-SUB-XXX`).

---

## 8. Domain: Knowledge

The core. Four concepts: the vault, the folder tree, the note and the content.

### 8.1 Entities

#### Entity: `Vault` (Aggregate Root)

Consistency boundary: the vault and **its whole folder tree**.

```
id, subscription_id,
name, slug,                  -- slug unique within the subscription (RN-KNW-032)
description,                 -- what shows up in the vault catalogue
guidance_ref?,               -- pointer to the Content Slot playing the Guidance role
version,                     -- concurrency control of the aggregate
created_by (Authorship), created_at, updated_at
```

#### Entity: `Folder`, part of the `Vault` aggregate

```
id, vault_id,
parent_folder_id?,           -- null = root of the vault
name, slug,
description,                 -- REQUIRED, 1 to 500 characters: it is what guides the agent
position,                    -- order among sibling folders
template_ref?,               -- pointer to the Content Slot playing the Template role
created_by (Authorship), created_at, updated_at
```

#### Entity: `Note`, a separate Aggregate Root

```
id, vault_id, folder_id,
title, slug,
position,                    -- order within the folder
body_ref,                    -- pointer to the Content Slot playing the body role
created_by (Authorship),
updated_by (Authorship),
deleted_at?, deleted_by?,    -- soft delete
version                      -- concurrency control
```

`Note` is an aggregate of its own and not part of the `Vault`. The technical justification is in `architecture-guide.md` §6.2; the product consequence is what matters here: **writing a note is cheap and concurrent**, which is the path through which the agent feeds the vault.

#### Entity: `ContentSlot` and `ContentRef`

A Content Slot is a Markdown document stored under an opaque identifier. **A note, a guidance and a template are the same kind of thing**; what differs is who points at it and with which role.

```
ContentSlot:  content_id, subscription_id, created_at
ContentRef:   content_id, revision, sha256, bytes
```

| Role (`Content Role`) | Pointed at by | Field |
|---|---|---|
| `body` | A note | `body_ref` |
| `guidance` | A vault | `guidance_ref` |
| `template` | A folder | `template_ref` |

From that follows the most counterintuitive product rule of the system: **`GUIDANCE.md` and `TEMPLATE.md` are not file names, they are roles.** There is no reserved name in storage. File names only come back into existence at the edge, in the export (§12) and in the UI.

Four similar things live together here, and mixing them up is expensive:

| What it is | Where it lives | Who writes it |
|---|---|---|
| **Guidance** | A Content Slot pointed at by `guidance_ref`, with a revision and history | A human |
| **The folder description** | The `description` attribute of the folder, 1 to 500 characters, with no revision | A human |
| **Vault Context** | Nowhere: it is composed on every read (§9.2) | The product, deriving |
| **`GUIDANCE.md`, `STRUCTURE.md`, `TEMPLATE.md`** | Only at the edge: in the export (§12) and never in storage | The product, materialising |

None of those file names appears in the interface or on the MCP surface. There, only the role and the composed document exist.

That makes trivial the operations that would otherwise be special-cased code: promoting a note to the template of the folder, turning a template into a note, adopting the content of a note as the guidance of the vault. All of them are a pointer swap.

#### Value: `Position`

The order of folders and notes is **content, not a display preference** (PP9): it is a signal to the agent about where to start and how the subject is organised. That is why it is editable, why it is preserved in the Vault Context and why it survives the export.

Alphabetical ordering stays available as a display option in the client, without changing the stored order.

### 8.2 Business rules: vault and structure

- **RN-KNW-001:** Every vault belongs to exactly one subscription, and to one only.
- **RN-KNW-002:** The `slug` of a folder is unique among its siblings (same parent, same vault).
- **RN-KNW-032:** The `slug` of the vault is unique **within the subscription**, because that is how the interface addresses the vault. Creating a vault whose name yields an already used `slug` answers `ALREADY_EXISTS` **with the identifier of the existing vault**, and never creates a second one, for the same reason as RN-AGT-004: the server does not generate an automatic suffix. Renaming to a taken `slug` gets the same refusal. Without that rule, two vaults with the same name share an address and the second one becomes unreachable.
- **RN-KNW-003:** The maximum depth of the folder tree is 6 levels.
- **RN-KNW-004:** Moving a folder may never create a cycle: the destination may not be a descendant of the source.
- **RN-KNW-005:** Every folder has a `position` ordering it among its siblings; every note has a `position` ordering it within the folder.
- **RN-KNW-006:** The `description` of a folder is required, between 1 and 500 characters. An empty description is not accepted, because it is what guides the writing of the agent.
- **RN-KNW-007:** Removing a folder that contains folders or notes requires an explicit removal policy (`CASCADE` or `REJECT_IF_NOT_EMPTY`). There is no implicit default.
- **RN-KNW-008:** A vault has at most one Guidance and a folder at most one Template; both are optional.
- **RN-KNW-009:** Renaming, reordering or moving a folder or a note never changes the stored content, only pointers and order.
- **RN-KNW-010:** A vault supports up to 200 folders and 2,000 notes. Above the folder ceiling, the Vault Context is truncated with an explicit notice.

### 8.3 Business rules: the note

- **RN-KNW-020:** The `slug` of a note is unique **within the vault**, and not within the folder, because that is how links resolve (§10.1).
- **RN-KNW-021:** Moving a note between folders of the same vault never produces a slug conflict.
- **RN-KNW-022:** Moving a note between vaults requires an explicit policy for a slug collision (`REJECT` or `RENAME`).
- **RN-KNW-023:** Moving a note between vaults preserves the `NoteId` and, with it, the whole timeline of the note.
- **RN-KNW-024:** Moving a note out of a vault **breaks every backlink that pointed at it in that vault**. It is the semantically correct consequence (PP2), and the links that break start showing up as broken in Discovery (§10.1).
- **RN-KNW-025:** A note holds at most 1 MB of content.
- **RN-KNW-026:** Every state-changing operation records complete authorship: the responsible human and, when there is one, the agent that executed it. There is no anonymous change.
- **RN-KNW-027:** Every content change produces a new, immutable revision, referenced by the corresponding event.
- **RN-KNW-028:** If the content sent is byte for byte identical to the current one, there is no new revision, no event and no reindexing.
- **RN-KNW-029:** Deleting a note is reversible: the note leaves the listings and the search, and the history stays readable by the identifier of the note.
- **RN-KNW-030:** Deleting a note frees its `slug` in the vault; restoring it requires the slug to be free again.
- **RN-KNW-031:** The backend does not validate the note against the Template of the folder (PP3), and does not interpret frontmatter or any content convention (PP4).
- **RN-KNW-033:** Deleting a vault is reversible and destroys no byte: the vault leaves every listing and starts answering `404` in every context, while folders, notes and revisions stay intact and the history stays readable. The operation belongs to the vault administration role, like renaming. Deleting frees the name of the vault in the subscription, for the same reason as RN-KNW-030, and that is why restoring it requires the name to be free again.
- **RN-KNW-034:** Writing the Guidance and the Template requires the **base revision**, as writing a note already does, and a diverging revision answers `CONFLICT` with the current content instead of overwriting. `null` is a legitimate value and asserts that the slot is empty: it is not the absence of the argument, it is a statement about the current state. The reason behind RN-AGT-005 holds here with more force, not less, because the Guidance is the most shared document of a vault and the one most likely to be written by two hands at once, one on the web and an agent over MCP.

---
## 9. Domain: Agent Access (the public contract)

**MCP is the public contract of the product.** The internal API (`architecture-guide.md` §12) exists to serve the UI. It is the tool catalogue below that external clients consume, and it is that catalogue the versioning policy protects (`CLAUDE.md` § Versioning policy).

### 9.1 Tool catalogue

| Tool | Signature | Role |
|---|---|---|
| `whoami` | `()` | Who is acting, what the connection reaches and **how to write here**: the reading order of the vault, the skill index and the whole catalogue |
| `get_skill` | `(name)` | The written method for a task, by the name `whoami` indexes. It teaches, and never validates nor writes (RN-AGT-019) |
| `list_vaults` | `()` | Visible vaults, with their descriptions |
| `create_vault` | `(name, description)` | Creates a vault in the subscription; a repeated name answers `ALREADY_EXISTS` with the identifier of the existing one (RN-KNW-032) |
| `delete_vault` | `(vault)` | Deletes a vault, reversibly and without destroying a single byte (RN-KNW-033) |
| **`get_vault_context`** | `(vault)` | **The main call.** The full Guidance plus the tree with descriptions, order, note counts and which folders carry a template |
| `get_guidance` | `(vault)` | The Guidance as it is stored, with the revision to state when writing |
| `set_guidance` | `(vault, content, baseRevision)` | Writes the Guidance of the vault, with conflict detection (RN-KNW-034) |
| `create_folder` | `(vault, name, description, parent?)` | Creates a folder; the description is required, because it is what says what belongs there |
| `delete_folder` | `(vault, folder, policy)` | Removes a folder under an explicit policy, `REJECT_IF_NOT_EMPTY` or `CASCADE` (RN-KNW-007) |
| `get_template` | `(vault, folder)` | The Template of the folder, to read before writing |
| `set_template` | `(vault, folder, content, baseRevision)` | Writes the Template of the folder, with conflict detection (RN-KNW-034) |
| `list_notes` | `(vault, folder?)` | The index of notes, in the defined order |
| `read_note` | `(vault, note, asOf?)` | The full Markdown and the current revision; with `asOf`, the revision in force on that date |
| `create_note` | `(vault, folder, title, content)` | The ingestion path (§1.3) |
| `update_note` | `(vault, note, content, baseRevision)` | An update with conflict detection |
| `delete_note` | `(vault, note)` | Deletes a note, reversibly (RN-KNW-029) |
| `search_notes` | `(vault, query)` | Literal search over the text of the vault, with fields and operators (§10.2) |
| `related_notes` | `(vault, note, depth?)` | A dependency tree through the link graph |
| `backlinks` | `(vault, note)` | Who points at this note |
| `note_history` | `(vault, note)` | The timeline: who changed it, when, with which agent |

### 9.2 The Vault Context

The output of `get_vault_context` is **the product**, not a presentation detail: it is the exact equivalent of what the agent gets today by reading the guidance document and running `ls -R` on the local folder, in a single call.

```markdown
# Vault: Normas e Legislação
<the full content of the Guidance>

## Structure
1. **Normas** `01J2Q4X8V6ZK9M3B7C5D1F0GHT`: Texto normativo por artigo. Uma norma por nota, sempre com órgão e vigência. (48 notes, has TEMPLATE.md)
2. **Achados** `01J2Q4X8V6ZK9M3B7C5D1F0GHV`: Achados de auditoria. Todo achado cita a norma que o fundamenta. (23 notes, has TEMPLATE.md)
3. **Trabalhos/** `01J2Q4X8V6ZK9M3B7C5D1F0GHW`: Relatórios emitidos. (5 notes)
   3.1. **2026** `01J2Q4X8V6ZK9M3B7C5D1F0GHX`: Emitidos neste exercício. (5 notes, has TEMPLATE.md)
```

The labels the product writes (`## Structure`, `notes`, `has TEMPLATE.md`) are en-US, like the whole MCP surface, which is a public contract and has `en_US` as its canonical locale (`CLAUDE.md` § Language policy). What appears in Portuguese in the example above is the content of the vault, written by whoever authors it, and that is how it comes out in whatever language the vault uses.

Four decisions are visible in that format:

- **The description of each folder comes along.** It is what directs where the agent writes, and that is why it is required (RN-KNW-006).
- **The order is the defined order**, numbered, because it is signal and not decoration (PP9).
- **The note count comes along.** The agent knows where the mass is before asking for any listing.
- **The identifier of each folder comes along** (RN-AGT-020). It is the argument every folder tool takes, and this document is where the agent gets it. The numbering is not an address: it is derived from the current position among siblings, so reordering a folder changes it, while the identifier is what stays.

The identifier is **the one element the Vault Context carries that `STRUCTURE.md` does not** (§12). Inside the system a folder is an opaque identifier and the tree is what names it; on the way out, the export is where names come into being, and a ULID printed next to a directory that already exists on disk addresses nothing the reader can call.

### 9.3 Writing by an agent

- **RN-AGT-001:** Every write over MCP records complete authorship: the human who owns the authorisation and the identity of the agent that executed it.
- **RN-AGT-002:** The server does not validate the content against the Template (PP3), but the tool description instructs the caller to fetch `get_template` before writing.
- **RN-AGT-003:** An error about a missing argument returns, along with the message, the information needed for the next attempt, the Template of the folder included when relevant (PP10).
- **RN-AGT-004:** `create_note` with a slug that already exists in the vault answers `ALREADY_EXISTS` **with the identifier of the existing note**, and never creates a second note. The server never generates an automatic suffix, because that is what would turn a transport retry into a silent duplicate.
- **RN-AGT-005:** `update_note` requires `baseRevision`. If the current revision diverges, the server answers `CONFLICT` **with the current content attached**, so the agent can decide between redoing and merging. Blind overwrite is not accepted in a vault that sustains auditing.
- **RN-AGT-006:** A user with the `VIEWER` role is refused on `create_note` and `update_note`.
- **RN-AGT-007:** The connector always operates on the subscription fixed at consent (RN-SUB-014); no tool takes the subscription as an argument.
- **RN-AGT-008:** No MCP vocabulary enters the domain model: changing protocol does not change a business rule.
- **RN-AGT-022:** The product implements the **MemorySmith Markdown Profile**, a specification with a version of its own, published outside this repository. It does not declare the notation: it declares **which version of the profile it implements**, serves that version through the skill, and derives the notation it reads and teaches from the profile itself rather than from a copy of it. A specification and an implementation that keep separate transcriptions of the same list drift apart on the first cycle, and the drift is silent — which is the failure the profile exists to prevent one layer up, for the vaults.
- **RN-AGT-023:** The declared notation covers **the reading surface** as well as the two sanctioned extractors, and every entry is proved by a conformance test of its own kind: the published cases run against the extractors, and each reading-surface entry runs through the real renderer. A rendering assertion cannot live in a data file — what a callout looks like is not something a suite can state — so the entries come from the profile and the expectation is written once, beside the components. A notation declared with nothing proving it fails the build.
- **RN-AGT-021:** No text the product serves to an agent cites a business rule code. Not the answer of `whoami`, not the Vault Context, not a skill, not the title or the description of a tool, and not an error message. The codes address a document of this repository, which whoever reads the MCP surface does not have, so a code there is a symbol that cannot be resolved: it is dropped as noise or mistaken for something addressable. Traceability between a rule and the code that fulfils it lives in comments and docblocks, and the sentence served to the agent has to stand on what it says.
- **RN-AGT-020:** The Vault Context carries the identifier of every folder it renders. It is the argument every folder tool takes, and it has to be readable from the document the agent already reads before writing: a vault describes itself to whoever arrives (PP1), and an agent addressing a folder it did not create itself is the ordinary case, not the exception. Returning the identifier only from `create_folder` bounds writing to the session that built the structure, which is the opposite of what the product promises.

### 9.4 Distribution of the connector

The connector is the product as seen by whoever arrives through an AI platform, and how it is found is part of the public contract as much as the signature of the tools. The curated directory mechanism and its criteria are in `knowledge-base.md` §3.7; the rules below say what MemorySmith does about it.

- **RN-AGT-009:** Every tool of the catalogue declares a readable title and a read-only or destructive hint. No tool enters the catalogue without both. The rule holds from the very first tool, and not from an eventual directory submission: those hints are what decide whether the client runs the call outright or asks the user first, so their absence charges friction to whoever uses the product, listed or not.
- **RN-AGT-014:** The connector writes the whole vault, and not only its notes. Creating and deleting a vault, writing the Guidance, creating and deleting a folder, writing the Template and deleting a note exist as tools of their own, under the same role rules the interface obeys: the decision always belongs to the vault, taken by the use case, and never to the protocol. The reason is the thesis of the product (§1.4): an agent that can only append notes to a structure somebody else assembled does not write knowledge, it merely deposits it.
- **RN-AGT-015:** `read_note` returns the body as the author wrote it, with the literal `![[…]]`, and **never expands the embed**. An agent that wants the content of the target calls `read_note` on it, and is the one who decides whether it needs it. The same holds for the export: what comes out are the bytes that were written.
- **RN-AGT-016:** `set_guidance` and `set_template` take `baseRevision`, extending RN-AGT-005 to the two Content Slots that had been left out of it. `get_guidance` and `get_template` return the revision the agent has to state, and a missing argument is refused with a message saying what is missing, while an explicit `null` is accepted and checked like any other revision.
- **RN-AGT-017:** The product serves the agent, as a skill, the description of the notation it interprets inside the body of a note, including **the notation it deliberately does not read**. The content is derived from the declaration of the notation, and never written beside it: a skill teaching a notation the product stopped reading is worse than no skill, because it instructs the agent to write something that silently does nothing. The declaration is the same one Discovery checks against its two sanctioned extractors.
- **RN-AGT-018:** `whoami` indexes the available skills, one per task, and **the index is derived from the skill registry**, never written beside it. A skill that exists shows up, and one that does not exist cannot be announced, for the same reason RN-AGT-013 gives for the help itself: a hand-kept index diverges on the first renamed skill, and pointing at a skill that does not exist sends the agent down a path that fails.
- **RN-AGT-019:** `get_skill(name)` returns the text of the skill. A name that does not exist answers `NOT_FOUND` **with the list of the ones that do**, so the next attempt is informed instead of guessed (RN-AGT-003). The skill teaches the method and validates nothing: PP3 and PP4 hold without exception, and nothing starts being refused for not following what it advises.
- **RN-AGT-010:** Reading and writing never share a tool. There is no generic tool parameterised by operation. The catalogue of §9.1 is born that way, and the rule exists so that it stays that way as the surface grows.
- **RN-AGT-011:** OAuth client registration for the connector is done through a Client ID Metadata Document. The product does not offer dynamic client registration, and the authorization server metadata announces the two keys that CIMD selection requires (`knowledge-base.md` §3.4). The decision has two reasons: dynamic registration would create a new OAuth client on every connection, which is precisely the traffic pattern expected of a distributed connector, and the identity provider we use implements neither mechanism, which already forces us to broker the registration.
- **RN-AGT-013:** `whoami` answers two questions in the same call: **who** the connection represents (the person who authorised it, the connector and the subscription fixed at consent) and **how the product expects to be used** (the reading order: the Guidance, the folder structure with the description of each folder, and the Template of the destination folder). The help part is **derived from the catalogue itself**, never written beside it: a parallel text would diverge on the first renamed tool, and help that cites a tool that does not exist sends the agent down a path that fails. `whoami` also states that the server **does not validate** the content against the Guidance or the Template (PP4), because an agent that assumes validation trusts a check that never happens.
- **RN-AGT-012:** A directory listing is a product goal, not part of the initial scope. It presupposes an implemented tool catalogue, a published privacy policy, public documentation and a demo account with populated vaults. Until there is a listing, the connector is added as a custom connector, and the product documentation has to tell the user which answers to give in the form.

---

## 10. Domain: Discovery

Three projections over the same facts, answering different questions. A conceptual comparison is in `knowledge-base.md` §5.6.

### 10.1 The link graph

Every link written in the body of a note becomes an edge. Two forms are recognised: `[[wikilink]]` and the relative Markdown link `[text](path.md)`.

**One resolution rule for both forms.** The target is reduced to the file name without extension, normalised, and resolved **within the scope of the vault**.

- **RN-DSC-001:** Path segments in the link (`../normas/`) are deliberately ignored in resolution. The edge is between notes, not between folders, and honouring the path would make the link break when the note changed folder, which is exactly what the product exists to avoid.
- **RN-DSC-002:** An anchor (`#section`) is dropped in resolution and preserved in display.
- **RN-DSC-003:** A link with a scheme or a host (`https://…`) is external: it does not become an edge.
- **RN-DSC-004:** A link whose target does not exist yet is not discarded: it becomes a **pending link** and resolves on its own when a note with that slug is created. Without that, the graph would lie precisely while the vault is being written, which is when it is consulted the most.
- **RN-DSC-005:** Deleting a note removes its edges and returns to the pending state the backlinks that pointed at it.
- **RN-DSC-006:** There are no links between vaults (PP2). Moving a note to another vault prunes its edges in the source vault.
- **RN-DSC-007:** Graph traversal is limited to depth 3 and 200 nodes, with cycles deduplicated. Without a ceiling, a dense vault returns the whole vault and drowns the agent.

**Outputs:** a dependency tree from a note, backlinks, broken links and orphan notes.

> **In a regulated domain, the graph is the trail of grounding.** A finding note cites, in its body, the note of the norm that sustains it, and `related_notes` answers *"which normative basis does this finding rest on?"*. What makes that reliable is the Template of the folder, which instructs the writer to state the grounding as a link instead of citing it in prose. The backend does not know what a grounding is: it sees an edge, and it is the vault that decides what it means (PP4).

### 10.2 Search

The search of the product is **literal over the text of the vault**: the body of each note, the title, the folder and the headings. It answers "where is this word written", and it matches by substring, ignoring accents and case, so a term written only once inside a note is found by typing part of it.

The query accepts several terms, which all have to match, `"exact phrase"`, `-exclusion`, `OR`, parentheses, an interval over a date attribute (RN-DSC-034) and the fields `title:`, `folder:`, `content:` and `section:`. `title:` also answers on the `aliases` of the note (RN-DSC-032). **Any other prefix is read as a frontmatter attribute of the vault**, and that is what makes `maturity:evergreen`, `reviewed:false` or a `norma:federal` the vault invented valid filters without any of it being written in the code. The vocabulary belongs to the Guidance (PP4, RN-DSC-020), and the ubiquitous language of the vault becomes the query language.

What the search does **not** do is look for meaning. A note covering the subject in other words does not come back. That existed as `semantic_search`, backed by a vector index, and it was **withdrawn in 0.2.0**: scoring similarity inside the function required reading every chunk of the vault on every query, and the item of a chunk cost ten times the size of the note. Whoever searches by subject relies on the link graph (§10.1) and the curation facets (§10.3) until the capability comes back over an adequate index.

- **RN-DSC-010:** The search always returns the source note along with the result, the heading the passage fell under when there is one, and the passage cut from the text as it was written. Whoever consumes it decides with the source in sight.
- **RN-DSC-011:** *(removed in 0.2.0)* Each chunk was enriched with the context it came from, that is the vault, the folder, the folder description and the note title, before being vectorised.
- **RN-DSC-012:** Moving a note between folders triggers its reprojection, because the folder is part of the portrait the vault shows of the note.
- **RN-DSC-013:** Deleting a note removes it from the projections immediately, soft delete included. What leaves the listing leaves the search, because deleted content that keeps being returned is a privacy problem, not a quality one.
- **RN-DSC-014:** Restoring a note reprojects it.
- **RN-DSC-015:** *(removed in 0.2.0)* The vector index was isolated per subscription, not filtered by metadata inside a shared index. The requirement still holds for any index derived under RN-SUB-015, and it is what governs the content index that replaces it.
- **RN-DSC-016:** The graph, the search and the facets are derived (PP5): deleting and rebuilding them from zero out of the notes is a supported operation, and it is the recovery plan for all of them.
- **RN-DSC-025:** The search matches a **literal substring**, and not a whole word nor a stem. `14.133` is found by `14.133` and not by `14133`, because the separator was written by the author and inventing a normalisation of numbers would make the result impossible to explain. Accents and case, those are ignored on both sides.
- **RN-DSC-026:** The fields `title`, `folder`, `content` and `section` are the only ones the backend knows by name. Every other query prefix is resolved as a facet of the vault, and a prefix matching no facet simply does not match, and is never an error.
- **RN-DSC-027:** The search scans every note of the vault on every query, which is sustained by the ceiling of 2,000 notes per vault (RN-KNW-010). The scan has to walk the whole index: a search that answers from part of the vault without saying it stopped is worse than no search.
- **RN-DSC-028:** The frontmatter does not take part in the searchable text. It is matter for the facet projector (RN-DSC-018), and keeping it in the body would make every note match its own metadata.
- **RN-DSC-029:** `![[target]]` is the embed form, and it produces **exactly the same edge** as `[[target]]`. The graph does not tell transclusion from reference apart, not even by counting: embedding a note and also linking to it is one single edge. An embed whose target does not exist yet follows RN-DSC-004 and becomes a pending link.

### 10.3 Curation facets

The curation panel (the Overview of the product) answers knowledge management questions: how much of the content is mature, how much has been through human review, how the notes spread across types, tags and creation dates. The answer comes from the third projection, the **facets**: aggregatable frontmatter attributes, extracted from each note the moment it changes and kept as counts per vault. The set of attributes is not fixed: whoever defines the frontmatter of the notes is the Guidance of each vault, and the projection discovers it by the shape of the values.

- **RN-DSC-017:** The curation panel is served by a derived projection, fed by note events. No screen and no tool scans notes to count; the one that counts is the projector, once, at the moment of the change.
- **RN-DSC-018:** The one that reads the frontmatter is the facet projector of Discovery, the second sanctioned reader of content next to the link extractor. The Knowledge core still does not read content (PP4), and no facet takes part in a rule, a validation or an authorisation: a facet guides curation, never behaviour.
- **RN-DSC-019:** `maturity` (`seed`, `growing`, `evergreen`) and `reviewed` (`true`, `false`) are the standard facets of the product, the only frontmatter vocabulary the product declares: `maturity` records the maturation stage of the content and is reassessed on every write; `reviewed` marks whether the current revision has been through human review, only a human writes it as `true` and any later content edit takes it back to `false`. To the projector they are not a special case, they are aggregatable attributes like any other; the standard exists so that the screens and the tools of the product can name them.
- **RN-DSC-020:** The remaining attributes are a convention of the vault and are configured nowhere: the projection classifies each value by its **shape** and aggregates the aggregatable ones, that is dates, booleans, short enumerable values and lists of short values (such as `tags`). Free text is discarded. What `type: evidence` means belongs to the Guidance, never to the backend.
- **RN-DSC-021:** A note without a facet counts as a missing value; it is never rejected nor corrected. The projection describes the vault as it is, and pointing out a gap is the job of the panel, not of the writer.
- **RN-DSC-022:** A deleted note leaves the counts on soft delete and comes back on restore, mirroring the search (RN-DSC-013, RN-DSC-014).
- **RN-DSC-023:** The facet projection is derived (PP5): eventually consistent, deletable and rebuildable from zero out of the notes, like the graph and the search index (RN-DSC-016).
- **RN-DSC-035:** `^identifier` at the end of a block **names that block**, and `![[note#^identifier]]` embeds it rather than the whole note. The identifier is never rendered as text, and it names nothing outside its own note. The edge the embed produces is **exactly** the edge `[[note]]` produces (RN-DSC-029): the graph does not tell an embed from a reference apart, and it does not tell a block embed from either. An identifier that names nothing, and an embed of one that does not exist, are reported the way a pending link is and are never an error.
- **RN-DSC-034:** A facet of kind `date` accepts an **interval** in the query, in two forms with one meaning: the comparison `created:>=2026-01-01`, with the operators `>=`, `>`, `<=` and `<`, and the range `created:2026-01-01..2026-03-31`, which is sugar for `>=` and `<=` and has **both ends inclusive**. The comparison is the primitive because it composes with the boolean operators already there and needs no second syntax for an open interval; the range is kept because it covers the common case in one token, and defining it as sugar leaves one semantics to implement, to test and to explain. An operand keeps the prefix granularity of RN-DSC-031, so `created:<=2026-02` is the last instant of that month and a month is a legal end of an interval. Two things are refused rather than answered empty, because an empty result reads as "there is nothing filed under that" and neither of these means it: an interval over an attribute this vault does not hold as a date, and a range whose ends are inverted. Relative and named dates are not part of this.
- **RN-DSC-033:** `#subject` written in the body of a note **is not read**. It becomes neither an edge nor a facet, it is stored and returned exactly as written, and the reading surface renders it as plain text — no chip, no colour, no click, because an affordance without the function it promises is worse than the raw text. Two lineages read the inline hashtag in incompatible ways, as a link and as metadata of the file, so there is nothing to inherit and any choice diverges from somebody: here the curation vocabulary lives in the frontmatter, where the Guidance governs it, and a subject worth marking in the middle of a sentence is worth a note of its own. Reading it would also require a third sanctioned reader of content and a real Markdown parser in the backend, against PP4 — `#` is a heading, a hex colour, `C#`, an issue number and a shell comment inside a fence, and in a survey of the 1,562 notes of the example vaults one of the three inline matches was a colour. To group, write `tags:`; to connect, write `[[wikilink]]`.
- **RN-DSC-030:** `aliases`, `tags`, `created` and `updated` are the vocabulary the profile reserves, **always written in en-US**. The interface may show the label of one of them translated and never the bytes: the note stores `created`, the export writes `created`, and the search answers `created:2026-09`, in a vault kept in any language. Every other attribute keeps the name whoever wrote the note gave it, in the language they gave it. Reserving is declaring, not enforcing: a reserved key whose value does not have the expected shape **degrades to an ordinary attribute and is never an error**, so `created: manually` is an enum and nothing is refused. `title` is deliberately not reserved, because the title of a note is structural and RN-DSC-024 already switches a `title:` key off on its own.
- **RN-DSC-031:** A facet of kind `date` matches by **prefix** and never by substring: `created:2026`, `created:2026-09` and `created:2026-09-03` are the three granularities, and `created:09` matches nothing. Values are canonicalised to `YYYY-MM-DD`, so the prefix is exactly the granularity asked for, and substring made a fragment of the middle stand for a date — `09` meaning September and also the year 2009, which is not a question anybody asked. Every other kind keeps matching by substring.
- **RN-DSC-032:** The entries of `aliases` join the search index as **alternative spellings of the note**, answering wherever the title does — under `title:` and under a bare term — and ranking as a title hit. A vault of technical terms lives on acronyms, and requiring the full title in every search is what makes people stop finding things. **They do not resolve wikilinks:** `[[RTO]]` still does not reach a note titled `Recovery Time Objective`, because resolution is behaviour and RN-DSC-018 keeps a facet out of behaviour.
- **RN-DSC-024:** An attribute that reveals itself as free text through use stops being aggregated: when the cardinality of distinct values of an attribute passes the per-vault ceiling, its counts are discarded and it stops producing statistics. It is that mechanism, and not a hand-kept exclusion list, that keeps `title` or `source` from becoming statistics.

---
## 11. Domain: Audit

The vault sustains work in a regulated environment. That changes what "storing a note" means: besides the current content, the system answers **who wrote it, with which agent, when, and what the note said on the date the work was issued** (the grounding is in `knowledge-base.md` §7).

### 11.1 Entities

#### Value: `Authorship`

```
user_id,                     -- always a human: the owner of the authorisation
agent?: {                    -- absent = written through the UI
  client_id,
  client_name
},
at
```

The human is always identified, because even when the one writing is the agent, the authorisation belongs to whoever connected. It is that pair that turns *"written by X"* into *"written by that agent, on behalf of X, on 12 March"*: the difference between a record and a defensible record.

#### Entity: `AuditEvent`

```
subject (SUBSCRIPTION | MEMBER | VAULT | FOLDER | NOTE),
subject_id,
occurred_at,
type,                        -- the domain event that happened
authorship,
content_ref?,                -- the exact revision of the content at that instant
payload
```

### 11.2 Business rules

- **RN-AUD-001:** The audit trail is append-only. There is no path, of application, of operations or of administration, that alters or removes an event already recorded.
- **RN-AUD-002:** Every event records complete authorship (the human and, when there is one, the agent).
- **RN-AUD-003:** Every event that changes content carries the reference to the exact revision at that instant, and not merely the fact that a change happened.
- **RN-AUD-004:** The timeline of a note is indexed by the identifier of the note and survives it changing folder and vault.
- **RN-AUD-005:** `read_note(asOf)` returns the content in force on the given date, reconstructed from the trail, which makes it possible to redo a piece of work reading the base as it stood on the date of issue.
- **RN-AUD-006:** Deleting a note never destroys the stored content; the history stays readable.
- **RN-AUD-007:** *(removed in 0.4.0)* It covered purging, the deliberate destruction of content, as an administrative act restricted to the `OWNER`, with a mandatory reason and an event of its own. The capability was never built, and what the product actually guarantees is still declared in RN-AUD-006. The number is preserved and will never be reused.
- **RN-AUD-008:** *(removed in 0.4.0)* It covered legal hold on the subscription, which would lock revisions against removal for the configured term. No path ever reached that activation, and what protects the revisions is the append-only trail of RN-AUD-001. The number is preserved and will never be reused.
- **RN-AUD-009:** *(removed in 0.4.0)* It stated that legal hold and purging were incompatible by design. With both capabilities removed, the rule lost its object. The number is preserved and will never be reused.

---

## 12. Domain: Portability

Zero lock-in is a requirement, not a courtesy: it is what makes the product safe to adopt in a context where the base has to outlive the vendor (`knowledge-base.md` §10).

**The export is where file names come into existence.** Inside the system there are opaque identifiers and roles (§8.1); it is here that `guidance` becomes `GUIDANCE.md`, `template` becomes `TEMPLATE.md` and the slug of the note becomes a file name. The annotated tree comes out next to the Guidance, as `STRUCTURE.md`: the two are exactly the two halves of the Vault Context (§9.2), the one a human writes and the one the product derives. `STRUCTURE.md` reproduces that tree line by line **except for the folder identifier** (RN-AGT-020), which is an address for calling a tool and has nothing to address in a folder of files.

```
Normas e Legislação/
├── GUIDANCE.md             ← the Guidance of the vault, as a human wrote it
├── STRUCTURE.md            ← the annotated tree: order, description of each folder and where a Template lives
├── 01 Normas/
│   ├── TEMPLATE.md
│   └── lei-14133-art-75.md
└── 02 Achados/
    └── TEMPLATE.md
```

- **RN-PRT-001:** The export contains only `.md` files, with no proprietary component and no index required for reading.
- **RN-PRT-002:** The order of folders and notes is encoded as a numeric prefix in the name, which is the only way to preserve it in a file system, since a file system has no order of its own.
- **RN-PRT-003:** *(revised)* The annotated tree of the vault is materialised as `STRUCTURE.md` at the root, with the order, the description of each folder, the note count and which folders carry a Template. The description is an attribute of the folder and never a document, so no file is written inside the folder to carry it. A folder with no Template and no note therefore leaves no directory in the exported tree and survives only in `STRUCTURE.md`. *(Up to 0.2.0 the rule said the description was materialised as a `README.md` inside each folder.)*
- **RN-PRT-004:** Links come out intact in the text of the notes.
- **RN-PRT-005:** *(revised)* A note whose slug is exactly `guidance`, `structure` or `template` is exported with a suffix, and every link to it is rewritten along with it. It is the only concession of the export, and it belongs to the edge, not to the model. *(Up to 0.2.0 the reserved names were `readme` and `template`.)*
- **RN-PRT-006:** Deleted notes do not enter the export.
- **RN-PRT-007:** A vault arriving with inline `#tags` is offered the conversion into the reserved `tags:`, **as a method the product teaches and never as an operation it performs**. The product serves the agent a skill: how to tell a tag from a heading, a hex colour, `C#`, an issue number and a URL fragment; to propose per note, in full, showing what would be written and what was rejected; to wait for a person to accept; to write one note at a time with `update_note` carrying its `baseRevision`, so each conversion is an ordinary authored write with its own revision in the history; and to leave the body untouched, because the inline tag is the author's bytes. It is a skill and not an endpoint for a structural reason: reading `#subject` for meaning would make the backend a third sanctioned reader of content, against PP4 and RN-DSC-033, and buying back the cost of a rejection by spending the guarantee that motivated it is not a trade this product makes. Nothing runs on import, nothing runs over a vault unasked, and a false positive is cheap **only** because a person reads the proposal first.

---

## 13. Application interface

**The UI is the only human reading surface of the product.** That raises the bar for the note screen and the tree: they have to be comfortable to **read**, not merely to navigate.

### 13.1 Screens

**Entry**

| Screen | Content |
|---|---|
| Sign-in | Authentication through the identity provider, and the return from it. There is no open sign-up: the account is born by an act of platform operations (§4.4) |
| Sign-in with no active subscription | There is no waiting screen inside the product. A session whose subscription is absent, awaiting approval or blocked reaches nothing, so it is ended and the person goes back to the sign-in screen with the message of their case: an account with no subscription, a subscription awaiting authorisation, or an inactive subscription. The distinction is deliberate, because "there is nothing here" and "your access is suspended" are different facts |
| Subscription request | Outside the product at this stage. The route exists in the API, and whoever requests and approves is platform operations; the interface does not offer the form |

**Knowledge**

| Screen | Content |
|---|---|
| Vault catalogue | Cards with the name, the description, the note count and the last update, and under them the panel of the subscription: the count of vaults and notes, pending links, orphan notes, quota usage and the distribution of the content across the facets the vaults declare (§10.3) |
| Vault → Vault Context | The vault as the agent receives it in `get_vault_context` (§9.2): the Guidance and the Templates as entry points and the folder tree with the description of each folder. Reading of the structure, with no reordering and no moving |
| Vault → Guidance | Reading of the Guidance of the vault, with the task list clickable for whoever may write |
| Folder | Reading: the description of the folder, its Template and the notes in the declared order (PP9) |
| Folder → Template | Reading of the Template of the folder, with the task list clickable for whoever may write |
| Note | Reading: the frontmatter properties and the body in Markdown, with wikilinks navigable, the pending ones marked as such (RN-DSC-004), embeds expanded one level, and the task list clickable for whoever may write |
| Vault → Graph | The link graph of the whole vault, navigable, with the note opened from it |
| Vault → Search | A single field over the text of the vault, accepting fields and operators |
| Vault → Export | Downloads the whole vault as a tree of `.md` files, in the format of §12 |

**What the interface does not reach.** The governance of the subscription, that is members, roles, invitations, ownership, vault ceilings and switching the active subscription, and the platform area of §4.6, exist in the API and have no screen. So do the audit and health reads, that is note history, vault activity, and broken links and orphan notes as lists. Whoever needs them today calls the API or uses the operations scripts, and what is missing is recorded in the issues of the repository, which is where the future lives.

### 13.2 Interface rules

- A subscription outside `trial` or `active` ends the session and takes the user back to the sign-in screen with the message of their case, and never to an empty content screen. The message says which of the three cases it is, because the difference between "there is nothing here" and "your access is suspended" is the difference between an apparent bug and a piece of information.
- **The reading surface renders the whole vault ring the profile declares, and only it.** `==highlight==` is marked text; `%%comment%%` leaves the page and **stays in the bytes**, so a tool that returns the note returns it and an agent sees what a person on the page does not — an asymmetry declared here rather than discovered, because text somebody did not want on the page is still text they wrote; `^identifier` names its block and never shows; `$inline$` and `$$block$$` are mathematics, while a `$` followed by whitespace does not open one and a `$` preceded by whitespace does not close one, so two prices in a sentence stay two prices.
- **Raw HTML in a note is not rendered.** It is stored and returned exactly as written, and shown as text. This is a security boundary and not a rendering preference: a vault is written by several people and by agents, and a page that renders arbitrary HTML out of one is a script injection whose trigger is written by whoever wrote the note. Superscript and subscript follow from it and have no notation here, which is a decision and not an omission: the GitHub form needs the HTML this rule forbids, and the Pandoc form renders in no vault editor.
- **A screen waiting for data shows the shape of what is coming, in the position it will occupy, and never a blank area or a bare line of text.** The frame of a screen is drawn as soon as it is known and is never withheld for a request: the vault layout draws its sidebar, its brand, its search box and its navigation immediately and places a skeleton only where the query lands, so the frame does not move when the data arrives. A placeholder belongs to the wait alone — over a request that has already failed it is a page that looks alive and is dead — it carries `aria-busy` and keeps the word for whoever hears the page rather than only sees it, and its motion stops under `prefers-reduced-motion`.
- **The sign-in screen never asks for a click that decides nothing.** Every path that reaches it with no session to explain hands the browser to the identity provider, which owns the credentials; it stops and speaks only when it has something to say — an account that reaches nothing, a session that ended on its own, or a sign-in that came back empty. Signing out is not one of those: the person who left knows they left.
- A session that can no longer be renewed ends the same way (RN-SUB-022), and it is the same screen with a message of its own: the person did not ask to leave, so being returned to sign-in in the middle of reading owes an explanation. Signing out is never the only way out of a session that stopped working, and a screen waiting on a request that has already failed is not a wait: it says what failed.
- **Entering a vault resumes where the reading stopped**, when this browser knows where that was, and shows the Vault Context when it does not. It is a convenience of the browser and never a fact of the product: which note somebody read last is not sent to the server, not exported and not seen by anybody else, so it does not follow them to a second device. It fires on arrival and not on request — asking for the Vault Context from inside the vault is answered, or resuming would make the tree unreachable — and a remembered note that is no longer there is silently forgotten, never shown as an error.
- The reading surface of the note follows the metrics of the default theme of the desktop vault editors, because whoever reads the vault on the web and in the editor it was written in should not have to relearn the page.
- No screen interprets a content convention. The frontmatter is presented as properties and the body is rendered as universal Markdown, which keeps the interface on the same side of PP4 as the backend.
- The reading surface **expands one level of transclusion, and only one**. A `![[target]]` found inside transcluded content is drawn as a link to the target, which makes a pair of notes that embed each other render without a loop. The transcluded block always says where it came from, with a link to the source note, because a passage pasted without provenance is indistinguishable from what the author wrote. There is a ceiling of expanded embeds per page, and what goes past it becomes a reference instead of disappearing.
- The **task list is clickable** where the effective role in the vault allows writing, and stays disabled where it does not. Clicks in sequence within a short window become **one** write, so that ticking five items leaves one entry in the history and not five. A refused write returns the box to its previous state and **says which failure it was**, reloading the document when the reason is a conflict (PP10). Every write answers the revision it produced and the next one is based on that, so a conflict here means what it says: somebody else, or an agent, wrote in that note. One person alone can never produce it.

---

## 14. Product limits

Declared so they become tests, and not folklore. The thesis is "without friction" (§1.4), and without a number that is not verifiable.

| | Limit |
|---|---|
| Note size | 1 MB |
| Folders per vault | 200 |
| Notes per vault | 2,000 |
| Tree depth | 6 levels |
| Graph traversal depth | 3, with a ceiling of 200 nodes |
| Propagation of a role change | up to 5 minutes |
| Invitation validity | 7 days |

Performance targets are in `architecture-guide.md` §15.

---

## 15. Where version scope, risks and open questions live

This document describes what the product **does**, and not what it is going to do. Version
scope, delivery order, a risk not yet addressed and an undecided question describe the
future, and that is why they left this file:

| What you are looking for | Where it is |
|---|---|
| The scope accepted for a version | The milestone of that version |
| Product risks and questions not yet decided | Issues labelled `question` |
| What has been delivered, and when | `CHANGELOG.md` and the GitHub Releases |

The rule that motivates the separation, and the cycle that takes a need from an issue to
this document, are in `development-process.md`.
