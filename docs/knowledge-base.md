# Knowledge Base: Markdown Knowledge Bases and the Agent Ecosystem

This document gathers the **facts of the domain** MemorySmith.app operates in, things that would still be true if the product did not exist: formats, established practices, open protocols, retrieval techniques and regulatory obligations.

It holds no product entities, no business rules (`RN-XXX`) and no architecture decisions. For the product, see [`software-vision.md`](software-vision.md); for the engineering, see [`architecture-guide.md`](architecture-guide.md).

---

## Contents

1. [Markdown as a knowledge format](#1-markdown-as-a-knowledge-format)
2. [Knowledge management practice in files](#2-knowledge-management-practice-in-files)
3. [Model Context Protocol (MCP)](#3-model-context-protocol-mcp)
4. [Context engineering](#4-context-engineering)
5. [Retrieval: lexical, vector and graph](#5-retrieval-lexical-vector-and-graph)
6. [Collaboration and concurrency in text bases](#6-collaboration-and-concurrency-in-text-bases)
7. [Auditing, provenance and regulated domains](#7-auditing-provenance-and-regulated-domains)
8. [LGPD](#8-lgpd)
9. [Multi-tenant SaaS: general concepts](#9-multi-tenant-saas-general-concepts)
10. [Portability and lock-in](#10-portability-and-lock-in)
11. [Glossary](#11-glossary)
12. [References](#12-references)

---

## 1. Markdown as a knowledge format

### 1.1 What is standardised and what is convention

Markdown was created by John Gruber in 2004 as a writing syntax readable in plain text. The original specification is informal and ambiguous in several places, which produced diverging implementations. Two initiatives reduced the problem:

| Layer | What it defines | Status |
|---|---|---|
| **CommonMark** | A strict specification: paragraphs, emphasis, lists, ATX and setext headings, code blocks, inline and reference links, images, embedded HTML | A formal specification with a test suite |
| **GitHub Flavored Markdown (GFM)** | CommonMark plus tables, task lists, autolinks and strikethrough | A documented superset of CommonMark |

Everything else is a **tool convention**, not part of the format. That matters for any system processing third-party Markdown: only the standardised core is safe to interpret, and the rest may mean different things in each editor.

**Those two are the whole list, and not even their authors stay inside them.** GitHub renders alerts, footnotes and mermaid diagrams, none of which are in the GFM specification it wrote; the desktop vault editors render wikilinks, embeds, callouts and block identifiers, none of which are in any specification at all. So "it works on GitHub" and "it works in my editor" are statements about one renderer, not about the format, and a system that reads third-party Markdown gets no help from either. The only way out of that is for a tool to publish what it means — as prose, as data and as an executable suite — so an author can tell what will happen before writing it. That is what the MemorySmith Markdown Profile is, and what this product implements a version of (`software-vision.md` §11, RN-AGT-022).

### 1.2 Frontmatter

Frontmatter is a metadata block at the top of the file, delimited by `---`, almost always in YAML:

```markdown
---
title: Lei 14.133, Art. 75
vigencia: 2021-04-01
tags: [licitacao, dispensa]
---

# Contratação direta por dispensa
```

**Frontmatter is part of neither CommonMark nor GFM.** It is a convention born in Jekyll (2008) that spread across static site generators and note-taking tools. The practical consequences:

- Field names are not standardised. `tags`, `keywords` and `categories` coexist, and each tool reads its own.
- A pure CommonMark parser treats the block as content (the first `---` line becomes a horizontal rule or a setext heading, depending on what follows).
- Any system that **requires** a frontmatter schema is imposing a convention of its own on the content of the user.

### 1.3 Links: wikilinks and relative links

Two forms coexist in file-based knowledge bases:

| Form | Syntax | Origin | Standardised? |
|---|---|---|---|
| **Relative Markdown link** | `[text](../folder/note.md)` | CommonMark | Yes |
| **Wikilink** | `[[note]]` or `[[note\|text]]` | Wikis (WikiWikiWeb, 1995); repopularised by Roam Research and the vault editors that followed it | No |

The wikilink resolves by **name**, not by path: whoever writes it does not have to know where the target lives. That is why it dominates in personal bases, where notes move between folders often. The relative link, by contrast, breaks whenever either of the two notes changes place, which makes it a poor choice for content that will be reorganised.

Details any resolver has to decide:

- **The extension.** `[[note]]` and `[[note.md]]` normally designate the same target.
- **The anchor.** `[[note#section]]` points at a heading inside the note.
- **The alias.** `[[note|how it reads in the text]]` separates target from label.
- **The scope.** The name is unique within what? The folder, the whole base, the system?
- **A non-existent target.** In the vault editors, a link to a note that does not exist yet is valid and becomes the gesture of creating it. Discarding it impoverishes the graph precisely while the base is being written.

### 1.4 Why Markdown won for knowledge bases

- **Readable without a tool.** The raw file is the content, with no decoding layer.
- **Versionable.** Line diffs work, which makes git a useful history.
- **Portable.** A `.md` file outlives the disappearance of the editor that created it.
- **Natively digestible by an LLM.** Language models were trained on an enormous volume of Markdown, and headings and lists are structure the model already reads as structure, with no extra instruction.

The last point is what changed the calculation in recent years: a format humans chose for convenience turned out to be the cheapest format to hand to a machine.

---

## 2. Knowledge management practice in files

### 2.1 The canonical arrangement

The de facto standard in personal knowledge management (PKM) is a **folder of `.md` files**, versioned or synced, opened by an editor that understands links between notes. That folder is what those editors call a *vault*; Logseq, Foam, Dendron, Zettlr and others use the same arrangement under different names.

What those tools add to the file system:

- **Backlinks:** the list of notes pointing at the open note. It is the half the file system does not give.
- **Graph view:** the base drawn as a network of nodes and edges.
- **Templates:** moulds applied when a new note is created.
- **Search:** lexical, over the text of every file.

### 2.2 Schools of organisation

| School | Central idea | Structural consequence |
|---|---|---|
| **Zettelkasten** (Niklas Luhmann) | Atomic notes, one idea per note, connected by links; structure emerges from the connections | The folder hierarchy is secondary; the graph is the map |
| **PARA** (Tiago Forte) | Four top categories: Projects, Areas, Resources, Archives | A strong hierarchy, oriented to action |
| **Digital garden** | Notes published in a permanently unfinished state, revised continuously | Values links and revision over completeness |
| **MOC** (Map of Content) | Curated index notes pointing at sets of notes | Navigation by hubs instead of folders |

None of them is "the right one". What they have in common, and what matters here: **the organisation is decided by whoever writes, and it has to be declared somewhere so that another person, or another agent, can contribute without breaking it.**

### 2.3 Guidance and templates as practice

Two recurring, tool-independent conventions:

- **A guidance document at the root** (`README.md`, `000 Index.md`, `Home.md`) explaining what the base is for and how to write in it.
- **A mould per category of note** (`TEMPLATE.md`, a `_templates/` folder) describing the expected sections.

When the base is read by a human, those documents are a courtesy. **When it is written by an agent, they stop being documentation and become executable instructions**: they are what decides whether the note is born in the right folder and with the right structure. The quality of what enters the base becomes a direct function of the quality of those two texts, and the effect only shows up later, at consumption.

### 2.4 The hygiene of a base

Three signals measure the health of a base linked by links:

| Signal | What it is | What it indicates |
|---|---|---|
| **Broken link** | Points at a target that does not exist | A note removed, renamed, or never written |
| **Orphan note** | No note points at it | Content unreachable by navigation; frequently forgotten |
| **Pending link** | Points at something that does not exist yet, but should | Work declared and not done. In Zettelkasten, it is considered a positive signal |

The distinction between "broken" and "pending" is one of intent, not of mechanism: both are the same unresolved edge.

### 2.5 Where the local arrangement stops

The folder-with-an-editor arrangement works very well for one person and fails at three predictable points:

1. **Collaboration.** Syncing files does not solve concurrent editing. Dropbox and similar tools produce conflicted files; git requires everyone involved to operate git.
2. **Remote reading.** Vault editors are local clients. Reading the base from another device, or from inside another tool, is outside the design.
3. **Multiple bases.** Separating subjects requires multiple loose folders, with no place listing them, describing them and controlling access.

---
## 3. Model Context Protocol (MCP)

### 3.1 The problem it solves

Before MCP, every LLM application integrated every data source with code of its own: *M* applications × *N* sources produced *M×N* integrations. MCP is an open protocol, published by Anthropic in late 2024, that standardises that edge: the source implements the protocol once (a *server*) and any application that speaks it (a *client*) consumes it.

Message transport is **JSON-RPC 2.0**, with an initialisation phase where client and server negotiate the protocol version and the capabilities.

### 3.2 Primitives

The server may offer three primitives:

| Primitive | What it is | Who decides to use it |
|---|---|---|
| **Tool** | An executable operation, with a declared input schema | The model, while reasoning |
| **Resource** | A piece of data addressable by URI, read as context | The client application |
| **Prompt** | A parameterised interaction template, offered to the user | The user |

The client, in turn, may offer capabilities to the server: *sampling* (asking the model for a completion), *roots* (stating which directories or URIs are in scope) and *elicitation* (asking the user for extra information).

In practice, **tools are the primitive with the most uniform support across clients**. A server that has to work everywhere exposes its capabilities as tools.

### 3.3 Transports

| Transport | Use |
|---|---|
| **stdio** | The server runs as a local process, communicating over standard input and output. Simple, with no network and no authentication, since the process runs as the user themselves. |
| **Streamable HTTP** | A remote server reachable over HTTP, with responses that can be streamed. It replaced the HTTP+SSE transport of the first revisions of the protocol. |

A remote server is what lets a hosted base be consumed by clients the user does not control, and it is what brings the authorisation problem along.

### 3.4 Authorisation of remote MCP servers

The MCP authorisation specification rests entirely on existing OAuth 2.1 standards, instead of inventing a scheme of its own. The pieces:

| Standard | RFC | Role |
|---|---|---|
| **OAuth 2.1** | draft (a consolidation of OAuth 2.0 and its BCPs) | The base: mandatory PKCE, no implicit grant, no password grant |
| **Protected Resource Metadata** | RFC 9728 | The MCP server declares, in a well-known document, **which** authorization server protects it |
| **Authorization Server Metadata** | RFC 8414 | The authorization server declares its endpoints |
| **Client ID Metadata Documents** | IETF draft (*client-id-metadata-document*) | The client uses an HTTPS URL as its `client_id`; the authorization server fetches a JSON document with the client metadata from that URL, doing away with prior registration |
| **Dynamic Client Registration** | RFC 7591 | The client registers itself with the authorization server, with no human intervention. Deprecated by the MCP specification in favour of CIMD, kept for backward compatibility |
| **PKCE** | RFC 7636 | Protects the authorization code flow against interception |
| **Resource Indicators** | RFC 8707 | The token is issued for a specific resource, and does not work for another |

The roles of the actors: the **MCP server is the Resource Server**, and identity stays with a separate **Authorization Server**.

**The practical point of friction is client registration.** The specification recognises three mechanisms, in order of preference: pre-registered credentials when client and server already know each other, CIMD when the authorization server announces `client_id_metadata_document_supported` in its metadata, and DCR only for backward compatibility. When none of the automatic mechanisms is available, the user pastes a `client_id` and a `client_secret` by hand into the connector configuration: it works, because clients accept manually entered credentials by specification, but it transfers configuration work to somebody who only wanted to connect.

Support among identity providers is uneven, and the absence is usually a product decision, not a gap: providers aimed at the enterprise market, such as Amazon Cognito and Microsoft Entra ID, implement neither DCR nor CIMD, because they prioritise governance and traceability of each registered client over the convenience of automatic registration. Providers aimed at developers, such as WorkOS AuthKit and Auth0, do implement them. A resource server in front of a provider without support can close that gap by publishing its own authorization server metadata and acting as a broker for the registration, without issuing tokens of its own.

On the client side, the Anthropic surfaces (web, desktop, mobile and CLI) share the same authentication infrastructure and support CIMD natively, and the official connector documentation recommends CIMD over DCR: with DCR, every new connection registers a new OAuth client, which bloats the authorization server of whoever hosts it.

**The choice of CIMD by those clients is conditional, and the condition has two parts.** The client only selects CIMD when the authorization server metadata announces, at the same time, `client_id_metadata_document_supported: true` and the value `none` in `token_endpoint_auth_methods_supported`. The second item exists because a CIMD client presents itself as a public client at the token endpoint, with no secret. Missing either of the two, the client falls back to DCR, and an authorization server that does not publish a `registration_endpoint` fails the whole connection. Announcing only the first key is therefore a silent failure mode: the metadata looks correct and the flow never starts.

Other contracts the same set of clients imposes on the server, and which hold in the design of any resource server meaning to serve them:

| Contract | Requirement |
|---|---|
| Discovery challenge | The `401` has to carry `WWW-Authenticate` with `resource_metadata`. The same header on a `200` response is ignored |
| Resource match | The `resource` field of the protected resource document has to match exactly the URL the user typed, path component included |
| Order of authorization servers | If the document lists more than one, the first is used and there is no attempt at the others |
| Redirect URI | The hosted surfaces use a fixed callback; the command-line client uses RFC 8252 loopback on an ephemeral port, which forces the server to match `localhost` and `127.0.0.1` ignoring the port |
| PKCE | `S256` on every authorisation request, and the method has to be announced in the metadata |
| Time tolerance | Around ten seconds for discovery, registration and token, and thirty seconds for refresh. Overshooting is treated as a failure, even if the server answers later |
| Refresh | Error codes per RFC 6749 (`invalid_grant`, not a code of your own) and refresh token rotation, because it is a public client |
| Traffic origin | Requests come from a published IP range, which matters when there is a WAF or conditional access in front of the identity provider |

### 3.5 Clients

One remote MCP server may be consumed by quite different clients: web and desktop applications, command-line tools, agentic working environments and IDEs. That changes two things for whoever writes the server:

- **The tool description is user interface.** It is the text the model reads to decide whether and how to call. A vague description produces the wrong call as easily as a badly labelled button produces the wrong click.
- **Platform memory does not cross the vendor boundary.** What a client retains about whoever uses it, preferences, project context, conversation history, is a resource of that product and that user: it is not read by the client of another maker nor by the agent of another person. In a group where each person picked their own tool, platform memory fragments by person and by vendor at once. An MCP server is the opposite of that: the state lives on the server side, and any client that speaks the protocol reaches the same state.
- **The session may be long and non-interactive.** An automated ingestion job runs for a long time with nobody watching. Any ambiguous state that could change midway, such as which organisation is active, has to be fixed at the start, and not resolved by default on every call.

### 3.6 Good practice in tool design

- **Few tools, well named.** A large surface dilutes the attention of the model and raises the chance of a wrong choice.
- **One call that solves the common case.** If understanding the state of the system takes five chained calls, the cost in tokens and latency kills the usage.
- **An actionable error.** The error message is read by the model and becomes the next action. "Invalid argument" wastes the turn; "`folder` is missing; the available folders are A, B, C" resolves it.
- **Explicit idempotency.** Transport retries are routine. If the second identical call creates a second thing, the base fills up with silent duplicates.
- **Declared concurrency.** A blind write overwrites somebody else's work. The established pattern is to require the base version on an update and refuse when it has diverged.

### 3.7 Connector distribution: curated directories

Publishing a remote MCP server on the internet makes it usable, not discoverable. Between the server existing and a user finding it there is a second layer, that of the **curated directories** maintained by the client vendors.

The difference is visible to whoever connects. A server outside the directory is added as a **custom connector**: the user pastes the URL and answers a form about the authentication type, the client registration mechanism and the transport. A listed server appears in the list of ready connectors and connects in one click, because those answers were already given by the developer at submission and checked in review. Being listed changes neither the exposed tools nor runtime behaviour: it changes only discovery and the friction of the first connection.

The curation model usually has two levels: an approved server enters with a community label, and the ones that prove most useful may be promoted to a verified label, whose review is slower and includes functional testing of each tool. The label is a quality signal to the user, not a different mode of operation.

**The acceptance criteria are mostly about design, not infrastructure**, and that is why they matter before submission:

- **A mandatory annotation on every tool.** Each one declares a readable title and a read (`readOnlyHint`) or destructive (`destructiveHint`) hint. It is not catalogue bureaucracy: it is what decides whether the client runs the tool without confirmation on every call or always asks the user. A write tool with no hint produces permanent friction, listed or not.
- **Separation of reading and writing.** A single tool accepting safe and unsafe methods according to an argument is refused. Documenting the difference in the description does not replace splitting it into distinct tools.
- **A description matching the behaviour.** The description is read by the model, so a vague description is a functional defect. Descriptions instructing the model to act outside the function of the tool, pulling instructions from an external source or carrying hidden text are treated as an attempted prompt injection and rejected.
- **An actionable error.** A generic error with no detail fails review, for the same reason as §3.6.
- **A public privacy policy.** Missing or incomplete is usually an immediate rejection.
- **Ownership of the API.** The server has to call an API of its own, or a third-party one with consent. Wrapping somebody else's API does not pass.
- **A populated test account.** The reviewer has to exercise each tool end to end, which requires data, not merely a valid credential.

There is also an account requirement that is not technical and is usually discovered late: the submission portal for remote servers lives in the organisation settings of the client, which requires an enterprise plan. Individual plans do not expose that area.

Two categories of connector are refused by policy, regardless of quality: those transferring money or financial assets, and those generating images, video or audio through an AI model (drawing tools producing diagrams and schematics are accepted).

---

## 4. Context engineering

### 4.1 The window is a scarce resource

An LLM reasons over what is in the context window. That creates three simultaneous pressures:

- **Cost:** input tokens are paid for on every call.
- **Latency:** a larger context takes longer to process.
- **Quality:** attention is not uniform along the window. Information buried in the middle of a very large context is attended to less reliably than the same information in a lean context, an effect documented in the literature as *lost in the middle*.

The practical conclusion is counterintuitive: **delivering everything is not delivering better**. An annotated index of 40 lines may produce a better result than a dump of 400 notes.

### 4.2 Executable instruction versus documentation

When an agent writes in a base, the text describing the base stops being descriptive and becomes prescriptive. Three levels, from the most general to the most specific:

| Level | Answers | If it is weak |
|---|---|---|
| Guidance of the base | "what is this for and how does one write here?" | The note is born with the wrong tone, granularity and vocabulary |
| Description of each category or folder | "what is kept here?" | The note is born in the wrong place |
| The mould of the note | "how is this note structured?" | The note is born without the sections consumption will later look for |

The effect of a weak text at any of the three levels is **deferred**: it does not show up at ingestion, it shows up months later, when somebody tries to use the base and discovers it is inconsistent.

### 4.3 Declared structure versus inferred structure

An agent facing a folder of files infers the organisation from the names. An agent facing a **declared** structure, with each category describing what it holds and with a deliberate order, has nothing to infer.

The difference is larger in writing than in reading. For reading, inferring wrongly costs one extra search. For writing, inferring wrongly costs a note in the wrong place, which will only be discovered later, if at all.

### 4.4 AI fluency: the four Ds and the shared memory

Working well with an agent is a described competence, not a personal talent. The *AI Fluency* framework organises that competence into four practices, the four Ds:

| Practice | What it is |
|---|---|
| ***Delegation*** | Deciding what stays with the person, what goes to the agent and how the work divides between the two |
| ***Description*** | Communicating to the agent what is wanted: the context of the problem, the expected product and the process to follow |
| ***Discernment*** | Critically assessing what comes back, the result, the reasoning and the behaviour, instead of accepting it by plausibility |
| ***Diligence*** | Answering for what is produced with the agent: choosing the tool, being transparent about the use and verifying before publishing |

All four share a rarely discussed dependency: **a shared body of knowledge, persistent and readable by both parties**. Without it, each practice pays a tax that is not attributed to the right cause.

| Practice | The tax when there is no shared base |
|---|---|
| *Delegation* | Only a task the agent can reach gets delegated. If the material is in a local folder or in somebody's head, what gets delegated is the retyping of the context, not the work |
| *Description* | Context written down nowhere is redescribed every session, slightly differently each time, which moves the result without anyone identifying the cause |
| *Discernment* | Assessing requires a reference. An answer with no source can only be judged by plausibility, which is exactly the criterion a model optimises |
| *Diligence* | Answering for a piece of work means being able to show which material it rested on, who wrote that material and what it said on the date |

It is the conclusion of §4.3 seen from the other side. The shared base is not the file where the result is deposited at the end: it is the condition for the collaboration to be good from the start. And to play that role, it has to be cheap in both directions, cheap to write, because whoever writes in it most is the agent during the work, and cheap to read, because the person has to judge, correct and decide over it without switching tools.

---
## 5. Retrieval: lexical, vector and graph

### 5.1 Lexical search

Term matching: `LIKE`, an inverted index, BM25. Cheap, exact, explainable. It fails when whoever searches does not know the vocabulary of whoever wrote, since "retention period" does not find a note saying "holding term".

### 5.2 Embeddings and vector search

An embedding model turns text into a dense vector of fixed dimension, positioned in a space where proximity corresponds to proximity of meaning. Searching is embedding the question and returning the nearest vectors, typically by cosine similarity.

Properties that decide the design of any system using it:

- **What is searched is the chunk, not the document.** Vectorising a whole long document dilutes the meaning to the point of making the vector useless.
- **The vector is derived.** It can be rebuilt from the text at any moment, and it is never the source of truth.
- **Changing the embedding model invalidates the index.** Vectors from different models are not comparable.
- **The cost is per write.** Every content change forces re-embedding what changed.

### 5.3 Chunking

Cutting the document into chunks is the decision that most affects retrieval quality. Common strategies: fixed size with overlap, by paragraph, by section (heading), or semantic, breaking where the subject changes.

**The central problem of chunking is the loss of context.** A chunk saying "the limit is 200 per account" is unrecoverable in isolation: it is unknown what the limit is on, of which system, under which rule. The established mitigation is to **enrich the chunk with the context it came from**, that is the document title, the section hierarchy and the description of the category, before generating the embedding. It is the difference between an index that works and one that returns a plausible and useless result.

### 5.4 RAG and its failure modes

*Retrieval-Augmented Generation* is the pattern of retrieving relevant chunks and injecting them into the context before generating the answer. The failure modes are known and none of them is solved by a better model:

| Failure | Description |
|---|---|
| **Silently empty retrieval** | Nothing relevant was found, and the model answers anyway, from parametric knowledge |
| **Plausible-but-wrong** | The retrieved chunk looks pertinent and is not; without the source in sight, nobody notices |
| **A chunk with no context** | Retrieved correctly, but unintelligible outside its source document |
| **A stale index** | The content changed and the vectors did not; the search returns the past |
| **Deleted content still indexed** | The document left the base and keeps being returned. It is a privacy problem, not a quality one |

The cross-cutting mitigation is to **always cite the source**: whoever consumes it decides with the source in sight, instead of trusting the summary.

### 5.5 The link graph as retrieval

If the notes cite each other, the links form a directed graph, with outgoing edges ("what this note references") and incoming ones ("who depends on this"). Questions the graph answers and vector search does not:

- Which basis does this statement rest on?
- What breaks if this note changes?
- What does nobody cite?

Two practical constraints in graph traversal: **maximum depth** and a **node ceiling**. In a dense base, an unbounded traversal returns the whole base, which is the same as retrieving nothing, at a higher cost.

### 5.6 Complementarity

| | Link graph | Vector search |
|---|---|---|
| Source | Links written by whoever drafted the note | Meaning inferred from the text |
| Precision | Exact, because there was a declared intent | Approximate |
| Cost | Practically zero | An embedding per write and per query |
| Typical failure | A broken link | A plausible and irrelevant result |
| Serves best | Whoever already organised the base | Whoever is arriving at it |

They are not alternatives: they answer different questions.

---

## 6. Collaboration and concurrency in text bases

### 6.1 Concurrent writing

Three approaches, with different trade-offs:

| Approach | How it works | Cost |
|---|---|---|
| **Last-write-wins** | The last write overwrites | Silent loss of work |
| **Optimistic concurrency** | Whoever writes states the version they read; a divergence is refused | One extra field and a conflict path to handle |
| **CRDT / OT** | Edits converge automatically (real-time collaborative editing) | High complexity; it changes the whole data model |

For content that sustains a decision, such as an opinion, a report or a finding, a silent overwrite is not acceptable: the record starts showing a version nobody approved. Optimistic concurrency is the usual balance.

An agent makes the problem worse: it writes fast, in batches, and does not notice that it overwrote something.

### 6.2 Roles

The established minimum in collaborative knowledge tools: **whoever administers**, **whoever writes**, **whoever only reads**. A reading role is not a detail, because in a base that sustains auditing the external reviewer needs access with no risk of altering what they review.

---

## 7. Auditing, provenance and regulated domains

### 7.1 What auditing requires of a record

Audit work, whether internal, external or regulatory, requires every conclusion to be **traceable to the evidence sustaining it**, and that evidence to be demonstrable in the future. That imposes four requirements on any system holding the knowledge base used in the work:

| Requirement | The question it answers |
|---|---|
| **Authorship** | Who produced this? |
| **Temporality** | When? |
| **Integrity** | Was it altered afterwards? |
| **Reconstruction** | What did this document say on the date the work was issued? |

The fourth is the most expensive and the most forgotten. Without it, a norm updated later retroactively contaminates a conclusion that was correct when it was issued, and there is no way to demonstrate that it was.

### 7.2 An append-only trail and WORM

An audit trail is an **append-only** record: events go in, and nothing is altered or removed. The distinction that matters in front of a regulator:

- *"We do not alter the log"* is policy, and depends on discipline.
- *"We cannot alter the log"* is a technical property, and it is verifiable.

Only the second one holds. The usual mechanisms: write permission without alter permission at the infrastructure level, WORM storage (*write once, read many*), retention with a time lock, and hash chaining.

### 7.3 Provenance when an agent is in the middle

When an AI agent writes, "author" stops being a single field. A defensible record separates two roles:

- **Who authorised:** the human who owns the credential used. There is always one, because somebody authorised the connector.
- **What executed:** the identity of the agent or client, which in OAuth is the `client_id`.

The difference between *"written by X"* and *"written by that agent, on behalf of X, on that date"* is the difference between a record and a record that defends itself. Recording only the human hides the process, and recording only the agent loses the accountability.

### 7.4 Historical reconstruction

Reconstructing the state of a document on a past date requires two things stored together:

1. A timestamped event saying that something changed.
2. **The exact reference to the version of the content at that instant**, not to the document, but to the version.

Storing only the first produces the classic error: the log states that the document changed and cannot show into what, becoming useless at exactly the question auditing asks.

### 7.5 Legal retention versus erasure

Compulsory retention and the right to erasure conflict by nature, and the conflict is resolved by legal hierarchy, not by configuration: **a legal retention obligation prevails over a request for erasure**. A system offering both has to say so on the screen where retention is activated, and not during the incident.

A second point, technical: **deleting a record and destroying the bytes are different operations**. Confusing them breaks historical reconstruction silently, because the log stays intact pointing at content that no longer exists. The established practice is to treat the destruction of bytes as a **recorded administrative act**, with a reason and an authorisation, and never as a side effect of a routine operation.

---

## 8. LGPD

### 8.1 Framing

The Brazilian General Data Protection Law (Lei nº 13.709/2018) regulates the processing of personal data in Brazil. The relevant roles:

| Role | Definition |
|---|---|
| **Data subject** | The natural person the data refers to |
| **Controller** | Whoever decides about the processing |
| **Processor** | Whoever processes the data on behalf of the controller |
| **Data protection officer (DPO)** | The channel between the controller, the data subjects and the ANPD |

A service hosting customer content is typically a **processor** with respect to the content the customers put into it, and a **controller** of the account data of its own users. The distinction decides who answers for what.

### 8.2 Rights of the data subject

Article 18 assures, among others: confirmation that processing exists, access, correction, anonymisation, blocking or elimination of unnecessary data or data processed in non-compliance, **portability**, and information about sharing.

Article 16 covers elimination after the end of processing, expressly reserving retention for the **fulfilment of a legal or regulatory obligation**, which is the basis of the hierarchy described in §7.5.

### 8.3 Personal data in free text

A knowledge base in Markdown is free text: **there is no way to know a priori whether it contains personal data**. The practical consequences for whoever hosts it:

- Assume it may, and protect it accordingly.
- Isolation between customers is a data protection requirement, not merely an architectural one.
- Derived indexes (search, vectors, cache) contain copies of the content and need the same treatment, deletion included. Removed content that keeps coming back in the search is an incident.
- A record of access and change is what makes it possible to answer a request for information about processing.

### 8.4 Portability

The right to portability has a direct technical translation: **export in an open, readable format**, and not in a proprietary dump. For a base in Markdown, that means returning the `.md` files in a tree that opens in any editor.

---

## 9. Multi-tenant SaaS: general concepts

### 9.1 Isolation models

| Model | Description | Trade-off |
|---|---|---|
| **Silo** | Dedicated infrastructure per customer | Maximum isolation, maximum cost and operations |
| **Pool** | Shared infrastructure, logical separation by identifier | Minimum cost, isolation depends on the code |
| **Bridge** | Shared with isolated parts (for example data together, keys separate) | A middle ground |

Most SaaS operates in a pool. What decides whether the pool is safe is not the model, it is **where the customer identifier enters**.

### 9.2 Where it leaks

A leak between customers almost never happens through an intrusion: it happens through a forgotten query. Known patterns:

- **IDOR** (*Insecure Direct Object Reference*): the identifier of the resource comes from the request and is used without checking who it belongs to. Changing the ID in the URL returns the data of another customer.
- **A forgotten filter:** a new query, written months later, does not repeat the per-customer filter.
- **A derived index with no boundary:** the search or the cache does not carry the separation the database carries.
- **An error that confirms existence:** a `403` says "it exists and you may not see it", and a `404` says nothing. In a multi-customer system, the difference is an information leak.

The structural mitigation is known: **the customer identifier comes from the authenticated credential, never from the request**, and it is part of the access key to the data, not of a filter applied afterwards.

### 9.3 Global identity versus a link

A person may take part in more than one organisation with the same account, a common case when there are invitations between organisations. That separates two concepts naive systems mix up:

- **Identity** is global and belongs to no organisation.
- **Participation** is a `(person, organisation)` relation, with a role of its own in each.

When there is more than one participation, the session needs an explicit **active context**, chosen and not discovered. Letting the system infer the active organisation is deciding the isolation boundary by accident. In long, non-interactive sessions, the active context has to be fixed at the start and must not change midway through the work.

---

## 10. Portability and lock-in

A knowledge base is a long-term asset: it is adopted expecting it to outlast the vendor hosting it. That makes portability an **adoption requirement**, not a courtesy, especially in a regulated context, where the base has to stay available to answer for work issued years earlier.

What characterises an honest export:

- An open format, readable without the tool that generated it.
- A structure preserved in a way that survives the file system, which has no order of its own and therefore requires the order to be encoded in the name when it matters.
- Links preserved in the text.
- No proprietary component required for reading.

A file system does not have some concepts a base has: order among siblings, a folder description, special document roles. Materialising them in the export is always an **edge concession**, with naming conventions that exist in the exported file and not in the original model.

---

## 11. Glossary

| Term | Meaning |
|---|---|
| **AI Fluency** | A framework of four practices for working with agents: *Delegation*, *Description*, *Discernment* and *Diligence* |
| **Backlink** | The list of notes pointing at the current note |
| **Chunk** | A passage of a document cut out for vectorisation |
| **CommonMark** | The formal, strict specification of Markdown |
| **CIMD** | *Client ID Metadata Documents*: the client uses an HTTPS URL as its OAuth identifier, and the authorization server reads the client metadata from it |
| **CRDT** | A data structure that converges under concurrent editing with no coordination |
| **DCR** | *Dynamic Client Registration* (RFC 7591): automatic OAuth client registration, deprecated by the MCP specification in favour of CIMD |
| **Embedding** | A dense vector representation of a text |
| **Frontmatter** | A metadata block at the top of the file, delimited by `---`; a convention, not a standard |
| **GFM** | *GitHub Flavored Markdown*, a superset of CommonMark |
| **IDOR** | Insecure direct object reference; the classic isolation failure |
| **JSON-RPC 2.0** | The remote call protocol used by MCP |
| **Lost in the middle** | Degradation of attention over information in the middle of long contexts |
| **MCP** | *Model Context Protocol*, an open protocol between LLM applications and data sources |
| **MOC** | *Map of Content*, a curated index note |
| **Orphan note** | A note with no incoming edge |
| **PARA** | An organisation method: Projects, Areas, Resources, Archives |
| **PKCE** | *Proof Key for Code Exchange* (RFC 7636) |
| **PKM** | *Personal Knowledge Management* |
| **PRM** | *Protected Resource Metadata* (RFC 9728) |
| **RAG** | *Retrieval-Augmented Generation* |
| **Streamable HTTP** | The HTTP transport of MCP for remote servers |
| **Vault** | A folder of notes treated as a knowledge base by a file-based editor |
| **Wikilink** | A link by name in the `[[target]]` form; a convention, not a standard |
| **WORM** | *Write Once, Read Many*, non-rewritable storage |
| **Zettelkasten** | A method of interlinked atomic notes |

---

## 12. References

**Format**
- CommonMark Specification: <https://spec.commonmark.org/>
- GitHub Flavored Markdown Spec: <https://github.github.com/gfm/>

**Protocol**
- Model Context Protocol, specification and documentation: <https://modelcontextprotocol.io/>
- Model Context Protocol, client registration: <https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization/client-registration>
- Anthropic, connector authentication: <https://claude.com/docs/connectors/building/authentication>
- Anthropic, connector directory submission: <https://claude.com/docs/connectors/building/submission>
- Anthropic, connector review criteria: <https://claude.com/docs/connectors/building/review-criteria>
- RFC 6749: The OAuth 2.0 Authorization Framework
- OAuth Client ID Metadata Document, IETF draft: <https://datatracker.ietf.org/doc/draft-ietf-oauth-client-id-metadata-document/>
- RFC 9728: OAuth 2.0 Protected Resource Metadata
- RFC 8414: OAuth 2.0 Authorization Server Metadata
- RFC 8252: OAuth 2.0 for Native Apps
- RFC 7591: OAuth 2.0 Dynamic Client Registration Protocol
- RFC 7636: Proof Key for Code Exchange (PKCE)
- RFC 8707: Resource Indicators for OAuth 2.0

**Collaboration with agents**
- Anthropic, *AI Fluency: Framework & Foundations*, a course by Rick Dakan and Joseph Feller: <https://www.anthropic.com/ai-fluency>

**Retrieval**
- Lewis et al., *Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks* (2020)
- Liu et al., *Lost in the Middle: How Language Models Use Long Contexts* (2023)

**Regulatory**
- Lei nº 13.709/2018 (LGPD), in particular articles 16, 18 and 46
- ANPD, the Brazilian data protection authority: <https://www.gov.br/anpd/>

**Knowledge practice**
- Ahrens, S. *How to Take Smart Notes* (Zettelkasten)
- Forte, T. *Building a Second Brain* (PARA)
