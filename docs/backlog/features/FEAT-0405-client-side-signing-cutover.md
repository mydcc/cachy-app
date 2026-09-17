---
id: FEAT-0405
title: Cut REST signing over to client-side WebCrypto (finish FEAT-0285 Option A)
type: feature
status: in-progress
branch: feat/feat-0405-a5b-orders
assignee: claude
priority: P1
milestone: none
editions: [community, pro, private]
area: security
data_class: A
adr: ADR-0013
depends_on: []
---

# FEAT-0405 — Cut REST signing over to client-side WebCrypto (finish FEAT-0285 Option A)

## Problem

[`FEAT-0285`](FEAT-0285-credential-transit-boundary.md) chose Option A and shipped
the decision ([`ADR-0013`](../../adr/0013-client-side-exchange-signing.md)), the
WebCrypto signing engine (`src/utils/crypto/exchangeSigning.ts`) and byte-matching
conformance tests — but no production caller was ever wired up. Raw exchange
secrets still transit the Cachy server on every signed REST request:

- **14 client call sites across 6 files** carry the pair:

  | File | Sites | Endpoints |
  |---|---|---|
  | `src/services/tradeService.ts` | 5 | `signedRequest` transport :303 (all order writes + `/api/tpsl`), :375 `leverage-margin-mode`, :440 `account`, :496 `account-settings`, :1192 `sync/positions-pending` |
  | `src/services/syncService.ts` | 1 header object :217 | reused by 3 concurrent POSTs — `sync/orders`, `sync/positions-history`, `sync/positions-pending` |
  | `src/services/feeRateService.ts` | 1 :114 | `sync` |
  | `src/components/inputs/PortfolioInputs.svelte` | 1 :189 | `balance` |
  | `src/components/shared/PositionsSidebar.svelte` | 4 :306, :368, :458, :576 | `positions`, `orders` ×2, `account` |
  | `src/lib/windows/implementations/CandleChartView.svelte` | 2 :283, :312 | `positions`, `orders` |

  The last three were missing from earlier scope notes — an acceptance check
  written against a three-file list passes while seven sites still transmit.

On the server side the pair is read via `extractApiCredentials`
(`src/utils/server/requestUtils.ts`) by **12** proxy routes, in two groups:

- **Bitunix-hardwired (7)** — no `exchange` parameter; each calls
  `generateBitunixSignature` directly: `tpsl` (`+server.ts:59` rejects
  `exchange !== "bitunix"`), `leverage-margin-mode` (`:64`, same guard), `sync`,
  `sync/orders`, `sync/order-detail`, `sync/positions-history`,
  `sync/positions-pending`.
- **Reachable by both venues (5)** — dispatch through `resolveVenue(exchange)`
  and gate on `venue.requiresPassphrase`: `orders`, `balance`, `positions`,
  `account`, `account-settings`.

(`api/external/news` also calls the helper but carries an unrelated key — not in
scope.)

The WebSocket private-channel login was audited 2026-09-06 and needs no change:
`src/services/bitunixWs.ts` (`login()`) and `src/services/bitgetWs.ts` (`login()`)
already sign in the browser (CryptoJS) and transmit only
`{apiKey, timestamp, nonce, sign}` — the secret never leaves the device there.

The security audit 2026-08-23 finding "raw credentials transit the Cachy server"
(Medium-High) is therefore still live on the REST paths. User-facing docs
currently describe this transitional state honestly (whitepaper chapters 2 and 6);
this item completes the cutover so the docs can drop the qualifier.

## Proposal

Wire the REST trade/sync paths through `src/utils/crypto/exchangeSigning.ts`
(WebCrypto, per ADR-0013): the browser computes nonce, timestamp and signature;
the server proxy accepts the pre-signed envelope and no longer requires
`X-Api-Secret` on the migrated routes.

### Decision: hard cutover (recorded 2026-09-15)

**No fallback path for mixed-version self-hosted deployments.** A request
without a valid pre-signed envelope is rejected (`400`); the server never
silently re-signs with a transmitted secret. Operators of an old client must
update the client to talk to a new server. This keeps the ADR-0013 boundary
absolute instead of reintroducing a secret-carrying branch behind a flag.

### Decision: named Bitget passphrase exception (recorded 2026-09-15)

The naive acceptance criterion — *no raw exchange credential crosses the wire* —
is **not satisfiable for Bitget while Cachy proxies it**. The passphrase is a
transport header, not a signing input: the Bitget prehash is
`timestamp + method + requestPath + bodyStr`
(`src/utils/server/bitget.ts:104`), `generateBitgetSignature` takes no
passphrase (`:75-117`), yet Bitget upstream requires the header on every
authenticated request and all seven outbound builders set it unconditionally
(`src/utils/server/venues/bitget.ts:110,154,210,272,310,352,484`). No client-side
computation removes it.

[`ADR-0013`](../../adr/0013-client-side-exchange-signing.md) was therefore
amended with a **named, bounded exception**: on the five Bitget-reachable routes
the passphrase continues to transit as a header; the **secret** continues to
transit on none.

This is not a no-op. Post-cutover a compromised Cachy runtime holds at most
`apiKey` + `passphrase` for Bitget — a pair that cannot produce a valid
signature, because the secret is the HMAC key and stays client-side. Credential
exfiltration stops yielding signable material, on both venues. Scoping Bitget
out of the item instead would have left all three credentials on the wire for
the highest-value path (`signedRequest` :303 is the funnel for every order
write), which is the outcome this item exists to prevent.

The exception is Bitget-only and closed: no new passphrase-accepting route may
be added on its strength, and it is removed once Bitget REST becomes reachable
client-direct.

### The constraint that dictates the order of work

The server does not sign the payload it receives — it first *builds* the venue
body (`cleanPayload`, `formatApiNum`, per-order-type mapping in
`src/utils/server/venues/bitunix.ts` / `bitget.ts`) and signs that result. For
the client to produce a signature the exchange will accept, the client must
sign **byte-for-byte the same body the server forwards upstream**.

Approach: extract that body construction into **one shared builder**
(`buildVenueBody(venue, payload) → string`) importable by both client and
server. The client signs its output; the request carries the structured payload
*and* the resulting body string. The server rebuilds it, **compares** (mismatch →
`400`) and forwards the client's string verbatim without re-serialising. The
read-back comparison is the divergence guard — a faithful client-side replica of
the server's serialiser is explicitly *not* the plan.

Routes whose signature covers a query string rather than a body (`balance`,
`positions`, `account`, `sync` reads) take a second envelope
shape and are migrated in the same pass.

### Envelope

Headers: `X-Api-Key`, `X-Api-Passphrase` (venues requiring it), `X-Timestamp`,
`X-Nonce`, `X-Signature`. The signed body/query string travels alongside the
structured payload so the server can validate with Zod *and* forward verbatim.

### Clock drift

ADR-0013 lists timestamp expiry as the first failure mode. The migration needs
the drift tracking it describes (client offset derived from response `Date`
headers / market WS timestamps) or live orders will intermittently fail
signature verification.

## Progress

Delivered as six PRs; only the last one flips this item to `done`.

| Phase | Scope | State |
|---|---|---|
| A1 | `ROUTE_SIGNING_PLAN` (12 routes), `signCachyRequest` / `exchangeSignedFetch`, `clockDrift`, `assertPresignedConsistency` | merged (#3416) — deliberately inert: no route and no call site wired up |
| A2 | `buildVenueBody` plus the Bitget counterpart, for the two body-signed multi-venue routes | merged (#3421) |
| A3 | The 7 Bitunix-hardwired query routes and their client call sites | merged (#3424) |
| A4 | The 3 multi-venue query routes (`balance`, `positions`, `account`) | merged (#3431) |
| A5a | `/api/account-settings` — the first body-signed route, and the first reader of the wrapper body | merged (#3436) |
| A5b | `/api/orders` — eleven actions, two venues | in progress |
| A6 | Absence test over all 12 routes, whitepaper, WS audit, item flip | not started |

### A5b recon (2026-09-17, before the first edit)

Sizes, so the next session does not re-derive them:

- `src/routes/api/orders/+server.ts` is **106 lines** and holds no per-action
  logic; it validates, calls `venue.validateKeys`, then
  `venue.executeOrder(creds, payload)`. The cutover is those three lines plus the
  wrapper body — the same edit A5a made to `account-settings`, which is the file
  to copy.
- Nine route tests move: `orders_bitget_history`, `orders_cancel_path`,
  `orders_history_queryCanceled`, `orders_history_reduceOnly`,
  `orders_history_time_range`, `orders_leverage_marginmode`,
  `orders_native_bulk`, `orders_place_order_hedge`, `orders_place_order_ordertype`
  (all under `src/routes/api/orders/`).
- Two venue-level tests build call the old signature directly and move with it:
  `src/utils/server/venues/bitunixCancel.test.ts` (`executeOrder(CREDS, …)`) and
  `src/utils/exchange/venueBodies.test.ts`.
- The temporary client scaffolding to delete lives in one file:
  `ENVELOPE_SIGNED_ROUTES` at `src/services/tradeService.ts:96`,
  `ENVELOPE_BODY_BUILDERS` at `:116`, both read at `:387-389`; the comment at
  `:2011` already names this phase as the one that removes the set.
- Client call sites still setting `X-Api-Secret`: `PositionsSidebar.svelte:376,466`
  and `CandleChartView.svelte:321`.

Notes from A4 for whoever picks up A5b:

- The wrapped body is real now, not theory: `/api/account-settings` is its first
  production reader. The route parses the wrapper, takes `venueBody` as the
  signed bytes, rebuilds through `buildVenueBody` and forwards `venueBody`
  verbatim — the client's rebuild can differ from the route's if the *client*
  signs an unparsed payload, because `marginCoin` carries a Zod default and
  `amount` a transform. Hence the client parses before signing
  (`AccountSettingsRequestSchema`), and there is a divergence test that pins it.
- `signCachyRequest` resolves a body route's Bitget upstream path from
  `payload.type` as well as from a `?action=` in the URL — a body-signed route
  with no action in the URL used to resolve `null` and be refused with
  `VENUE_PATH_UNKNOWN`.
- The still-open A5b gaps, unchanged: a per-venue Bitget read path for `pending`
  / `history` (`BITGET_ORDER_PATHS` carries only the three writes), and the
  Bitunix body builders for `cancel-order`, `cancel-all`, `close-all-positions`
  and `flash-close-position`.
- A migrated read signs before it dispatches, and signing settles on a *macrotask*
  (`crypto.subtle`). Tests that drive a migrated call under fake timers must
  yield real macrotasks between advances, or they hang rather than fail.

Notes from A3 for whoever picks up A4:

- `src/utils/exchange/venueQueries.ts` is new: the query-shaped counterpart of
  `venueBodies.ts`, applied by *both* sides so defaults, clamps and empty-value
  filters cannot drift.
- Review follow-up (A3): every route now rebuilds through the shared builder
  (`venueQueries.ts`), including `leverage-margin-mode` and `sync/order-detail`,
  which had inlined the query object. The `marginCoin` default moved out of
  `leverage-margin-mode`'s Zod schema into `buildLeverageMarginModeQueryParams`,
  so there is one owner for it instead of two that could drift.
- `/api/sync/order-detail` is migrated but has no client call site —
  `tradeService` reaches order detail through `/api/orders`. Harmless until A5
  cuts that route over; the endpoint is then reachable only if `/api/orders`
  gains a use for it.
- `/api/tpsl` is the one route whose signature shape is a property of the `action`
  riding in the URL, so its Cachy body is asymmetric by design: a **read** sends
  the `{ exchange, action, params }` wrapper (which `TpSlRequestSchema` validates),
  a **write** sends the *venue* body (`params`) — because the handler forwards the
  bytes it received to Bitunix verbatim. Signing or sending the wrapper on a write
  would hand the venue `{ exchange, action, … }` where it expects `{ orderId, … }`.
- The enveloped client path now passes `venue: provider` explicitly. `signCachyRequest`
  refuses a route that does not accept that venue, which replaces the server-side
  `exchange !== "bitunix"` guard that left with the secret.
- `tradeService.signedRequest` carries a temporary `ENVELOPE_SIGNED_ROUTES` set
  (`/api/tpsl`). It exists only while `/api/orders` is unmigrated and goes away
  with it in A5.
- `account-settings` is a **body** route — settled 2026-09-16, before A5. Bitunix
  builds it through `buildVenueBody("bitunix", payload)`
  (`src/utils/server/venues/bitunix.ts`), and Bitget has no implementation for it
  at all (`executeAccountSetting` returns `null`). `ROUTE_SIGNING_PLAN` was right
  and the AC list was wrong; the AC has been corrected. Two independent sources
  beat one line of prose.

Notes for A4 + A5 (added 2026-09-16, on starting them):

- The delta is `VenueCredentials` → a pre-signed envelope on five `VenueModule`
  methods: `fetchAccount`, `fetchBalance`, `fetchPositions` (the three query
  routes) and `executeOrder`, `executeAccountSetting` (the two body routes). The
  venues stop signing and start forwarding the client's headers, the way
  `bitunixCallHeaders` already does for the A3 routes.
- `validateKeys(creds)` needs the secret, so it cannot survive as written, and it
  is called by three of the five routes (`account`, `orders`, `account-settings`
  — not `balance`, which never ran it). Bitget's implementation is worse than a
  shape check: it *signs a dummy request* with the secret to prove the signing
  chain works, which has no server-side equivalent once the secret is gone. Decide
  whether the remaining key-shape check moves client-side or is dropped — a
  deleted check that used to produce a legible error must not turn into a worse
  failure message from the venue.
- Roughly a dozen *route* test files break the same way A3 broke
  `tests/unit/verify_tpsl_validation.test.ts`: they build requests with `apiSecret`
  in the body and usually no `url`, which is the contract these routes stop
  accepting. Affected: `account-settings/account_settings.test.ts`,
  `account/account.test.ts`, `balance/balance.timeout.test.ts`, the nine
  `orders/*.test.ts` and `positions/positions_positionId.test.ts`.
  `sync/orders/security.test.ts`, `sync/sync_security.test.ts` and
  `tpsl/tpsl_paths.test.ts` are already on `signedEnvelopeRequest` and are the
  pattern to copy.

### A4/A5 design decisions (recorded 2026-09-17)

Four forks were open when A4 started. All four are settled, and the first two
are not what the phase plan assumed.

1. **Body transport: a wrapper field.** The bytes a venue signature covers on
   `/api/orders` and `/api/account-settings` are the *venue* body
   (`buildVenueBody(venue, payload)`), which carries neither `type` nor
   `exchange` and so cannot be Zod-validated. The Cachy body therefore carries
   both: `{...cachyPayload, venueBody: "<the string that was signed>"}`. The
   route parses the wrapper, takes `parsed.venueBody` as `rawBody`, rebuilds
   through `buildVenueBody(exchange, parsed)` and forwards `parsed.venueBody`
   verbatim. The rejected alternative — sending the venue body alone and
   putting `type`/`exchange` in headers — forces the handler to invert a venue
   body back into a Cachy payload, which puts venue knowledge in the proxy
   (against ADR-0007) and drops either the Zod check or the rebuild comparison.
   Consequence: `signCachyRequest`/`exchangeSignedFetch` must now express
   "signed bytes ≠ transmitted body".

2. **`/api/orders` is not uniformly body-signed.** Three of its eleven actions
   are query-signed GETs on both venues (`pending`, `history`, `order-detail`).
   The plan row was a bare `signed: "body"`. It now carries `signedByAction` for
   those three, and the shape is per-action only.

   *Correction (2026-09-17):* an earlier version of this note claimed
   `cancel-order` was a query on Bitunix and a body on Bitget, and that the table
   therefore needed a per-venue map. That was wrong. Bitunix documents
   `cancel_orders` as a `POST` with `{symbol, orderList}` in the body
   (`docs/bitunix-api/07_trade.md`; `bitunix.ts` already sends it that way; and
   the regression test pins the path), so both venues agree on the shape and no
   per-venue override exists anywhere in the table. What A5 owes `cancel-order`
   is its Bitunix body builder — `venueBodies.ts` throws for that pair today, so
   the action is refused rather than signed with a shape the venue does not
   document.

3. **Bitget's path is part of the signed bytes.** Bitget's prehash is
   `timestamp + METHOD + path + body`, so the *client* must sign the real
   upstream endpoint — which it has no way to know today. `bitgetUpstreamPath`
   in `restSigningPlan.ts` is now the single source, and `bitget.ts` reads its
   paths from it too so the two cannot drift. A3's conformance test deliberately
   carries sample paths and cannot detect a wrong one. `BITGET_ORDER_PATHS`
   carries the three write actions so far; a Bitget read on this route
   (`pending`, `history`, `order-detail`) is refused rather than signed over the
   Cachy path, which is the same A5 gap as above.

4. **`validateKeys` moves to the client**, into `signCachyRequest`, reusing the
   existing `validateBitunixKeys`/`validateBitgetKeys` shape checks. It needs the
   secret and so cannot survive server-side; dropping it instead would let a bad
   key surface as an opaque venue rejection, which is the worse error message
   the item warns about.

Found while settling (4): the note below that Bitget "signs a dummy request with
the secret to self-test the signing chain" describes
`validateBitgetKeysAsync`/`validateBitunixKeysAsync`, which no production path
calls — dead code with its own unit test. The wired check is the synchronous
shape check.

Also needed, and not in the phase plan: a venue-aware query serialiser
(`queryStringForVenue`). Bitunix sorts its query parameters and Bitget does not,
so a single `canonicalQueryString` would answer `PRESIGNED_DIVERGENCE` on every
Bitget query route.

## Acceptance criteria

- [ ] No REST trade/sync request carries a raw exchange **signing secret** out of
      the browser, across all **14** client call sites / **6** files and all **12**
      migrated proxy routes (asserted by test: signature material present,
      `X-Api-Secret` absent). The passphrase is a separate case — see the next
      criterion.
- [ ] The Bitget passphrase transits **only** through the ADR-0013 named
      exception, and only as a header: the secret-absence test must hold on all
      **12** routes, while an explicit passphrase-absence test holds on the **7**
      Bitunix-hardwired ones. No passphrase in a query string, body, or log.
- [ ] The server proxy has **no silent dual path**: a migrated route receiving no
      valid pre-signed envelope answers `400`, never re-signs with a transmitted
      secret
- [ ] One shared `buildVenueBody` produces the signed bytes for both sides; the
      server answers `400` when its rebuild diverges from the client-supplied body
      (covered by a test)
- [ ] Query-string routes (`balance`, `positions`, `account`, `sync` reads)
      migrated with their own envelope shape — not only the body-signing routes.
      (`account-settings` is *body*-signed, per `ROUTE_SIGNING_PLAN` and the
      venue builders; it was listed here as a query route in error.)
- [ ] Existing `exchangeSigning` conformance vectors still pass; order lifecycle
      and sync happy paths covered by integration tests
- [ ] WS private login recorded as audited-clean (documentation only, no code change)
- [ ] Whitepaper transitional note (chapters 2 and 6) updated to completed state

## Out of scope

- Changing venue signing algorithms themselves
- AI routes and backup encryption (unrelated at-rest concern)
- `api/external/news` route (calls the credential helper but carries an unrelated
  key — not a credential-transit path)
- A backward-compatible dual path for old self-hosted clients (decided against —
  see hard cutover above)
- **Removing the Bitget passphrase from the wire.** Structurally impossible while
  Cachy proxies Bitget; covered by the named ADR-0013 exception instead. A
  client-direct Bitget path is the real fix and belongs in its own item.
- **Stale open tab after cutover.** A tab loaded before the deploy keeps sending
  the pre-cutover format and 400s until reloaded. Wants a client-side
  "version changed — reload" prompt; tracked separately, not part of this item's
  criteria.

## Links

- [`FEAT-0285`](FEAT-0285-credential-transit-boundary.md)
- [`docs/adr/0013-client-side-exchange-signing.md`](../../adr/0013-client-side-exchange-signing.md)
  — amended 2026-09-15 with the named Bitget passphrase exception
- [`docs/adr/0001-local-first-boundary.md`](../../adr/0001-local-first-boundary.md)
- Client callers: `src/services/tradeService.ts`, `src/services/syncService.ts`,
  `src/services/feeRateService.ts`, `src/components/inputs/PortfolioInputs.svelte`,
  `src/components/shared/PositionsSidebar.svelte`,
  `src/lib/windows/implementations/CandleChartView.svelte`
- `src/utils/crypto/exchangeSigning.ts`, `src/utils/crypto/exchangeSigning.test.ts`
- `src/utils/exchange/bitunixBodies.ts`, `src/utils/exchange/bitunixBodies.test.ts`
  — shared Bitunix body construction, landed as this item's first phase (#3409)
- `src/utils/server/venues/bitunix.ts`, `src/utils/server/venues/bitget.ts`
  (server-side body build + signing to be split)
- `src/utils/server/requestUtils.ts` (`extractApiCredentials`)
- `src/tests/security/credential_transport.test.ts` (secret-absence assertions)
- `src/services/bitunixWs.ts`, `src/services/bitgetWs.ts` (audited, no change)
