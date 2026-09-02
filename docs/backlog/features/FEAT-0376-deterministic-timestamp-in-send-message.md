---
id: FEAT-0376
title: Replace Date.now() with ctx.timestamp in the send_message reducer
type: feature
status: specced
priority: P3
milestone: none
editions: [community, pro, private]
area: chat
data_class: B
adr: none
depends_on: []
size: S
estimate: 1
# assignee:            # required while status: in-progress (who is working this)
---

# FEAT-0376 — Replace Date.now() with ctx.timestamp in the send_message reducer

Found in the read-only security/privacy audit on 2026-09-02 (finding F-05).

## Current state

`send_message` sets the message timestamp with `Date.now()`
(`server/spacetimedb/src/index.ts:130`). Reducers must be deterministic —
`server/CLAUDE.md` hard requirement #3 — and the module itself demonstrates
the correct pattern one reducer over: `delete_expired_messages` uses
`ctx.timestamp.microsSinceUnixEpoch / 1000n` (`index.ts:74-75`).

With `Date.now()` the stored `sent_at` is the module host's wall clock at
insert time, not the transaction time. SpacetimeDB orders transactions by
`ctx.timestamp`, so messages can carry a `sent_at` that disagrees with the
retention sweep's cutoff computed from `ctx.timestamp` — an ordering/retention
consistency defect, not a security hole.

## Fix

One line: `const timestamp = ctx.timestamp.microsSinceUnixEpoch / 1000n;`
(keep the existing millisecond semantics of the `sent_at` column; if the
client expects a JS number, `Number(...)` at the boundary).

## Acceptance criteria

- [ ] `send_message` derives `sent_at` from `ctx.timestamp`, `Date.now()` no
      longer appears in any reducer.
- [ ] Retention cutoff and message timestamps are now comparable (cutoff is
      computed from the same clock messages are stamped with) — noted in the
      PR.
- [ ] `npm run check` passes.

## Out of scope

- Changing the `sent_at` column type or client-side timestamp handling
  (`src/services/cloudService.ts` untouched).

## Links

- Related audit findings: BUG-0372, BUG-0373, FEAT-0375 (same file)
- [server/CLAUDE.md](../../../server/CLAUDE.md) — "Reducers must be deterministic"
