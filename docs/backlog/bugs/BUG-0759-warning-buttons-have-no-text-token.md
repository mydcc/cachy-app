---
id: BUG-0759
title: Warning buttons have no text token and fall back to unreadable body text
type: bug
status: done
priority: P2
milestone: none
created: "2026-10-31"
editions: [community, pro, private]
area: ui
data_class: none
adr: none
depends_on: [BUG-0728]
shipped: 1.6.0
---

# BUG-0759 — Warning buttons have no text token and fall back to unreadable body text

## Symptom

`Button variant="warning"` renders the body text colour on a yellow or orange
fill. In dark themes that is light text on a light fill (1.01–2.14:1 measured);
in the four light themes it is dark text on a dark amber fill (1.17–2.42:1). The
buttons appear in Settings → Data maintenance, where they run the journal
repairs — `repair`, `repairMfeMae`, `repairSymbols` — so the least readable
label in the app sits on the actions that rewrite stored journal fields.

## Evidence

**Demonstrated** by resolving the pair per theme block the way the cascade
does, with the resolver introduced in BUG-0728.

`.btn-base.btn-warning` in `src/themes.css`:

```css
background-color: var(--btn-warning-bg);
color: var(--text-on-warning, var(--text-primary));
```

Before this fix `--text-on-warning` was referenced three times in the file and
declared **zero** times, so every theme resolved the fallback. `--btn-warning-bg` is the one
`--btn-*` background that is not re-declared per theme either; it follows
`--warning-color`, whose value ranges from `#ffff00` (matrix) to `#953800`
(light) across the palettes.

Measured pairs (`--text-primary` on `--warning-color`):

| Theme | Fill | Ratio |
| --- | --- | --- |
| `.theme-meteorite` | `#ffe0ee` | 1.02:1 |
| `.theme-default` | `#facc15` | 1.24:1 |
| `.theme-matrix` | `#ffff00` | 1.27:1 |
| `.theme-VIP` | `#ff9800` | 1.63:1 |
| `.theme-github-light` | `#953800` | 1.98:1 |
| `.theme-light` | `#953800` | 2.42:1 |

**Three more consumers had the same hole**, found while fixing it:

- `src/components/layout/Header.svelte:91` (`.paper-mode-badge`) paints the
  warning fill and took its label from `--bg-primary`. That token is a
  `radial-gradient` in `meteorite`, `steel`, `insight` and `ever`, so the
  declaration is invalid at computed-value time and the label inherits the
  header text colour — 1.02–1.10:1 in those four pastel themes (only
  `meteorite` is also in the table above). In the other 24 CSS scopes it passed
  by coincidence (4.68–19.56:1).
- `src/components/settings/HotkeySettings.svelte:197` (conflict toast) pairs the
  warning fill with a hardcoded `text-black`, which is 2.84:1 on the `#953800`
  fills — and a hardcoded colour besides.
- `src/components/settings/PaperTradingSettings.svelte:124` sits inside
  `.bg-warning-paired` and set its own `--text-secondary` on the paragraph, so
  the container's `!important` ink never reached it (1.00–2.61:1).

`.badge-warning` has no consumer today; it is fixed with the rest so the next
one does not inherit the bug.

## Cause

The primitive's warning variant reused the old `--text-on-warning` name, but no
theme ever declared it. BUG-0728's gate covers `--btn-*-bg` / `--btn-*-text`
pairs; warning is the one filled role without a text token, which is why it fell
outside that gate instead of failing it. The three component sites above read
the same missing token, or worked around it with `--bg-primary` / `text-black`,
so the hole was wider than the primitive.

## Fix

1. `--text-on-warning` is declared in the shared `:root` block as
   `var(--blue-950)` (dark ink), and overridden to `var(--blue-100)` in the four
   themes whose warning fill is dark (`light`, `solarized-light`, `ayu-light`,
   `github-light`). No single ink clears both a `#ffff00` and a `#953800` fill.
2. `--btn-warning-text: var(--text-on-warning)` is declared once at `:root`,
   next to `--btn-warning-bg` and for the same re-substitution reason.
3. Consumers: `.btn-base.btn-warning` reads `--btn-warning-text`;
   `.bg-warning-paired`, `.badge-warning`, `.status-indicator.warning`
   (`CalculationDashboard.svelte`), `.paper-mode-badge` (`Header.svelte`) and
   the `HotkeySettings` toast read `--text-on-warning`. The paper-trading card's
   description paragraph switches with the card's fill instead of hardcoding
   `--text-secondary`.
4. `src/themes.buttonContrast.test.ts` adds `warning` to the role list, pins the
   six fills from the table, pins the hover by reading the opacity out of
   `.btn-base.btn-warning:hover` and compositing fill and label over
   `--bg-primary` (the row surface in `DataMaintenance`, including every
   gradient stop in the four gradient themes) — measured worst case 4.74:1
   (`solarized-dark`) — and guards the wiring, so a consumer reverted to
   `--bg-primary`, `--text-secondary` or `text-black` fails with its name.

## Acceptance criteria

- [x] `.btn-base.btn-warning` reads `--btn-warning-text`; the other warning-fill
      labels read `--text-on-warning`, and no rule uses a fallback for it
- [x] `warning` is in the gate's role list and every theme's pair clears 4.5:1
- [x] The six measured pairs from the table above are pinned by the test
- [x] The additional labels (paper-mode badge, conflict toast, paper-mode card
      paragraph) clear 4.5:1 in the themes that previously failed
- [x] The hover composite, at the opacity the CSS declares, clears 4.5:1 on
      every backdrop a warning button sits on

## Out of scope

- Changing `--warning-color` or any palette value.
- Hover for the other four roles, which swap a hover token instead of lowering
  opacity (BUG-0760).
- The four pastel themes paint "warning" as `#ffe0ee`. Contrast is fixed here;
  whether that is a sensible warning colour is a palette question.

## What shipped

Ships with `1.6.0` — `--text-on-warning` plus `--btn-warning-text`, the six
consumer rules, the wiring guard and the extended contrast gate. The concrete
beta is recorded by the release PR.

## Links

- BUG-0728 — the gate and the four pairs it covers
- BUG-0760 — hover and mixed button pairs outside the gate
- `src/themes.buttonContrast.test.ts`
