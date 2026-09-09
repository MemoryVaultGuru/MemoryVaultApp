---
title: Incident #4711
aliases: []
tags: [review, incident]
type: review
maturity: evergreen
reviewed: true
scope: payments
source: Incident record 4711
author: Continuity Engineering
co-author: Claude
created: 2026-03-08
updated: 2026-03-09
exercised_at: 2026-03-07
---

# What the incident measured

This page has **no addressable title**, and it says so where somebody would
otherwise waste an afternoon.

Its `title:` is `Incident #4711`, and a title carrying `#`, `[`, `]` or `|` —
the four characters that delimit the form a link is written in — cannot be
named by a link. The note exists, it renders, it is searchable, it links
outward, and no `[[…]]` can reach it. A stated title also **ends the chain**:
the heading above is not read as a fallback, because a heading is where a
title comes from when the frontmatter states none, not a repair for one the
author wrote.

> [!warning] Write the number without the hash
> `Incident 4711` would be an ordinary title. So would `Reunião 03/09/2026`:
> a slash is not one of the four, because folders play no part in identity.

## Timeline

| Moment | Minutes | Note |
| --- | --- | --- |
| Region declared lost | 0 | [[Failure domain\|the region domain]] |
| Failover started | 6 | [[Failing over the payments database]] |
| Writes accepted again | 21 | Over the [[Recovery Time Objective]] of 15 |

## What went wrong

The runbook assumed the replica was current, and it was 90 seconds behind —
inside the [[Recovery Point Objective]] and outside what the runbook said. The
step now reads the lag before it promotes, instead of after.

The evidence is the file the exercise produced:
`payments-failover-4711.csv`, an attachment addressed by its name.
