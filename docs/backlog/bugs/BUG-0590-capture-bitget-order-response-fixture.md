---
id: BUG-0590
title: Capture a real Bitget order response and settle which field carries the traded amount
type: bug
status: ready
priority: P1
milestone: none
editions: [community, pro, private]
area: exchange
data_class: none
adr: none
depends_on: []
assignee: opencode
branch: audit/last-2-days-review
---

# BUG-0590 — Capture a Bitget order response and name the traded-amount field

## Symptom

Nothing is broken in the app. This is the missing evidence that BUG-0589's fix
depends on, filed separately so the research can start without a decision.

Cachy maps Bitget's traded amount from `filledQty` in two REST paths
(`src/utils/server/venues/bitget.ts:131` and `:171`). The string `filledQty`
appears **nowhere** in `docs/bitget-api/`; the mirror documents `baseVolume` as
"Amount of coins traded" (`:479`, and again at `:572`, `:630`, `:685`).

So one of three things is true, and the repo cannot currently distinguish them:

1. the current endpoints send `baseVolume` and `filled` is always `"0"`
2. the endpoints send `filledQty` and the mirror documents a different
   generation of the API than the one being called
3. both fields exist and mean different things — total traded vs. something else

## Why it is its own item

BUG-0589 cannot be fixed by renaming, because the correct name is exactly what
is unknown. Renaming `filledQty` to `baseVolume` on the strength of the docs
would replace a silent zero with a second silent zero, and would look like a
fix. The capture has to come first.

## Fix

1. Capture one real response from each endpoint in play — pending orders and
   order history — for a symbol, ideally with a partially filled order so the
   field is non-zero. Store them as fixtures under the existing
   `src/services/exchange/fixtures/` convention (see how
   `adapterConformance.test.ts` calls `loadFixture`).
2. Read the traded-amount field off the captured bytes. Do not consult the docs
   to decide what to look for; note what is actually present.
3. Record which of the three cases above it is, and whether the pending and
   history endpoints agree with each other.
4. Update BUG-0580 with the V1/V2 split, since this settles part of it.

Credentials are needed for the capture. Everything downstream — the fixture
commit, the field mapping, the regression test — is then possible without
asking anyone anything.

## Acceptance criteria

- [ ] A captured pending-orders response and a captured order-history response
      are committed as fixtures, with any secrets stripped
- [ ] The traded-amount field is named from the captured bytes, and the item
      records which of the three cases it is
- [ ] It is stated explicitly whether the two endpoints use the same field name
- [ ] BUG-0580 is updated with the V1/V2 finding, or the two are linked with
      this item as the concrete instance
- [ ] If the capture cannot be obtained, the item says so and records what was
      tried, rather than the conclusion being guessed

## Out of scope

- Changing `src/utils/server/venues/bitget.ts`. This item produces evidence;
  BUG-0589 acts on it
- Any UI change. The visible symptom of a zero `filled` is BUG-0589's blast
  radius, not this item's
- Verifying the Bitunix side, which is already documented and consistent
- Re-verifying `amount`/`size` as the order total. That is BUG-0588's premise
  and only the `filled` half is in doubt

## Links

- BUG-0589 — the defect this unblocks; `area: exchange`, so it is never
  auto-dispatched and needs a human handoff even once the evidence exists
- BUG-0580 — the umbrella "Bitget wire format unverified" flag this partially
  discharges
- BUG-0581 — sibling entry-exchange wire-format finding
- `src/utils/server/venues/bitget.ts:51` — `filledQty?:` declared optional,
  with the comment conceding it is "whatever field either endpoint's raw order
  carries" rather than a verified shape
- `docs/bitget-api/04_trade.md:479` — `baseVolume`, the field the mirror does
  document
