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
---

# BUG-0759 — Warning buttons have no text token and fall back to unreadable body text

## Symptom

`Button variant="warning"` renders the body text colour on a yellow or orange
fill. In dark themes that is light text on a light fill (1.02–1.64:1 measured),
in light themes dark text on a dark orange fill (1.98–2.42:1). The buttons
appear in Settings → Data maintenance, where they start destructive resets, so
the least readable label in the app sits on the action that erases data.

## Evidence

**Demonstrated** by resolving the pair per theme block the way the cascade
does, with the resolver introduced in BUG-0728.

`src/themes.css:2850` (`.btn-base.btn-warning`):

```css
background-color: var(--btn-warning-bg);
color: var(--text-on-warning, var(--text-primary));
```

`--text-on-warning` is referenced three times in the file and declared **zero**
times, so every theme resolves the fallback. `--btn-warning-bg` is the one
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
  header text colour — 1.02–1.10:1, the same four themes as the table above. In
  the other 27 themes it passed by coincidence (4.68–19.56:1).
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
   six fills from the table, and pins the `opacity: 0.9` hover by compositing
   both the fill and the label over `--bg-secondary` — measured worst case
   4.71:1 (`solarized-dark`).

## Acceptance criteria

- [x] `.btn-base.btn-warning` reads `--btn-warning-text`; the other warning-fill
      labels read `--text-on-warning`, and no rule uses a fallback for it
- [x] `warning` is in the gate's role list and every theme's pair clears 4.5:1
- [x] The six measured pairs from the table above are pinned by the test
- [x] The additional labels (paper-mode badge, conflict toast, paper-mode card
      paragraph) clear 4.5:1 in the themes that previously failed
- [x] The `0.9` hover composite clears 4.5:1 in every theme

## Out of scope

- Changing `--warning-color` or any palette value.
- Hover for the other four roles, which swap a hover token instead of lowering
  opacity (BUG-0760).
- The four pastel themes paint "warning" as `#ffe0ee`. Contrast is fixed here;
  whether that is a sensible warning colour is a palette question.

## What shipped

Shipped in `1.6.0` — `--text-on-warning` plus `--btn-warning-text`, the six
consumer rules, and the extended contrast gate.

## Links

- BUG-0728 — the gate and the four pairs it covers
- BUG-0760 — hover and mixed button pairs outside the gate
- `src/themes.buttonContrast.test.ts`
