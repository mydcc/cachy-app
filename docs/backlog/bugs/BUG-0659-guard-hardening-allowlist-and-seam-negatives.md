---
id: BUG-0659
title: Textual guards accept reworded bypasses; or-mode aliasing has no owner
type: bug
status: in-progress
priority: P2
milestone: none
editions: [community, pro, private]
area: security
data_class: A
adr: none
depends_on: []
assignee: opencode
---

# BUG-0659 — Textual guards accept reworded bypasses; or-mode aliasing has no owner

Follow-up to the FEAT-0342 review swarm (M2, M3, M4) plus the two review-1
nits. No live hole in any of the three — all three are missing guardrails,
plus two cosmetic corrections.

## Symptom

1. A future order-like write through the `exchangeSignedFetch` envelope
   (`accountSettings.ts`) passes CI silently: `MUTATING_ACTIONS` in
   `order_gate_bypass.test.ts` knows no account-settings types, so the
   scanner — which does see the primitive — has nothing to match. (The three
   current call sites are correctly ungated: no orders, documented in the
   module. The scanner just does not know that.)
2. The paper-seam backstop counts spellings, not branches:
   `paperTrading_seam.test.ts:198-250` matches `if (paperState.enabled)` /
   `if (ports.isPaperMode())` literally. A ternary, a cached boolean, or a
   `handle` longer than 220 chars keeps the identical branching with a
   passing count.
3. The `or` load mode (`stored || defaults[key]`,
   `persistenceSchema.ts:527`) hands six keys (`logSettings`, `rssPresets`,
   `customRssFeeds`, `discordChannels`, …) the live default object on a
   storage miss. Documented 1:1 legacy, but no test or item records which
   keys may alias — the next "fix" can silently diverge save from load.
4. Cosmetic: the FEAT-0342 problem statement still cites the stale sizes
   (1700/1930/2130/1200 vs measured 3102/2166/1247), and the
   `TRANSPORT_OWNER` fragility ("pairing holds only while transport and
   check share one file") lives in the backlog item, not at the code.

## Evidence

**Derived**, verified against `develop` (`8af24c67b`):

- *M2.* `DISPATCH_PRIMITIVES` already lists `exchangeSignedFetch`/`appFetch`,
  and the three `accountSettings.ts` call sites (`:237,294,356`) carry no
  `MUTATING_ACTIONS` string in their 30-line window — the scan is quiet for
  the right reason today, and would be quiet for the wrong reason tomorrow.
- *M3.* Exact-match counts (`toHaveLength(9)`, `(2)`, `(3)`) plus the
  `{0,220}` window in the seam test: rewordings with identical semantics
  evade them by construction.
- *M4.* `loadPlainValue` `:527`; the `LoadMode` doc comment (`:60-68`)
  enumerates the aliasing keys itself, and `customHotkeys` needed the
  fresh-literal exception (`:418`) — the hazard is real, the ownership is
  missing.
- *Nits.* FEAT-0342 item line 17 vs the status notes; `TRANSPORT_OWNER`
  (`order_gate_bypass.test.ts:47`) with no move-with-me comment.

## Cause

Textual guards pin the current spelling. The aliasing is transcribed legacy
without an owner.

## Fix

- M2: extend the gate scan with an account-settings allowlist (types plus
  the no-pass rationale), or a companion test pinning the allowed
  `/api/account-settings` types.
- M3: negative controls in the mutation suite (ternary + alias-boolean at
  minimum), or widen the matcher to `isPaperMode()` / `paperState.enabled`
  in if/ternary position.
- M4: contract test enumerating the `or` keys (which may alias, and why) —
  pinning the *inventory*, not changing load semantics. No `freeze`, no
  clone here: behaviour change rides separately.
- Nits: correct the FEAT-0342 problem numbers (or mark them "at spec
  time"); one-line move-with-me comment at `TRANSPORT_OWNER`.
- L2/L3/L4 (seam `toJSON` facade allocation, loader-closure dedup,
  favorites-cap/legacy-keys round-trip): explicitly deferred, no code —
  recorded here so the deferral is a decision, not an oversight.

## Acceptance criteria

- [ ] A synthetic order-like write via `exchangeSignedFetch` without a pass fails the gate scan; the three real account-settings call sites stay green
- [ ] A ternary-form and an alias-boolean-form paper branch are flagged by the seam suite
- [ ] A contract test enumerates every `or`-mode key; adding an `or` key without documenting its aliasing fails
- [ ] FEAT-0342 numbers corrected; `TRANSPORT_OWNER` carries the move-with-me comment
- [ ] Gate, seam, and settings suites stay green

## Links

- FEAT-0342 (M2/M3/M4 in the review swarm; problem-statement numbers)
- `src/tests/architecture/order_gate_bypass.test.ts`, `src/services/paperTrading_seam.test.ts`, `src/stores/settings/persistenceSchema.ts`
