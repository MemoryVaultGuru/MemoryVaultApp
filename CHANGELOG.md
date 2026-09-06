# Changelog

Every notable change to this project is recorded in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project adopts [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Entries up to 0.3.0 were condensed when the repository was translated to en-US: the fact
each one records is preserved, the reasoning behind it lives in the git history and in the
issues each entry cites.

## [Unreleased]

### Fixed

- **Coming back to a note shows what you wrote, not what it said before.** Ticking boxes, following a link and coming back showed the state from before the edit; only a reload fixed it. The write had landed all along — the cache was holding content the application itself had just overwritten. `staleTime: Infinity` means a query is never refetched on its own, and only a conflict invalidated anything, so a successful write updated the server and nothing else. A write now invalidates what it wrote, and the staleness policy of the interface is written down instead of being a comment saying somebody else would bring one. (#79)
- **A wikilink inside transcluded content is a link.** It reached the page with its brackets, unformatted and not navigable, because the transclusion rendered its content straight while every other reading surface resolves the wikilinks first. It shows worst on the link the one-level rule creates itself: an embed found inside embedded content is demoted to a wikilink, and §13.2 says that embed is drawn as **a link** to its target — raw text is not one. (#79)

## [0.5.2] - 2026-09-06

### Fixed

- **Ticking a second box no longer conflicts with the first.** Ticking one worked; ticking another a few seconds later answered a conflict on a note nobody else had touched. The client sent the revision it loaded with and never adopted the one its own write produced, so the second write claimed a revision the first had already retired — and the server was right to refuse it. Inside the two-second grouping window the clicks collapse into one write, which is why ticking quickly worked and ticking at an ordinary pace did not. **A conflict on a task box now means what it says:** somebody else, or an agent, wrote in that note. One person alone can no longer produce one. (#77)

### Changed

- **The three writes of a Content Slot answer the revision they produced.** The guidance already did; the note answered a summary, which carries none, and the template answered `204` and nothing at all. So a caller had no way to learn what to base its next edit on and could only echo the revision it loaded with. The note now answers the full DTO — its content costs nothing to include, since it is what the caller just sent — and the template answers `{ revision }` like the guidance. (#77)

## [0.5.1] - 2026-09-06

### Fixed

- **Ticking a task box now writes.** It answered *"someone wrote here first, and the content was reloaded"* on a note nobody else had touched. The API returns a note's `revision` as a `ContentRef` — an object — and the interface had retyped that response by hand as a `string`, so the whole object was echoed back as `baseRevision`, where the API requires a version. Every write was refused at validation and never reached the conflict check. It survived because the note was the one surface nobody had exercised: the box itself did not work from 0.4.0 until it was fixed in 0.5.0, so the write behind it had never run. The guidance and the template read the version and always worked. **The origin is fixed with the symptom:** the response is typed by the DTO the API publishes, so the next divergence between the interface's assumption and the contract is a build error rather than a screen that fails. (#75)
- **A write that fails says what failed.** One sentence was rendered for every failure — the conflict one — so a refused request, a session that had ended and a real conflict all announced that somebody had written first, which was wrong for two of the three. A message that invents a cause is worse than one that admits it does not know: it sends the reader looking for a person who was never there. The conflict sentence is now used only for a conflict, and everything else says what it was. (#75)

## [0.5.0] - 2026-09-06

### Added

- **Two vaults show the profile working, one in en-US and one in pt-BR.** The notation was proved in tests and demonstrated nowhere, and none of what proves it can be read by a person deciding whether to bring their knowledge here. `continuity-engineering` and `enologia` are the only artefact of the profile that is documentation, demonstration and fixture at once: every declared notation of the three rings appears in each of them **in context** — an alias that finds a note by its acronym, an embed that expands to a single identified block, a formula the subject actually uses, a checklist that writes back — and so does every rejection, written where somebody would have reached for it and beside the sentence saying what to write instead. They are **not translations of each other**: the same notations carried by different subject matter, which is what lets the pair show the four reserved keys in en-US on both sides while `regiao`, `tipo` and `colhida_em` stay in the language of whoever keeps the vault. A test guards both directions — every declared entry appears in each vault, and neither vault demonstrates a notation the profile does not declare — because a hand-written vault is the first thing to age when a notation changes, and it ages while teaching the wrong version to precisely the person who is learning. (#69)
- **A vault arriving with inline `#tags` is offered the conversion, as a method the product teaches rather than an operation it performs.** The curation those tags carried is lost here, and that is the declared cost of rejecting the notation, paid at the door by whoever is arriving. `get_skill` now serves `convert-inline-tags`: how to tell a tag from a heading, a hex colour, `C#`, an issue number and a URL fragment; to propose per note and in full, showing what would be written **and what was rejected**; to wait for a person to accept rather than proceeding unless told otherwise; to write one note at a time with `update_note` and its `baseRevision`, so each conversion is an ordinary authored write with a revision of its own in the history; and to leave the body untouched, because the inline tag is the author's bytes and leaving it makes the whole thing reversible. It is a skill and not an endpoint on purpose: reading `#subject` for meaning would make the backend a third sanctioned reader of content, and buying back the cost of a rejection by spending the guarantee that motivated it is not a trade this product makes (RN-PRT-007). (#68)
- **The rest of the vault ring renders: `==highlight==`, `%%comment%%`, `^block-id` and `![[note#^id]]`.** All three were already written in the example vaults and did nothing. Marked text is marked. A comment leaves the page and **stays in the bytes**, so `read_note` returns it and the export writes it — an agent sees what a person on the page does not, and that asymmetry is declared rather than discovered, because text somebody did not want *on the page* is still text they wrote. A block identifier names its block and never shows, and an embed of it renders that block and produces **exactly** the edge a plain wikilink produces (RN-DSC-035). (#66)
- **Mathematics renders, and a price does not become a formula.** `$inline$` and `$$block$$` are rendered with KaTeX. The rule that makes it usable is the one the profile states and the library does not implement: a `$` followed by whitespace does not open a formula and one preceded by whitespace does not close one, so `costs $30 a month, and the plan $60` stays two prices instead of turning the sentence between them into mathematics. (#67)
- **Raw HTML is declared off, as a security boundary.** It was already not rendered, by omission; it is now behaviour with a reason and a test. A note carrying `<script>`, an `onerror` handler or an `<iframe>` is escaped and shown as text, because a vault is written by several people and by agents and a page that renders arbitrary HTML out of one is a script injection whose trigger is written by whoever wrote the note. Superscript and subscript follow from it and have **no notation** here, which is a decision: the GitHub form needs the HTML this forbids, and the Pandoc form renders in no vault editor and would collide with a block identifier. GFM's single-tilde strikethrough is switched off for the same reason — left on, it turned `H~2~O` into struck-through text, which is a worse answer than nothing. (#67)
- **Every wait now shows the shape of what is coming.** The product had exactly two ways of rendering a wait and neither said anything: a blank area of viewport — what every page load and every deep link showed first — and one line of grey text standing in for a whole screen. Eight surfaces now draw a placeholder matched to the frame the real content occupies: the application while the session resolves, the vault catalogue, the KPI tiles and the facet charts, the note, a template card, an embedded block mid-paragraph, the folder tree and the graph canvas. The vault layout is the one that pays for itself first — its sidebar, brand, search box and navigation are known before the request leaves and are no longer withheld, so the frame does not jump when the structure arrives. One reusable primitive, not eight grey boxes; the shimmer stops under `prefers-reduced-motion`; every region carries `aria-busy` and keeps the word "loading" for whoever hears the page. A placeholder belongs to the wait alone, which is what #53 made possible. The graph also stops swallowing its own failure: a request that fails no longer renders as an empty vault. (#58)
- **A date can be searched over an interval, and not only at a point.** `created:>=2026-01-01`, `updated:<2026-04-01` and the range `created:2026-01-01..2026-03-31` answer the ordinary questions of curation: what came in during the first quarter, what has not been revised since March. This is the first operator the query language has ever had, so its shape sets the precedent: the comparison is the primitive, because it composes with the boolean operators already there and needs no second syntax for an open interval, and the range is sugar for two comparisons with both ends inclusive, so there is one semantics to implement, to test and to explain. An operand keeps its prefix granularity, which makes a month a legal end of an interval. Two things are refused rather than answered empty, because an empty result reads as "there is nothing filed under that" and neither of these means it: an interval over an attribute the vault does not hold as a date, and a range whose ends are inverted (RN-DSC-034). (#64)
- **The inline `#tag` is declared as carrying no meaning, and the reading surface is held to it.** `#subject` in the body of a note becomes neither an edge nor a facet: the bytes are stored and returned exactly as written, and the page renders it as plain text — no chip, no colour, no click, because an affordance without the function it promises is worse than the raw text. Two established lineages read the inline hashtag in incompatible ways, as a link and as file metadata, so there is nothing to inherit; here the curation vocabulary lives in the frontmatter, where the Guidance governs it. Reading it would also need a third sanctioned reader of content and a real Markdown parser in the backend, against PP4, and in a survey of the 1,562 notes of the example vaults one of the three inline matches was a hex colour. To group, write `tags:`; to connect, write `[[wikilink]]` (RN-DSC-033). (#63)
- **The frontmatter vocabulary is declared, and two of the four keys now do something.** `aliases`, `tags`, `created` and `updated` are reserved by the profile, always written in en-US, and the interface may show the label translated and never the bytes — a vault kept in Portuguese still stores `created` and still answers `created:2026-09`. Reserving is declaring rather than enforcing: a reserved key whose value has the wrong shape degrades to an ordinary attribute instead of being an error, and `title` is deliberately not reserved. A facet of kind `date` now matches by **prefix**, so `created:2026`, `created:2026-09` and `created:2026-09-03` are the three granularities and `created:09` matches nothing, where substring made a fragment of the middle stand for a date. And the entries of `aliases` join the search index as other spellings of the note, answering wherever the title does and ranking as a title hit, so a vault of technical terms is found by its acronyms. They do **not** resolve wikilinks (RN-DSC-030, RN-DSC-031, RN-DSC-032). (#62)
- **Entering a vault resumes at the note you were reading.** Every visit started at the tree, and getting back to the note open in the previous session meant walking the folder structure again, every time. The last note opened is now remembered per vault, and arriving at the vault goes straight to it. It is remembered in the browser and nowhere else: which note somebody read last is a convenience of that machine, not a fact of the product, and storing it on the server would be a write on every note opened — on the hottest path of the reading surface, against the quota, carrying an authorship that reading does not have. It resumes on arrival and not on request, so the vault name in the sidebar still reaches the Vault Context, and a note that has since been deleted, renamed or moved is forgotten in silence and lands on the tree instead of on a not-found line. (#56, #72)

### Changed

- **The repository no longer names the editor whose reading metrics the interface follows.** The comments of the stylesheet and of the Markdown readers, `docs/knowledge-base.md`, `docs/software-vision.md` §13.2, `CLAUDE.md` and the entry of 0.3.0 now speak of the desktop vault editors as a family, which is what the decision was always about: the metrics are shared by the tools that read a folder of Markdown files, and naming one of them read as a dependency the product does not have. The content of the example vaults is untouched, because it is vault content and not repository documentation, and `.obsidian/` stays in `.gitignore`, in `.dockerignore` and in the ignore list of `build-vaults.mjs`, because there it is the name of a directory on disk and not a citation.

### Changed

- **Signing out goes straight to the sign-in page, with no click in between.** The product had two doors into that page and they behaved differently with nothing on screen to explain why: arriving without a session handed the browser to the identity provider, while signing out stopped at a card with a button that asked for nothing, because the provider owns the credentials. The reason recorded for that asymmetry was a loop — handing the browser back to a still-warm provider session would sign the person straight in again — and it was checked against the deployed pool before being reversed: `signOut()` goes through the Cognito `/logout` endpoint, which ends the hosted session, and the handover that follows lands on a credentials form. There was no loop left to guard against. The two paths that keep the button are untouched and now pinned by tests: an account that reaches nothing, which is the one fact a person cannot discover any other way, and a sign-in that came back empty, which is the loop guard itself. (#59)
- **The product stopped declaring its own notation and started implementing a published one.** The list of what it reads used to live in `packages/contracts` as a private declaration. It is now the [MemorySmith Markdown Profile](https://github.com/memorysmithapp/markdown-profile) `0.1.0`, a specification with a version of its own, carrying the notation as prose, as data and as an executable suite. `RECOGNISED_NOTATION` is a projection of `profile.json` rather than a list beside it, the Discovery conformance test runs the **published cases** instead of a transcription of them, and the version is pinned once, in the `catalog:` of `pnpm-workspace.yaml`, so the two packages that read it cannot drift onto two versions of one specification. A specification and an implementation that keep separate copies of the same list drift apart on the first cycle, and the drift is silent — which is exactly the failure the profile exists to prevent one layer up, for the vaults (RN-AGT-022). (#61)
- **The declared notation now covers the reading surface, and each entry is proved by a test of its own kind.** The profile declares callouts, mermaid, transclusion, the visible pending link and the interactive task list under a `reading-surface` reader — behaviour this product has and nothing proved. A conformance test in the frontend runs every one of those entries through the real renderer, and a declared entry with no expectation written for it fails the test instead of being discovered later in a browser. It earned its place on its first run, the way the published suite did against the extractors: it found #71 (RN-AGT-023). (#61)
- **`get_skill` teaches the three rings and cites the version it is teaching.** The notation table gained the ring each form belongs to, and the skill now opens by naming the profile, its version and its address, with CommonMark and GFM named as the two base specifications. "Which Markdown is this" is the question underneath every other one an agent has about writing here, and it is answered with a specification rather than with a list of forms. (#61)
- **The MCP surface no longer cites business rule codes at the agent.** The `whoami` help ended the paragraph about folder identifiers with `(RN-AGT-020)`, and the vault role-limit validation answered with `(RN-ACC-012)` in its message. Those codes name lines of `docs/software-vision.md`, a document whoever reads the connector has no access to: inside a served answer the code is a symbol that does not resolve, dropped as noise or mistaken for something addressable. Both sentences already stated the whole fact without it. The traceability stays where the other ~50 occurrences are — in comments and docblocks — and a test now walks everything the connector serves, the `whoami` text, every tool title, description and schema, every skill and every declared notation, and fails on a rule code found in any of them (RN-AGT-021). (#52)

### Fixed

- **A wikilink to a title with a decimal number no longer renders as pending.** `[[Lei 14.133]]` is a real edge — the backend resolved it, the backlink exists, the graph carries the connection — and the reading surface drew it as a link to a note that does not exist yet. The slug is computed twice, once in the kernel for storage and once in the interface to turn a wikilink into a URL, and the second copy was missing two of the six steps the profile specifies: the `.` or `,` **between two digits**, which belongs to the number and not to the words around it, and the truncation at eighty characters. So the interface addressed `lei-14-133`, found nothing under it, and told the person a note they had written did not exist. It fired wherever a title carries a decimal number, which is where these vaults live: norms, articles, versions, measurements. The two implementations are now pinned not to each other but to the **published conformance cases** — nine of which fail the moment the rule drifts again, including one that was already in the suite and had never been pointed at this side of the product. (#73)
- **The task box works: the first write the web interface makes did nothing on any note.** Clicking a checkbox changed nothing on screen and wrote nothing, in every vault, whatever the role. The cause was one line: the item decided whether it was a task by reading `checked` off the node react-markdown hands a component, and version 9 hands a **hast** element, which carries no such property. Every item therefore fell through to the plain branch and reached the screen as the checkbox GFM renders by default — `disabled`, with no handler on it. The state is now read where it actually is, on the child input, our box replaces GFM's instead of sitting beside it, and the class react-markdown passes in no longer overwrites ours. Found by the reading-surface conformance test of the profile, on its first run. (#54, #71)
- **A session that can no longer be renewed ends, instead of leaving the interface loading forever.** A tab left open past the second hour stopped working and never said so: the screen sat on **Loading…**, a reload changed nothing, and signing out was the only way through. Three defects composed into that. The first silent refresh wrote `null` over the refresh token, because Cognito does not return one on a refresh and a missing field was read as a revoked credential — a two-hour fuse on a credential valid for thirty days. Nothing reacted to `UNAUTHENTICATED`, so the guard kept letting the person in on a stale token and the session was rebuilt from claims the API had just refused. And the dashboard decided with `isLoading || !data`, which sends an errored query to the loading branch and keeps it there. The credential now survives every refresh, a token that cannot authenticate ends the session in one place and returns the person to the sign-in screen with the reason, and a screen waiting on a request that has already failed says what failed (RN-SUB-022). (#53)
- **A frontmatter list with one item is classified as a list, so an attribute no longer changes kind when a second value arrives.** `tags: [contracts]` was read as an `enum` and `tags: [contracts, budget]` as a `list`, because the classification was decided by how many values an entry happened to hold rather than by the form the author wrote. The same attribute therefore had two kinds across the notes of one vault, settled by a fact about whichever note was being read, and everything downstream that reads the kind became inconsistent for a reason invisible from the note. The frontmatter reader now carries the written form out with the values, and RN-DSC-020 — which has always said the classification is by shape — is what the code obeys. The reading surface already drew a list of one as a list, and is now pinned to the same cases so the two agree by rule instead of by coincidence. (#70)

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

[Unreleased]: https://github.com/memorysmithapp/memorysmithapp/compare/v0.5.2...HEAD
[0.5.2]: https://github.com/memorysmithapp/memorysmithapp/compare/v0.5.1...v0.5.2
[0.5.1]: https://github.com/memorysmithapp/memorysmithapp/compare/v0.5.0...v0.5.1
[0.5.0]: https://github.com/memorysmithapp/memorysmithapp/compare/v0.4.1...v0.5.0
[0.4.1]: https://github.com/memorysmithapp/memorysmithapp/compare/v0.4.0...v0.4.1
[0.4.0]: https://github.com/memorysmithapp/memorysmithapp/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/memorysmithapp/memorysmithapp/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/memorysmithapp/memorysmithapp/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/memorysmithapp/memorysmithapp/releases/tag/v0.1.0
