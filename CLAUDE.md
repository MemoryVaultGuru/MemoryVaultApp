This file is the **single source of truth** for all agent behaviour in this project.
Claude Code reads it automatically on every session and on every sub-agent invocation.

---

## Project identity

### Organisation
memorysmithapp

### Project name
memorysmithapp

### Project identifier
memorysmith

### Product domain
memorysmith.app

### What it does
MemorySmith.app hosts self-describing knowledge vaults in Markdown, with structure, ordering and authoring Guidance declared as data, and serves them natively to AI tools through a remote MCP server. The agent does not merely read a vault: it writes in it, obeying the Guidance of the vault itself and the Templates of each folder.

### Slogan
Structured knowledge, natively readable and writable by humans and agents.

### Visual identity
Defined in the brand book "Livro da marca v1" (Figma). The symbol is a graph forming a brain: each circle is a note, each stem is a link. Never redraw the symbol and never create colour combinations outside the four versions of the book.
- **Primary colour:** Azul cofre `#0F56D7` (structure). Accents: Laranja sinal `#FF8A2B` (capture) and Verde nó `#16A34A` (connection; it never leads a piece on its own). Neutrals: Tinta `#0E1526` (text), Papel `#EDEFEC` (light background) and Fundo escuro `#0B1220` (dark mode). Usage proportion: background 70%, blue 18%, orange 8%, green 4%
- **Typography:** Space Grotesk (Bold in the logotype and headings, Medium in labels and interface) and Inter (body text). Tracking of −2.5% in the logotype; the `.app` suffix of the wordmark is always Laranja sinal
- **Visual tone:** sober and legible. The surface of the product is a reading tool before it is an editing tool

### Base version
0.4.1

### Current state
Version 0.4.1, a correction cycle of a single issue: the Vault Context prints the identifier of every folder, which was returned once by `create_folder` and by nothing else, so a session that had not built the structure could read the whole vault and write in none of it (RN-AGT-020). Before it, 0.4.0, the cycle that closed the distance between what the documents promised and what the product does, and that opened a door for whoever uses it. The documents stopped describing screens that were never built and an invitation e-mail that was never sent; the roadmap, the risks and the open questions left `docs/` and became issues, because a document never describes the future; and the whole repository was translated to en-US, which is the language of everything the product already exposes. Two issue forms and a `SECURITY.md` gave feedback somewhere to arrive, and `development-process.md` became the fourth canonical document, holding the process half that was disguised as agent configuration. On the product: transclusion renders `![[note]]` where a broken image icon used to be, the task list became clickable and is **the first write the web interface makes**, writing the Guidance and the Template now requires the base revision, which is the contract break of the cycle, and the connector started teaching method through skills, not only operation. Before it, 0.3.0 hardened what 0.2.0 delivered, with the responsive interface, the graph with facets, the plan quota actually enforced and the reading surface following the metrics of the default theme of the desktop vault editors; 0.2.0 delivered the six bounded contexts, the whole infrastructure in CDK, the interface wired to the real API and the MCP connector authenticated by the CIMD proxy in front of Cognito; and 0.1.0 delivered the canonical documentation, the navigable prototype over the seed and the MCP authentication spike. The environment goes up and comes down through the scripts in `deploy-aws/`, and deployment to AWS happens with step-by-step supervision by the user.

### Git remote
github.com/memorysmithapp/memorysmithapp

---

## Repository layout

A pnpm monorepo with **three first-level projects**, named after the project identifier. The complete structure and its justification are in `docs/architecture-guide.md` §5.

```
memorysmithapp/
├── memorysmith-backend/     # six bounded contexts + shared kernel + event contracts
│   ├── packages/            # kernel and contracts
│   ├── services/            # access, knowledge, discovery, audit, agent, portability
│   └── apps/core-monolith/  # the composition root of the main deployable
├── memorysmith-frontend/    # React SPA
└── memorysmith-infra/       # all CDK: stacks, constructs, IAM policies, pipeline
```

**Never put infrastructure code inside the backend project, and never put the definition of a stack inside a service.** The infra project declares resources for all three projects, the bucket serving the frontend and the pipeline deploying everything included, and therefore it cannot live inside any of them. That also keeps the deploy credentials separable from the application code.

**The dependency direction between the projects, single and checked in CI:**

```
memorysmith-infra      →  references backend and frontend artifacts (bundling, deploy)
memorysmith-backend    →  knows nothing about infra or frontend
memorysmith-frontend   →  imports @memorysmith/contracts (types only) and calls the API at runtime
```

An `import` of `memorysmith-infra` inside `memorysmith-backend` is an architecture error, not a matter of style. Services never import each other either: communication between contexts is HTTP with IAM authentication or an event, never an `import`.

When creating a file, decide where it goes by asking what it is, not what it is for: a CDK construct for the audit table belongs in `memorysmith-infra/constructs/`, even if only the audit service uses it.

---

## Canonical documentation

Four documents in `docs/`, each the single source of truth for one question. **Each document bounds itself in its own preamble**, which says what it holds and what it does not, and this file does not repeat that inventory. What stays here is only the rule of where to write.

| The paragraph answers | It belongs to |
|---|---|
| "This is true about Markdown / MCP / auditing in general" | [`docs/knowledge-base.md`](docs/knowledge-base.md) |
| "This is what our product does, and under which rule" | [`docs/software-vision.md`](docs/software-vision.md) |
| "This is **how the software is built**" | [`docs/architecture-guide.md`](docs/architecture-guide.md) |
| "This is **how work flows**, from the need to the merge" | [`docs/development-process.md`](docs/development-process.md) |
| "This is what we have yet to **decide, evaluate or build**" | **A GitHub issue, never `docs/`** |

When a fact seems to fit in two documents, it goes into exactly one and the other **references it by section**, never repeats it. Duplication between these files is the failure mode this structure exists to avoid.

The last two rows of the table separate what confuses most. The test: "the outbox guarantees at-least-once delivery" changes the code, so it is architecture; "every change reaches `main` through a pull request" does not change a line, it changes the path to it, so it is process. And the final row is absolute: **a hypothesis of a need, the roadmap, an open risk and an undecided question never enter `docs/`**, because they describe the future.

> **A document never describes the future. If it is in the document, it is in production.**

### Business rule codes

Business rules are declared only in `software-vision.md`, one rule per line, in the form `RN-{CONTEXT}-{NNN}`, whose notation and context prefixes are in [`docs/software-vision.md`](docs/software-vision.md) §6. The codes are **append-only**: never renumber a rule and never reuse a retired code, because commits, issues and code reference them. A rule that stopped holding is marked as removed on its own line, keeping its number. The moment a number is reserved is in [`docs/development-process.md`](docs/development-process.md) §6.

---

## Documentation hygiene

**Never add version notes, revision dates or internal-use footers to any file in `docs/`.** Lines of the form:

```
*Internal development document. Last revised: … — vX.Y (…)*
```

are forbidden. They duplicate information already recorded in the git history and in `CHANGELOG.md`, fall out of sync immediately, and add noise the reader has to filter out.

**Where change history belongs:**

- **`CHANGELOG.md`**, the only place where notable changes to the project are recorded, relevant documentation updates included. Add the entry when opening a pull request, and not as a footnote inside the edited document.
- **Git commit messages**, since every commit records what changed, when and why. That is the audit trail of document edits.

**The rule:** when editing any `docs/*.md` file, do not add, do not update and do not preserve any footnote mentioning a version number, a revision date or the phrase "internal development". If one already exists in a file being edited, remove it in the same change.

---

## Language policy

**The whole repository is written in American English (en-US). Brazilian Portuguese (pt-BR) exists in exactly one place: the `pt_BR` locale of the interface.**

### Written in en-US

Everything: `docs/*.md`, `README.md`, `CHANGELOG.md`, this file, `SECURITY.md`, the issue templates, the repository labels and the Project field values, commit messages and pull request descriptions, source code (identifiers, comments and docblocks), branch names, configuration files, log and error messages, DynamoDB attribute names, S3 key components, EventBridge event names, API endpoint names, and MCP tool names and descriptions.

The reason is not preference. Everything the product exposes is already en-US: the code, the API, the names and descriptions of the MCP tools, the Vault Context the agent receives, the labels the server writes, the canonical locale of the interface. The repository is public and the product addresses AI tools and whoever integrates them, so a second language in the documentation layer charges a cost precisely at the door somebody from outside comes in through.

### Written in pt-BR

- The `pt_BR` locale of the interface, which is mandatory and speaks to whoever uses the product, not to whoever reads the specification.
- The content of the example vaults in `deploy-aws/`, which is vault content and not repository documentation. It is good that it is in Portuguese: it demonstrates that the product serves a vault in any language and that the backend does not interpret content (PP4).
- Answers in issues, from whoever reports something. The language of the repository is not a demand on whoever uses the product.

Neither the git history nor issues and pull requests already written are rewritten: they are dated records.

### The two terms translated in the interface

In the `pt_BR` locale, and only there, two ubiquitous language terms are shown translated:

| In the code, the docs and `en_US` | In the `pt_BR` locale |
|---|---|
| `Guidance` | Orientação |
| `Template` | Modelo |

That is interface translation, not project terminology, and it does not propagate. No other ubiquitous language term is translated: `Vault`, `Subscription` and the rest stay as they are. `Note` is the trivial case: "nota" is a common Portuguese word and that is how the `pt_BR` locale writes it.

### Locale-sensitive formatting

Date and number formatting is runtime behaviour, driven by the `Intl` APIs and governed by the active locale, not by this policy.

---

## Non-negotiable design rules

These are the structural decisions of the system, and violating any of them is not a defect to fix later: it is a rewrite. They stay here as statements, because the agent needs them before writing the first line. The full text, with the mechanism that guarantees each one, is in the indicated section of [`docs/architecture-guide.md`](docs/architecture-guide.md), and this file does not repeat it. When a task seems to require breaking one of them, stop and raise the question instead of working around it.

| # | Rule | In full in |
|---|---|---|
| 1 | **Every key starts with the subscription**, `S#{subscriptionId}` in DynamoDB and `s/{subscriptionId}/` in S3. The only two exceptions are named in the design, and there is no third | §8.2, §8.3 |
| 2 | **The `subscriptionId` comes from the JWT claim, never from the request**, and therefore never from the path, the query, the body or a header | §8.2, §8.5 |
| 3 | **`domain/` and `application/` do not import the AWS SDK**, without exception, "just to get a type" included | §5.5 |
| 4 | **The S3 key is opaque**: only a `ContentId`, never a vault, a folder, a name or a role. Renaming, moving and reordering never write a byte to S3 | §9.2 |
| 5 | **The backend never interprets the content of a note.** Frontmatter and convention belong to the Guidance and the Template. The backend reads only universal Markdown syntax, and only in the two sanctioned Discovery extractors | §11.1 and §11.3; PP4 in `software-vision.md` §2 |
| 6 | **The audit trail is append-only by IAM, not by discipline** | §12.2 |
| 7 | **Every domain operation that changes state takes an `Authorship`.** There is no anonymous mutation | §12.1 |
| 8 | **Deleting a note never destroys bytes**, and there is no path that destroys them: no domain port, no route, no administrative act | §12.4 |
| 9 | **A forbidden resource returns `404`, never `403`**, because a `403` would confirm the existence of something the requester may not see | §15 |
| 10 | **A note transaction never writes to the `META` item of the vault**, which would become the contention point of the whole vault under batch ingestion | §10.2 |
| 11 | **The subscription identifier is perpetual.** No status transition moves, rekeys or deletes data: the status governs access, never address | §8.1 |
| 12 | **A platform administrator session carries no subscription**, and therefore no Knowledge repository can even be constructed under it. Never replace that with a role check: the impossibility is the guarantee | §8.4 |
| 13 | **The per-vault role ceiling only lowers a role, never raises it.** The effective role is `min(subscription role, vault ceiling)`, with the owner of the subscription above both | `software-vision.md` §5.3 |

---

## Operational policies

The complete process, with the cycle that takes a need from an issue to `main`, is in [`docs/development-process.md`](docs/development-process.md). What follows is the normative form: what may never be violated. The reasoning and the operational detail live in the process document, and **where this file summarises, it never repeats the text from there**.

### Ignored files

Whenever creating, moving, deleting or modifying files and directories, assess whether `.gitignore` and `.dockerignore` need updating. Both are reviewed together, because a change affecting one usually affects the other.

**Update `.gitignore`** when build outputs (`dist/`, `cdk.out/`, `build/`), dependencies (`node_modules/`), environment or secrets (`.env`, `*.key`), cache or temporary files (`.cache/`, `tmp/`, `.turbo/`), IDE files (`.idea/`, `.vscode/`, `.obsidian/`) or coverage (`coverage/`) appear. **Never leave a sensitive untracked file without an entry.**

**Update `.dockerignore`** when anything appears that should not enter the build context. It always includes: `.git/`, `.claude/`, `.obsidian/`, `node_modules/`, `dist/`, `cdk.out/`, `coverage/`, `tests/`, `*.log`, `.env`, `.env.*`, `README.md`, `CHANGELOG.md`, `CLAUDE.md`, `docs/`. If it does not exist and there are Docker files, create it.

### Versioning

The canonical version of the product lives **in this file**, under § Project identity → Base version, and is propagated to every `package.json` of the monorepo and to `CHANGELOG.md` before the release commit. The three projects share a single version, because they are deployed together.

| Kind of change | Bump |
|---|---|
| A break in an MCP tool or API contract, a destructive key or schema migration | Major (`2.0.0`) |
| A new MCP tool, a new visible feature, a new service, a new route | Minor (`0.2.0`) |
| A defect fix, a configuration adjustment, a refactor with no external impact | Patch (`0.1.1`) |

**While the base version is `0.x`, the rule above does not hold:** SemVer treats that range as unstable, and a contract break enters as a minor bump, recorded in `CHANGELOG.md` under `Removed` or `Changed`. From `1.0.0` on it holds without exception, because by then somebody is integrated on the other side.

**Inviolable:** the version bump reaches `main` only through a PR, never through a direct push. The tag is created **after** the merge and points at the merged commit. A change that alters nothing deployable, such as documentation and repository governance, **does not cut a version**: it waits in `[Unreleased]` for the next cycle, which takes the whole accumulation. The nine-step flow is in `development-process.md` §9.1, and what cuts a version, in §9.

### CHANGELOG

Update `CHANGELOG.md` **in the same commit** as the change it documents, and never pile entries up for the end of the branch.

Use the [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) categories: `Added`, `Changed`, `Fixed`, `Removed`, `Deprecated`, `Security`. Write from the perspective of the user and the agent, never of the implementation, and group small entries under the same category instead of one per file touched. Documentation restructurings in `docs/` get an entry.

**Good:** `Added the asOf argument to read_note, which returns the revision in force on a date`
**Bad:** `Updated NoteQueryHandler.ts to accept an optional timestamp`

### Branch protection

`main` is protected. **Every change reaches it only through a pull request reviewed and merged on GitHub**, holding equally for features, fixes, documentation, maintenance and version bumps.

- Never commit or push directly to `main`.
- Never work around the protection. Do not use "Bypass rules and merge", `gh ... --admin`, `git push --no-verify` or an equivalent, even holding administrator rights.
- If a merge is blocked, **stop and report**. Ask how to proceed instead of overriding the rule.
- The only direct writes to `main` are annotated tags on already merged commits.

### Branch names

Branch names use one of the five prefixes defined in `development-process.md` §7.1: `release/` for the cycle that closes a whole version, and `feat/`, `fix/`, `docs/` and `chore/` for single pieces of work. The earlier convention, `feature-2026.NNNNNN`, is no longer used.

### Incremental commits

Commit along the branch, never piling everything up at the end, and push on every commit or at least every two or three. Every commit has to build and may not break the existing tests. **The unit of a commit is the whole behaviour change: code, test, document and `CHANGELOG.md` in the same commit**, and the criterion for when a commit touches each document is in `development-process.md` §7.2 and §7.3.

Messages in the imperative mood and the present tense, following Conventional Commits, for example `feat(knowledge): add fractional Position value object`.

### Pull request

Every PR description contains two sections: a **Summary of changes** and an **AI productivity analysis**. The format of both, and how to fill in each field of the second, are in `development-process.md` §8.

A change that implements or alters a business rule cites its `RN-XXX` code. A change originating from feedback references the issue with `Closes #N`.
