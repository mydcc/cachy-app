---
id: BUG-0650
title: A validation error is set and erased in the same tick, so the trader never sees it
type: bug
status: in-progress
priority: P2
milestone: none
editions: [community, pro, private]
area: ui
data_class: none
adr: none
depends_on: []
assignee: opencode
branch: fix/bug-0650-erased-validation-error
---

# BUG-0650 — A validation error is set and erased in the same tick, so the trader never sees it

## Symptom

Type an entry price that crosses the stop — a long whose entry falls to or below
its stop. The position summary clears, which is correct. No message explains why.

The validation message exists, is computed, and is passed to the UI. It is
erased before the browser ever paints it.

## Evidence

**Derived** — the defect follows from reading two functions in one file. Nobody
has watched it happen; the path is short enough to follow to the end, and the
review that surfaced it read both ends rather than assuming.

`src/services/calculatorService.ts:161-166`, `handleValidationResult`:

```ts
if (validationResult.status === CONSTANTS.STATUS_INVALID) {
  trackCustomEvent("Calculation", "Error", validationResult.message);
  this.uiManager.showError(validationResult.message || "");   // sets it
  this.clearResults();                                        // takes it away
  return true;
}
```

`src/services/calculatorService.ts:128-135`, `clearResults`:

```ts
public clearResults(showGuidance = false): void {
    resultsState.reset();
    if (showGuidance) {
      this.uiManager.showError("dashboard.promptForData");
    } else {
      this.uiManager.hideError();                             // runs, with showGuidance defaulting to false
    }
}
```

Same synchronous call stack. `showError` and `hideError` are two writes to the
same `$state` pair, so the framework batches them and the intermediate value is
never rendered. The message exists for less time than a frame.

The `STATUS_INCOMPLETE` branch two lines below does not have this problem,
because it passes `true` and so takes the branch that *shows* rather than hides.

## Cause

The two calls do unrelated jobs and were written in the wrong order. `showError`
publishes the reason; `clearResults()` clears the stale figures and, as a side
effect, clears whatever error was showing. The caller wants both effects, in
that order, and there is no call that does both.

Note the asymmetry that hides this: `clearResults(true)` — the *other* branch —
calls `showError`. So `clearResults` can show or hide, depending on a flag, and
the INVALID branch is the only caller that asks for "clear the results and show
nothing", which is precisely the opposite of what that branch just asked for.

## Fix

Swap the two calls in the `STATUS_INVALID` branch: `clearResults()` first, then
`showError(message)`. Same two effects, message survives.

Do **not** change `clearResults`. Its hide-when-not-guiding behaviour is what
three other call sites rely on; making it error-preserving by default would
reach all of them.

## Acceptance criteria

- [x] A test reproduces the defect: drive the calculator to `STATUS_INVALID` and
      assert the error is still showing afterwards — and it fails before the fix
- [x] The test passes with the fix
- [x] The `STATUS_INCOMPLETE` path still shows `dashboard.promptForData`, and a
      plain `clearResults()` still hides — both pinned, since the fix reorders
      calls in a shared method
- [x] `npm run check` clean for every file touched

## Resolution

One swap in `handleValidationResult`: `clearResults()` first, then
`showError(message)`. Both effects are still wanted — clearing the stale figures
is correct, explaining why is correct — only the sequence was wrong.

`clearResults` is untouched. Its hide-when-not-guiding behaviour is what three
other call sites rely on, and a test pins it.

### The assertion had to be about order, not absence

Both calls still happen after the fix. A test asserting `hideError` was never
called would have failed for the right reason and then pushed the fix towards
deleting a behaviour three call sites depend on. The test asserts that **the last
thing to happen is a show**, plus that the clear actually ran — the second half
matters because an earlier version compared against `?? 0` and so passed
vacuously when the clear never happened.

Two false starts are worth recording, because both would have shipped a green
test that proved nothing:

- **The entry/stop path is unreachable for this test.** `slBelowEntry` sits behind
  the meta guards, and a crossed stop yields a nonsense size that trips a guard
  first. The take-profit path is used instead: by the time a target is validated
  the size is computed and no guard stands in the way.
- **A nine-character typo.** `verborgen` for `verbergen` — indistinguishable by
  eye, and my own search pattern could not match it. The test threw
  `ReferenceError` rather than failing an assertion, which is why it looked like
  the fix was wrong twice before I read the error instead of the diff.

## Links

Found while reviewing BUG-0648's second half, where it matters more than it
first appears: on this path the calculator's message is the only thing that
would have told the trader their entry and stop disagree, and the standing
"not current" note is currently the only signal that survives.

- `docs/backlog/bugs/BUG-0648-clearing-stop-keeps-stale-calculation.md`
