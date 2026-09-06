---
title: Exercise 2026-03 · Region loss
aliases: [March exercise]
tags: [review, exercise]
type: review
status: evergreen
scope: payments
source: Exercise log
author: Continuity Engineering
created: 2026-03-04
updated: 2026-03-11
exercised_at: 2026-03-04
summary: A full region loss exercised against the payments path, with the timeline and the two findings it produced.
---

A planned loss of the primary region, run against
[[Failing over the payments database]] with the operators who had not written
it.

> [!tip] The exercise is the measurement
> Everything in [[Recovery Time Objective]] is a target until a page like this
> one carries a number.

## Timeline

| Moment | Minutes | Note |
| --- | --- | --- |
| Detection | 0 | Alert fired on the health check |
| Decision | 7 | Waiting for a second signal |
| Promotion | 9 | The step that matters |
| Confirmed | 14 | A real payment cleared |

Fourteen minutes against an objective of thirty. The seven spent deciding are
the finding. ^timeline-2026-03

## What went wrong

The freeze in step 1 was confirmed by looking at a graph, which is why it took
two minutes. It now has its own check.

$$A = \frac{43200 - 14}{43200}$$

which is $0.99968$ for the month, and inside the budget.

## What we tried to write and could not

- **A formula with a subscript.** `H~2~O` and `x^2^` carry no meaning in this
  profile: what is written stays on the page as those characters. Write the
  real character, or a formula: $H_2O$ and $x^2$.
- **A styled warning in HTML.** `<div class="warn">` is stored and shown as
  text, never rendered. Use a callout, as this page does above.
- **A summary in the frontmatter.** The `summary` above is longer than forty
  characters, so it is read and discarded rather than becoming a category of
  one. The same is true of `title`, which is an ordinary attribute here and
  does not rename anything: this note is called what the vault calls it.

Related: [[Recovery Point Objective#Open]].
