---
id: BUG-0357
title: CloudService single callback overwrite disables global chat updates after CloudTab closes
type: bug
status: ready
priority: P1
milestone: none
editions: [community, pro, private]
area: chat
data_class: none
adr: none
depends_on: []
size: S
---

# BUG-0357 — CloudService single callback overwrite disables global chat updates after CloudTab closes

## Symptom

When a user opens Settings and navigates to the Cloud tab, and then closes Settings, the Global Chat widget stops receiving incoming messages and connection status changes for the remainder of the application session.

## Evidence

**Derived** from comparing `cloudService.ts`, `chat.svelte.ts`, and `CloudTab.svelte`:

In `src/services/cloudService.ts:229-237`:
```typescript
subscribeMessages(cb: (msgs: GlobalMessage[]) => void) {
  this.onMessageCallback = cb;
  cb(this.messages);
}

subscribeStatus(cb: (status: CloudStatus) => void) {
  this.onStatusCallback = cb;
  cb(this.status());
}
```

In `src/stores/chat.svelte.ts:61-62`:
```typescript
cloudService.subscribeStatus((status) => this.applyStatus(status));
cloudService.subscribeMessages((rows) => this.applyRows(rows));
```

In `src/components/settings/tabs/CloudTab.svelte:34-45`:
```typescript
$effect(() => {
  cloudService.subscribeMessages((msgs) => {
    messages = msgs;
  });
  cloudService.subscribeStatus((s) => {
    status = s;
  });

  return () => {
    cloudService.subscribeMessages(() => {});
    cloudService.subscribeStatus(() => {});
  };
});
```

## Cause

`CloudService` maintains only a single reference variable for `this.onMessageCallback` and `this.onStatusCallback`. When `CloudTab` mounts, it overrides `chatState`'s listener. When `CloudTab` unmounts, its cleanup function replaces both callbacks with empty no-op functions (`() => {}`), permanently disconnecting `chatState` from SpacetimeDB events.

## Fix

1. Convert `onMessageCallback` and `onStatusCallback` in `CloudService` to `Set<(msgs: GlobalMessage[]) => void>` and `Set<(status: CloudStatus) => void>`.
2. Make `subscribeMessages` and `subscribeStatus` return an unsubscribe cleanup function `() => void`.
3. In `CloudTab.svelte`, store and call the returned unsubscribe functions in the `$effect` teardown instead of passing dummy callbacks.

## Evaluation

- **Umfang (Scope):** S (approx. 30 lines across 2 files)
- **Priorität (Priority):** P1 (Broken feature state after opening settings)
- **Schwierigkeit (Difficulty):** Low (standard listener pattern)
- **Dringlichkeit (Urgency):** Medium

## Acceptance criteria

- [ ] A test proves that registering multiple message and status subscribers receives callbacks simultaneously.
- [ ] Unsubscribing one subscriber does not prevent other subscribers from receiving subsequent messages.
- [ ] Opening and closing `CloudTab` leaves `chatState` actively receiving messages and status updates.

## Out of scope

- Modifications to SpacetimeDB schema or reducers.
- Changes to chat message retention or presentation.

## Open questions

None.

## Links

- `src/services/cloudService.ts:229-237`
- `src/stores/chat.svelte.ts:61-62`
- `src/components/settings/tabs/CloudTab.svelte:34-45`
