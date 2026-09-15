---
id: FEAT-0405
title: Cut REST signing over to client-side WebCrypto (finish FEAT-0285 Option A)
type: feature
status: ready
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

- `src/services/tradeService.ts`: `X-Api-Key` / `X-Api-Secret` header pair at
  **5** request sites — order lifecycle (placement, cancel, modify and TP/SL
  share one endpoint selector), `leverage-margin-mode`, `account`,
  `account-settings`, `sync/positions-pending`
- `src/services/syncService.ts`: one shared header object reused by **3** sync
  sub-requests (orders, positions-pending, positions-history)
- `src/services/feeRateService.ts`: same header pair at 1 request site

On the server side the pair is read via `extractApiCredentials`
(`src/utils/server/requestUtils.ts`) by **12** proxy routes: `orders`, `balance`,
`positions`, `leverage-margin-mode`, `account`, `account-settings`, `tpsl`,
`sync`, `sync/orders`, `sync/order-detail`, `sync/positions-history`,
`sync/positions-pending`. (`api/external/news` also calls the helper but carries
an unrelated key — not in scope.)

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
`positions`, `account`, `account-settings`, `sync` reads) take a second envelope
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

## Acceptance criteria

- [ ] No REST trade/sync request carries a raw exchange secret out of the browser,
      across all **7** client call sites / **12** migrated proxy routes
      (asserted by test: signature material only, `X-Api-Secret` absent)
- [ ] The server proxy has **no silent dual path**: a migrated route receiving no
      valid pre-signed envelope answers `400`, never re-signs with a transmitted
      secret
- [ ] One shared `buildVenueBody` produces the signed bytes for both sides; the
      server answers `400` when its rebuild diverges from the client-supplied body
      (covered by a test)
- [ ] Query-string routes (`balance`, `positions`, `account`, `account-settings`,
      `sync` reads) migrated with their own envelope shape — not only the
      body-signing routes
- [ ] Existing `exchangeSigning` conformance vectors still pass; order lifecycle
      and sync happy paths covered by integration tests
- [ ] WS private login recorded as audited-clean (documentation only, no code change)
- [ ] Whitepaper transitional note (chapters 2 and 6) updated to completed state

## Out of scope

- Changing venue signing algorithms themselves
- AI routes and backup encryption (unrelated at-rest concern)
- ADR-0013 itself (exists)
- `api/external/news` route (calls the credential helper but carries an unrelated
  key — not a credential-transit path)
- A backward-compatible dual path for old self-hosted clients (decided against —
  see hard cutover above)

## Links

- [`FEAT-0285`](FEAT-0285-credential-transit-boundary.md)
- [`docs/adr/0013-client-side-exchange-signing.md`](../../adr/0013-client-side-exchange-signing.md)
- [`docs/adr/0001-local-first-boundary.md`](../../adr/0001-local-first-boundary.md)
- `src/services/tradeService.ts`, `src/services/syncService.ts`,
  `src/services/feeRateService.ts`
- `src/utils/crypto/exchangeSigning.ts`, `src/utils/crypto/exchangeSigning.test.ts`
- `src/utils/server/venues/bitunix.ts`, `src/utils/server/venues/bitget.ts`
  (server-side body build + signing to be split)
- `src/utils/server/requestUtils.ts` (`extractApiCredentials`)
- `src/tests/security/credential_transport.test.ts` (secret-absence assertions)
- `src/services/bitunixWs.ts`, `src/services/bitgetWs.ts` (audited, no change)
