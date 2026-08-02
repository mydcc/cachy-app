---
id: FEAT-0033
title: Harden Global Chat and add peer-signal reputation
type: feature
status: specced
priority: P2
milestone: M7
editions: [pro, private]
area: collaboration
data_class: B
adr: ADR-0004
depends_on: [FEAT-0014]
---

# FEAT-0033 — Harden Global Chat and add peer-signal reputation

## Problem

Global Chat works and has no moderation, no rate limiting and no abuse handling.
Separately, the original request was to filter out unsuccessful traders so their
opinions carry less weight.

## Proposal

**Hardening:** rate limiting in the reducer, message length bounds, blocking and
reporting, and an operator moderation path. The retention sweep and self-service
erasure already exist.

**Reputation — and this is deliberately not what was asked for.** The requested
filter, ranking users by trading success, **cannot be built**:

- Any figure derived from the journal is Class A data used as metadata, which
  ADR-0001 condition 3 forbids. This was already built once, as a profit factor
  in the chat payload, and removed for exactly that reason.
- It was also unverifiable: the client computed it and the server accepted it
  verbatim, so anyone could claim any figure.

What is admissible is reputation from signals that originate in the chat itself
— peer ratings, message count, account age, report counts. That is a weaker
thing and should be described honestly: it measures whether people valued what
you wrote, not whether you can trade. See
[ADR-0004](../../adr/0004-spacetimedb-data-scope.md) §3.

## Acceptance criteria

- [ ] Rate limiting is enforced in the reducer, not the client, with a test
- [ ] Blocking and reporting work; a blocked sender's messages do not render
- [ ] The payload-shape test still asserts the exact permitted key set
- [ ] No reputation input derives from the journal, settings or account state,
      asserted against the wire payload
- [ ] Reputation is labelled in the UI as what it measures, in both locales
- [ ] Absent from the Community build
- [ ] Chat unreachable changes nothing about the core

## Links

- [`docs/adr/0004-spacetimedb-data-scope.md`](../../adr/0004-spacetimedb-data-scope.md) §3
- [`docs/GLOBAL-CHAT.md`](../../GLOBAL-CHAT.md)
- `server/spacetimedb/src/index.ts`, `src/stores/chat.svelte.ts`
