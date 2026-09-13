---
id: BUG-0466
title: Global Chat re-registers its table listener on every reconnect and never releases its cloud subscriptions
type: bug
status: done
assignee: opencode
shipped: 1.6.0-beta.292
priority: P3
milestone: none
editions: [community, pro, private]
area: cloud
data_class: B
adr: ADR-0001
depends_on: []
size: S
---

# BUG-0466 — Global Chat re-registers its table listener on every reconnect and never releases its cloud subscriptions

## Symptom

Two lifecycle defects in the Class B Global Chat:

1. Every `cloudService.connect()` attaches another `globalMessage.onInsert`
   handler. `tables` is a module-level query builder, so the handlers stack;
   after a reconnect each incoming row is appended once per handler ever
   installed, and a reconnect that replays the table can also re-append rows
   already held.
2. `ChatManager` subscribes to `cloudService.subscribeStatus` and
   `subscribeMessages` in its constructor, but `destroy()` only tears down its
   `$effect` root. Those two callbacks are never unsubscribed, so a hot reload
   leaves the old store attached to the live service.

## Evidence

**Derived** from reading the code. No running reconnect was profiled.

- `src/services/cloudService.ts` registers the handler after every `connect()`
  call, guarded only by `typeof onInsert === 'function'`; `connect()` returns
  early only while `this.connected`, so a `connected → onDisconnect → connect`
  cycle reaches the registration again.
- `src/stores/chat.svelte.ts` pushed neither subscription's unsubscribe
  function anywhere, and `destroy()` only cleared `effectCleanup`.

## Cause

Both are missing teardown/guard pairs on a long-lived singleton: a handler that
is attached but never detached, and subscriptions that are taken but never
released. `tables` being module-level (not per connection) is what turns the
first into a duplicate on every reconnect rather than a stale-handle bug.

## Fix

- Attach the `onInsert` handler at most once per `CloudService` instance
  (`insertListenerAttached`), and dedupe replayed rows on the module's natural
  composite key (`sender:sentAt`) before appending.
- Track the two cloud unsubscribe functions on `ChatManager` and call them from
  `destroy()`.

## Acceptance criteria

- [x] A test connects, disconnects and reconnects, and the table handler is
      attached exactly once.
- [x] A test feeds the same row twice and the message list holds it once.
- [x] A test proves both cloud subscriptions are released on `destroy()`.

## Out of scope

- Changing the reconnect policy itself (no autonomous reconnect is added).
- Any change to the SpacetimeDB module schema or reducers.
- The market-data subscription lifecycle (`BUG-0465`).

## Links

- `src/services/cloudService.ts`
- `src/stores/chat.svelte.ts`
- `src/services/cloudService.test.ts`, `src/stores/chat.cloudSubscriptions.test.ts`
- [`ADR-0001`](../../adr/0001-local-first-boundary.md),
  [`BUG-0357`](BUG-0357-cloud-service-callback-overwrite.md)
