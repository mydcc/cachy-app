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
  has to re-apply it. The window layer must not import the settings store
  directly — settings → UI store → window implementations → `WindowBase` is a
  fatal import cycle. The settings module publishes a live reader through
  `src/lib/windows/windowRuleSource.ts`, and `WindowBase` consumes only that
  leaf module; the dependency points one way.
- Geometry goes through the existing size/position clamping
  (`updateSize`/`updatePosition`) so a rule cannot strand a window off-screen.
  A rule size is additionally capped to the viewport, because a rule is entered
  rather than measured. A maximized rule wins over the x/y/width/height fields.
- A rule that sets geometry (or says "not maximized") opens the window
  floating even when its snapshot was maximized; dimensions the rule does not
  set fall back to the type's registry layout. Aspect-locked types (`chart`)
  size from the width, so the editor hides the height field there.
- Editing or disabling a rule affects the next open, not windows that are
  already open. There is no continuous "tiling window manager" enforcement, so
  a rule never fights a live drag. The rule's geometry becomes the window's
  snapshot on its next save, so removing the rule later leaves the window where
  the rule put it.
- UI: a **Window rules** section under Visuals with a type chosen when adding
  (one type-wide rule per type; FEAT-0769 adds one per chart symbol), an
  enabled switch, numeric geometry fields (height only
  where the type has no fixed aspect ratio), maximized/keep-above selects, and
  a remove action. Empty list means today's behaviour.
- New DE/EN strings and the generated locale schema.

## Acceptance criteria

- [x] `windowRules` defaults to an empty list and persists through the existing
      settings schema.
- [x] A rule can be added, edited, disabled and removed in Visuals; a second
      rule for the same `windowType` is refused. (Amended by FEAT-0769: `chart`
      may additionally hold one rule per symbol, so "one rule per type" means
      one *type-wide* rule plus one per scoped symbol.)
- [x] A matching enabled rule applies its position/size when that window type
      next opens; a disabled rule and an empty list leave the restored geometry
      unchanged.
- [x] A rule setting `isMaximized` opens the window maximized and ignores its
      x/y/width/height fields.
- [x] A rule setting `isKeepAbove` opens the window in the keep-above band;
      the control is not offered for a close-on-blur target and the open path
      ignores the flag there.
- [x] Rule geometry is clamped to the viewport by the same path as a drag.
- [x] Two instances of a multi-instance type receive the same rule on open.
      (Amended by FEAT-0769: two charts with different scoped rules each get
      their own.)
- [x] Changing a rule does not move windows that are already open.
- [x] Component/model tests cover matching, precedence, maximize, keep-above,
      clamping, disabled/empty rules, multi-instance types and settings
      persistence.
- [x] `npm run check` stays at 0 errors; no hardcoded colours.

## Out of scope

- Matching by title, URL, role or regular expression. (Symbol matching for
  `chart` shipped in FEAT-0769.)
- More than one rule per type and scope, priority ordering or conflict
  resolution. FEAT-0769 added the *scope* axis for `chart`; two type-wide rules
  for the same `windowType` remain impossible.
- Opacity, shading, focus policy, shortcuts, skip-taskbar/pager/switcher,
  desktop/screen, fullscreen and window-type overrides.
- Rules that follow a window across monitors.
- Per-instance rules for `news` and `iframe`: **charts are covered by
  FEAT-0769**. These are no longer rule targets at all (the reader/content
  surfaces left the list); when they were, neither had a per-instance identity
  a rule could name — `news` is a singleton, and article readers are `iframe`
  windows with a generated id and one shared `news_article` snapshot key.
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
  of scope. Charts gained a symbol scope in FEAT-0769 (`match`) — a different
  axis than an ordinal: two symbols are two deliberate rules, not one rule
  applied twice.
- **Next open only.** There is no "apply now" action for the focused window.
  Editing a rule never moves a window that is already open.
- **The snapshot is the floating rectangle only when the window was closed
  floating.** A maximized close persists the maximized rect, so an
  `isMaximized` rule carries no second rectangle: opening not maximized (by
  setting the flag to false, or by setting geometry) replaces the dimensions
  the rule does not set with the type's registry layout and runs normal
  placement. `restore()` after a live maximize still uses the geometry the
  window had before that maximize.
- **Keep-above is hidden for close-on-blur targets.** The rule UI omits the
  keep-above control when the selected `windowType` has `closeOnBlur`, and the
  open path refuses to lift such a window, so a hand-edited payload cannot
  create the contradiction. No rule target is close-on-blur today (`settings`
  has left the list), but the guard stays for a future type.

## Links

- KWin comparison: [`assets/FEAT-0618/window-manager-comparison.md`](../assets/FEAT-0618/window-manager-comparison.md)
- `src/lib/windows/WindowBase.svelte.ts`
- `src/lib/windows/WindowManager.svelte.ts`
- `src/lib/windows/WindowRegistry.svelte.ts`
- `src/stores/settings/display.svelte.ts`
- `src/stores/settings/persistenceSchema.ts`
- `src/components/settings/tabs/VisualsLayout.svelte`
- [`FEAT-0742`](FEAT-0742-keep-window-above.md) — keep-above action
