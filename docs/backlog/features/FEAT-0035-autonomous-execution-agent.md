---
id: FEAT-0035
title: Let an agent trade inside limits it cannot exceed
type: feature
status: idea
priority: P2
milestone: M9
editions: [private]
area: ai
data_class: A
adr: required
depends_on: [FEAT-0011, FEAT-0012, FEAT-0013, FEAT-0015]
---

# FEAT-0035 — Let an agent trade inside limits it cannot exceed

## Problem

The long-term goal: an agent that analyses the market, picks a strategy and
executes it without a human in the loop.

## Proposal

An agent that, within a user-approved strategy and a user-set capital
allocation, opens and manages positions on its own.

**Everything about this item is downstream of its constraints, so they come
first:**

- It executes **only** through [`FEAT-0011`](FEAT-0011-preflight-order-verification.md)'s
  gate. No bypass, no privileged path, no exception for latency.
- Every limit in [`FEAT-0013`](FEAT-0013-risk-limits-and-kill-switch.md) applies
  to it, and the kill switch stops it mid-strategy.
- It runs in paper mode ([`FEAT-0012`](FEAT-0012-paper-trading-mode.md)) for a
  sustained period, with a reviewable decision log, before live capital is a
  discussion.
- Its state — permitted strategies, capital, positions, decision log — is the
  most sensitive data the product will hold. Per
  [ADR-0004](../../adr/0004-spacetimedb-data-scope.md) §4 it may live only on a
  user-operated instance, and exchange credentials stay on the device.
- It requires its own ADR before implementation.

**This item is `idea` and stays `idea` until M1 and M8 are done.** That is not
process for its own sake: an agent placing orders on an unverified execution
path is a way to lose money at machine speed, and it is the one thing in this
backlog that could do real harm if built early.

## Acceptance criteria

- [ ] An ADR exists covering autonomy scope, capital limits and failure modes
- [ ] Every order goes through the verification gate, proven by a test that adds
      a bypassing path and fails
- [ ] Each limit has a test where the agent tries to exceed it and is refused
- [ ] The kill switch halts it mid-execution without unwinding positions
- [ ] A complete decision log records what it did and why
- [ ] A sustained paper run completes with a reviewable log before any live
      discussion
- [ ] Agent state never reaches a Cachy-operated instance

## Links

- [`docs/MILESTONES.md`](../../MILESTONES.md) — M9
- [`docs/VISION.md`](../../VISION.md) — commitment 2
- [`docs/adr/0004-spacetimedb-data-scope.md`](../../adr/0004-spacetimedb-data-scope.md) §4
