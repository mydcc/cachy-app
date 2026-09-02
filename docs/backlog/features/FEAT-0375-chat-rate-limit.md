---
id: FEAT-0375
title: Rate-limit the send_message reducer to stop message flooding in global chat
type: feature
status: specced
priority: P3
milestone: none
editions: [community, pro, private]
area: chat
data_class: B
adr: none
depends_on: [BUG-0373]
size: M
estimate: 3
# assignee:            # required while status: in-progress (who is working this)
---

# FEAT-0375 — Rate-limit the send_message reducer to stop message flooding in global chat

Found in the read-only security/privacy audit on 2026-09-02 (finding F-04).

## Current state

`send_message` (`server/spacetimedb/src/index.ts:124-140`) validates only the
message length (≤ 1000 chars). There is no frequency limit, so any token
holder can insert unbounded messages per second, filling the `global_message`
table between the hourly retention sweeps and degrading chat for everyone.

SpacetimeDB reducers are transactional and have no timers, so any rate limit
has to be derived from table state (e.g. a small per-sender bookkeeping table
read inside the reducer).

## Proposal

Add per-identity throttling inside the reducer. Sketch (to be finalized during
implementation):

- A `sender_activity` table (private, not `public: true`) with one row per
  sender identity holding the last send timestamp and/or a token bucket.
- `send_message` reads/updates it in the same transaction and rejects with a
  `SenderError` when the caller exceeds the budget.
- Determinism: use `ctx.timestamp`, never `Date.now()` (see FEAT-0376 — fix
  that first or together).

Constants (window, budget) as named constants at the top of the module, in
the style of the existing `RETENTION_DAYS`.

## Acceptance criteria

- [ ] A sender exceeding the configured budget gets a rejected reducer call;
      other senders are unaffected (test).
- [ ] Burst behavior defined and tested (what happens in the first window).
- [ ] The bookkeeping table itself is covered by the retention sweep or
      bounded another way (no unbounded growth).
- [ ] `npm run check` passes; client (`src/stores/chat.svelte.ts`) surfaces
      the rejection as a user-visible error, not a silent drop.

## Out of scope

- Moderation, blocking, or report features.
- Rate limiting any other reducer.

## Open questions

- Budget values (e.g. 5 messages / 10 s?) — pick conservative defaults and
  document them; adjust later without schema change.
- Dependency note: build on BUG-0373's full-identity sender key so the
  bookkeeping row is keyed unambiguously, not on the colliding 8-char prefix.

## Links

- Related audit findings: BUG-0372, BUG-0373 (same file), FEAT-0376
- [server/CLAUDE.md](../../CLAUDE.md) — reducer rules
