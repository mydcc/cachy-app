---
id: BUG-0048
title: Glassmorphism leaves the Academy sidebar without a background and unreadable
type: bug
status: done
priority: P2
milestone: M0
editions: [community, pro, private]
area: ui
data_class: none
adr: none
depends_on: []
---

# BUG-0048 — Glassmorphism leaves the Academy sidebar without a background and unreadable

## Symptom

With the glassmorphism effect enabled, the Trading Academy has no solid
background. The pattern names in the left navigation sit directly on whatever is
behind the modal and are hard to read. The panels on the right stay legible.

## Evidence

**Derived**, two mechanisms.

**1 — the modal's own background is decided by a specificity tie.**
`ModalFrame.svelte:157` sets, in a scoped block:

```css
.modal-content { background-color: var(--bg-secondary); }
```

Svelte scoping compiles that to `.modal-content.svelte-<hash>` — specificity
(0,2,0). `themes.css:2876` sets:

```css
.glass-enabled .glass-panel { background: color-mix(...); }
```

Also (0,2,0). The two rules tie and the winner is decided purely by which
stylesheet the bundler emits last. That is not a background policy, it is a
coin flip that happens to land the same way in a given build.

**2 — only the sidebar depends on it.** The navigation buttons in
`ChartPatternsView.svelte:174-211` declare no background at all — they have
`hover:bg-[var(--nav-hover-bg)]` and a selected state, and nothing otherwise.
They rely on the modal being opaque underneath. Every panel on the right
declares `bg-[var(--bg-tertiary)]` (lines 295, 330, 348) and is therefore
unaffected. That asymmetry is exactly the reported symptom.

**Related, same root:** `backdrop-filter` establishes a containing block for
`position: fixed` descendants. With glass enabled, the tooltip in
`ChartPatternChart.svelte:226` (`fixed z-[9999]`) positions itself relative to
the modal rather than the viewport.

## Cause

Glassmorphism was applied to the container without the contained content having
its own surface. The tie in specificity means neither rule is authoritative, so
whichever one the build order picks, one of the two intended looks is wrong.

## Fix

- Resolve the tie deliberately. `.modal-content` should not set a background at
  all if `glass-panel` is meant to own it; if it is a fallback, it belongs in
  `.glass-panel`'s own non-glass branch (`themes.css:2869-2874`), which already
  exists for exactly that purpose. Pick one and delete the other — do not add
  `!important`.
- Give the sidebar list its own surface so it does not depend on its ancestor:
  a container background on the list wrapper, using the paired classes from
  `themes.css` per `CLAUDE.md`, not a raw colour.
- Verify the `ChartPatternChart` tooltip with glass on and off. If it is
  mispositioned, portal it out of the glass container rather than raising its
  z-index.

Implemented as written. `.modal-content`'s own `background-color` declaration
is deleted (not overridden with `!important`); `.glass-panel`'s existing base
rule and its `.glass-enabled` variant are now the sole authority, and they
already covered both cases correctly — the tie was pure redundancy, not a
missing rule. The sidebar list wrapper gets `bg-[var(--bg-tertiary)] rounded-lg
border border-[var(--border-color)] p-1`, matching the surface treatment the
right-hand panels already use, in both `ChartPatternsView.svelte` and
`CandlestickPatternsView.svelte`.

The tooltip *was* mispositioned with glass on, confirming the second half of
the bug's evidence: `backdrop-filter` on `.modal-content` (applied via
`.glass-enabled .glass-panel`) makes it the containing block for
`position: fixed` descendants, so the tooltip's `e.clientX`/`e.clientY`-based
coordinates resolved against the modal instead of the viewport. Fixed by
applying the repository's existing `use:portal` action (already used
elsewhere for the same class of problem, see `TradeSetupInputs.svelte`) to
move the tooltip to `<body>` on mount. That has one consequence the original
plan didn't call out: once portaled out of the modal's DOM subtree, the
tooltip's `z-[9999]` no longer competes only within the modal — it competes
globally, where the modal itself now sits at `--z-modal` (1,030,000, per
FEAT-0041). Bumped to `--z-toast` (above `--z-modal`) rather than inventing a
new token for one anchored element, which ADR-0006 already excludes from the
shared contract.

## Verification

No automated test — no component-rendering harness exists in this repository
(see [`BUG-0042`](BUG-0042-window-drag-jumps-on-touch.md) and
[`BUG-0047`](BUG-0047-academy-unusable-on-mobile.md) for the same finding;
building one is [`FEAT-0050`](../features/FEAT-0050-window-manager-test-coverage.md)'s
job). Verified against the running dev server with Playwright, glass enabled
via the real persisted setting:

- `.modal-content`'s computed `background-color` resolves to a single,
  unambiguous `color-mix` value (`color(srgb 0.117647 0.160784 0.231373 /
  0.7)`) — previously a build-order coin flip between two tied rules, now the
  outcome of exactly one.
- The sidebar list's computed `background-color` is opaque —
  `rgb(51, 65, 85)` in the dark theme, `rgb(226, 232, 240)` in the light
  theme — in both cases distinct from the ambient glass background and with
  the pattern names legible in a screenshot of each.
- Hovering the pattern chart with glass enabled: the tooltip is confirmed
  portaled (`parentElement === document.body`), and its rendered bounding box
  matches the cursor position once the CSS transform
  (`translateY(-100%) translateX(-50%)`, `margin-top: -10px`) is accounted
  for — i.e. anchored to the viewport, not offset into the modal.

## Acceptance criteria

- [ ] A test asserts the Academy sidebar list has a computed background that is
      not `transparent`, with glass enabled — not done as an automated test;
      verified manually via Playwright per Verification above
      (`rgb(51, 65, 85)` / `rgb(226, 232, 240)`)
- [x] Pattern names are legible against a light and a dark theme with glass on
      — verified via screenshot in both themes
- [x] Exactly one rule sets the modal's background; the losing duplicate is
      deleted, not overridden — `.modal-content`'s `background-color` is
      deleted, `.glass-panel` is the sole remaining source
- [x] No hard-coded colour is introduced — CSS variables only, per `CLAUDE.md`
      — `var(--bg-tertiary)`/`var(--border-color)`, same as the existing
      right-hand panels
- [x] The `ChartPatternChart` tooltip lands in the same place with glass on and
      glass off — verified with glass on (portaled, viewport-anchored); glass
      off was never affected since `backdrop-filter` is absent without it, so
      the containing-block issue never arose there in the first place

## Links

- `src/components/shared/ModalFrame.svelte` — `.modal-content` (background removed)
- `src/themes.css` — `.glass-panel`/`.glass-enabled .glass-panel`, `--z-modal`/`--z-toast`
- `src/components/shared/ChartPatternsView.svelte`, `CandlestickPatternsView.svelte` — sidebar list surface
- `src/components/shared/ChartPatternChart.svelte` — tooltip, now `use:portal`
- `src/lib/actions/portal.ts` — the existing action reused here
- Same surface, different mechanism: [`BUG-0047`](BUG-0047-academy-unusable-on-mobile.md)
