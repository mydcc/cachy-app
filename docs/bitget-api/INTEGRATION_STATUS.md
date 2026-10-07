# Bitget API — integration status in Cachy

Reconciled on: **2026-09-28**. Vendor surface crawled 2026-09-28. Symbol-key
state refreshed **2026-10-03** after BUG-0599 — see
[Symbol keys](#symbol-keys-one-canonical-pair) below.

Purpose: state, per capability, whether **Bitget supports it natively** and
whether **Cachy uses it** — and where the code that decides lives. This is not
a plan document. Anything that is out of scope is marked out of scope, not
queued.

**Status of the reconciliation as a whole: Cachy speaks a dead API generation.**
The public market rows are V2 as of BUG-0576; the account, position, trade and
WebSocket rows still point at `/api/mix/v1/…` paths that answer `30032`. Read
`09_v1_vs_v2.md` before trusting any row marked ☠️, and read the umbrella item
BUG-0576 for the order the remaining rows are migrated in.

**Legend**

| | |
|---|---|
| ✅ | integrated, and the call path is live |
| 🟡 | partially integrated, or integrated with a known limitation |
| ❌ | not integrated |
| ☠️ | wired in Cachy, but calling a **decommissioned** Bitget V1 endpoint |
| ⏳ | wired to UTA V3, but **not yet verified live** — needs a trader account |

☠️ is a distinct status from ❌ on purpose. ❌ means nothing is sent. ☠️ means
code exists, is exercised by the test suite, and would work against a live V1
API — it fails at the venue instead of at the boundary. Nothing in Cachy
detects the difference, because the boundary never sees a request.

⏳ is the status the UTA recon (BUG-0597 Phase A–F, verified against live
envelopes 2026-10-03 in `14_uta_v3.md`) leaves behind: the path, body and
parser are written against observed shapes and covered by tests, but no live
order, close or verification has run through them. Claiming ✅ would assert a
live call nobody made; keeping ☠️ would assert a dead endpoint nothing calls
anymore — the V1 paths are gone from the path table, so ☠️ currently describes
nothing. When the trader verification lands (IDEA-0620), ⏳ rows become ✅.

## Symbol keys: one canonical pair

Since BUG-0599 every normalized Bitget symbol is the bare pair V2 addresses —
`BTCUSDT`, never `BTCUSDT_UMCBL`. `normalizeSymbol` strips the V1 suffix rather
than appending it and no longer branches on the venue, so **one key per contract
serves as both the store key and the wire symbol**. That is the state every row
below assumes; the rows themselves are about endpoint generation, not symbols.

Two consequences worth knowing before touching a call site:

- `stripLegacyVenueSuffix` is the narrow helper for the two places that still
  need the old spelling removed: the wire boundary
  (`venues/bitget.ts`, `bitgetWs.ts`) and the reads of records persisted before
  the change. `formatSymbolForDisplay` keeps its own strip for a different
  reason — journal entries, presets and watchlists are the user's history and
  must keep rendering.
- **Three stores persisted under the old key** and converge it away on read:
  chart drawings (`drawings.svelte.ts`), favourite symbols
  (`favorites.svelte.ts`) and alert rules (`alertEngine/ruleLoopWiring.ts`).
  All three are Class A records, so they are read forward rather than dropped.
  A new symbol-keyed store must either strip on read or never have written the
  suffix — matching a persisted record by strict equality is what made the three
  above unreachable for one release.

## Architecture in brief

Three files touch the network for Bitget:

| File | Role |
|---|---|
| `src/utils/server/venues/bitget.ts` | All signed REST plus candles and tickers |
| `src/routes/api/bitget/contracts/+server.ts` | The public V2 contracts proxy — the only V2 call |
| `src/services/bitgetWs.ts` | WebSocket, single socket for public and private |

Signing happens in the browser, not on the server
(`src/utils/crypto/exchangeSigning.ts:242`); the proxy forwards an
already-signed request and rebuilds the identical bytes to compare. See
[`adr/0013-client-side-exchange-signing.md`](../adr/0013-client-side-exchange-signing.md).

`ACCESS-PASSPHRASE` is the one credential that does reach the proxy, because
Bitget requires it on the wire and the signature scheme gives no way to derive
it.

---

## 1. REST endpoints

### Market (`03_market.md`) — public, no API key

| Endpoint | Status | Code / Note |
|---|---|---|
| `GET …/market/contracts` | ✅ | `src/routes/api/bitget/contracts/+server.ts:42` — the one V2 call, 60 s cache |
| `GET …/market/ticker` | ✅ | [[`src/utils/server/venues/bitget.ts:317`](../../src/utils/server/venues/bitget.ts) — V2 as of BUG-0576. `productType` is **required** even here (`400172` without it); bare symbol, `40034` on `_UMCBL` |
| `GET …/market/tickers` | ✅ | [[`src/utils/server/venues/bitget.ts:318`](../../src/utils/server/venues/bitget.ts) — V2 as of BUG-0576. Same field set as the single-symbol form, verified across all 812 contracts |
| `GET …/market/candles` | ✅ | [[`src/utils/server/venues/bitget.ts:316`](../../src/utils/server/venues/bitget.ts) — V2 as of BUG-0576, and the only source of every kline. Array-of-arrays unchanged from V1; `limit` is now actually sent (it used to arrive as a parameter and be dropped) |
| `GET …/market/merge-depth` | ❌ | Not called. `books5` covers the UI's needs |
| `GET …/market/candles` with `kLineType: mark` | ❌ | Declared `supportsMarkKlines: false` at [[`src/utils/server/venues/bitget.ts:570`](../../src/utils/server/venues/bitget.ts) — a mark request is **refused**, not answered with last-price candles. V2 serves it on the same path (`kLineType=mark` verified 2026-09-30), so this is now a one-line change rather than an unknown endpoint |
| `GET …/market/history-mark-candles` | ❌ | The dedicated mark-candle endpoint, unused |
| `GET …/market/symbol-price` | ❌ | Not called |
| All funding-rate endpoints | ❌ | Not called. Bitget-specific, not part of the shared calculator path |
| All open-interest endpoints | ❌ | Not called |
| All rate / discount / VIP-fee endpoints | ❌ | Not called |

### Account (`02_account.md`)

| Endpoint | Purpose | Status | Code |
|---|---|---|---|
| `GET …/account/account` | Account + balance | ⏳ | `/api/v3/account/assets` via `BITGET_UPSTREAM_PATHS` (`restSigningPlan.ts:288`) — called **twice** from two Cachy routes; envelope parsed from the live shape in `14_uta_v3.md` |
| `GET …/account/accounts` | Account list | ❌ | Single-account read is enough |
| `GET …/account/liq-price` | Estimated liquidation price | ❌ | Would answer liquidation questions without opening a position |
| `GET …/account/max-open` | Max openable quantity | ❌ | Not called |
| `POST …/account/set-leverage` | Set leverage | ❌ | Refused — see §3 |
| `POST …/account/set-all-leverage` | Product-line leverage | ❌ | Refused — see §3 |
| `POST …/account/set-margin` | Adjust position margin | ❌ | Refused — see §3 |
| `POST …/account/set-auto-margin` | Isolated auto-margin | ❌ | Refused — see §3 |
| `POST …/account/set-margin-mode` | Change margin mode | ❌ | Refused — see §3 |
| `POST …/account/set-position-mode` | Change position mode | ❌ | Refused — see §3 |
| `GET …/account/bill` | Account bills | ❌ | Not called |
| All union / asset-mode endpoints | Multi-asset | ❌ | UTA supersedes this model; see `00_common.md` |

### Position (`05_position.md`)

| Endpoint | Status | Code / Note |
|---|---|---|
| `GET …/position/all-position` | ⏳ | `/api/v3/position/current-position` via `BITGET_UPSTREAM_PATHS` — the position snapshot; the OMS is fed from this; raw fields read off the live UTA shape (`venues/bitget.ts:68`) |
| `GET …/position/single-position` | ❌ | The all-position read covers it |
| `GET …/position/history-position` | ❌ | Not called — see the `ctime`/`cTime` casing note in `05_position.md` |
| `GET …/position/adlRank` | ❌ | Not called. Note `adlRank` is deprecated in favour of `rank` |
| `GET …/market/query-position-lever` | ❌ | Leverage tiers not read |

### Trade (`04_trade.md`)

| Endpoint | Status | Code / Note |
|---|---|---|
| `POST …/order/place-order` | ⏳ | `/api/v3/trade/place-order` — serves **both** order placement and every close (body carries the intent); UTA body with refusal design (`bitgetBodies.ts`), covered by `bitgetUtaWrites.test.ts` |
| `GET …/order/orders-pending` | ⏳ | `/api/v3/trade/unfilled-orders` — re-filters `startTime`/`endTime` client-side because Bitget's own default is not the one Cachy signs |
| `GET …/order/orders-history` | ⏳ | `/api/v3/trade/history-orders` — re-filters `startTime`/`endTime` client-side because Bitget's own default is not the one Cachy signs |
| `POST …/order/cancel-order` | ⏳ | `/api/v3/trade/cancel-order` — a cancel can refuse or mis-target but never opens a position (Phase B) |
| `POST …/order/close-positions` | ❌ | **Not used** — see §3. Bitget's native flash close, 1 req/s |
| `POST …/order/cancel-all-orders` | ❌ | Refused at the signer; no path-table row |
| `POST …/order/batch-place-order` | ❌ | Refused |
| `POST …/order/batch-cancel-orders` | ❌ | Refused |
| `POST …/order/modify-order` | ❌ | Refused |
| `GET …/order/detail` | ❌ | Deliberately absent from the path table so a Bitget envelope is refused **before** a request exists |
| `GET …/order/fills` | ❌ | Not called |
| `GET …/order/fill-history` | ❌ | Not called. 1-week window only |

### Trigger / TP-SL (`06_tp_sl.md`)

| Endpoint | Status | Code / Note |
|---|---|---|
| `POST …/order/place-order` with `presetStop*` | ❌ | **Native attached TP/SL exists on the endpoint Cachy already calls** and is not used. Answers BUG-0503 |
| `POST …/order/place-plan-order` | ❌ | No Bitget plan-order endpoint exists in `src/` at all |
| `POST …/order/place-tpsl-order` | ❌ | Same |
| `POST …/order/place-pos-tpsl` | ❌ | Same |
| `POST …/order/modify-plan-order` | ❌ | Same |
| `POST …/order/modify-tpsl-order` | ❌ | Same |
| `POST …/order/cancel-plan-order` | ❌ | Same |
| `GET …/order/orders-plan-pending` | ❌ | Resolves to `[]` at [[`src/services/exchange/bitgetAdapter.ts:208`](../../src/services/exchange/bitgetAdapter.ts) |
| `GET …/order/orders-plan-history` | ❌ | Resolves to `[]` |
| `GET …/order/plan-sub-order` | ❌ | Resolves to `[]` |

TP/SL request fields are **refused**, not silently dropped:
`BITGET_UNSUPPORTED_PROTECTION_FIELDS` at
[`src/utils/exchange/bitgetBodies.ts:97`](../../src/utils/exchange/bitgetBodies.ts) rejects `triggerPrice`, `stopPrice`,
`tpPrice`, `slPrice` and their type/price companions.

---

## 2. WebSocket channels

| Channel | Type | Status | Note |
|---|---|---|---|
| `ticker` | public | ✅ | `bitgetWs.ts` — V2 public socket (`wss://ws.bitget.com/v2/ws/public`) |
| `candle1m`…`candle1W` | public | ✅ | V2 public socket; `kline_1m` → `candle1m` mapping |
| `books5` | public | ✅ | V2 public socket; depth, 5 levels |
| `books`, `books15` | public | ❌ | Handled in the dispatcher, not mapped to an adapter channel |
| `trade` | public | ❌ | `streams.trades: false` at [[`src/services/exchange/bitgetAdapter.ts:246`](../../src/services/exchange/bitgetAdapter.ts) |
| `orders` | private | ❌ | No private socket yet — `bitgetWs.ts` **refuses** to subscribe on the public V2 socket (BUG-0598). Nothing dead is called; pushes land nowhere until the private half exists. The field-name mismatch below still applies once it does |
| `positions` | private | ❌ | Same — refusal, not a dead call |
| `account` | private | 🟡 | Subscribed by `subscribePrivate()` but has **no** `handleMessage` branch |
| `equity`, `fill`, `positions-history`, `orders-algo`, `adl-noti` | private | ❌ | Not subscribed |
| `op:"trade"` place-order / cancel-order | private | ❌ | Request channels, not used |

A Cachy-specific bug, not a wiring gap: the WebSocket order and position pushes
arrive with **Bitget** field names (`size`, `status`, `filled`) while
`accountState.updateOrderFromWs` / `updatePositionFromWs`
(`src/stores/account.svelte.ts:68`, `:157`) read **Bitunix** names (`qty`,
`orderStatus`, `dealAmount`, `positionId`, `ctime`). Tracked in
[`docs/TODO.md`](../TODO.md). It would remain a live bug after the V1
migration if the V2 field names are the same, so it is worth resolving together
with BUG-0576.

---

## 3. Capability parity — the question FEAT-0525 exists to answer

For each capability: what the venue does, what Cachy does, and where.

| Capability | Bitget native | Cachy today | Implementing file |
|---|---|---|---|
| **Single close** | ✅ `POST …/order/close-positions` | 🟡 **Emulated** as a reduce-only market order via `place-order` | [`src/services/tradeService.ts:2088`](../../src/services/tradeService.ts) |
| **Bulk close** | ✅ `POST …/order/close-positions`, `holdSide` blank closes all — **1 req/s, the tightest limit in the surface** | 🟡 **Emulated**: reads fresh positions, then fires **N concurrent** `placeOrder` calls via `Promise.allSettled` | [`src/services/tradeService.ts:2327`](../../src/services/tradeService.ts) |
| **Order place** | ✅ `POST …/order/place-order` | ⏳ UTA body (`side` + `posSide`/`reduceOnly`, `marginMode` required, `tradeSide` absent by design) — `bitgetBodies.ts`, `bitgetUtaWrites.test.ts` | [`src/utils/server/venues/bitget.ts:75`](../../src/utils/server/venues/bitget.ts) |
| **Cancel** | ✅ `POST …/order/cancel-order` | ⏳ `/api/v3/trade/cancel-order` | [`src/utils/server/venues/bitget.ts:197`](../../src/utils/server/venues/bitget.ts) |
| **TP/SL attach** | ✅ On `place-order` itself (`presetStopSurplusPrice`, `presetStopLossPrice`, plus `*ExecutePrice`), and 5 dedicated plan-order endpoints | ❌ **Refused.** `tpSl: false`, `tpSlAtEntry: false`, `tpSlStandalone: false` | [`src/services/exchange/bitgetAdapter.ts:208`](../../src/services/exchange/bitgetAdapter.ts), [[`src/utils/exchange/bitgetBodies.ts:97`](../../src/utils/exchange/bitgetBodies.ts), `bitgetCapabilities.ts` |
| **Leverage / margin-mode set** | ✅ `set-leverage`, `set-all-leverage`, `set-margin`, `set-auto-margin`, `set-margin-mode`, `set-position-mode` | ❌ **Refused.** `executeAccountSetting()` returns `null`; every adapter verb refuses on `accountSettings: false` | [`src/utils/server/venues/bitget.ts:495`](../../src/utils/server/venues/bitget.ts), [[`src/services/exchange/bitgetAdapter.ts:162`](../../src/services/exchange/bitgetAdapter.ts) |
| **Position snapshot** | ✅ `GET …/position/all-position` | ⏳ `/api/v3/position/current-position`; feeds the OMS | [`src/utils/server/venues/bitget.ts:402`](../../src/utils/server/venues/bitget.ts) |
| Order detail | ✅ `GET …/order/detail` | ❌ Refused at the signer | [`src/utils/exchange/restSigningPlan.ts:291`](../../src/utils/exchange/restSigningPlan.ts) |
| Modify order | ✅ `POST …/order/modify-order` | ⏳ `/api/v3/trade/modify-order` (Phase E) — changes price/size of a resting order, cannot open a position |
| Cancel all | ✅ `POST …/order/cancel-all-orders` | ❌ Refused at the signer | [`src/utils/exchange/venueBodies.ts:139`](../../src/utils/exchange/venueBodies.ts) |
| Mark-price candles | ✅ `kLineType: mark` + a dedicated endpoint | ❌ Refused rather than answered with last-price candles | [`src/utils/server/venues/bitget.ts:519`](../../src/utils/server/venues/bitget.ts) |
| Position mode (one-way / hedge) | ✅ read from **two** places: `account/account` returns `posMode` (`one_way_mode` \| `hedge_mode`) directly, and `history-position` also returns it | ❌ Declared empty — but **the data is already in hand** | `bitgetCapabilities.ts` |
| Trailing stop | ✅ `planType: track_plan` + `callbackRatio` | ❌ `trailingStop: false` | `bitgetCapabilities.ts` |
| Multiple take-profits | ✅ `place-pos-tpsl` takes a TP and an SL with separate custom IDs | ❌ `multipleTakeProfits: false` | `bitgetCapabilities.ts` |
| Time in force | ✅ `force: ioc \| fok \| gtc \| post_only` | ❌ Empty list — Cachy sends no time-in-force on this path | `bitgetCapabilities.ts` |
| Leverage / margin mode **read** | ✅ `marginMode` and `leverage` are on the position response | 🟡 Read-only, normalised | [[`src/services/tradeService.ts:2195`](../../src/services/tradeService.ts), `src/routes/api/positions/+server.ts` |

### Why each refusal is a refusal and not a gap

The refusals are the point of the design, not an oversight. Bitget has every
one of these endpoints; Cachy declines to call them because it has no
*verified* request format for them. BUG-0001 is the standing rule: never guess
an exchange's wire format for a call that moves money. Each refusal therefore
happens **before** a request exists — at the signer, or one step earlier at the
venue boundary — and fails loudly rather than resolving quietly.

A margin top-up that silently did nothing would leave a trader believing their
liquidation price had moved away from them. A TP/SL modify that resolved quietly
would leave them believing a stop had moved.

The two capability maps answer different questions on purpose
([[`src/services/exchange/bitgetAdapter.ts:18`](../../src/services/exchange/bitgetAdapter.ts)): `SUPPORTS` is *"has Cachy wired this verb end-to-end
here"*, `capabilities` is *"what will the venue take on an order"*. Bitget
genuinely accepts attached TP/SL, and Cachy still declares
`tpSlAtEntry: false`, because it has no verified wire format for it.

### ⚠️ `positionModes: []` is answered by an endpoint Cachy already calls

This one is not a "Cachy declines to call it" refusal. The field is already
arriving, unread.

`GET /api/v2/mix/account/account` returns `posMode` with the value
`one_way_mode` or `hedge_mode`, sitting immediately beside `marginMode` in the
same response object
(`02_account.md` → *Get Single Account*, response fields). Cachy calls that
endpoint — [`fetchBitgetAccount`](../../src/utils/server/venues/bitget.ts) at
line 244 — and parses `available`, `locked`, `unrealizedPL`, `marginCoin` and
`equity` from `data`. It does not read `posMode`, and does not read `marginMode`
there either.

So the comment in
[`bitgetCapabilities.ts`](../../src/services/exchange/bitgetCapabilities.ts) —
*"Unknown rather than one_way: no Bitget response Cachy reads carries a
position mode … Empty means 'do not offer the control', which is the safe
reading of an unknown"* — is right about the conclusion and wrong about the
premise. The premise reads as though the venue does not expose the mode. It
does, it is documented, and it is in a payload Cachy already parses.

Nothing about this is blocked. The endpoint Cachy reaches is a V1 path today
(`/api/mix/v1/account/account`) and therefore currently answers `30032`, but
that is true of every other row in this table and BUG-0576 covers it.

**Why it is on the critical path and not just a tidy-up.** The V2 order schema
is mode-dependent: in hedge mode the close is carried by `tradeSide`, and in
one-way mode Bitget *ignores* `tradeSide` entirely, so a close has to be
expressed with `reduceOnly` instead (`04_trade.md`, `09_v1_vs_v2.md`). The
error-code table makes the coupling explicit — `22042` *"When a one-way
position is held, trigger order cannot only reduce positions"*, `45021`
*"When one-way position is held, the order type must also be one-way position
type"*, `45020` *"Liquidation can only occur under two-way positions"*
(`08_error_codes.md`). A V2 order port cannot pick a request shape without
knowing the account's mode, so reading `posMode` is a prerequisite for
correct order placement, not a follow-up.

**Bitunix already does this**, which is the precedent:
[`bitunixCapabilities.ts:64`](../../src/services/exchange/bitunixCapabilities.ts)
declares `positionModes: ["one_way", "hedge"]`, and the value reaches the UI
through `accountState.positionMode`
([`ExchangeAccountControls.svelte:141`](../../src/components/inputs/ExchangeAccountControls.svelte)).
Bitunix's `Get Single Account` also carries `positionMode`. The Bitget gap is
that Cachy never asked.

**Resolved 2026-10-04 (BUG-0596), with a generation correction.** The note above
was written for Classic V2, where the mode arrives as `posMode` on the account.
Cachy targets UTA instead, where there is no mode on the account at all:
`/api/v3/account/assets` carries balances only. The mode arrives per position
and per order as `holdMode` (`hedge_mode`, verified live; one-way is the
documented buy/sell mode). So `fetchBitgetAccount` does *not* parse a mode —
there is none to parse — and the mode reaches `accountState.positionMode`
through the positions lane (`hydratePositions` reads `holdMode` off
`NormalizedPosition`). `bitgetCapabilities.positionModes` declares
`["one_way", "hedge"]`. The account-settings UI stays behind the adapter's
`SUPPORTS.accountSettings` (false until the write formats are verified), so
this changes what the order port may assume, not what the UI offers.

### The bulk-close answer, in full

This is the question that motivated FEAT-0525, so the answer is stated in full
rather than left to a table cell.

**Yes, Bitget has a native bulk-close endpoint** — `POST
/api/v2/mix/order/close-positions`, which accepts a blank `holdSide` to close
every position of a symbol in hedge mode and returns
`successList` / `failureList`. Cachy does not use it. Instead
`closeAllPositions` reads a fresh position list and issues one reduce-only
market order per position, concurrently, through `Promise.allSettled`.

The reason, in the code's own words ([[`src/services/tradeService.ts:2311`](../../src/services/tradeService.ts)): the wire format
was unverified — *"no local reference, no sandbox run"* — and BUG-0001 forbids
guessing it for a call that closes real positions. It also names this item: *"FEAT-0525
pins the full Bitget reference."*

So the reference now exists, and the blocker is no longer the reference. What
remains is the sandbox run. `09_v1_vs_v2.md` has the endpoint; the migration
that would reach it is BUG-0576.

Two things are worth noting for whoever picks it up. The 1 req/s limit means a
native bulk close is not obviously faster than the loop for a handful of legs,
though it is atomic in a way N concurrent orders are not — a partial failure
today leaves some positions open, which is why `verifyFlat` re-reads and
`reportFlattenShortfall` throws. And the venue is a V1 endpoint anyway, so the
native close is not reachable until the V2 migration lands.

### Prioritised gaps

1. **Migrate to V2.** Everything else is downstream of this. BUG-0576.
2. **Settle the query-parameter ordering question** in a sandbox. It gates
   every read path and is cheap. See `01_sign.md`.
3. **Read the position mode.** `posMode` is already in a payload Cachy parses
   and is not read. The V2 order schema is mode-dependent, so this is a
   prerequisite for step 4, not a follow-up. See the section above.
4. **Native TP/SL on `place-order`.** The single highest-value capability the
   venue already grants on an endpoint Cachy calls. Closes the unprotected
   window in BUG-0503.
5. **Leverage / margin-mode set.** Six documented endpoints behind one refusal
   (FEAT-0068). Self-contained and read-mostly-adjacent.
6. **Native bulk close**, once V2 is reachable.
7. **The WebSocket field-name mismatch** in §2.
8. **WebSocket two-socket split** — a lifecycle change, deliberately not
   bundled with the REST port.

### Capability maps

Three maps declare what Bitget can do. They are separate on purpose:

| Map | File | Answers |
|---|---|---|
| `bitgetCapabilities` | `src/services/exchange/bitgetCapabilities.ts` | what the venue takes on an order |
| `SUPPORTS` | [`src/services/exchange/bitgetAdapter.ts:140`](../../src/services/exchange/bitgetAdapter.ts) | what Cachy wired end-to-end |
| `BROKER_CAPABILITIES` | [`src/config/brokerCapabilities.ts:18`](../../src/config/brokerCapabilities.ts) | native timeframes — Bitget has **no `1M`**, Bitunix does |

The bar for every flag, per [`src/services/exchange/capabilityTypes.ts:56`](../../src/services/exchange/capabilityTypes.ts), is
that the venue supports it **and** Cachy has a verified request shape for it.

---

**For:** Cachy App - Trade Execution Integration
**File:** `docs/bitget-api/INTEGRATION_STATUS.md`
