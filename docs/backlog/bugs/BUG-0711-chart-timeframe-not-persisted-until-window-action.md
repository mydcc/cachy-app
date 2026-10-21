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
  changes in place. It catches a blocked-storage failure and logs, because a
  persistence problem must not break the action that changed the chart.
- Make `ChartWindow.timeframe` a getter/setter; the setter calls
  `requestSessionSave()` on a real change. The constructor writes the backing
  field directly, so restoring a value does not schedule a pointless save
  before the window is registered.
- Validate the restored timeframe at the session-JSON boundary
  (`typeof d.timeframe === "string"`), so a corrupt record cannot become a
  durable never-matching timeframe.

## Acceptance criteria

- [x] A test changes a chart window's timeframe, advances the save debounce and
      finds the new value in `sessionStorage['cachy_open_windows']`; it fails
      without the fix (`WindowManager.test.ts`: received `15m`, expected `5m`)
- [x] The open-save itself carries the restored timeframe, and the change stays
      debounced until its own save fires (asserted before the second advance)
- [x] A pending change is flushed on `beforeunload` without advancing the timer
- [x] Setting the same timeframe twice — including the same changed value —
      does not request a save (`ChartWindow.test.ts` spy: 0 calls for the
      default, 1 for `5m` set twice)
- [x] Restoring a non-default timeframe (`4h`) sets the window and the active
      header button without scheduling a save
- [x] A blocked `sessionStorage` does not throw out of `requestSessionSave()`;
      the failure is logged
- [x] The spies are restored for every test, and the manager test closes its
      window in `finally` so a failed assertion cannot leave it registered

## Out of scope

- Raising the window when a header control is clicked — separate item
  (BUG-0710).

## Links

- `src/lib/windows/WindowManager.svelte.ts`
- `src/lib/windows/implementations/ChartWindow.svelte.ts`
- Branch: `fix/chart-timeframe-session-persist`
