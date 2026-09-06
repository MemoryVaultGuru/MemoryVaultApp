---
title: Recovery Point Objective
aliases: [RPO]
tags: [objective, continuity]
type: objective
maturity: evergreen
reviewed: true
scope: payments
source: Continuity policy 4.2
author: Continuity Engineering
created: 2026-01-12
updated: 2026-02-19
agreed_at: 2026-01-20
---

The **Recovery Point Objective** is how much work may be lost, measured in
time. An RPO of five minutes means the last five minutes of writes are
acceptable casualties.

> [!note] It is a property of the data, not of the service
> Two services on one database cannot hold two different RPOs, however
> differently their [[Recovery Time Objective|RTOs]] are written.

## Read this first

![[Recovery Time Objective#^rto-and-rpo]]

## How it is measured

From the last durable replica, not from the last successful write. The
difference is the replication lag, and it is the number
[the replication dashboard](../Reviews/Exercise 2026-03 · Region loss.md)
records during an exercise.

```mermaid
flowchart LR
  W[Write accepted] --> P[Primary]
  P --> R[Replica]
  R --> S[Snapshot]
```

The distance between `W` and `S` is the real RPO. ^measured-from

## Open

The figure for the reporting warehouse has never been agreed. Until it is,
[[Warehouse recovery objective]] is a page nobody has written, and the link
above says so rather than pretending otherwise.
