# Continuity Engineering

> [!info]
> What each service promises to survive, how it is restored, and what the last
> exercise actually measured. Objectives, runbooks and reviews.

## Writing rules

1. **An objective is agreed, never proposed by whoever restores the service.**
   A number without a name behind it is a wish.
2. **A runbook is written for somebody who has not read it before**, at three
   in the morning. Every step that needs judgement links the page that explains
   the criterion.
3. **A review carries numbers or it is not a review.** It is what turns an
   objective from a target into a capability, so it is the only place where a
   figure may be asserted.
4. An objective that no review has exercised says so on its own page.

## Required frontmatter

`title`, `aliases`, `tags`, `type` (`objective` | `runbook` | `review`),
`maturity` (`seed` | `growing` | `evergreen`, reassessed on every write),
`reviewed` (`true` only after a human has reviewed the current revision; any
later content edit takes it back to `false`), `scope`, `source`, `author`,
`created`, `updated`.

`aliases` is not decoration here: this subject lives on acronyms, and a page
that cannot be found by `RTO` is a page nobody finds.

## The notation this vault is written in

Everything here is the MemorySmith Markdown Specification, and nothing in this vault
uses anything outside it. Two habits are worth naming because people arrive
with them:

- **A subject written in the body as `#continuity` files nothing.** It is plain
  text. Subjects live in `tags:`; a subject that deserves a page of its own
  gets a `[[wikilink]]`.
- **Raw HTML is not rendered.** It is stored and shown as text, and that is a
  security boundary rather than a preference. Write a callout.
- **There is no notation for superscript or subscript**, and none for anything
  else the profile does not list: it may still be drawn on the page, and it
  never means anything. Write a formula.
