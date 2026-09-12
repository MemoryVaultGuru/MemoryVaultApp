# Development process

This document is the source of truth for **how work flows**, from the need of whoever uses
the product to the merge into `main`. It describes the life cycle of a change, how feedback
is captured, triage, prioritisation, the reservation of `RN-XXX` codes, work on the branch,
the pull request and the release. The role of each artifact, this one included, is in §1.

It does not say what is true in the domain ([`knowledge-base.md`](knowledge-base.md)), what
the product does and under which rule ([`software-vision.md`](software-vision.md)), or how
the software is built ([`architecture-guide.md`](architecture-guide.md)).

## Contents

1. [The artifacts and the role of each](#1-the-artifacts-and-the-role-of-each)
2. [The life cycle of a change](#2-the-life-cycle-of-a-change)
3. [Capture: where a need comes from](#3-capture-where-a-need-comes-from)
4. [Triage: distilling the need out of the request](#4-triage-distilling-the-need-out-of-the-request)
5. [Prioritisation and roadmap](#5-prioritisation-and-roadmap)
6. [Reserving a business rule code](#6-reserving-a-business-rule-code)
7. [Work on the branch](#7-work-on-the-branch)
8. [Pull request](#8-pull-request)
9. [Release](#9-release)
10. [What never goes into docs/](#10-what-never-goes-into-docs)

---

## 1. The artifacts and the role of each

| Artifact | Answers | For whom | Changes when |
|---|---|---|---|
| `README.md` | "What is this and how do I use it" | Whoever arrives, including whoever only uses it | The product or the install procedure changes |
| `docs/software-vision.md` | "What the product does, and under which rule" | Whoever builds it | An `RN-XXX`, an entity or a limit changes |
| `docs/architecture-guide.md` | "How the software is built" | Whoever builds it | A technical decision changes |
| `docs/knowledge-base.md` | "What is true in the domain" | Whoever builds it | Almost never, because it does not depend on the product |
| `docs/development-process.md` | "How work flows" | Whoever builds it | This process changes |
| `CLAUDE.md` | "What the agent may never violate" | The agent | A non-negotiable rule enters or leaves |
| `CHANGELOG.md` | "What changed, and when" | Everyone | Every commit that changes behaviour |
| **Issues and milestones** | "What we have yet to decide, evaluate or build" | Everyone | All the time |

The last row governs everything else in this document. A hypothesis of a need,
prioritisation, the roadmap, an open risk and an undecided question live **in an issue**,
never in `docs/`. That is how this process was born: the sections on version scope, risks
and open questions were removed from the documents and became issues, because they aged
every week while the rest of the documents aged every version.

### 1.1 The rule that keeps the documents honest

> **A document never describes the future. If it is in the document, it is in production.**

A document describing what has not been built yet is the debt this process exists to
eliminate, and it is paid twice: once when the plan changes and the text does not follow,
and again when someone builds against a text that was never true.

The rule is verifiable, not good intentions. Every `RN-XXX` declared in
`software-vision.md` has code implementing it, today across 96 files and more than 300
citations. When the rule is broken, it will be broken detectably.

`README.md` obeys the same rule with double the force. An internal document describing what
does not exist gets in the way of whoever builds; a `README` describing what does not exist
breaks the trust of whoever tried to follow it, and that person is precisely the one who
agreed to try it first. No "coming soon" or "planned" in there. Public direction is
communicated through the milestones and the Releases, and the `README` at most points at the
link.

---

## 2. The life cycle of a change

| # | Stage | Where it lives | What is true at this stage |
|---|---|---|---|
| 1 | **Capture** | `feedback` issue | It is a hypothesis of a need. Nobody promised anything |
| 2 | **Triage** | Comments on the issue | The real friction is distilled out of the request. A proposal or a recorded refusal comes out |
| 3 | **Scope closed** | The issue, in a milestone | It gets a target version and reserves the `RN-XXX` codes it will create |
| 4 | **Implementation** | Branch, incremental commits | Code, test, document and changelog move together |
| 5 | **Consistent state** | `main`, through the merged PR | What is in the document exists and is in production |

No stage may be skipped out of haste, with one named exception: a **defect that blocks
use** goes straight to stage 4, and the issue describing it is written along with the fix,
not before it. Postponing the fix to observe the ritual would trade the purpose of the
process for its form.

---

## 3. Capture: where a need comes from

A need arrives through three paths, and all of them end in an issue:

- **Whoever uses the product**, through the usage feedback form.
- **Whoever builds it**, on running into a friction or a risk while working.
- **Operations**, when an alarm, an invoice or a measurement reveals something.

### 3.1 The feedback form and the order of its questions

The form in `.github/ISSUE_TEMPLATE/01-feedback.yml` asks, in this order: what the person
**was trying to do**, what **happened**, what they **expected**, how they **worked around
it**, how often it happens, and only then, last and explicitly optional, what they would do
to solve it.

The order is deliberate and is the most important design decision of the form. Requests
arrive written as a solution ("I wanted a duplicate-note button") and not as a friction ("I
copy the structure of a note by hand every time I create a meeting"). If the form asked for
the solution first, it would get the solution and lose the friction, which is the only part
that stays true after we pick a path different from the one suggested.

The question about the workaround usually yields more than all the others: **whoever worked
around it measured the pain**, and the size of the workaround is the size of the pain.

### 3.2 What never goes into a public issue

The repository is public. Two things stay out:

- **Real vault content**, customer names or business data. The form asks for explicit
  confirmation of this, and an issue that slipped through is edited as soon as it is
  noticed.
- **An isolation failure or any vulnerability**, which go through `SECURITY.md` and the
  private advisory channel. A public issue describing how to reach data of another
  subscription is an exploitation instruction for as long as the fix is not out.

---

## 4. Triage: distilling the need out of the request

Triage happens in batches, weekly, and not on every message that arrives. Reacting to each
request individually is how the product of a single person gets built, and with few users
every voice carries disproportionate weight.

**Triage is a conversation, not a command.** The open issues labelled `feedback` are read
in full, grouped by real friction instead of by request, and each group is discussed until
its outcome is decided. There is no script that runs it: every one of the four outcomes of
§4.2 is a decision about the product, and a refusal is as much of a decision as a delivery.

What the conversation produces is one proposal per group, with the friction distilled into
one sentence, the issues it came from, the proposed outcome, the bounded context, and the
`RN-XXX` that would have to be created or changed. Whoever runs the triage may not create,
close or label anything before that decision: applying it is always the call of whoever
owns the product.

### 4.1 The first question

> **Does this get solved by writing, or only by building?**

A good part of what arrives as missing functionality is a missing `README`. "I could not
connect the vault to my agent" may be a gap in the product or a missing paragraph. Mixing
the two up is the most expensive mistake of the process, because it builds functionality to
solve a problem of text.

### 4.2 The four outcomes

| Outcome | Label | Cost | Creates an `RN-XXX`? |
|---|---|---|---|
| **Documentation** | `documentation` | A PR of minutes | No |
| **Defect** | `bug` | A fix | No, it restores what the rule already states |
| **Gap** | `enhancement` | Enters a milestone when accepted | Usually yes |
| **Refusal** | the issue closes as `not planned` | A comment | No |

The four labels above are the ones GitHub already ships. The project does not create a
label for what a native one already says, and it does not create one for a state either:
being accepted for a version is the **milestone**, and having been delivered or refused is
the way the issue was **closed**.

**Refusal is a first-class outcome and it has to be written down.** A refused issue closes
with the reason in a comment, addressed to whoever reported it. A backlog without recorded
refusals is not a backlog, it is a dump, and the cost shows up when someone reopens in six
months the same discussion that was already had.

### 4.3 Classification

Every triaged issue also says **where in the system it lives**, which is what makes triage
point at the document it will force to change, and what reveals early when a request
crosses two places, the sign that it is two requests.

| Label | What it covers |
|---|---|
| `domain:subscription` | The customer account: status, plan, quota, isolation |
| `domain:access` | Who may do what: members, roles, invitations, ceilings, ownership |
| `domain:knowledge` | The content itself: vaults, folders, notes, Guidance, Templates |
| `domain:discovery` | Finding things: search, the link graph, backlinks, facets |
| `domain:audit` | The history: who wrote what, when, and what it said on a date |
| `domain:mcp` | The connector for the agent: tools, the Vault Context, skills |
| `domain:export` | Taking the vault out as `.md` files |
| `layer:web` | The web interface |
| `layer:infra` | AWS, the stacks, the deployment scripts |

The seven `domain:` labels are the bounded contexts of §6 of `software-vision.md`, and each
one maps to the prefix of its business rules: an issue on `domain:knowledge` creates an
`RN-KNW-XXX`. That correspondence lives in that table, and not in the name of the label,
which is read by a person scanning a list. The two `layer:` ones carry a different prefix
because they are not domains: the interface consumes all seven, and the infrastructure
sustains all seven.

---

## 5. Prioritisation and roadmap

**The scope of a version is the milestone of that version**, and there is no field to fill
in beyond it: an issue in `v0.4.0` is an issue accepted for that cycle, and one with no
milestone has not been decided yet. Everything else the roadmap would need is already in
the native state of the issue, which §7.4 defines.

Risks and questions not yet decided live in issues labelled `question`. What sets them
apart from a delivery is that they **do not close on delivery**: they close when the risk no
longer materialises, when the question is decided, or when they turn into a concrete
proposal. Each carries, in its body, the explicit criterion of what closes it.

---

## 6. Reserving a business rule code

The `RN-{CONTEXT}-{NNN}` codes are append-only: they are never renumbered nor reused,
because commits, PRs and more than 300 lines of code reference them.

That creates a coordination requirement, and it is resolved like this:

> **The rule number is reserved in the issue whose scope closed, at step 3. The normative text
> enters `software-vision.md` at step 4, along with the code that fulfils it.**

The separation protects both things at once. The number is burned the moment the scope
closes, so two parallel efforts do not collide on the same `RN-KNW-025` even if one of them
takes weeks. And the document does not start stating a rule that does not exist yet, which
would preserve the append-only property at the expense of the rule in §1.1.

If the branch is abandoned, **the number stays burned** and the issue is the record that it
was consumed. A code retired without ever having existed costs less than a code reused.

---

## 7. Work on the branch

`main` is protected. Every change reaches it through a reviewed pull request, without
exception, documentation, maintenance and version bumps included. The only direct writes
are annotated tags on already merged commits.

### 7.1 Naming convention

The project has two kinds of branch, and the name says which:

| Prefix | Use | Example |
|---|---|---|
| `release/` | The cycle that closes a whole version | `release/v0.4.0` |
| `feat/` | A single feature | `feat/note-move` |
| `fix/` | A single fix | `fix/graph-touch-target` |
| `docs/` | Documentation and repository governance | `docs/development-process` |
| `chore/` | Maintenance: dependencies, CI, build configuration | `chore/bump-cdk` |

`release/` deliberately does not use a Conventional Commits prefix: the branch of a cycle
holds many types at once, and labelling it `feat/` would be wrong on the first `fix` that
lands in it. The commits **inside** it keep using the normal types, and that is where
Conventional Commits belongs.

> **Earlier convention, kept as history:** the branches `feature-2026.000001`,
> `feature-2026.000002` and `feature-2026.000003` correspond, in order, to versions
> `0.1.0`, `0.2.0` and `0.3.0`. The sequence required a translation table to say what the
> branch did, and that is what `release/vX.Y.Z` fixes. The old branches are not renamed,
> because they are referenced from already merged pull requests.

### 7.2 Incremental commits

Commit and push along the branch, never piling everything up at the end. Every commit has
to build and may not break the existing tests.

The unit of a commit is the **whole behaviour change**: code, test, document and
`CHANGELOG.md` in the same commit. It is not extra work, it is what keeps documentation
from being written from memory days after the decision, when the reason for it has already
evaporated. It is also the task that gets cut when the branch runs late, and cutting it is
precisely what may not be done.

### 7.3 When a commit touches each document

| Touches `docs/` or `README.md` | Does not touch |
|---|---|
| Creates or changes an `RN-XXX` | Refactoring with no behaviour change |
| Changes the permission matrix or the per-vault role ceiling | Test, lint or formatting adjustments |
| Changes the contract of an MCP tool: name, argument or return shape | Infrastructure change with no visible effect |
| Changes a declared limit, an entity or the ubiquitous language | A fix that **restores** the behaviour the document already describes |
| Changes a recorded architecture decision | Intermediate work that has not changed anything assertable yet |
| Changes the install procedure, the prerequisites or the `deploy-aws/` scripts | |
| A capability the `README.md` mentions enters or leaves | |

The last three rows of the left column are specifically the responsibility of `README.md`,
and it is the only document that is **executable in practice**: someone follows its steps
in a real AWS account. When a `deploy-aws/` script changes and the `README` does not, the
defect only shows up at the next install, when it has already cost dearly.

On `main`, document and code never diverge. Inside the branch they may be ahead of what is
published, because the branch is a workspace and the two move in step: if it dies halfway,
nothing inconsistent reached `main`; if it is merged, everything arrives together by
construction.

### 7.4 When an issue closes

The issue of a delivery closes **when its commit is on the branch of the cycle**, and not
when the branch reaches `main`. It closes as `completed`, with a comment saying which
commit it is in. A refused issue closes as `not planned`, with the reason written down,
which is the fourth outcome of triage (§4.2).

The consequence has to be stated, because it is counterintuitive: during the cycle there
are closed issues and a product that does not do that thing yet. What declares the scope of
the version is the **milestone**, and what takes everything to `main` is the single pull
request of the cycle, at the end. Closing earlier is what makes progress visible while the
branch runs, and the price is accepting that, here, "closed" means "it is on the branch of
the version".

No pull request is opened per issue. It would require a branch per issue, and over the
branch of a cycle it would leave a merge button available for weeks, with the version half
done.

---

## 8. Pull request

Every PR description has two mandatory sections: a **Summary of changes** and an **AI
productivity analysis**.

In the summary, every change that implements or alters a business rule cites its `RN-XXX`
code, and every change originating from feedback references the issue that originated it,
with `Closes #N`. That reference is what makes it possible, months later, to answer why a
rule exists by pointing at the sentence of a real person who felt the friction.

### 8.1 AI productivity analysis

Add this section to the body of every PR. Collect the data from the git history and the
diff, without guessing and without omitting fields.

```
## AI productivity analysis

| Metric | Value |
|---|---|
| Lines of code handled (added + removed) | {loc_added + loc_removed} ({loc_added} added, {loc_removed} removed) |
| Branch duration | {duration} (from `{branch_start_date}` to `{pr_date}`) |
| Technologies involved | {comma-separated list} |

### Estimated human effort (without AI assistance)

> **Estimated effort:** {hours}h, roughly {total_days} working days (8h/day) or {total_weeks} working weeks (40h/week).
```

**How to fill in each field:**

- **Lines of code handled:** run `git diff --stat origin/main...HEAD` and add the
  insertions and deletions of the final totals line. Exclude lock files
  (`pnpm-lock.yaml`, `package-lock.json`) from the count.
- **Branch duration:** use the date of the first commit on the branch as the start, and
  today as the PR date.
- **Technologies involved:** list every language, framework, library and tool touched by
  the diff, for example TypeScript, Node.js, AWS CDK, DynamoDB, S3, Bedrock, React, Vite,
  Hono, Zod. Derive it from the extensions of the changed files and from the imports, and
  do not list technologies that exist in the repository but were not touched by this PR.
- **Estimated human effort:** produce a single realistic estimate of how long one engineer
  would take to deliver the same result alone, without AI assistance. Base the estimate on:
  - **Volume:** total lines handled (added + removed), weighted by complexity,
    distinguishing repetitive code from code with dense logic.
  - **Breadth:** the number of distinct technologies involved, since each additional one
    adds a learning curve and an integration cost.
  - **Scope indicators:** the number of new aggregates, ports, adapters, API routes, MCP
    tools and CDK stacks, plus the test coverage added.
  - Express the result in hours, for example `8h` or `2h`. If the scope is very small (less
    than 1h), use `< 1h`.
- **Total estimated effort:** use the single hours value above. Then compute:
  - `{total_days}` = `{hours}` ÷ 8, rounded to one decimal place
  - `{total_weeks}` = `{hours}` ÷ 40, rounded to one decimal place
  - If the estimate is `< 1h`, treat it as `0.5h` for the arithmetic and note the
    approximation on the line itself.

### 8.2 A blocked merge

**If a merge is blocked, stop and report.** Branch protection is not worked around, even
with administrative rights to do so: the protection rule is the real layer of guarantee,
and going around it silently defeats the reason it exists.

---

## 9. Release

The canonical version of the product lives in `CLAUDE.md`, under § Project identity → Base
version, and has to be propagated to every `package.json` of the monorepo and to
`CHANGELOG.md` before the release commit. When to bump, and the three-layer versioning
strategy, are in `CLAUDE.md` § Operational policies → Versioning and in
`architecture-guide.md` §23.

The `[Unreleased]` section of `CHANGELOG.md` is the buffer between one cycle and the next.
Every entry is born there and waits there. **A change that alters nothing deployable does
not cut a version**, and documentation and repository governance are the typical case:
cutting a version just for them would tag and publish a Release pointing at an artifact
identical to the previous one, and the number would start asserting something that did not
happen. The change waits for the next cycle and goes out inside it, dated by the cut and
not by when it was written. Whoever needs the exact date of each change has the git
history, which is where it lives.

**The cut takes the whole `[Unreleased]`, and it is the accumulation that decides the
number.** No subset is picked: the `vX.Y.Z...vX.Y.Z+1` range in the footer of
`CHANGELOG.md` covers every commit between the two tags, and a section omitting part of
them would lie about what changed. That is why the bump is the **largest that any
accumulated entry requires**, and not what the last pull request would require on its own.
An `[Unreleased]` holding documentation and one defect fix closes as a patch; if a new MCP
tool, a route or a visible feature lands before the cut, the same accumulation closes as a
minor bump, and the fix goes out inside it.

### 9.1 Version bump flow

Run in this exact order:

```
1. Update  CLAUDE.md                                       ← bump "Base version" under Project identity
2. Update  memorysmith-backend/package.json
           memorysmith-backend/packages/*/package.json
           memorysmith-backend/services/*/package.json     ← every service package
3. Update  memorysmith-frontend/package.json
4. Update  memorysmith-infra/package.json
5. Update  CHANGELOG.md                                    ← rename [Unreleased] to [X.Y.Z] with the cut date,
                                                             open a fresh empty [Unreleased] above it, and add
                                                             the compare links at the bottom of the file
6. Commit on a release branch  "chore(release): bump version to vX.Y.Z"
7. Push the branch, open a PR, and merge it into main (never push the bump directly to main)
8. Tag the merged commit on main  git tag vX.Y.Z && git push origin vX.Y.Z
9. Publish a GitHub Release for the tag, with notes copied from that version's CHANGELOG section
   gh release create vX.Y.Z --title "vX.Y.Z" --notes-file <changelog-section>
```

The three projects share a single product version, because they are deployed together and a
divergence between them never means anything to the user.

Steps 1 to 5 have to land in the same commit on the release branch. The version bump
reaches `main` only through the PR of step 7, and never through a direct push. Never tag
before the PR is merged, and never push a tag whose commit is not on `main` yet. The tag has
to point at the merged commit, and the GitHub Release of step 9 is created from that tag.

### 9.2 Two points that belong to the process

- **The branch of a cycle is `release/vX.Y.Z`**, and the version bump commit lands in it,
  not in a separate branch.
- **When cutting the version**, the issues delivered in the cycle are closed with a
  reference to the PR, and the ones left behind move to the milestone of the next version.
  An accepted issue that nobody reassessed at the end of the cycle is a silent promise to
  whoever reported it.

---

## 10. What never goes into `docs/`

| This | Goes to |
|---|---|
| A hypothesis of a need, a request, a reported friction | `feedback` issue |
| Scope under discussion, an alternative being evaluated | The issue itself, before a milestone |
| Roadmap, build order, target version | The milestone of the version |
| A risk not yet addressed | `question` issue |
| An undecided question | `question` issue |
| Change history, release notes, revision dates | `CHANGELOG.md` and the git history |

The last row predates this process and still holds with the same force: footers of the
"internal document, last revised X, version Y" kind are forbidden in any file under
`docs/`. They duplicate what git already records, fall out of sync immediately, and add
noise the reader has to filter out.
