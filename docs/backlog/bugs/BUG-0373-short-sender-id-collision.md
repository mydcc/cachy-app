---
id: BUG-0373
title: Short sender IDs are 32-bit identity prefixes and can collide, breaking GDPR erasure and message attribution
type: bug
status: specced
priority: P3
milestone: none
editions: [community, pro, private]
area: chat
data_class: B
adr: none
depends_on: []
size: M
estimate: 3
# assignee:            # required while status: in-progress (who is working this)
---

# BUG-0373 — Short sender IDs are 32-bit identity prefixes and can collide, breaking GDPR erasure and message attribution

Found in the read-only security/privacy audit on 2026-09-02 (finding F-03).

## Symptom

Two different chat users can end up with the same displayed sender ID. When
that happens, one user's "delete my messages" can delete another user's
messages, and every message is attributed to the wrong person.

## Evidence

**Derived** (from reading the code; no incident observed, and none is needed
to show the possibility).

- `server/spacetimedb/src/index.ts:129` —
  `const senderId = ctx.sender.toHexString().substring(0, 8); // Short ID`.
  The stored identity is the first 8 hex characters = 32 bits of a 256-bit
  identity.
- `server/spacetimedb/src/index.ts:76-86` — `delete_my_messages` matches rows
  by that same 8-character prefix, so any prefix collision means one caller
  erases another caller's rows.
- Birthday bound: at ~77,000 distinct identities a 32-bit space has ~50%
  collision probability. Far below any realistic user count for Global Chat —
  but the failure mode is silent and touches GDPR erasure.

## Cause

The sender ID is truncated to a "Short ID" for display and then also used as
the storage key and erasure key. Display truncation and identity semantics
were conflated.

## Fix

Store and match on the full identity (or at least a collision-safe portion of
it), and truncate only at the display layer, e.g.:

- Extend the `sender` column to hold the full identity string.
- `delete_my_messages` compares full identities.
- Migration decision for existing rows: stored 8-char prefixes cannot be
  re-expanded — old messages either stay under a legacy value or are purged
  (they expire after 90 days anyway). The operator can republish with
  `--clear-database` if a clean break is preferred.

## Acceptance criteria

- [ ] `send_message` stores an unambiguous sender identity.
- [ ] `delete_my_messages` deletes only messages written by the calling
      identity, even when display prefixes collide (test with two identities
      sharing an 8-char prefix).
- [ ] Decision on legacy rows documented in the PR (migrate vs. purge vs.
      clear-database).
- [ ] `npm run check` passes; chat store (`src/stores/chat.svelte.ts`) still
      compiles against the widened type.

## Open questions

- Does the UI anywhere rely on the 8-character length of `sender`
  (e.g. rendering, grouping)? Needs a quick check before widening the column.

## Links

- Related audit findings: BUG-0372, FEAT-0375, FEAT-0376 (same reducer/file)
- [docs/GLOBAL-CHAT.md](../../../GLOBAL-CHAT.md)
- [docs/adr/0004-spacetimedb-data-scope.md](../../adr/0004-spacetimedb-data-scope.md)
