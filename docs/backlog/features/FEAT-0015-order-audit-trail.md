---
id: FEAT-0015
title: Record every order submission attempt locally
type: feature
status: done
branch: claude/feat-0011-erledigen-k3fht2
priority: P1
milestone: M1
editions: [community, pro, private]
area: execution
data_class: A
adr: none
depends_on: [FEAT-0011]
estimate: 5
size: L
target_date: 2026-10-21
start_date: 2026-08-01
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

- [x] Every attempt is recorded, including refused ones, with the refusal reason
- [x] Credentials and signatures are redacted before writing, asserted by a test
- [x] The log is bounded and its eviction rule is stated in this item
- [x] Export produces a file the user can read
- [x] Nothing in the log reaches any network endpoint, asserted by a test
- [x] Survives reload

## Eviction rule

As the acceptance criteria require, stated here rather than only in code:

The log keeps the **most recent 500 attempts**. Writing the 501st drops the
oldest. Independently, if the serialised log would exceed **512 KB**, the
oldest entries are dropped until it fits — one pathological payload must not
be able to consume the whole `localStorage` budget and take the journal down
with it.

Both bounds drop from the oldest end, and nothing is ever summarised or
rewritten: an entry is present in full or it is absent. A half-record would
be worse than none, because it would look like evidence.

## What shipped

- `src/services/orderAuditService.ts` — the append-only record. One entry per
  attempt: the payload, the exchange's response, the fields the gate compared,
  the refusal if there was one, the account, the mode, and both timestamps.
- `orderGate.registerAuditRecorder` — the seam. `submit()` reports every
  outcome through it, so an order cannot be placed without appearing in the
  log. Refusals are recorded too, and those are the ones a console would never
  have shown, because nothing was sent. The recorder's exceptions are
  swallowed: an audit trail that can refuse an order is a second gate, and a
  broken recorder must never be able to stop a close.
- `src/utils/redact.ts` — browser-side credential redaction, mirroring
  `src/lib/server/logger.ts` (which extends Node's `EventEmitter` and cannot
  be imported into the browser bundle). Redaction happens **before** the
  record exists, so there is no window in which an unredacted copy could be
  persisted or exported, and it never mutates the caller's payload — doing so
  would mean the transport sent a redacted order.
- Order Log sub-tab under Trading: the attempts newest-first, each expandable
  to the full record, with JSON export and a clear button.
- German and English strings.

## Out of scope

Journal integration. The journal records trades the user chose to keep; this
records what the software did.

## Follow-ups

- The `open` path is not reachable from the UI yet
  ([`FEAT-0069`](FEAT-0069-bitunix-place-order-completion.md)), so today the
  log fills with closes, cancels and modifications. Nothing about the record
  is specific to those.

## Links

- [`FEAT-0011`](FEAT-0011-preflight-order-verification.md)
- `src/services/omsService.ts`, `src/lib/server/logger.ts` — the redaction
  pattern already exists there
