---
id: BUG-0719
title: Journal sync disables on uiState.isLoading with no visible reason
type: bug
status: in-progress
assignee: opencode
branch: fix/ui-journal-dates
priority: P3
milestone: none
created: "2026-10-21"
editions: [community, pro, private]
area: ui
data_class: none
adr: none
depends_on: []
---

# BUG-0719 — Journal sync disables on uiState.isLoading with no visible reason

## Symptom

The "Sync Bitunix" button has three reasons to be unavailable, but only two of
them are shown. While the journal is loading (`uiState.isLoading`), the button
greys out with its normal refresh icon and label — no spinner, no changed text,
no tooltip. It reads as a broken button.

## Evidence

**Derived.** `src/components/shared/JournalContent.svelte:621-638`:

```svelte
<button
    onclick={app.syncBitunixHistory}
    disabled={!settingsState.entitlement.isPro || uiState.isPriceFetching || uiState.isLoading}
    …
>
    {#if uiState.isPriceFetching}
        <div class="animate-spin …"></div>
    {:else if !settingsState.entitlement.isPro}
        <span class="opacity-70">🔒</span>
    {:else}
        <span class="opacity-70">{@html icons.refresh}</span>
    {/if}
    <span>
        {uiState.isPriceFetching ? $_("journal.messages.syncing") : $_("journal.syncBitunix")}
    </span>
```

`isLoading` appears in the disabled expression but in neither branch below.
`uiState.isLoading` is set around the journal load in the same file (`:559`,
`:576`).

## Cause

The condition was extended with `isLoading` after the visual states were written,
and the spinner branch was never widened.

## Fix

Either include `isLoading` in the spinner/label branch (the load and the sync are
both work in progress), or drop it from the condition if the button is safe to
press then. Do not keep a disable with no cue.

## Acceptance criteria

- [ ] Every condition in the `disabled` expression has a visible counterpart
- [ ] A component test sets `isLoading` and asserts the visible state

## Links

- Found by [FEAT-0606](../features/FEAT-0606-button-placement-visibility-and-dependency-audit.md)
- Evidence table: [`ui-zustandsaufnahme.md`](../assets/FEAT-0605/ui-zustandsaufnahme.md) §8.2
