---
id: FEAT-0772
title: Prove the Apply-now button reacts to a newly focused window
type: feature
status: in-progress
priority: P3
milestone: none
editions: [community, pro, private]
area: ui
data_class: none
adr: none
depends_on: [FEAT-0770]
assignee: opencode
branch: test/feat-0772-apply-now-reactivity
size: S
estimate: 2
---

# FEAT-0772 — Prove the Apply-now button reacts to a newly focused window

## Problem

A rule card's "Apply now" is only usable while the window the user last worked
in matches the rule. That state is produced by one `$derived` read of the window
manager, and no test has ever observed it change. The component test mounts the
editor against a plain object and assigns `lastActiveWindow` before mounting, so
it proves the initial state and nothing about the transition.

The transition is the whole feature: the editor is already open when the user
focuses a chart, and the button is supposed to become usable at that moment. If
the link stops being reactive — the manager keeps the id in a field the getter
does not track, or the editor captures the value once — every existing test
stays green while the button stays disabled forever. The user sees a shipped
feature that never activates.

## Proposal

One integration-style component test in the `components` project that mounts the
Window rules section against the real `windowManager` singleton instead of a
mock. The settings and i18n stores stay mocked: rule persistence is not the
subject, the reactive link is.

The test opens a real window through the manager's normal open path after the
editor has rendered, and asserts the card's action flips from disabled to
enabled without a remount. It then focuses a non-matching window, and finally
closes the matching one and asserts the action returns to disabled.

## Acceptance criteria

- [ ] A component test mounts the Window rules section against the real
      `windowManager`; only the settings and i18n modules stay mocked.
- [ ] With no other window focused, the action is disabled and names the
      "no target window" reason.
- [ ] Opening a matching window through the manager's normal open path — after
      the editor is mounted — flips the action to enabled without a remount.
- [ ] Focusing a window that does not match the rule (another type, or a chart
      with a different symbol scope) keeps it disabled and swaps the reason.
- [ ] Closing the matching window returns the action to disabled.
- [ ] The test fails when the reactive link is broken. Proof required: make the
      manager's getter return a captured value instead of reading its reactive
      field, watch the new test go red, then revert.
- [ ] The existing mocked component test stays as the fast path; this is an
      addition, not a rewrite.
- [ ] It runs in the `components` project with no new global setup, no new fake
      timers and no `resolve.conditions` change.

## Decisions

- **Target the manager, keep the settings mock.** The gap is the reactive link
  to `windowManager.lastActiveWindow`, not rule persistence. Mocking settings
  keeps the test fast and the failure unambiguous.
- **The test must fail for the reason it names.** A green test that also passes
  against a non-reactive manager would reproduce the hole it is meant to close,
  so the red-on-break probe is part of the acceptance criteria, not a nicety.
- **Component test, not Playwright.** `mount()` in the `components` project
  already resolves Svelte's browser build, and the claim is one boolean. An
  end-to-end run would add minutes to prove nothing extra.

## Out of scope

- Re-testing geometry, clamping, keep-above or maximize application — the
  FEAT-0770 unit tests own that.
- A general "mount any settings tab against the real singletons" harness.
- End-to-end coverage of the settings window in Playwright.

## Open questions

None blocking. If the real singleton turns out to need the settings store's
persistence chain at mount time, mock that chain rather than the manager — the
manager is the subject.

## Links

- `src/components/settings/tabs/VisualsLayout.component.test.ts` — the mock and
  its "the mock is the whole contract" comment
- `src/components/settings/tabs/VisualsLayout.svelte` — `ruleTarget`,
  `applyNowRefusal`
- `src/lib/windows/WindowManager.svelte.ts` — `lastActiveWindow`,
  `bringToFront`, the rehydration clear
- `docs/backlog/features/FEAT-0770-apply-a-window-rule-now.md` — the known gap
