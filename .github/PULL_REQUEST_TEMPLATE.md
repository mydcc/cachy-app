<!--
  Replace <issue_number> below. The `Fixes #` line must stay at the very top of
  the description so GitHub links the PR to the issue and advances the Kanban
  card. See AGENTS.md § "Commits & Branches".
-->

Fixes #<issue_number>

## Summary

<!-- What changed and why. One logical change per PR. -->

## Type of change

- [ ] `feat` — new feature
- [ ] `fix` — bug fix
- [ ] `refactor` — behavior-preserving change
- [ ] `docs` / `chore` / `ci` — non-behavioral
- [ ] `BREAKING CHANGE` (describe below)

## Backlog item

<!-- Only if this closes a backlog mirror with a `backlog-id:` label. -->
- [ ] N/A
- [ ] Item flipped to `status: done` and `node scripts/backlog-index.mjs` regenerated in this PR

## Test plan

<!-- Name the tests actually run and what they said. Full suites run in CI. -->

- [ ] Targeted test(s): `npx vitest run <path>`
- [ ] Type check: `npm run check` (CI)
- [ ] Manual verification: <steps / screenshots for UI changes>

## Non-negotiable rules (Cachy)

- [ ] Svelte 5 runes only — no `export let`, `$:`, `createEventDispatcher`, `<slot>`
- [ ] Every `$effect` that subscribes to a listener returns a cleanup function
- [ ] `decimal.js` for all prices / amounts / balances (no native `number`)
- [ ] No hardcoded colors — CSS variables or paired classes from `src/themes.css`
- [ ] Local-First boundary held — Class A data never leaves the device
- [ ] Core code does not import `src/lib/spacetimedb/` or `src/services/cloudService.ts`

## Sensitive areas

<!-- Gentle heads-up, not a blocker. Tick if the change touches any of these. -->

- [ ] `area: execution` / `area: security` / `area: exchange` / `priority: P0` — 👤 human review recommended before merge

## Notes for reviewers

<!-- Anything non-obvious: trade-offs, follow-ups, areas you are unsure about. -->
