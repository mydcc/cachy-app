---
id: FEAT-0197
title: "Extract entitlement state and the settings load/persist path out of settings.svelte.ts"
type: feature
status: in-progress
priority: P2
milestone: none
editions: [community, pro, private]
area: security
data_class: A
adr: none
depends_on: [BUG-0182, BUG-0183, BUG-0184]
estimate: 5
size: L
target_date: 2026-09-28
---

# FEAT-0197 — Extract entitlement state and the settings load/persist path out of `settings.svelte.ts`

Sub-item 5 of 5 under [`FEAT-0190`](FEAT-0190-epic-split-god-functions.md).
Read that item's "Rules that apply to every sub-item" first.

> **Manual only — never dispatch to an agent.** Filed as `area: security` and
> `data_class: A` deliberately, which puts it outside
> `scripts/jules/dispatch-backlog.mjs`'s allowed set. See "Why this stays
> manual".

## Problem

`src/stores/settings.svelte.ts` is 1807 lines, and `SettingsManager.load()`
alone is **382 lines** — the second-largest method in the codebase. It has a
single test file (`settings.security.test.ts`), which covers the security
surface but not the load/merge/migrate path.

`load()` does four things at once:

1. Deep-merges persisted settings over `defaultSettings`, per exchange
   (`apiKeys.bitunix`, `apiKeys.bitget`).
2. Runs localStorage-keyed one-shot migrations
   (`cachy_v0.94_broker_migrated_v2`).
3. Drives **async decryption of stored exchange API keys and secrets** —
   `encryptedApiKeys`, `encryptedSecrets`, and the `secretsReady` /
   `secretsPending` promise handshake that every other path through `load()`
   has to resolve exactly once.
4. Assigns roughly a hundred fields onto reactive `$state`.

Separately, edition/entitlement state (`isPro`, `isProLicenseActive`) is mixed
into the same store and read directly by the capability map
(`tradeExecution`, `livePositions`, `liveOrders`, `liveBalance`,
`pnlSettings`, `feeSettings`).
[`FEAT-0187`](FEAT-0187-edition-entitlement-switch.md) needs that state to
live on its own.

### Why this stays manual

Three reasons, each sufficient on its own:

- **Klasse-A data plus credentials.** Per CLAUDE.md, settings and API
  keys/secrets never leave the device; `load()` is the code that decrypts them.
  `scripts/jules/dispatch-backlog.mjs` keeps `area: security` out of unattended
  dispatch for exactly this shape of code.
- **The failure mode is silent and already precedented.** BUG-0182's review
  found this same pattern in `trade.svelte.ts:load()`: a narrowed parse that
  fell through to `resetToDefaults()` and discarded the user's notes, tags and
  targets — with CI green and the only diagnostic behind
  `import.meta.env.DEV`. `settings.load()` is the larger, more entangled
  version of that function, and it holds credentials as well as preferences.
- **`secretsReady` is a correctness invariant a refactor can quietly break.**
  Every branch through `load()` must resolve it exactly once. Split it wrong
  and the app either hangs waiting for secrets or races ahead without them —
  neither surfaces as a failing assertion today.

## Proposal

**Three PRs, in this order.**

**PR 1 — characterisation tests.** No production code changes. Cover:

- legacy-shape tolerance: settings written by older versions still load
  without falling back to defaults (the `trade.svelte.ts` regression, ported)
- the `cachy_v0.94_broker_migrated_v2` migration: runs once, is idempotent
- `secretsReady` resolves exactly once on every path — no stored secrets,
  encrypted secrets present, decryption failure
- decryption failure does not clear or overwrite the stored ciphertext

**PR 2 — extract the entitlement store.** `isPro` / `isProLicenseActive` and
the capability map move into their own store; `settings.svelte.ts` consumers
reach it through **one** accessor. This is the piece
[`FEAT-0187`](FEAT-0187-edition-entitlement-switch.md) builds on, and the
ADR-0003 boundary the parent epic is really about.

**PR 3 — split `load()`/`save()`.** Suggested shape:

- `src/stores/settings/migrations.ts` — versioned one-shot migrations
- `src/stores/settings/secretsLoader.ts` — encrypted key/secret handling and
  the `secretsReady` handshake, as one unit with one owner
- `settings.svelte.ts` — `$state` surface, merge, assignment

Behaviour-preserving in PRs 2 and 3. `refactor:` commits only there.

## Acceptance criteria

- [ ] Characterisation tests for legacy-shape loading, migration idempotence
      and `secretsReady` resolution exist and were merged **before** any
      production code moved
- [ ] Entitlement state (`isPro`, `isProLicenseActive`) and the capability map
      live in their own store, reached through one accessor
- [ ] `load()` is under 150 lines
- [ ] No method in `settings.svelte.ts` exceeds 200 lines
- [ ] `secretsReady` provably resolves exactly once on every path, covered by test
- [ ] No settings shape written by a previous release fails to load
- [ ] `settings.security.test.ts` passes **without being modified**
- [ ] `npm run check` passes with 0 errors
- [ ] `npm test` passes
- [ ] No Klasse-A field changes storage location or encryption state; if one
      must, it is a `BREAKING CHANGE:` and is listed here

## Out of scope

- The entitlement *mechanism* — licence validation, gating behaviour, edition
  switching ([`FEAT-0187`](FEAT-0187-edition-entitlement-switch.md)). This
  item moves existing state, it does not change what it means.
- Any change to the encryption scheme or `cryptoService`.
- Touching any of the other four modules in [`FEAT-0190`](FEAT-0190-epic-split-god-functions.md).

## Links

- [`FEAT-0190`](FEAT-0190-epic-split-god-functions.md) — parent epic and shared rules
- [`FEAT-0187`](FEAT-0187-edition-entitlement-switch.md) — consumes the extracted entitlement store
- [`docs/adr/0001-local-first-boundary.md`](../../adr/0001-local-first-boundary.md) — Klasse A
- [`docs/adr/0003-edition-boundary.md`](../../adr/0003-edition-boundary.md)
- `src/stores/trade.svelte.ts` — the `load()` regression this item must not repeat
