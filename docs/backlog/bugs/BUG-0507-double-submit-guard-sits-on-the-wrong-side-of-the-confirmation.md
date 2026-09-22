---
id: BUG-0507
title: The entry panel's double-submit guard is set after the confirmation dialog, so what actually prevents a second order is an unrelated invariant in the modal store
type: bug
status: done
assignee: opencode
branch: fix-pkg-e-0507
priority: P3
milestone: none
editions: [community, pro, private]
area: execution
data_class: none
adr: none
depends_on: []
---

# BUG-0507 — The guard against a double entry is not the thing preventing it

## Symptom

No double order is sent today. This item records *why*, because the reason is
not the code that looks like it is responsible.

The entry panel guards against a second submission with a `submitting` flag.
The flag is checked at the top of `submit()` and set several lines later, after
an `await` on the confirmation dialog — a wait that lasts as long as the trader
takes to answer. For that whole window the flag is still `false` and the Place
Order button is still enabled.

What closes the window is a check in `modalState.show` that belongs to a
different bug: a second dialog is refused and its promise resolved as a cancel.
The entry path is safe because of an invariant in the modal store, not because
of its own guard.

## Evidence

**Derived, from reading the code.** Check and set are separated by a wait.

`src/components/results/PlaceOrderPanel.svelte:223`:

```typescript
async function submit() {
    if (!ready || !data || submitting) return;
    ...
    const confirmed = await modalState.show(...);
    if (confirmed !== true) return;

    submitting = true;
```

The check is at `:224`, the `await` at `:227`, the assignment at `:248`. The
button's only disable condition is that same flag — `:414`:

```svelte
disabled={!ready || submitting}
```

**The gate does not close the window either.** `OrderGate.submit`
(`src/services/orderGate.ts:1432`) verifies, issues a pass and calls the
transport. It holds no in-flight set, no intent fingerprint, no idempotency
key; `verify` is documented as pure and "safe to call twice", which it is —
being safe to call twice is not the same as refusing to send twice.

**The venue cannot deduplicate.** FEAT-0069's accepted criterion is "Every
submission carries a unique `clientId`; resubmitting the same attempt reuses
it". Two invocations of `submit()` are two attempts, so two distinct client
IDs reach the venue and two independent positions open, each sized for the
full configured risk.

**The thing that actually prevents it.** `src/stores/modal.svelte.ts:44`:

```typescript
// BUG-0422: never stack a second dialog. WindowManager dedupes by
// id/type and drops the newcomer, so without this check the new
// promise would hang forever with no window to answer it. A
// duplicate confirm reads as a cancel.
if (windowManager.windows.some((w) => w.windowType === "dialog")) {
    resolve(false);
    return;
}
```

The second `submit()` receives `false`, returns at the `confirmed !== true`
line, and sends nothing. Correct outcome, produced by a module that knows
nothing about orders.

## Cause

`submitting` was written as a busy flag for the network call and reads like a
re-entrancy guard. It is checked where a re-entrancy guard belongs and set
where a busy flag belongs, and the confirmation dialog was introduced between
the two.

The safety of the entry path then came to rest on BUG-0422's fix. That fix is
sound and there is no reason to expect it to change — but it is a UI-stacking
rule, not an order-placement rule, and nothing connects the two. A confirmation
moved into the gate (FEAT-0024 already owns a confirmation policy), a dialog
system that allows stacking, or a second entry control that skips the dialog
each silently reopen a double-entry window, and none of those changes would
look like they touch order safety.

## Fix

Put the guard where it is checked.

1. **Set `submitting = true` before showing the confirmation**, and clear it on
   every exit path including cancel. This is the whole behavioural fix and it
   is one line moved.
2. **Give `OrderGate.submit` an in-flight guard** keyed on the intent's
   identity — account, endpoint, action, symbol, quantity — refusing a second
   identical intent while the first is still in flight. This is the layer every
   order path passes through, so it covers the bot path and any future control
   without each needing its own flag.
3. **Test the window, not the outcome.** A test that only asserts "one order
   was sent" passes today for the wrong reason. The test has to invoke `submit`
   a second time while the first is waiting on the confirmation, with the modal
   stubbed to answer both, and assert the panel itself refuses.

Nothing here changes current behaviour. It moves the reason for that behaviour
into the code responsible for it.

## Acceptance criteria

- [x] `submitting` is true for the entire duration of the confirmation dialog
- [x] A test invokes `submit` twice with the modal stubbed to confirm both, and
      asserts exactly one placement call — and fails without the fix
- [x] Cancelling the confirmation clears the flag and leaves the button usable
- [x] `OrderGate.submit` refuses a second identical intent while the first is
      in flight, proven by a test that does not involve the dialog
- [x] Bot placement is unaffected, or gains the same protection

## Links

- BUG-0422 — the stacked-dialog fix currently carrying this path's safety
- FEAT-0069 — the unique-`clientId` rule that makes a second submission a
  second order rather than a retry
- FEAT-0024 — the confirmation policy in the gate, one of the changes that
  would reopen the window
- BUG-0491 — the bot-side duplicate-order case, already recorded separately
