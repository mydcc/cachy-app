---
id: FEAT-0684
title: Give the Academy window the title bar's font-size control
type: feature
status: done
priority: P3
milestone: none
editions: [community, pro, private]
area: ui
data_class: A
adr: none
depends_on: [FEAT-0045]
assignee: opencode
branch: feat/academy-font-size
---

# FEAT-0684 — Give the Academy window the title bar's font-size control

## Problem

The Academy is read — twenty-three indicator lessons, four prose fields each,
plus the pattern tabs — and the windows that are *read* in this app (guide,
changelog, privacy, whitepaper) all carry the A-/A+ step control in their title
bar. The Academy does not, so a trader who finds the prose too small for their
screen has no way to enlarge it short of browser zoom, which scales the whole
app including the panels they had sized deliberately.

The control already exists and is generic: `WindowFrame` renders the two buttons
behind `win.allowFontSize`, `WindowBase.setFontSize` clamps the value to 8–32 px
and persists it per window, and the frame applies it as the content's
`font-size`. The Academy window simply never opted in.

## Proposal

Set `allowFontSize: true` in the Academy window's registry flags — the same
opt-in the reader class already takes, for the same reason.

## Acceptance criteria

- [x] The Academy window's title bar shows the A-/A+ font-size control
- [x] Pressing it steps the Academy's text size and the value survives a reload, through the existing per-window persistence
- [x] The flag stays a per-type opt-in: the fallback window config keeps the control off, so this is not a new default

## Out of scope

- **No new control and no new persistence.** The buttons, the 8–32 clamp and the
  per-window `fontSize` round trip already exist; this item only lets the Academy
  use them.
- **No change to the Academy's own layout.** The content scales with the frame's
  `font-size`, as it does in the reader windows; container-query breakpoints in
  the tab views are unaffected.

## State

Shipped on branch `feat/academy-font-size`. The flag alone would have been
theatre: `WindowFrame` applies a px `font-size` to `.window-content`, but the
Academy's text is sized by Tailwind utilities, which Tailwind v4 emits as
`font-size: var(--text-*)` — rem-based tokens a px parent cannot reach. So the
change has two halves:

- the registry flag (`allowFontSize: true`) — without it the frame renders no
  buttons at all;
- `themes.css` multiplies the six `--text-*` tokens by `--text-scale`, and the
  frame publishes that factor on the content wrapper (the size relative to
  `DEFAULT_WINDOW_FONT_SIZE`). At the default size the factor is exactly 1, so
  nothing renders differently until the trader steps it.

What is pinned by a test, and what is not: the registry opt-in
(`WindowRegistry.test.ts`), the published factor and its clamp
(`WindowFrame.component.test.ts`), and that the factor defaults to 1. The token
*consumption* is CSS — `themeColors.test.ts` shows the house style is to test
pure functions over a `StyleReader`, not a stylesheet's text — so that half is
verified by compiling Tailwind and reading the emitted
`.text-sm { font-size: var(--text-sm) }` beside
`--text-sm: calc(0.875rem * var(--text-scale, 1))`, and has no automated guard.
A reviewer who reverts the tokens would leave the buttons present and inert
again.

## Links

- `src/lib/windows/WindowRegistry.svelte.ts` — the Academy window's flags
- `src/components/shared/windows/WindowFrame.svelte` — the buttons and the `font-size` they drive
- `src/lib/windows/WindowBase.svelte.ts` — `setFontSize`, the clamp and the persisted state
- FEAT-0045 — the Academy as its own window type
