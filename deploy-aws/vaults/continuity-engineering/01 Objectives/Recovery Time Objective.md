---
title: Recovery Time Objective
aliases: [RTO, Recovery Time]
tags: [objective, continuity]
type: objective
maturity: evergreen
reviewed: true
scope: payments
source: Continuity policy 4.2
author: Continuity Engineering
created: 2026-01-12
updated: 2026-03-04
agreed_at: 2026-01-20
---

The **Recovery Time Objective** is how long a service may stay down before the
loss stops being operational and starts being contractual. It is agreed with
whoever owns the service, never proposed by whoever restores it.

> [!warning] An RTO nobody has exercised is a wish
> Until the failover in [[Failing over the payments database]] has been run
> against it, the number is a target and not a capability.

## How it is stated

Always in wall-clock minutes, from the moment of detection and not from the
moment of decision. The gap between those two is where most of the budget goes,
which is why [[Exercise 2026-03 · Region loss#Timeline]] measures it separately.

The paired figure is [[Recovery Point Objective|the RPO]], and the two are set
together: an aggressive RTO with a loose RPO restores a service quickly to a
state nobody wants. ^rto-and-rpo

## What it costs

Availability is what the objective buys, and it is arithmetic before it is
engineering. For a service of $n$ independent components each with availability
$a$, the whole is $a^n$, which is why halving the number of things that must be
up beats improving any of them.

The budget for a month is $$B = (1 - A) \times 43200$$ minutes, and an RTO
larger than $B$ means the objective is unreachable in a single incident.

Anything ==agreed above four hours== needs a written waiver, because it stops
being a technical target and becomes a commercial one.

%% The 2027 policy revision moves this to two hours. Do not write it here
until it is signed. %%

## What is not read here

- A subject written in the body as #continuity looks like it files this note
  somewhere. It does not: it is plain text. Subjects live in `tags:` above, and
  a subject that deserves a page of its own gets a wikilink.
- The policy itself lives at
  [the continuity policy](https://example.org/policy/4.2), and an external link
  is never an edge of this vault: it points at the world.
- `[[Recovery Time Objective]]` written inside code, as it is in this line, is
  an example and not a link.

Related: [[Recovery Point Objective]], [[Blast radius]].
