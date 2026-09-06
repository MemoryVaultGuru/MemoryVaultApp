# Changelog

Every notable change to this project is recorded in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project adopts [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Entries up to 0.3.0 were condensed when the repository was translated to en-US: the fact
each one records is preserved, the reasoning behind it lives in the git history and in the
issues each entry cites.

## [Unreleased]

### Changed

- **The repository no longer names the editor whose reading metrics the interface follows.** The comments of the stylesheet and of the Markdown readers, `docs/knowledge-base.md`, `docs/software-vision.md` §13.2, `CLAUDE.md` and the entry of 0.3.0 now speak of the desktop vault editors as a family, which is what the decision was always about: the metrics are shared by the tools that read a folder of Markdown files, and naming one of them read as a dependency the product does not have. The content of the example vaults is untouched, because it is vault content and not repository documentation, and `.obsidian/` stays in `.gitignore`, in `.dockerignore` and in the ignore list of `build-vaults.mjs`, because there it is the name of a directory on disk and not a citation.

## [0.4.1] - 2026-09-04

### Fixed

- **The Vault Context carries the identifier of every folder, so a session that created nothing can still write.** The identifier was returned exactly once, by `create_folder`, and every folder tool takes it as an argument: `create_note`, `get_template`, `set_template`, `delete_folder`, `list_notes` and the `parent` of a new folder. It lived as long as the session that built the structure, so opening a new session, or connecting from a different AI platform, left the agent reading a vault it could not name a single folder of. The tree it already reads before writing now prints the identifier next to each folder name, at every depth, which is what §9.2 promised when it called the Vault Context the equivalent of an `ls -R`: a listing whose entries the next command can open (RN-AGT-020). `STRUCTURE.md` is the one place the identifier does not go, because the export is where opaque identifiers stop existing and file names come into being. (#50)

## [0.4.0] - 2026-09-03

### Added

- **`docs/development-process.md`, the fourth canonical document.** Half of `CLAUDE.md` was operational process disguised as agent configuration. The process now has a document of its own: the five-stage cycle from a need to `main`, triage and its four outcomes, the reservation of `RN-XXX` codes, the branch naming convention and when a commit touches each document.
- **A way in for whoever uses the product.** Two issue forms, one for **usage feedback** and one for **scope proposals**. The feedback form asks for the suggested solution last, and explicitly optional, because the description of the friction outlives the proposed fix.
- **`README.md` says how to report.** A section right after troubleshooting, opening with the statement that you do not need to know what the solution is.
- **`SECURITY.md`, with a private channel for isolation failures.** It names the seven observations that are security failures and commits to a 72-hour acknowledgement.

### Changed

- **The vision, the README and the problem statement were rewritten one level up.** The product no longer opens on the local `.md` folder and its three breaking points, which are symptoms of an arrangement: it opens on the fragmentation of the memory of a team, by time and by vendor, and on its cost in rework, divergence and distrust. The answer to the vendor split is the protocol, not asking everyone to use the same tool.
- **The slogan now includes people:** "Structured knowledge, natively readable and writable by humans and agents", propagated to the four places it lives.
- **`CLAUDE.md` shrank from 436 to 267 lines.** Operational policy moved to `development-process.md`, the `RN-XXX` notation moved to where the rules live, and the inventory of the `docs/` files moved back to the preamble of each document. What stays is what the agent may never violate.
- **The roadmap, the risks and the open questions left the documents and became issues**, fourteen of them, each with the explicit criterion of what closes it. A document never describes the future.
- **The four Ds of AI fluency entered `knowledge-base.md` (§4.4)**, as the domain fact behind why the base has to be cheap to write and cheap to read.
- **The branch naming convention changed** to `release/vX.Y.Z` for a version cycle and the Conventional Commits prefixes for single pieces of work.
- **`development-process.md` says what cuts a version**, and when an issue closes: as soon as its commit is on the branch of the cycle, not when the branch reaches `main` (§7.4, §9).
- **The invitation stopped promising an e-mail the product never sent.** What exists is an invitation addressed to an e-mail, whose link whoever invites passes on. The Signup moment now says there is no open sign-up at this stage. `RN-ACC-005` keeps its number and its meaning. (#42)
- **§13 now describes the interface that exists.** Nine of the fourteen listed screens were never built and four were described as editors when what exists is reading. The screens that exist and were missing entered, the graph and the export among them, and a paragraph names what the interface does not reach. A later pass removed the assertion about *who writes* in the product, which was a decision about the destiny of the product that nobody had taken. (#28, #29, #30, #31, #32, #33, #34, #35, #36, #37, #38, #39, #40, #41)
- **The `README.md` stopped promising editing in the web interface**, and the promise of working in pairs gained the clause it was missing: at this stage, whoever adds somebody to a subscription is platform operations.
- **Two business rules stopped asserting screen behaviour that does not exist.** `RN-ACC-016` now states the propagation delay and its cause; `RN-KNW-024` stopped promising a warning that existed neither in the UI nor in the API, and the orphan `moveImpactSchema` left with it. Both numbers are preserved. (#32, #33)
- **The repository declares its licence and its two modes of operation.** The vision gained §4.9, the README announces both ways of using the product before "The problem" and gained a licence section, and `SECURITY.md` says who applies the fix in each mode. No sentence promises billing, open sign-up or a request form, because none of the three exists. (#25)
- **The connector teaches method, and not only operation: `whoami` indexes skills and `get_skill` delivers them.** There is exactly one task where the premise that a vault describes itself cannot hold, which is **creating the vault**. The first skill, `design-vault`, writes the missing method, and its guiding rule is to design from samples and not from a questionnaire. The index is derived from the registry (RN-AGT-018), and an unknown name answers with the list of the ones that exist (RN-AGT-019). (#21)
- **A second skill teaches the notation the product reads, and the notation it does not.** `write-notes` describes the ten forms the two sanctioned extractors decide, each with its observable consequence, and its most useful half is the list of what means nothing. The recognised notation is now declared as data in the contracts package, so Discovery tests each example against its own extractors while Agent Access builds the skill from the same entries (RN-AGT-017). (#47)
- **Transclusion arrived: `![[note]]` and `![[note#section]]` show the content of the target inside the note that cites it.** Before it, an embed was not missing behaviour but wrong behaviour: the interface emitted an `<img>` and the reader got a broken image icon. Expansion belongs to the reading surface and goes one level only, which breaks a cycle by construction; the transcluded block always says where it came from. Nothing changed in storage, in the write contract, in what the tools return or in what the export writes (RN-DSC-029, RN-AGT-015). (#22)
- **The task list became clickable, and it is the first write the interface makes.** Whoever has an effective writing role ticks and unticks in a note, in the Guidance and in the Template of each folder, and what reaches the server differs from the original by exactly one character. A task item inside a fenced block is not counted, clicks in sequence become one write, and ticking and unticking the same box produces no write at all (RN-KNW-028). (#23)
- **Writing the Guidance and the Template now requires the base revision.** Both routes accepted only the content, and whoever wrote last won, silently. `set_guidance` and `set_template` take `baseRevision`, and `get_guidance` entered because the Vault Context is a composed document and could not carry the revision. **This is the contract break of the cycle** (RN-KNW-034, RN-AGT-016). (#23)

- **The repository is written in en-US, with pt-BR left where it serves the user.** The language boundary had become a list of exceptions that grew with the project: prose in pt-BR and code in en-US, identifiers and ubiquitous language terms never translated inside a Portuguese sentence, except in the `README.md` and the `pt_BR` locale where two of them were, Keep a Changelog headings in English inside a Portuguese changelog, Conventional Commits prefixes likewise, branch names in en-US because "they are not prose". Each rule was defensible on its own; together they charged a tax on every paragraph written, and the practice was eroding the orthography the policy demanded. Roughly 66,000 words were translated across `docs/`, the `README.md`, `SECURITY.md`, the `CHANGELOG.md`, the issue templates, the triage command and this file, plus the repository labels. Four exceptions disappeared with the migration, and one rule fell by decision: the ban on the em dash, which was written against a problem of Portuguese. **The interface stays bilingual**, with `pt_BR` mandatory and Orientação and Modelo preserved, because that is where Portuguese speaks to whoever uses the product. Nothing else was rewritten: not the git history, not the issues and pull requests already written, and not the content of the example vaults. (#24)

- **The issue scheme was cut from 27 labels to 14, and most of what stayed is what GitHub already ships.** The repository had three custom axes and nine unused default labels, four of which were competing synonyms of our own: `bug` against `type:defect`, `documentation` against `type:documentation`, `enhancement` against `type:gap`, and `wontfix` against the `not planned` close we had just adopted. The four `type:` labels are gone and the native ones do that work; `open-question` is gone and `question` does it; `proposal` is gone because what it said, "scope closed", is what the **milestone** says; and `risk` and `technical-risk` are gone, with both kinds of issue now labelled `question`, which is what they have in common: they do not close on delivery. The nine `ctx:` labels became seven `domain:` and two `layer:`, with whole words instead of three-letter prefixes, because a label is read at a glance in a list and the correspondence with the `RN` prefixes belongs to the table in §6 of the vision, not to the name of the label. The two issue forms lost the redundant title prefix, and the proposal form opens labelled `enhancement`.

### Fixed

- **The `app:version` tag on every AWS resource is derived from `package.json` instead of typed by hand.** It had been asserting `0.2.0` since that release, through two cuts, so every resource in production is answering the wrong version to whoever asks the billing console or the tag editor. A version repeated by hand is a version that drifts.
- **The catalogue card shows the last update of the vault**, which was already in the response and was discarded in the mapping. The date is formatted by `Intl` in the active locale. (#43)
- **The `serverInfo` of the MCP stopped announcing a fixed version.** It answered `0.2.0` with the product on `0.3.0`, because the version was a literal. It is now derived from the manifest of the service itself, with a test comparing the answer to the manifest. (#46)
- **The route map of `architecture-guide.md` §14.1 matches the code again.** It documented two export routes that do not exist and omitted thirteen that do, and three further divergences left with it: the session answers at `GET /session`, the search accepts only `mode: lexical`, and the authorizer is not a route. (#44, #45)

### Removed

- **Purging and legal hold stopped being declared capabilities.** Neither ever had a route, a screen or a path of any kind. `RN-AUD-007`, `RN-AUD-008` and `RN-AUD-009` are marked as removed, keeping their numbers, and `RN-AUD-006` alone states what the product actually guarantees. The orphan code left with them: the `ContentErased` event and the `legalHold` field. (#26, #27)
- **`architecture-guide.md` stopped naming S3 Object Lock as the retention mechanism.** It was asserted in three places and had never been in any CDK stack. What protects the revisions is the append-only trail by IAM. (#27)

## [0.3.0] - 2026-08-29

The version that makes 0.2.0 stand up to use. No new bounded context and no new tool: the whole product already existed, and what was missing was for it to work on the screen it is being read on, to count what it promises to count, and to show the vault the way the vault writes itself.

### Added

- **The plan quota is enforced, and not merely declared** (RN-SUB-021). It measures the **current content**: the current revision of every note not deleted, plus every `Guidance` and `Template`. It refuses only what grows that total, with `LIMIT_EXCEEDED`, and the check happens before the content reaches storage. The count is kept by the outbox relay, outside the write transaction, which makes enforcement slightly delayed and the hot path untouched.
- **A recount tool for the storage counter**, in `deploy-aws/recount-storage.ps1`. Every derived number owes the same answer, which is how it remakes itself; it reports first and only writes with `-Apply`.
- **The user menu shows how much of the plan is in use**, with a thin bar, amber from 80% and red when full, and `GET /access/session` returns `usedBytes` and `quotaBytes`.
- **The product version appears in the footer of the user menu**, read from the `package.json` at build time.

### Changed

- **The interface fits the screen it is read on.** The stylesheet had not a single media query. Two breakpoints entered, each with a reason that can be measured: at `1180px` the sidebar yields width first, and at `860px` it becomes a drawer over the content. The panel grids, the folder tree row height, the carousel arrows and the window height in `dvh` came along.
- **The graph became a tool instead of a drawing.** The controls moved to a panel over the drawing; it is assembled from one switch per attribute, with no exclusive choice; each attribute gets a colour, and the colour belongs to the attribute and not to the value; clicking a value vertex holds its group, taking the rest of the vault off the screen instead of merely fading it; and it answers touch and resizes.
- **The reading surface follows the metrics of the default theme of the desktop vault editors**, because whoever reads the vault here wrote it there: the modular heading scale, the paragraph and list spacing, the 700px reading column, callouts as the elements those editors draw, and the note properties in their own panel. The palette stays the brand's.
- **Renaming and rewriting a note in the same call publishes one event, not two.** `NoteUpdated` is a portrait and not a difference, and the pair could arrive out of order, reindexing the note from the old content.
- **The facet projection reads every page of the vault and applies every delta.** A `Query` answers at most 1 MB, and a DynamoDB transaction carries a hundred items; both ceilings were silently truncating counters, permanently.
- **Note properties come back when the file was written with Windows line endings.** The frontmatter reader of the interface only understood `LF`, so every key with a value was silently discarded, on three quarters of the notes of the environment. It now reads the block the way the Discovery projection reads it, because the graph groups by what the projection saw and the property table is where somebody checks it.
- **The callout colours are legible, and the claim was measured.** Three failed contrast in the light theme; each hue now descends in luminosity until the title passes 4.5:1 against the field it lives in.
- **The navigation drawer opens with the brand signature at the top**, and the collapse control became an icon at the exact coordinate of the button that opened it.
- **§20 of `architecture-guide.md` describes the pipeline that exists**, not one that was never built: continuous integration with the five jobs that really run, and delivery by script as a decision, with the three reasons that sustain it.
- **The CI actions moved to the majors that run on Node 24.**

### Removed

- **The graph legend left the screen.** It repeated what the switch already said, since turning an attribute on is what gives it colour.

### Fixed

- The storage bar showed "0 GB" for a 1 GB quota, because the last unit range has no ceiling and dividing by `Infinity` zeroed every value from a gigabyte up.
- The header overflowed next to the logo on a phone; the slogan is the first thing to go below `860px`, and the wordmark stays.
- The vault sidebar took the whole screen on a phone, with a fixed width of `22rem`.
- The adapter tests run in continuous integration again. The job brought MinIO up from a four-year-old image that answers `NotImplemented` to the checksum headers the current AWS SDK sends, so 22 cases were reported as skipped and the only automatic gate of the adapters was off in practice. CI now brings the dependencies up from the same `docker-compose.yml` the local machine uses, with the images pinned and a healthcheck on both.

## [0.2.0] - 2026-08-28

The version that takes the product off paper. 0.1.0 had the canonical documentation, an interface prototype over seeded data and an authentication spike that was validated and torn down. 0.2.0 builds the whole product described in `software-vision.md`: the six bounded contexts, the complete infrastructure in CDK, the interface wired to the real API and the MCP connector with reading and writing.

Search by meaning left the version, with the whole vector index: the explanation is in `Removed`.

### Added

- **The MCP connector writes the whole vault, and not only its notes.** Seven authoring tools entered: `create_vault`, `delete_vault`, `set_guidance`, `create_folder`, `delete_folder`, `set_template` and `delete_note`.
- **The complete backend:** the Knowledge domain with the `Vault` aggregate and its five invariants, `Note` as a separate aggregate, the DynamoDB and S3 adapters, the outbox relay, the Access context with the whole subscription life cycle, the append-only audit trail, the Discovery projections (link graph, literal search, curation facets) and the export as a readable file tree.
- **Complete infrastructure in CDK:** the versioned content bucket, the event bus, the four tables with PITR, the product API, the outbox relay with a DLQ and a depth alarm, the audit consumer, the Discovery projector, the MCP server with the CIMD proxy and the frontend hosting.
- **`whoami`**, which answers who the connection represents and how the product expects to be used, with the help derived from the catalogue itself.
- **Search over the text of the vault, with a query language**: several terms, `"exact phrase"`, `-exclusion`, `OR`, parentheses and the fields `title:`, `folder:`, `content:` and `section:`; any other prefix is read as a frontmatter attribute of the vault.
- **Deleting a vault, reversibly**, and downloading the whole vault in one click, with the API answering a short-lived pre-signed link and never the bytes.
- **The subscription declares what it is and how much it may hold**, with a `type` and a storage `quota`, plus two administrative operations for operating an environment.
- **Bringing the environment up and down became a script**, in `deploy-aws/`: `deploy.ps1`, `destroy.ps1` and `onboard.ps1`, all three starting from the same preflight that points out the gaps with the command that resolves each one.
- **The first account of an empty pool becomes a platform administrator, and only the first.**
- The dependency rule checked in CI, the CI pipeline with the steps of the architecture guide, and `docker-compose.yml` with DynamoDB Local and MinIO.

### Changed

- **The workspace level was removed from the model.** The product goes from `Subscription → Workspace → Vault` to `Subscription → Vault`, and the effective role becomes `min(subscription role, vault ceiling)`.
- **The subscription lost its name.** What identifies it is the `SubscriptionId`, and who answers for it is its owner (RN-SUB-020).
- **The interface talks to the real backend**, with OAuth 2.1 and PKCE, and lost its second data source: the bundled seed that answered in place of the API made the screen look right while showing something else.
- **The sign-in screen answers at `auth.memorysmith.app`**, with the brand identity of the product, in the chosen language, and shows the full horizontal signature.
- **The vault screen is called Vault Context**, the same object the agent receives in `get_vault_context`.
- **The `README.md` tells the story of the product**, and the vault trees `onboard.ps1` writes moved to `deploy-aws/vaults`.
- **`onboard.ps1` hands the account over with a temporary password**, and reads the vault structure from `STRUCTURE.md` instead of from the directories.

### Removed

- **Search by meaning left the product.** The `semantic_search` tool and the whole vector index went with it. The reason was measured in the real environment: a 1024-dimension vector written as a list of numbers took 14 KB per chunk, so every 1 GB of Markdown became 10.6 GB of items, and each query read every chunk of the vault while the 1 MB page limit silently truncated it to 65. An index that lies silently is worse than the declared absence of one. The removal is deliberate and temporary.
- **The deployment no longer creates any account**, so no real person's e-mail stays in the repository and no deployment decides who operates the platform.
- **The onboarding screen left the interface.** Either the person enters with an active subscription, or they do not enter.

### Fixed

- The MCP server answered `500` on every call, because the function came from the spike and was bundled without the preamble the AWS SDK requires.
- The trigger that injects the subscription into the token was still the spike sketch, returning a fixed subscription for any user.
- Authorising the connector in Claude and ChatGPT stopped at the sign-in screen, because the branded UI is per app client and only the interface client had it.
- The vault catalogue always came back empty against the real environment, because the query looked for the vaults of a subscription in a partition that never exists.
- A query to the link projection stopped at the first page of results, so a vault with a few thousand notes would have half of its graph silently omitted.
- The home screen mixed two sources, showing the counts of the seed as if they were the ones of the real catalogue.
- Signing out did not end the session, direct navigation always landed on the sign-in screen despite a valid session, and the user menu read the simulated session of the prototype.
- The log groups of the CDK custom resources had no retention, and tearing the environment down left the log groups of the destroyed functions behind.

## [0.1.0] - 2026-08-26

### Added

- **The canonical documentation**: `docs/software-vision.md`, `docs/architecture-guide.md`, `docs/knowledge-base.md` and `CLAUDE.md`, replacing the old `DESIGN.md`, with explicit and non-overlapping responsibilities.
- **The MCP connector authentication spike**: `svc-agent` is born as an OAuth 2.1 Resource Server and a CIMD registration proxy in front of Cognito, validated end to end on a desktop and a web client.
- **The `memorysmith-infra` project** with the three minimal stacks of the spike, and the operational deployment guide in the `README.md`, including delegating the domain to Route 53.
- **The `memorysmith-frontend` skeleton** as a reading SPA over the seed, with i18n from the first screen, the vault graph, Mermaid diagrams and the curation dashboard.
- **The seed of vaults**, three real ones translated into the export format of the product and five fictional ones with sources inside the repository.

### Changed

- **The product was renamed from MemoryVault.guru to MemorySmith.app**, with the domain registered.
- **The tenancy model was replaced by the subscription model.** `Subscription` becomes at once the business object and the isolation boundary, with every key starting from it, and the role taxonomy was rewritten to `PLATFORM_ADMIN`, `OWNER`, `EDITOR` and `VIEWER`.
- **The platform surface is separated from customer data by construction:** a platform session carries no `subscription_id` claim, so no Knowledge repository can be instantiated under it.
- **The visual identity was defined and applied**, from the brand book: the graph-brain symbol, the palette and the typography.
- **DNS and certificates became infrastructure managed as code**, with ACM certificates validated by DNS in the hosted zone.
- **MCP client registration was decided**: `svc-agent` acts as an authorisation proxy implementing CIMD in front of Cognito, which offers no automatic client registration.
- **The repository layout was defined as three top-level projects**, with infrastructure outside the backend.
- **The language policy was revised**: the documentation of the repository in pt-BR and the source code in en-US. *(Superseded in this cycle: the whole repository is now en-US, with pt_BR only in the interface.)*

### Fixed

- The sidebar tree did not reflect navigation done outside it, the header slogan was in English in the `pt_BR` locale, and the brand symbol had a background square in dark mode.

### Removed

- `DESIGN.md`, redistributed among the three documents of `docs/`. The history stays available in git.

### Security

- The HMAC key signing the `state` of the CIMD proxy moved from a Lambda environment variable to Secrets Manager, read at runtime. As an environment variable the value sat in clear text.

[Unreleased]: https://github.com/memorysmithapp/memorysmithapp/compare/v0.4.1...HEAD
[0.4.1]: https://github.com/memorysmithapp/memorysmithapp/compare/v0.4.0...v0.4.1
[0.4.0]: https://github.com/memorysmithapp/memorysmithapp/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/memorysmithapp/memorysmithapp/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/memorysmithapp/memorysmithapp/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/memorysmithapp/memorysmithapp/releases/tag/v0.1.0
