---
title: Failing over the payments database
aliases: [Payments failover]
tags: [runbook, payments]
type: runbook
status: growing
scope: payments
source: Drill 2026-03
author: Continuity Engineering
created: 2026-02-02
updated: 2026-03-06
rehearsed_at: 2026-03-04
---

The procedure for promoting the standby region when the primary is lost. It is
written to be followed by somebody who has not read it before, at three in the
morning.

> [!caution] Do not start this without declaring the incident first
> A failover that nobody announced is indistinguishable from an outage, and
> the second one is what people escalate.

## Before you start

- [x] The incident is declared and the channel exists
- [x] The primary is confirmed unreachable, not merely slow
- [ ] The last replica lag is recorded, for [[Recovery Point Objective]]
- [ ] Somebody who is not you is watching the clock

## The steps

1. Freeze writes at the edge.
2. Promote the standby. See [[Exercise 2026-03 · Region loss#What went wrong]]
   for the two minutes this took last time.
3. Repoint the application, then verify a real payment end to end.
4. Announce the new primary, in writing, before you rest.

Step 2 is the one that decides whether the ==objective is met==, because
everything before it is detection and everything after it is confirmation.

![[Blast radius]]

## Notes for whoever revises this

%% Steps 1 and 2 were one step until the March exercise showed the freeze
needs its own confirmation. Do not merge them again. %%

The dashboard query is written as
[the replication dashboard](https://example.org/dashboards/replication) and the
subject of this page is #failover, which files it nowhere: this page is filed
by its `tags:` and by the folder it is in.
