---
id: FEAT-0229
title: Refuse an order verb the venue cannot do before it leaves the client
type: feature
status: done
branch: feat-0229-refuse-unsupported-verbs
priority: P1
milestone: M2
editions: [community, pro, private]
area: exchange
data_class: none
adr: ADR-0007
depends_on: [FEAT-0016]
estimate: 2
size: S
target_date: 2026-11-19
---

# FEAT-0229 — Refuse an order verb the venue cannot do before it leaves the client

## Problem

A trading verb the active exchange has no verified format for still travels.
On Bitget, `cancelTpSlOrder` and `modifyTpSlOrder` are built, signed and sent,
and `routes/api/tpsl/+server.ts:58` refuses them at the far end. The user's
stop is not moved, and what they see is whatever the generic API-error path
renders.

The industry rule is the opposite one — *pre-trade control*: what the venue
will certainly reject does not leave the system. MiFID II's RTS 6 requires
exactly this of algorithmic trading firms, and venues enforce it commercially
through order-to-trade and message-efficiency ratios. Sending a request whose
rejection is already known is not neutral; it is a defect.

Cachy has three lines of defence available and currently only the outermost:

| Line | Where | State |
|---|---|---|
| The control is not offered | [`FEAT-0017`](FEAT-0017-exchange-capability-model.md) | not built |
| The adapter refuses locally | `services/exchange/` | **missing — this item** |
| The venue refuses | `routes/api/tpsl/+server.ts:58` | works |

The middle line is the one that still holds when the first is bypassed: a
panel left open across an exchange switch, a keyboard shortcut, a stale
capability read. [`FEAT-0016`](FEAT-0016-exchange-adapter-interface.md) built
the declaration it needs (`ExchangeAdapter.supports`) but deliberately did not
act on it, because acting on it is a user-visible change — see
[`ADR-0007`](../../adr/0007-exchange-adapter-boundary.md), last alternative.

## Proposal

The adapter refuses a verb its `supports` declaration marks absent, before any
request is built, and it treats reading and writing differently:

- **Reading** (`fetchTpSlOrders`) resolves empty. "There are no plans here" is
  a true answer and carries no risk.
- **Writing** (`cancelTpSlOrder`, `modifyTpSlOrder`, and any later verb behind
  a `supports` flag) throws `ExchangeUnsupportedError` carrying an i18n key
  naming the venue and the verb. A write must never resolve quietly — a stop
  that was silently not moved is the worst outcome in this file.

New strings go into `src/locales/` in German and English.

## Acceptance criteria

- [x] With `supports.tpSl === false`, no write verb reaches `tradeService` —
      proven by a test asserting the transport was never called
      → `unsupportedVerbs.test.ts` asserts the *absence* of the call, not just
      the presence of an error. The error is the symptom; the unsent request is
      the point.
- [x] A read verb on the same venue resolves empty and raises no error
      → `fetchTpSlOrders` resolves `[]`; `fetchLeverageMarginMode` and
      `fetchTradingPairInfo` resolve locally instead of sending a request that
      `tradeService` would drop or a Bitunix-only route would reject. Nothing
      was ever written by those on Bitget, so nothing observable changes.
- [x] `ExchangeUnsupportedError` renders through the existing toast path with a
      message naming the exchange and what it cannot do, in both locales
      → `TpSlList.refusal.component.test.ts` mounts the component, clicks
      cancel, and asserts the toast carries the real English sentence with
      `Bitget` in it — not the i18n key, and not the generic "cancel failed".
      The real adapter, the real error and the real `getDisplayMessage` are in
      the path; only the transport, the settings store, the socket and
      `confirm()` are replaced. Verified by mutation: with `SUPPORTS.tpSl`
      flipped to `true`, two of its three tests fail.
- [x] Bitunix behaviour is byte-identical — the guard is reachable only through
      a false `supports` flag
      → asserted verb by verb: every TP/SL and account call still reaches
      `tradeService` exactly once on Bitunix.
- [x] The refusal is independent of the UI: it holds when the verb is invoked
      directly, not only when a hidden control would have prevented it
      → the tests call the adapter directly, and through `activeExchange()`.

## What was built

- `src/services/exchange/errors.ts` — `ExchangeUnsupportedError` carrying the
  venue, the missing feature and an i18n key. Free of runtime imports on
  purpose: `errorUtils` translates it and is itself imported by `apiService`,
  which the adapters import.
- `bitgetAdapter.ts` — one `SUPPORTS` constant that the guards read, so the
  declaration and the behaviour cannot drift. Reads resolve, writes `refuse()`.
- `errorUtils.getDisplayMessage` translates the error, as it already did for
  `OrderRefusedError`.
- `exchange.unsupported.*` in `de.json` and `en.json`, types regenerated.
- `TpSlList` shows the refusal instead of collapsing it into "cancel failed".
- A `components` Vitest project (`vite.config.ts`) for tests that mount a
  component. It exists because `mount()` needs `svelte` resolved to its
  browser build, and setting that condition globally is *not* free: it also
  flips `$app/environment`'s `browser` to true, which sent `technicalsService`
  down its Worker path and broke two previously passing tests. The condition
  is therefore scoped to `src/**/*.component.test.ts`. `npm test` runs both
  projects, so nothing needs a new CI step.

One existing test changed: `exchangeAdapter.test.ts` asserted that TP/SL
delegated on *both* venues, which was FEAT-0016's deliberate pass-through.
That is exactly the behaviour this item removes, so the test now asserts the
new contract and names what it used to assert.

That test only caught the drift because this item happened to touch the same
verb. `unsupportedVerbs.test.ts` closes that gap with an invariant instead of
a case list: every verb of every adapter is classified against its own
`supports` declaration — supported verbs must reach the transport, unsupported
writes must throw, unsupported reads must resolve empty and reach nothing —
and the table has to name every verb the port exposes, so a verb added later
fails the test until someone decides what it does on a venue that cannot
perform it. It is the shape `FEAT-0018` grows into.

## Verification

- `npm run check` — 2005 files, 0 errors, 0 warnings
- `npm test` — 222 test files passed, 1 skipped; 1622 tests passed, 6 skipped,
  0 failures, across both projects
- `scripts/check_translations.sh` — 0 missing, 0 empty, 0 one-sided keys
- New: `unsupportedVerbs.test.ts` (35 tests, including the port-contract
  invariant), `TpSlList.refusal.component.test.ts` (3 tests)
- Mutation-checked rather than assumed: flipping `SUPPORTS.tpSl` to `true`
  fails 6 tests in `unsupportedVerbs.test.ts` and 2 in the component test;
  adding an unclassified verb to both adapters fails the contract test.

## Out of scope

Hiding the controls. That is [`FEAT-0017`](FEAT-0017-exchange-capability-model.md),
the first line of defence; this item is the second and must work without it.

## Links

- [`ADR-0007`](../../adr/0007-exchange-adapter-boundary.md) — why FEAT-0016 declared the gap without acting on it
- `src/services/exchange/bitgetAdapter.ts` — the seam is marked in the file
