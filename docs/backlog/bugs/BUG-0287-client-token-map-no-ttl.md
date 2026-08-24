---
id: BUG-0287
title: Issued client tokens never expire and the token map grows without bound
type: bug
status: in-progress
assignee: opencode
branch: fix/bug-0287-client-token-ttl
priority: P3
milestone: none
editions: [community, pro, private]
area: api
data_class: none
adr: none
depends_on: []
---

# BUG-0262 — Issued client tokens never expire and the token map grows without bound

## Symptom

`src/lib/server/clientToken.ts:41–49` stores every issued token hash in a module
Map with a `createdAt` field but no TTL check anywhere and no sweep. A
long-running process accumulates entries forever; repeated self-mints grow it at
will (slow resource growth, not an auth bypass — verification itself is sound).

## Evidence

**Derived** — from reading the file; no long-running process was observed to OOM.

## Cause

TTL was designed in (the timestamp exists) but never wired into `checkClientToken`
or any sweep.

## Fix

Reject-and-evict tokens older than a TTL inside `checkClientToken`, plus a size
cap with oldest-first eviction as backstop. Choose TTL so normal sessions don't
re-auth annoyingly (document the value).

## Acceptance criteria

- [x] A test issues a token, advances time past the TTL, and the token is
      rejected and removed from the map — failing before the fix
- [x] Inserting more than the cap evicts oldest entries without erroring valid
      newer tokens (test)
- [x] Existing rate-limit behaviour unchanged

## Out of scope

Persistent token storage or cross-instance sharing. The bootstrap-endpoint
trade-off already documented in the code.

## Links

- `src/lib/server/clientToken.ts`
- Security audit 2026-08-23, finding "issued tokens never expire" (Low)
