---
id: BUG-0717
title: Window titles have button semantics on windows where the title does nothing
type: bug
status: in-progress
assignee: opencode
branch: fix/ui-window-chrome
priority: P3
milestone: none
created: "2026-10-21"
editions: [community, pro, private]
area: ui
data_class: none
adr: none
depends_on: []
---

# BUG-0717 — Window titles have button semantics on windows where the title does nothing

## Symptom

Every window title is announced as a button and is keyboard-focusable. On
windows whose title only names the window, pressing Enter does nothing, and the
pointer cursor does not change either. A screen-reader user is told there is an
action where there is none.

## Evidence

**Derived.** `src/components/shared/windows/WindowFrame.svelte:681-689`:

```svelte
<div
    class="title-wrapper"
    class:clickable={win.headerAction === "toggle-mode"}
    role="button"
    tabindex="0"
    onkeydown={(e) => e.key === "Enter" && win.onHeaderTitleClick()}
>
```

The pointer affordance is conditional (`class:clickable`), the semantics are
not: `role`, `tabindex` and the keydown handler are unconditional. The default
handler is empty — `src/lib/windows/WindowBase.svelte.ts:743`
(`onHeaderTitleClick() { }`) — so only subclasses that override it do anything.

## Cause

The title's interactive mode was added as a class toggle, while the accessibility
attributes were treated as static markup.

## Fix

Drive all four from one condition — the one that decides whether the title has
an action (for example a derived `titleIsActionable` on the window, true when
`headerAction === "toggle-mode"` and the subclass overrides the handler). Keep
the `clickable` class on the same condition.

## Acceptance criteria

- [ ] A window without a title action renders no `role="button"` and no
      `tabindex` on its title
- [ ] A window with the action keeps both, and Enter still fires it
- [ ] A component test covers both cases

## Links

- Found by [FEAT-0606](../features/FEAT-0606-button-placement-visibility-and-dependency-audit.md)
- Evidence table: [`ui-zustandsaufnahme.md`](../assets/FEAT-0605/ui-zustandsaufnahme.md) §8.3
