---
id: FEAT-0743
title: Apply a saved layout rule when a window opens
type: feature
status: done
priority: P3
milestone: none
editions: [community, pro, private]
area: ui
data_class: none
adr: none
depends_on: [FEAT-0044, FEAT-0742]
assignee: opencode
branch: feature/feat-0743-window-rules
---

# FEAT-0743 — Apply a saved layout rule when a window opens

## Problem

Every window restores the geometry it happened to have when it was last
closed. There is no way to say "a journal always opens on the left half" or
"the alert panel always opens above everything": the user has to rearrange the
same workspace by hand whenever a window comes back in a different place, and
the per-window snapshot follows the last accidental drag instead of a chosen
layout.

The KWin comparison lists window rules as deferred: per-window-type config
flags plus persisted geometry exist, but there are no user-defined rules. The
comparison recommends starting with position/size/pin rather than arbitrary
attributes.

## Proposal

A first, deliberately small rules slice:

- Add a persisted `windowRules` list to Settings (Class A, local only). A rule
  has an `enabled` flag and matches exactly one `windowType`.
- At most one rule per `windowType`. The UI refuses a second rule for a type
  that already has one; this keeps precedence obvious and avoids an ordering
  editor.
- Actions in this slice:
  - `x`, `y`, `width`, `height` in CSS pixels;
  - `isMaximized`;
  - `isKeepAbove` (FEAT-0742).
- A matching enabled rule applies **when the window opens**, after the registry
  defaults and the per-window snapshot are restored, and before the frame is
  first rendered. Rule fields win over the restored snapshot; fields the rule
  does not set keep the restored value.
- Application site: `WindowBase.restoreState()`, next to where the per-window
  snapshot is read, so the rule lands before the first paint and no component
  has to re-apply it. This makes `src/lib/windows/` read the settings store;
  that layer reads no store today, so this is the one coupling the slice
  deliberately adds — the alternative is a caller that passes the rule in, and
  that would leave the open path split across two places.
- Geometry goes through the existing size/position clamping
  (`updateSize`/`updatePosition`) so a rule cannot strand a window off-screen.
  A maximized rule wins over the x/y/width/height fields.
- Editing or disabling a rule affects the next open, not windows that are
  already open. There is no continuous "tiling window manager" enforcement, so
  a rule never fights a live drag.
- UI: a **Window rules** section under Visuals with a per-rule type picker,
  enabled switch, numeric geometry fields, maximized/keep-above toggles, and a
  remove action. Empty list means today's behaviour.
- New DE/EN strings and the generated locale schema.

## Acceptance criteria

- [ ] `windowRules` defaults to an empty list and persists through the existing
      settings schema.
- [ ] A rule can be added, edited, disabled and removed in Visuals; a second
      rule for the same `windowType` is refused.
- [ ] A matching enabled rule applies its position/size when that window type
      next opens; a disabled rule and an empty list leave the restored geometry
      unchanged.
- [ ] A rule setting `isMaximized` opens the window maximized and ignores its
      x/y/width/height fields.
- [ ] A rule setting `isKeepAbove` opens the window in the keep-above band;
      the control is not offered for a close-on-blur target and the open path
      ignores the flag there.
- [ ] Rule geometry is clamped to the viewport by the same path as a drag.
- [ ] Two instances of a multi-instance type receive the same rule on open.
- [ ] Changing a rule does not move windows that are already open.
- [ ] Component/model tests cover matching, precedence, maximize, keep-above,
      clamping, disabled/empty rules, multi-instance types and settings
      persistence.
- [ ] `npm run check` stays at 0 errors; no hardcoded colours.

## Out of scope

- Matching by title, symbol, URL, role or regular expression.
- Multiple rules per type, priority ordering or conflict resolution.
- Opacity, shading, focus policy, shortcuts, skip-taskbar/pager/switcher,
  desktop/screen, fullscreen and window-type overrides.
- Per-instance rules for charts/news, and rules that follow a window across
  monitors.
- Applying a rule to already-open windows when it is edited.
- Continuous enforcement on focus, move, resize or viewport change.
- Rules for modals, dialogs, the symbol picker or minimized dock tiles.
- Import/export and sharing of rule sets.

## Decisions

These were the open questions; they are settled for this slice:

- **Pixels, not viewport fractions.** Geometry stays in absolute CSS pixels.
  Fractions would survive monitor changes better, but need a resize policy
  that is its own slice. A rule that no longer fits is clamped on open.
- **Multi-instance types accept the overlap.** Two charts or two news
  windows that match the same rule open at the same coordinates. Cascading
  the second instance would need a per-instance ordinal and reword this
  item's acceptance criterion; rules for per-instance storage keys are out
  of scope.
- **Next open only.** There is no "apply now" action for the focused window.
  Editing a rule never moves a window that is already open.
- **The per-window snapshot is the floating rectangle.** An `isMaximized`
  rule does not carry a second restore rectangle; `restore()` keeps using the
  geometry the window had before its last maximization, as it does today.
- **Keep-above is hidden for close-on-blur targets.** The rule UI omits the
  keep-above control when the selected `windowType` has `closeOnBlur`, the
  same rule the window header follows. The open path also refuses to lift
  such a window, so a hand-edited payload cannot create the contradiction.

## Links

- KWin comparison: [`assets/FEAT-0618/window-manager-comparison.md`](../assets/FEAT-0618/window-manager-comparison.md)
- `src/lib/windows/WindowBase.svelte.ts`
- `src/lib/windows/WindowManager.svelte.ts`
- `src/lib/windows/WindowRegistry.svelte.ts`
- `src/stores/settings/display.svelte.ts`
- `src/stores/settings/persistenceSchema.ts`
- `src/components/settings/tabs/VisualsLayout.svelte`
- [`FEAT-0742`](FEAT-0742-keep-window-above.md) — keep-above action
