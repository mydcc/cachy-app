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
assignee: unassigned
---

# BUG-0590 — Capture a Bitget order response and name the traded-amount field

## Partial resolution (2026-10-03, UTA half only)

The capture ran against a UTA account. Two of the three cases in the Symptom
below are settled for `/api/v3/*`; the Classic half is untouched, because a UTA
account is refused by every `/api/v2/*` path with `40085` before the signature is
even checked.

**`filledQty` exists in no generation.** It is not that the endpoints send a
differently-named field — the name was never real. UTA splits the quantity three
ways, **documented** in the vendor's samples (see "Capture attempt" for why this
is documentation, not an observation):

| Meaning | Field | Endpoint |
|---|---|---|
| Ordered size | `qty` | `/api/v3/trade/unfilled-orders` |
| Cumulative filled size | `cumExecQty` | `/api/v3/trade/unfilled-orders` |
| One execution | `execQty` | `/api/v3/trade/fills` |

So this is **case 1**, not case 2 or 3: `filledQty` appears on neither endpoint,
in no generation. The phrase "and `filled` is always `0`", which stood here
before, described the pre-BUG-0596 readers; both now map `cumExecQty`.

**The pending and history order endpoints answer in the same envelope.** Both
return `{"code":"00000","data":{"list":…,"cursor":…}}` — an object with a `list`
and a cursor, not the bare array the pre-BUG-0596 parsers expected. That settles
the envelope; whether a *populated* entry carries the same field names on both
endpoints is not observed (see "Open points"). One difference is real though:
`unfilled-orders` returns `"list":[]` for an empty result and `fills` returns
`"list":null`, so a parser needs a null guard on one path and not the other.

**Not captured:** a *filled* order. Nothing was placed, so the semantics of
`cumExecQty` under a partial fill rest on the documented sample, not an
observation. Observed 2026-10-04: there are no demo API keys — a fill capture
comes from the trader's live account during normal trading and is recorded here;
agents never hold keys and never place orders.

Acceptance criteria below stand for the Classic half. Full evidence:
`docs/bitget-api/14_uta_v3.md`.

## Capture attempt (2026-10-28) — what exists, and what still does not

**Searched, not assumed.** A populated Bitget order has still never been
observed. Before writing this section, the checkout, every linked worktree, all
untracked files, the commit history of this item and of `14_uta_v3.md`, and the
recorded past agent sessions were searched for `cumExecQty` and for a captured
order response. Nothing was found. No demo API keys exist (2026-10-04, above);
agents hold no keys and place no orders, so no agent-side probe can produce a
fill.

**Committed as evidence:** the two responses that *were* captured — one with no
orders from `/api/v3/trade/unfilled-orders` (2026-10-03) and one from
`/api/v3/trade/history-orders` (2026-10-04) — now live as pretty-printed
fixtures under `src/services/exchange/__fixtures__/bitget/rest/` (provenance in
the README there) and are loaded by `bitgetUtaReads.test.ts` instead of being
inlined. Both are re-serialised from the response bodies; whitespace is not the
wire's.

**What the captures do not prove.** They contain **no order entries**, so they
prove the envelope (`data: {list, cursor}`, `list: []` on both) and nothing
about a populated entry. The partial resolution above was corrected in place:
the quantity field names are **documented**, not observed, and `cumExecQty`'s
partial-fill semantics remain unverified. `docs/bitget-api/14_uta_v3.md`
separates *captured* from *documented* the same way.

**Still missing, and why this stays open:** one response from a populated —
ideally partially filled — order on `unfilled-orders`, and one on
`history-orders`, from the trader's live account during normal trading, with
`orderId`, balances and any key material removed. That is the only step an agent
cannot perform here.

**2026-10-28, confirmed by the account holder:** they cannot place orders at
present, so no populated response can be produced on demand. The fixtures and
the captured-vs-documented correction are in review as PR #4384; the item itself
stays open by design, not by neglect, and closes when trading resumes and one
capture per endpoint exists.

### Open points — none of these is inferred

1. **Populated `unfilled-orders` entry.** Which field names an order actually
   carries (`qty`, `cumExecQty`, `cumExecValue`, `avgPrice`, `orderStatus` are
   documented, not observed), and whether `filledQty` appears at all.
2. **Populated `history-orders` entry.** Whether it answers with the same order
   object and the same cumulative-fill field. Only the empty envelope is proven.
3. **`cumExecQty` under a partial fill.** The documented name says "cumulative
   executed quantity"; no partially filled order has ever been seen, so the
   semantics under a partial fill are unverified.
4. **Classic `/api/v2/*`.** Dropped by ADR-0023, not pending: a UTA account is
   refused with `40085`, so the V1/V2 question is out of scope rather than
   blocked.

## Symptom

Nothing is broken in the app. This is the missing evidence that BUG-0589's fix
depends on, filed separately so the research can start without a decision.

Cachy mapped Bitget's traded amount from `filledQty` in two REST paths
(`src/utils/server/venues/bitget.ts`, then `:131` and `:171`). The string
`filledQty` appears **nowhere** in `docs/bitget-api/`; the mirror documents
`baseVolume` as "Amount of coins traded" (`:479`, and again at `:572`, `:630`,
`:685`).

> As filed, before BUG-0596. Both readers now map `cumExecQty`
> (`bitget.ts:259`, `:303`); what the Symptom still describes correctly is the
> missing evidence, not the current code. See "Open points" for what remains.

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
   field is non-zero. Store them under
   `src/services/exchange/__fixtures__/bitget/rest/` (the `__fixtures__`
   convention `adapterConformance.test.ts` uses, `loadFixture` at `:67`).
2. Read the traded-amount field off the captured bytes. Do not consult the docs
   to decide what to look for; note what is actually present.
3. Record which of the three cases above it is, and whether the pending and
   history endpoints agree with each other.
4. Update BUG-0580 with the V1/V2 split, since this settles part of it.

The capture is observed trader-side and handed over as bytes (secrets
stripped); the agent commits only the fixture. Everything downstream — the
fixture commit, the field mapping, the regression test — needs no keys.

## Acceptance criteria

- [x] A captured pending-orders response and a captured order-history response
      are committed as fixtures, with any secrets stripped — both are captures
      with no order in the queried window, see "Capture attempt"; they prove the
      envelope, not a populated entry
- [ ] The traded-amount field is named from the captured bytes, and the item
      records which of the three cases it is — **not met**: the captures carry
      no order entry. Case 1 is recorded from the absence of `filledQty` in
      every generation and from the documented UTA schema, not from bytes
- [ ] It is stated explicitly whether the two endpoints use the same field name
      — **not met for populated responses**; only the envelope is proven equal
- [x] BUG-0580 is updated with the V1/V2 finding, or the two are linked with
      this item as the concrete instance — a backlink now sits in BUG-0580's
      Links, and BUG-0580 carries the V3 signing result (`done`)
- [x] If the capture cannot be obtained, the item says so and records what was
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
- `src/utils/server/venues/bitget.ts:45` — the comment recording that
  `filledQty` appears in no generation; `BitgetRawOrder` declares `cumExecQty`,
  not `filledQty`
- `src/services/mappers.ts:153` — the remaining `filledQty` fallback in the
  generic OMS mapper (`data.dealAmount || data.filledQty`), on an untyped
  payload; not one of the two REST paths this item is about
- `docs/bitget-api/04_trade.md:479` — `baseVolume`, the field the mirror does
  document
