---
id: BUG-0793
title: Window rules offer a chatbox target that no window can ever carry
type: bug
status: ready
priority: P3
milestone: none
editions: [community, pro, private]
area: ui
data_class: A
adr: none
depends_on: []
assignee: none
branch: none
---

# BUG-0793 — Dead window types in the rule picker and the registry (W1-12 follow-up)

## Symptom

Settings → Visuals offers a window rule for **Chat**, and the window registry
declares a **news** type, but neither window can exist: nothing constructs a
window with `windowType: "chatbox"` or `"news"` any more. A rule the user
creates for Chat is stored, listed and enabled, and can never match. The
`news` registry entry is never reached because news frames open as `iframe`.

## Evidence

Found while cleaning up BUG-0790 (the deleted window classes). Verified against
`develop` at `72f3d72ec`:

- `src/lib/windows/windowRules.ts:72` lists `"chatbox"` in
  `WINDOW_RULE_TYPES`; `src/components/settings/tabs/VisualsLayout.svelte:73`
  labels it `settings.windowRulesTypes.chatbox` ("Chat").
- `WindowManager.svelte.ts` constructs only `chart`, `channel`, `iframe` and
  `academy` (`createFromData`, `:275-293`); `chat` opens as `AssistantWindow`
  via `src/stores/ui.svelte.ts:376`.
- `WindowRegistry.svelte.ts:333` still declares a `news` config; nothing reads
  it, because `news` windows are `iframe` windows with
  `storageKey: "news_article"`.

## Cause

The window types outlived their implementations. The registry is a
`Record<WindowType, WindowConfig>`, so a type can be added and kept
type-complete while no code path ever produces it; the rule picker filters
`WINDOW_RULE_TYPES` only by "already has a rule", not by constructibility.

## Fix

Decide per type, then do it in one pass:

1. `chatbox` — either drop it from `WindowRuleType`, `WINDOW_RULE_TYPES`,
   `TYPE_LABEL_KEYS` and both locale files **with** a migration for rules
   already stored in `settingsState.windowRules`, or keep the type and hide it
   from the picker (`availableRuleTypes`) while stored rules keep rendering.
2. `news` — remove the registry entry and the `WindowType` member, or make
   something actually open it.

## Acceptance criteria

- [ ] The rule picker offers only window types a `WindowManager` path can
      produce
- [ ] A settings file that already contains a `chatbox` rule loads without
      error and keeps rendering (or the migration removes the rule explicitly)
- [ ] No `WindowType` member exists without a constructible path, or the
      remaining exception is documented in the registry file

## Out of scope

- Re-introducing a chat or news window. This item removes dead metadata; it
  does not add a surface.

## Links

- `src/lib/windows/windowRules.ts`
- `src/lib/windows/WindowRegistry.svelte.ts`
- `src/components/settings/tabs/VisualsLayout.svelte`
- `docs/backlog/bugs/BUG-0790-unreachable-modules-still-maintained.md`
