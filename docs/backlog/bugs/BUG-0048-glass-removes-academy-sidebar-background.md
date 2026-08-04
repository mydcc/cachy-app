---
id: BUG-0048
title: Glassmorphism leaves the Academy sidebar without a background and unreadable
type: bug
status: specced
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

## Acceptance criteria

- [ ] A test asserts the Academy sidebar list has a computed background that is
      not `transparent`, with glass enabled
- [ ] Pattern names are legible against a light and a dark theme with glass on
- [ ] Exactly one rule sets the modal's background; the losing duplicate is
      deleted, not overridden
- [ ] No hard-coded colour is introduced — CSS variables only, per `CLAUDE.md`
- [ ] The `ChartPatternChart` tooltip lands in the same place with glass on and
      glass off

## Links

- `src/components/shared/ModalFrame.svelte:156-164`
- `src/themes.css:2869-2882`
- `src/components/shared/ChartPatternsView.svelte:174-211,295,330,348`
- `src/components/shared/ChartPatternChart.svelte:226`
- Same surface, different mechanism: [`BUG-0047`](BUG-0047-academy-unusable-on-mobile.md)
