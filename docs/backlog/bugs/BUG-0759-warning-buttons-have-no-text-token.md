---
id: BUG-0759
title: Warning buttons have no text token and fall back to unreadable body text
type: bug
status: specced
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

`src/themes.css:2843` (`.btn-base.btn-warning`):

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

## Cause

The primitive's warning variant reused the old `--text-on-warning` name, but no
theme ever declared it. BUG-0728's gate covers `--btn-*-bg` / `--btn-*-text`
pairs; warning is the one filled role without a text token, which is why it fell
outside that gate instead of failing it.

## Fix

1. Add `--btn-warning-text` (per theme where the fill differs in lightness) and
   read it in `.btn-base.btn-warning` and the two `--text-on-warning` rules at
   `src/themes.css`'s warning overrides.
2. Extend `src/themes.buttonContrast.test.ts` to include `warning` once the
   token exists, so the pair is gated like the other four roles.

## Out of scope

- Changing `--warning-color` or any palette value.

## Links

- BUG-0728 — the gate and the four pairs it covers
- `src/themes.buttonContrast.test.ts`
