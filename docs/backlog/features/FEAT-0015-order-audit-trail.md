---
id: FEAT-0015
title: Record every order submission attempt locally
type: feature
status: specced
priority: P1
milestone: M1
editions: [community, pro, private]
area: execution
data_class: A
adr: none
depends_on: [FEAT-0011]
---

# FEAT-0015 — Record every order submission attempt locally

## Problem

When an order does something unexpected there is no record of what was actually
sent, what came back, or which checks it passed. Reconstruction depends on
console logs that may not have been open.

## Proposal

An append-only local record: for each submission attempt, the exact payload
sent, the exchange's response, the verification results, the active account and
mode (live/paper), and timestamps. Exportable for support, bounded in size,
Class A — it stays on the device, and it contains credentials-adjacent data, so
it is never attached to a crash report or a debug upload.

## Acceptance criteria

- [ ] Every attempt is recorded, including refused ones, with the refusal reason
- [ ] Credentials and signatures are redacted before writing, asserted by a test
- [ ] The log is bounded and its eviction rule is stated in this item
- [ ] Export produces a file the user can read
- [ ] Nothing in the log reaches any network endpoint, asserted by a test
- [ ] Survives reload

## Out of scope

Journal integration. The journal records trades the user chose to keep; this
records what the software did.

## Links

- [`FEAT-0011`](FEAT-0011-preflight-order-verification.md)
- `src/services/omsService.ts`, `src/lib/server/logger.ts` — the redaction
  pattern already exists there
