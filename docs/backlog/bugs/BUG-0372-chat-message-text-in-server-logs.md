---
id: BUG-0372
title: Global chat reducer logs every message text to server logs, defeating the 90-day retention promise
type: bug
status: specced
priority: P2
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

# BUG-0372 — Global chat reducer logs every message text to server logs, defeating the 90-day retention promise

Found in the read-only security/privacy audit on 2026-09-02 (finding F-02).

## Symptom

Every global chat message, including its full text, is written to the
SpacetimeDB server's persistent logs. The product promises (docs/GLOBAL-CHAT.md,
ADR-0001 GDPR rationale): chat is a conversation, not an archive — messages are
deleted after 90 days. Server logs have no retention policy and keep the full
text indefinitely, so the retention promise is false.

## Evidence

**Derived** (from reading the code; no incident observed).

- `server/spacetimedb/src/index.ts:132` —
  `console.info(\`Message from ${senderId}: ${text}\`);` logs the full message
  text.
- `server/spacetimedb/src/index.ts:17-23` (comment) and
  `docs/GLOBAL-CHAT.md` § 4 — retention promise of 90 days, motivated by the
  GDPR consequence named in ADR-0001.
- The message retention reducer (`delete_expired_messages`,
  `server/spacetimedb/src/index.ts:70-91`) deletes rows but not log lines.

## Cause

A debug `console.info` was left in the production reducer. SpacetimeDB
persists reducer logs (`spacetime logs <db>`), so the log line outlives the
row it describes.

## Fix

- Remove the message text from the log line (e.g. log only the sender ID
  prefix and message length), or remove the log line entirely.
- Leave the retention reducer itself untouched.

## Acceptance criteria

- [ ] The `send_message` reducer no longer logs message text (code review).
- [ ] `spacetime logs <db>` after sending a message shows no message content
      (manual verification during development).
- [ ] `npm run check` passes; no existing chat tests break.

## Open questions

- None blocking. Optional follow-up: whether operator-side logs should get a
  documented retention policy at all — that is an operator decision, not a
  code fix.

## Links

- [docs/GLOBAL-CHAT.md](../../GLOBAL-CHAT.md) § 4 — retention promise
- [docs/adr/0001-local-first-boundary.md](../../adr/0001-local-first-boundary.md)
- Related audit findings: BUG-0373, FEAT-0375, FEAT-0376 (same reducer/file)
