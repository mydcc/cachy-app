---
id: BUG-0216
title: Three dialogs render raw {placeholder} because $_ was called without the values wrapper
type: bug
status: done
branch: claude/feat-0011-erledigen-k3fht2
priority: P2
milestone: M3
editions: [community, pro, private]
area: ui
data_class: none
adr: none
depends_on: []
start_date: 2026-08-16
target_date: 2026-08-16
size: XS
estimate: 1
---


# BUG-0216 — Three dialogs render raw {placeholder} because `$_` was called without the values wrapper

## Symptom

Closing a position asks:

> Close position for {symbol}?

The leverage and fee fields show the same fault in their manual-override hint.

## Evidence

**Demonstrated** — screenshotted by the user on `dev.cachy.app`, in the native
confirm dialog raised by `PositionsList.handleClose`.

Three call sites, found by scanning every `$_(key, {…})` in `src/` for an
argument that does not open with `values:`:

- `src/components/shared/PositionsList.svelte:91` — `{ symbol: pos.symbol }`
- `src/components/inputs/GeneralInputs.svelte:181` — `{ value: remoteLev + "x" }`
- `src/components/inputs/GeneralInputs.svelte:222` — `{ value: targetRemoteFee + "%" }`

Both locales have the keys, with the placeholders. Nothing was missing from
the translations.

## Cause

svelte-i18n takes interpolation values under a `values` key:

```ts
$_("positionsList.confirmClose", { values: { symbol } })
```

Passing the variables directly is silently ignored — the object is a valid
options bag, `symbol` simply is not an option. There is no type error and no
runtime error; the placeholder is rendered literally. Every correct call site
in the codebase uses `values`, so this is three slips against a convention,
not a misunderstanding of it.

## Fix

The three call sites, and — because this is the third time in one day that a
raw placeholder reached a user — a check in `scripts/lint-i18n.js`, which
already gates CI. It flags any `$_(key, {…})` whose object does not begin with
`values:`, allowing the empty object.

The check is verified against the pre-fix code: it reports exactly these three
sites and exits 1.

**Left alone:** the native `confirm()` in `PositionsList`. Cachy has its own
`modalState` and using it here would be an improvement — the browser dialog
cannot be themed and announces the hostname — but that is a UI change, not
this fix, and closing a position is not the place to bundle one.

## Acceptance criteria

- [x] A check reproduces the defect and fails without the fix
- [x] The check passes with the fix
- [x] All three call sites pass their values under `values`
- [x] The linter runs in CI and fails the build on a new occurrence

## Links

- [`BUG-0215`](BUG-0215-order-refusal-placeholders.md) — the same symptom from a
  different cause (values discarded in transit rather than never passed), found
  the same day

## What shipped

Shipped in 1.6.0-beta.53.
