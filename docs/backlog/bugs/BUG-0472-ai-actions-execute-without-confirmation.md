---
id: BUG-0472
title: AI trade-setup actions execute immediately unless the user opted into confirmation
type: bug
status: done
priority: P1
milestone: none
editions: [community, pro, private]
area: security
data_class: A
adr: none
depends_on: []
size: S
---

# BUG-0472 — AI trade-setup actions execute immediately unless the user opted into confirmation

## Symptom

A model-suggested `setLeverage`, `setRisk`, `setAccountSize` or `resetSetup`
is applied to the live trading interface with no user approval, as long as the
user never enabled "confirm AI actions". Only a mathematically poor R:R forces
confirmation. A jailbroken or prompt-injected model can therefore silently
rewrite the user's risk posture.

## Evidence

**Derived** from reading the code (not observed live in the app).

- `src/stores/ai.svelte.ts:635`: `const confirmActions = (settings.aiConfirmActions ?? false) || forceConfirm;`
- `src/stores/ai.svelte.ts:649-661`: the `else` branch executes every parsed
  action immediately via `executeAction`.
- `src/stores/settings.svelte.ts:649`: `aiConfirmActions: false` by default.
- The only built-in override is the low-R:R guard at
  `src/stores/ai.svelte.ts:598-622`.

## Cause

The confirmation gate is opt-in instead of opt-out for risk-posture
mutations. The batch path treats "user said nothing" the same as "user
approved", so model output gains write access to entry, SL, leverage, risk %,
account size, symbol and full setup reset without a human in the loop.

## Fix

The confirmation gate is replaced by a curated permission policy, so the user
decides *which* trade changes the assistant may request and anything that
touches the trade always asks first.

- New pure module `src/lib/ai/actionPolicy.ts` holds the single source of
  truth: a curated `AI_ACTION_CATALOG` (grouped `setup` / `risk` / `notes`),
  the default permission set, `filterPermittedActions()`,
  `requiresConfirmation()`, `shouldForceConfirm()` and a boundary
  `sanitizeAllowedActions()`.
- `src/stores/ai.svelte.ts` filters every parsed batch through the policy
  before the confirm/execute decision. Unknown actions (anything the catalog
  never offered, e.g. `setSymbol`, `resetSetup`, `setAccountSize`) and actions
  the user switched off are dropped with a `logger.warn` and one system
  notice; a permitted batch that contains any non-benign action forces
  confirmation exactly like the low-R:R guard already does.
- `src/stores/settings.svelte.ts` gains `aiAllowedActions: string[]` at the
  five existing touchpoints (type, default, `$state`, `applyCoreFields`
  through `sanitizeAllowedActions`, `toJSON`). Default: every `setup` and
  `notes` action allowed, the `risk` group off.
- `src/components/settings/tabs/AiTab.svelte` gets a grouped checkbox
  dropdown so the user can switch each action on or off; the confirm toggle
  copy is corrected and the relay span now also states the on-state transit.
- Add one UI sentence where Server-Relay is offered stating that relayed
  prompts and context travel via Cachy infrastructure (same area, same PR).

Leave alone: the low-R:R guard, the schema enum in
`src/lib/ai/prompts/actionSchema.ts` (wire contract — see Out of scope),
order placement (there is none — actions only touch interface state).

## Acceptance criteria

- [x] A test reproduces the defect (a `setLeverage` batch applied to
      `tradeState` without `confirmAction`) and fails without the fix
- [x] With the fix, every batch containing a non-benign action lands in
      `pendingActions` when the toggle is off, and applies after `confirmAction`
- [x] Benign-only batches still follow the `aiConfirmActions` toggle
- [x] Actions outside the curated catalog (`setSymbol`, `resetSetup`,
      `setAccountSize`, `setAtrMode`, `setAtrTimeframe`, `setAnalysisTimeframe`,
      `setAutoPrice`) never reach `executeAction`
- [x] An action switched off in the permission dropdown never reaches
      `executeAction`
- [x] `aiAllowedActions` survives a settings round-trip and rejects unknown
      ids from storage
- [x] The relay copy string exists in DE and EN (`schema.d.ts` regenerated)

## Out of scope

- Removing actions from the schema enum or changing what values they accept
  (see BUG-0474); this item only curates what the app is willing to execute.
- Changing the order-placement flow (actions never place orders)
- Flipping the global `aiConfirmActions` default for benign actions

## What shipped

- Curated permission policy in `src/lib/ai/actionPolicy.ts`: 12 executable
  actions, the other schema names refused, and unconditional confirmation for
  every non-benign action.
- `aiAllowedActions` setting plus the grouped Agent-permissions dropdown in
  Settings → AI.
- Relay copy now states the on-state transit (prompts and shared context via
  Cachy infrastructure).

Lands via the PR that closes #3316 (squash-merge into `develop`); the release
version is set at merge time.

## Links

- `src/lib/ai/actionPolicy.ts` (new: catalog, permission set, filter)
- `src/stores/ai.svelte.ts` (`sendMessage` action handling, `executeAction`)
- `src/stores/settings.svelte.ts` (`aiConfirmActions`, `aiAllowedActions`)
- `docs/adr/0011-*` (trade-context consent; the same consent spirit applies)
- `docs/adr/0019-*` (server relay is the sanctioned opt-in exception)
- GitHub Issue: #3316
