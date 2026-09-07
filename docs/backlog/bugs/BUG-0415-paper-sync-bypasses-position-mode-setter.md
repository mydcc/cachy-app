---
id: BUG-0415
title: Paper sync writes the position mode without a freshness stamp
type: bug
status: specced
priority: P1
milestone: none
editions: [community, pro, private]
area: trade-panel
data_class: none
adr: none
depends_on: [BUG-0409]
---

# BUG-0415 — Paper sync writes the position mode without a freshness stamp

## Symptom

The mode chip can show a position mode with a stale freshness stamp. Because
the chip blanks whichever half is more than two minutes older than the other
(BUG-0409), a fresh paper value carrying an old stamp is either blanked while
it is in fact current, or paired with a live margin mode it never shared a
moment with. The likeliest path is a mixed session: read live, then switch
paper trading on.

## Evidence

**Derived.** Two writers of the same field disagree about the contract.

`src/services/paperTradingService.ts:262` writes the field directly:

```ts
accountState.positionMode = account.positionMode;
```

`src/services/tradeService.ts` — both `fetchPositionMode` and the paper branch
inside it — goes through the setter, which stamps:

```ts
accountState.setPositionMode(paper.accountInfo().positionMode);
```

`src/stores/account.svelte.ts:210` is the setter that carries the stamp:

```ts
setPositionMode(value: string | undefined) {
    this.positionMode = value || undefined;
    this.positionModeAt = Date.now();
}
```

Nobody has reported the wrong display yet. Per the template's rule, the fix
needs a test that reproduces the skew *before* the fix lands.

## Cause

`positionMode` and `positionModeAt` are two public `$state` fields with an
invariant that only a convention holds together: write them as a pair. The
setter exists but nothing requires its use, so a second writer in a different
file drifted without any check failing. The same shape applies to the ordering
ticket (BUG-0412) and to the read-back (BUG-0409): all three are discipline,
not mechanism.

## Fix

Close the whole class rather than the one line.

1. Make `positionMode` and `positionModeAt` private to `AccountManager`;
   expose reads through a getter and writes only through `setPositionMode`.
2. Point `paperTradingService.syncToStores` at the setter.
3. Decide deliberately what happens to `positionModeVerifying` and
   `marginModeVerifying`. They are short-lived UI flags with no truth value and
   are written directly from `tradeService.changePositionMode` and
   `changeMarginMode`. Either give them a named begin/end pair or leave them
   public on purpose — but say which, so the next reader does not have to guess
   whether the omission was a decision.

Leave the ordering tickets alone. They already have a branded type; this is the
stamp half.

## Acceptance criteria

- [ ] A test shows the paper sync leaving `positionModeAt` behind, and fails
      before the fix
- [ ] The test passes after the fix
- [ ] `positionMode` and `positionModeAt` cannot be assigned from outside the
      store — type check fails if a call site tries
- [ ] Every existing writer still writes through a setter; no behaviour change
      in the live path
- [ ] The verifying-flag decision is recorded in the code or in the ADR from
      FEAT-0416, not left implicit

## Links

- [BUG-0409](BUG-0409-mode-chip-stale-after-change.md) — introduced the stamp
- [BUG-0412](BUG-0412-duplicate-sidebar-account-fetch-race.md) — the ordering half of the same class
- [FEAT-0416](../features/FEAT-0416-account-read-protocol-adr.md) — the note that follows this
