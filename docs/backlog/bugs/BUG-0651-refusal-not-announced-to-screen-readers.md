---
id: BUG-0651
title: The refusal that blocks the order is never announced to a screen reader
type: bug
status: ready
priority: P2
milestone: none
created: "2026-10-07"
editions: [community, pro, private]
area: ui
data_class: none
adr: none
depends_on: []
branch: fix/bug-0651-refusal-live-region
---

# BUG-0651 — The refusal that blocks the order is never announced to a screen reader

> **State note (2026-10-10).** Re-verified against the tree at `56302b52b`
> after #3949 landed. Two things changed and both matter: the outcome banner
> gained `role="alert"`, so *most* refusals are now announced; and #3949 added a
> **new** silent path — the stale-calculation guard — which writes the shared
> error banner and returns without touching `result`. The Evidence below is
> rewritten against the current code. Scope is now small and the risk is now a
> named one, not a vague one.

## Symptom

A trader using a screen reader clicks submit, the panel refuses the order, and
nothing is spoken.

The message is on screen — rendered, in text, in the same place errors have
always appeared. A sighted trader reads it. Everyone else has to go looking for
it, and the moment it describes — "nothing was sent" — is exactly the moment it
would otherwise be missed.

Concretely, on the current build: a calculation that no longer matches the form
(what [BUG-0648](BUG-0648-clearing-stop-keeps-stale-calculation.md) now refuses
on) produces a spoken silence. The trader hears the button do nothing.

## Evidence

**Verified against the code**, not carried over from the original filing.

### The surface

`src/routes/+page.svelte:485-493` renders the error in a plain `<div>`, wrapped
in `{#if uiState.showErrorMessage}`:

```svelte
{#if uiState.showErrorMessage}
  <div
    id="error-message"
    class="text-center text-sm font-medium mt-4 md:col-span-2"
    style:color="var(--danger-color)"
  >
    {$_(uiState.errorMessage as TranslationKey)}
  </div>
{/if}
```

No `role`, no `aria-live`, **and conditionally rendered** — so even adding
`aria-live` to it would be unreliable, because a live region has to be in the
DOM before its content changes.

`src/stores/ui.svelte.ts:414-422` is two plain writes with no announce intent
and no timeout:

```ts
showError(message: string) {
  this.errorMessage = message;
  this.showErrorMessage = true;
}
hideError() {
  this.errorMessage = "";
  this.showErrorMessage = false;
}
```

### Which refusals are silent, and which are not — this is the part that moved

**Already announced.** The gate refusal renders through `result` into
`PlaceOrderPanel.svelte:929-934`, which carries `role="alert"`. Same for the
outcome at `:915` and the venue-unavailable block at `:857`. #3949 gave this
banner its semantics, so the *original* filing's claim that "the one message
that blocks the money path has none" no longer holds for the gate.

**Silent.** `PlaceOrderPanel.svelte:562-573`, the BUG-0648 guard:

```ts
if (staleInputs) {
  uiState.showError(
    $_("orderEntry.errors.staleCalculation", { … }),
  );
  return;
}
```

It writes the shared banner and returns. It sets no `result`, so the
`role="alert"` outcome block never renders. Every channel this refusal has is
the one container with no live-region semantics — **announced nowhere.**

### The thing that makes this more than one attribute

The banner is **shared**, and one of its other writers is the per-keystroke
guidance. `src/services/calculatorService.ts:128-134`:

```ts
public clearResults(showGuidance = false): void {
  resultsState.reset();
  if (showGuidance) {
    this.uiManager.showError("dashboard.promptForData");
  } else {
    this.uiManager.hideError();
  }
}
```

BUG-0648 traced the paths that reach it during ordinary typing: a zero
`accountSize` / `riskPercentage` / `entryPrice` yields `STATUS_INCOMPLETE`
(typing `0.5` into risk puts a literal `0` in the store for one tick), a stop
`<= 0` does too, and editing the entry price on a long that already has a stop
walks through values where `entry <= stop`, which is `INVALID`.

So a live region added naively announces *"Please enter required trade data to
start calculation."* on ordinary keystrokes. That is the failure mode the
fourth acceptance criterion is about, and it is not hypothetical.

Other writers on the same surface, for completeness: `PortfolioInputs.svelte`
(balance fetch), `TradeSetupInputs.svelte` (clipboard copy),
`JournalContent.svelte:574` (screenshot upload, which sets
`showErrorMessage` directly).

### The house vocabulary, so the fix does not invent one

| Meaning | Pattern in use | Where |
|---|---|---|
| Refusal / failed outcome | `role="alert"` | `CandlesticksTab.svelte:236`, `ComboTab.svelte:428`, `IndicatorsTab.svelte:418`, `PlaceOrderPanel.svelte:857/915/929` |
| Hint, loading, guidance | `role="status"` | `IndicatorsTab.svelte:414`, `PlaceOrderPanel.svelte:866`, `AlertPanelView.svelte:414` |
| Ticking numbers that would flood the reader | `aria-live="off"` | `AccountSummary.svelte:263`, `MarketOverview.svelte:640`, `PositionsList.svelte:221` |
| Whole-app offline banner | `aria-live="assertive"` | `OfflineBanner.svelte:118` |

Every refusal in the codebase is `role="alert"`. The shared banner is the one
place where that rule must bend, and the reason is in the next section.

## Cause

Accessibility was applied per-component rather than to the error surface.
Several notes inside `PlaceOrderPanel.svelte` carry `role="status"`, which
makes the pattern look present in the codebase.

Beneath that: **the banner carries three different kinds of message through one
container with no announce intent** — an event refusal (rare, consequential), a
standing guidance string (per keystroke), and an operation failure. A container
that mixes them cannot be given live-region semantics without also making the
commonest message announce, which is why this was never simply patched.

## Fix

Give the container live-region semantics, and resolve the guidance collision
rather than discovering it in review.

1. **Always render the container**; make only its text conditional. The region
   exists before the content arrives — this is the hard requirement, and it is
   also what makes step 4 work. The empty state must not leave the `mt-4`
   margin behind; hiding it must not remove the region from the accessibility
   tree.

2. **`role="status"`, no `aria-atomic`.** Polite, because the surface is shared
   with a message that arrives on ordinary typing, and assertive would interrupt
   whatever the reader is saying several times per sentence. Not atomic,
   because the region contains nothing but the message — there is no unrelated
   content for atomicity to drag along, and non-atomic means only a *changed*
   text is announced.

   This is the one place the house "refusals are `role="alert"`" rule bends, and
   the bend is deliberate: the panel's own refusal banner keeps `role="alert"`
   unchanged, so a refusal raised by the gate is still assertive. What becomes
   polite is the shared banner.

3. **Keep `dashboard.promptForData` on this surface** rather than splitting it
   out. Splitting is the cleaner model and the wrong trade here: it moves where
   guidance renders (a layout change on the trading screen), adds a second
   surface and a second set of store writes, and buys suppression that step 4
   already provides for free.

4. **Rely on — and then verify — the equality guard.** Svelte compiles `{expr}`
   to a text write that skips equal values, so with the container permanently
   present, the repeated identical `promptForData` write produces **no DOM
   mutation and therefore no announcement**. This is the mechanism that makes the
   guidance safe, and it is an assumption about a compiler behaviour until a
   test proves it. Assert the DOM text node is not re-created across two
   identical writes; if Svelte's guard does not hold, the design has to change
   and this item says so rather than shipping a claim.

5. **Decide the double announcement.** `PlaceOrderPanel.svelte:728-736` — the
   `catch` writes `uiState.showError("orderEntry.errors.entryRejected")` *and*
   sets `result`, so with the banner live a rejection would be spoken twice: once
   assertively by the outcome banner, once politely by the banner. See open
   questions.

6. **Extract a component for the markup.** `src/components/shared/ErrorMessage.svelte`,
   ~15 lines, owning the always-rendered region. `src/routes/+page.svelte` is
   ~940 lines and imports the whole shell (window manager, markdown loader, i18n,
   every input component); there is no existing test that mounts it, and building
   that harness to assert three attributes is not worth it. One caller today, and
   the extraction is justified by testability rather than by reuse — if a reviewer
   disagrees, the fallback is manual-only verification and that should be written
   down as a choice, not left implicit.

## Acceptance criteria

- [ ] The container is present in the DOM **with no message**, and carries
      `role="status"` / `aria-live="polite"` on that empty state
- [ ] A refusal from `submit()` is announced: after the stale-calculation guard
      fires, the region holds the text
- [ ] No `aria-atomic` on the region, and the region contains nothing but the
      message
- [ ] Polite, not assertive — with the shared-surface reason recorded here, not
      only in a comment
- [ ] The panel's own refusal banner keeps `role="alert"`; the rejection path
      does not announce the same failure twice
- [ ] `dashboard.promptForData` written twice with identical text does not change
      the region's content — **proven by a test**, not assumed from Svelte's
      equality guard
- [ ] A control case asserts that a *different* message **does** change the
      region's content. A guard that cannot fail is worse than no guard; the
      false-green trap in BUG-0648's fixture is the precedent
- [ ] A manual screen-reader check is recorded (NVDA or VoiceOver), naming what
      was heard for the refusal and what was *not* heard for the guidance. Unit
      tests can prove the region and its content; they cannot prove an
      announcement
- [ ] `npm run check` clean for every touched file; the components Vitest project
      green for the new test

## Out of scope here, deliberately

Adding `role="status"` to the per-keystroke notes inside `PlaceOrderPanel`. It
was proposed, tried in #3949, and withdrawn: `aria-atomic="true"` plus a note
that flickers on ordinary typing is the wrong combination, and it would have
added live-region semantics to five blocks unrelated to the defect while leaving
this one — the refusal — silent.

Also out of scope:

- **Moving `dashboard.promptForData` to its own surface.** Reasoned above.
- **New i18n strings.** This is attributes and structure only; nothing is added
  to `src/locales/locales/{de,en}.json`, so the DE/EN parity check is unaffected.
- **Changing `role="alert"` on the outcome banner or the alert-panel refusals.**
  They are correct as they are.

## How to verify

Component test, `src/components/shared/ErrorMessage.component.test.ts` — the
`components` Vitest project is the only place `svelte` resolves to its browser
build, and `mount()` throws from the server entry.

```bash
bash scripts/run-lowpri.sh npx vitest run src/components/shared/ErrorMessage.component.test.ts
```

Test names state the behaviour (`keeps the region in the DOM when there is no
message`), not the function. Arrange-Act-Assert. Every assertion about
announcement is paired with the control that proves the assertion can fail.

## Open questions

1. **The `catch` double announcement** — drop `uiState.showError` at
   `PlaceOrderPanel.svelte:729` and let the `role="alert"` outcome banner be the
   single channel, or keep both and accept a repeat? Recommendation: drop it,
   because the banner already renders the same message with stronger semantics
   and the banner is the one that stays visible until the next submission.
   Deciding this changes a behaviour that is not only about a11y, so it is named
   rather than assumed.
2. **Manual verification is not automatable.** Somebody has to run a screen
   reader. If nobody can, the item should say so in its Resolution rather than
   close on the unit tests alone.

## Links

Found by review of #3949. The reviewer's own finding on that PR was withdrawn
after checking whether announcement was needed at all rather than assuming a
mechanism; the gap it had been aimed at is this one.

- `docs/backlog/bugs/BUG-0648-clearing-stop-keeps-stale-calculation.md` — the
  refusal that is silent, and the traced keystroke paths into `clearResults`
- `docs/backlog/bugs/BUG-0650-validation-error-erased-in-same-tick.md` — fixed
  the erasure of the validation error on this same surface
- PR #3949 — the change that added both the `role="alert"` banner and the silent
  guard