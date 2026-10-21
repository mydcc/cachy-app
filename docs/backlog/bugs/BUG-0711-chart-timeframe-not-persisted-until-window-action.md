---
id: BUG-0711
title: A chart window's timeframe is lost on reload until another window action
type: bug
status: done
branch: fix/chart-timeframe-session-persist
priority: P3
milestone: none
created: "2026-10-21"
editions: [community, pro, private]
area: ui
data_class: none
adr: none
depends_on: []
estimate: 1
size: XS
assignee: opencode
---

# BUG-0711 — A chart window's timeframe is lost on reload until another window action

## Symptom

A chart window's session state includes its timeframe (`serialize()` writes it,
`createFromData` restores it), but changing the timeframe does not write the
session. If the page is reloaded before another window is opened or closed, the
chart comes back on the timeframe of the last session save — often `1h`, the
default — instead of the one the trader selected.

## Evidence

**Demonstrated** — during the BUG-0709 review on 2026-10-21: the dev app's
chart window was switched to `15m`, then `4h`; after a reload the restored
window was active on `1h`. The `serialize()` payload was correct at save time,
but no save had run after the switches.

## Cause

`src/lib/windows/WindowManager.svelte.ts`: the debounced `saveSession()` is
private and called only from `open()` and `close()`. Nothing in `ChartWindow`
triggers it when `timeframe` changes, although `ChartWindow.serialize()`
includes the field and `WindowManager.createFromData()` reads it back.

## Fix

- Expose `windowManager.requestSessionSave()` (the existing debounced
  `saveSession()` behind a public method) for state a window serializes but
  changes in place.
- Make `ChartWindow.timeframe` a getter/setter; the setter calls
  `requestSessionSave()` on a real change. The constructor writes the backing
  field directly, so restoring a value does not schedule a pointless save
  before the window is registered.

## Acceptance criteria

- [x] A test changes a chart window's timeframe, advances the save debounce and
      finds the new value in `sessionStorage['cachy_open_windows']`; it fails
      without the fix (`WindowManager.test.ts`: received `1h`, expected `5m`)
- [x] Setting the same timeframe twice does not request a save
      (`ChartWindow.test.ts` spy: 0 calls for the default, 1 for the change)
- [x] Open/close still persist the session (the new test lets the open-save run
      first and finds the window in the session)

## Out of scope

- Raising the window when a header control is clicked — separate item
  (BUG-0710).

## Links

- `src/lib/windows/WindowManager.svelte.ts`
- `src/lib/windows/implementations/ChartWindow.svelte.ts`
- Branch: `fix/chart-timeframe-session-persist`
