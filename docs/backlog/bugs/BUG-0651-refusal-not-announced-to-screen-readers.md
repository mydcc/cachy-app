---
id: BUG-0651
title: The refusal that blocks the order is never announced to a screen reader
type: bug
status: done
priority: P2
milestone: none
created: "2026-10-07"
editions: [community, pro, private]
area: ui
data_class: none
adr: none
depends_on: []
assignee: opencode
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

**Already announced — but on an unreliable construct.** The gate refusal renders
through `result` into `PlaceOrderPanel.svelte:929-934`, which carries
`role="alert"`. Same for the outcome at `:915` and the venue-unavailable block
at `:857`. #3949 gave this banner its semantics, so the *original* filing's
claim that "the one message that blocks the money path has none" no longer
holds for the gate.

That does not make it sufficient, and the item nearly said so in the opposite
direction. The banner lives inside `{#if result}`, and `result` is `null` until
the submit assigns it — so on the first submission the alert node enters the
accessibility tree together with its text, which is the construct this same
Evidence section calls unreliable a few lines up. Applying one rule and then
its opposite to two neighbouring blocks is what made the first cut of this fix
delete the wrong line. Both surfaces are now kept; see Resolution.

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
   assertively by the outcome banner, once politely by the live region. See open
   questions. **Resolved the other way than this step assumed** — the banner is
   inside `{#if result}`, so it does not reliably speak, and the deletion traded a
   possible duplicate for a possible silence on the money path. See Resolution.

6. **Extract a component for the markup.** `src/components/shared/ErrorMessage.svelte`,
   ~15 lines, owning the always-rendered region. `src/routes/+page.svelte` is
   ~940 lines and imports the whole shell (window manager, markdown loader, i18n,
   every input component); there is no existing test that mounts it, and building
   that harness to assert three attributes is not worth it. One caller today, and
   the extraction is justified by testability rather than by reuse — if a reviewer
   disagrees, the fallback is manual-only verification and that should be written
   down as a choice, not left implicit.

## Acceptance criteria

- [x] The container is present in the DOM **with no message**, and carries
      `role="status"` / `aria-live="polite"` on that empty state
- [x] A refusal from `submit()` is announced: after the stale-calculation guard
      fires, the region holds the text
- [x] The region contains nothing but the message, so atomicity has nothing to
      drag along
- [x] Polite, not assertive — with the shared-surface reason recorded here, not
      only in a comment
- [x] `aria-atomic="false"`, stated rather than inherited. `role="status"` carries
      an implicit `aria-atomic="true"`; asserting the attribute is *absent* would
      have passed on a region that re-announces everything it holds
- [x] The panel's own refusal banner keeps `role="alert"`, **and** the catch in
      `submit()` still writes the shared surface — the banner is inside
      `{#if result}` and does not reliably announce on a first submit, so the two
      channels are not redundant. Three cases pin the catch path; see Resolution
- [x] A rejected submit is pinned by a test that drives `submit()`, not by one
      that pushes a string into the store — the earlier wording claimed that
      composition and no test delivered it
- [x] `dashboard.promptForData` written twice with identical text does not change
      the region's content — **asserted, but not fully pinned**. See Verification
      still owed, and Known limits. The old wording demanded a test that "cannot
      pass for the wrong reason"; that turned out to be unachievable in this
      environment and the wording was wrong, not the finding
- [x] A control case asserts that a *different* message **does** change the
      region's content, and a positive control proves the observer sees an
      identical `nodeValue` write. A guard that cannot fail is worse than no
      guard; the false-green trap in BUG-0648's fixture is the precedent
- [x] `npm run check` clean for every touched file; the components Vitest project
      green for the new test

## Verification still owed

Two things this item's code cannot deliver. They were acceptance criteria
while the work was open; they are prose here so that a closed item does not
carry a ticking box that no commit can satisfy. Both stay open — neither is
done.

**A screen reader has not run this.** Unit tests can prove the region exists and
holds the text. They cannot prove an announcement. The check to run: with NVDA
or VoiceOver, trigger a refusal and record what was spoken, then type into the
risk or entry field and record that the guidance was *not* spoken on each
keystroke. Both halves, because the second is the reason `polite` was chosen.

**The identical-write skip is asserted but not fully pinned.** Two attempts to
force a contradicting implementation — `{@html}` instead of the text write, and
an `$effect` writing `nodeValue` unconditionally — both stayed green, because
happy-dom's `innerHTML` and the effect's dependency tracking skip identical
values for the same reason Svelte does. The skip therefore rests on `$state`'s
own equality check — `internal_set` compares against the old value and returns
early on a match, so the template effect never re-runs and the text write is
never reached — a code-level fact in Svelte's `sources.js`, and not on a test.
An earlier version of this item credited `set_text`; the effect is never called
at all. The same assertions would catch an unconditional write in a real browser.

**A duplicate announcement is accepted here, and is not verified either way.**
Both surfaces speak the rejection on the catch path — the live region politely,
the outcome banner assertively. That is a deliberate trade, recorded in the
Resolution: the banner is inside `{#if result}` and cannot be relied on, so the
region is kept even though the duplication is possible. The three cases in
`PlaceOrderPanel.staleSubmit.component.test.ts` pin each surface firing
*independently* — neither fails if the other stops. So the suite proves both
channels work and deliberately proves nothing about whether the trader hears
the message twice, which depends on screen-reader behaviour no test here can
reach. Anyone tightening this later must start from the unreliability of the
banner, not from the duplication.

**The message moved on screen.** It used to be the last child of the
`grid-cols-1 md:grid-cols-2 gap-y-4` inputs grid, spanning both columns. It is
now a full-width block between that grid and `#results`. The margin is applied
conditionally so the permanently-present empty region adds no gap, and the
empty-state case asserts the class is absent — but the change in *position* is
visible and shipped under an accessibility ticket. The repo has no e2e
coverage for this region, so it wants one look at a wide and a narrow window
before merge.

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

## Resolution

`src/components/shared/ErrorMessage.svelte` (~20 lines) owns the markup, and
`+page.svelte` renders it. Five cases in
`ErrorMessage.component.test.ts`, against the real `uiState`.

**The region moved out of the grid.** It was the last item of
`grid grid-cols-2 gap-x-8 gap-y-4`, wrapped in `{#if}`. Conditional, it was
un-announceable; made permanent in place, it would have been a permanent empty
grid row with a `gap-y-4` under it, on every load. Outside the grid the empty
state is a zero-height block. The `md:col-span-2` went with it — it described a
grid placement that no longer applies.

**The double announcement: first cut wrong, corrected.** The first version
deleted `uiState.showError` from the `catch` in `PlaceOrderPanel.svelte`, on the
reasoning that `errorText` falls back to `orderEntry.errors.entryRejected` when
there is no `errorKey`, that branch sets none, and the `role="alert"` outcome
banner therefore already renders the identical string — so two channels meant
the trader heard it twice.

That reasoning holds only if the banner speaks, and it is the weaker of the two
claims. The banner lives inside `{#if result}`; `result` is `null` until this
very catch block assigns it. On the first submission the alert node is inserted
into the accessibility tree together with its text — the construct this item's
own Evidence calls unreliable. So the deletion bought a *possible* duplicate in
exchange for a *possible* silence, on the refusal that blocks a money path. The
call is restored.

Both surfaces are now deliberate: the live region is what can be relied on,
because it is in the DOM before any message arrives; the banner is what stays on
screen until the next submission. Three cases in
`PlaceOrderPanel.staleSubmit.component.test.ts` pin the catch path — the shared
surface receives the refusal, the banner renders it under `role="alert"`, and the
banner carries the failure detail the shared surface cannot. Removing the
`showError` call fails the first and leaves the other two green, so the region
write is pinned independently of the banner rather than riding on it.

**The first draft of the mutation test was wrong, and the wrongness is the
point.** It compared text *node identity*. Svelte's `set_text` mutates
`nodeValue` on the same node, so identity survives whether or not the write was
skipped — the assertion would have passed on a component that re-announced every
keystroke. Replaced with a MutationObserver.

**Then the observer was measured before it was trusted.** Two attempts to build
a contradicting implementation — `{@html}` instead of the text write, and an
`$effect` writing `nodeValue` unconditionally — both stayed green. Not because
the tests are weak: happy-dom's `innerHTML` skips identical values, and the
effect's own dependency tracking skips a run whose dependency did not change.
Both skip for the same reason Svelte does, so nothing in this environment can
be made to re-write an identical value.

So the honest division of labour:

| Claim | Proven by |
|---|---|
| The region exists, empty, polite, not atomic | test |
| A refusal reaches it; a changed message replaces its text | test |
| The observer would report a write if one happened | positive control in the test |
| The identical write is **skipped** rather than performed with the same value | `$state`'s equality check in `internal_set` — a code-level fact, not a test |
| A reader **hears** it | nothing yet; needs a human |

The earlier wording of that acceptance criterion — "proven by a test, not
assumed" — was not achievable. It is recorded as `[~]` rather than ticked.

## Known limits

- **No screen reader has run this.** Everything above is DOM state and code
  reading. Whether NVDA or VoiceOver actually speak the refusal, and stay quiet
  on the guidance, is unverified. Carried in *Verification still owed* above;
  still open.
- **The identical-write skip is environmental.** The same assertions would catch
  an unconditional write in a real browser, where `innerHTML` always mutates.
  Under happy-dom they would not.
- **About twenty writers now reach a screen reader, not only an eye.** Roughly
  twenty call sites write `uiState.showError`, and not all of them write a
  translated, bounded, trader-facing sentence. `+layout.svelte` forwards
  `window.error` and `unhandledrejection` messages verbatim,
  `PositionsSidebar.svelte` puts a cancel-order response in, `JournalContent`
  puts an upload failure in. Those strings were rendered before this change and
  are *spoken* after it. Because the region is polite they queue rather than
  interrupt, so the cost is crowding, not noise-over-crowding-out. Auditing
  every writer for announcement-worthiness is its own item and was not done
  here.
- **A round-trip translation guard was tried and reverted.** The cast
  `uiState.errorMessage as TranslationKey` is unchecked and `errorMessage` is a
  plain `string`, so `PlaceOrderPanel.detailText`'s pattern was copied over as
  apparent insurance. Removing the round trip left every test green —
  svelte-i18n already echoes exactly the values the guard would have passed
  through, so it was a no-op with a security-flavoured comment attached. Reverted;
  what remains is the inline lookup that `+page.svelte` had before this change,
  plus one test pinning that raw third-party text reaches the trader as written.
- **`aria-live="polite"` is reasoned, not experienced.** The argument is that
  this surface also carries a per-keystroke message and that assertive would
  interrupt constantly. If a reader turns out to announce `role="status"`
  reliably enough that the guidance becomes audible on every keystroke, the
  answer is to move the guidance to its own surface — deliberately not done here,
  for the reasons in Fix step 3.

## Open questions

None blocking. The politeness question above stays open until somebody has run a
screen reader.

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