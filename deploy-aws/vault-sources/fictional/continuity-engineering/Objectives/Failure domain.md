---
title: Failure domain
aliases: [Blast radius, Fault domain]
tags: [objective, continuity]
type: objective
status: growing
scope: platform
source: Continuity policy 4.5
author: Continuity Engineering
co-author: Claude
created: 2026-02-02
updated: 2026-03-11
agreed_at: 2026-02-14
---

A **failure domain** is the set of things that go down together. It is the
unit an objective is agreed over, because promising five minutes for a
service says nothing until somebody says five minutes of *what failing*.

> [!note] This note is what `[[Blast radius]]` points at, and it is not called that
> [[Recovery Time Objective]] links to `Blast radius`, which is not the title
> of any note here. It lands on this one because `Blast radius` is in the
> `aliases:` of this page — an alias resolves a target **no title matched**,
> and it does nothing else. The day somebody writes a note actually titled
> `Blast radius`, that link moves to it and this page stops receiving it: a
> title always wins, and an alias only ever fills an empty.

## What `author` and `co-author` say here

The frontmatter of this page states `author: Continuity Engineering` and
`co-author: Claude`, and both are **statements this note makes about itself**.
They are not what the platform observed: the platform holds a history of who
wrote what and answers it separately, and the two are allowed to disagree.
`author` is the person who authorized the connection and `co-author` is the
connector that executed the write — which is the convention this product
teaches and never the value it writes.

## The three domains we agreed

| Domain | What is inside it | Objective |
| --- | --- | --- |
| Availability zone | One data centre | [[Recovery Time Objective\|RTO]] of 15 min |
| Region | Every zone of one region | RTO of 4 h |
| Account | Every region we hold | Not agreed |

The last row is the one worth reading twice: an account-wide failure has no
objective because nobody has agreed one, and writing `4 h` there because the
row above says so would be inventing a capability.

## The diagram of the region case

![Failure domains of one region|360x180](../assets/failure-domains.png)

That is an **attachment**, addressed by its name and nothing else. It produces
no edge, it appears in no graph, and this product stores none: what is drawn
is a reference to a file the vault carries beside its notes. The `|360x180`
after the name is the size it is drawn at, not an alias — a pipe means one
thing after a note and another after an attachment.

## Open

The account-wide figure waits on the same conversation as
[[Warehouse recovery objective]], which is a page nobody has written.
