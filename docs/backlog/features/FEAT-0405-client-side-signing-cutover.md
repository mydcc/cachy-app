---
id: FEAT-0405
title: Cut REST signing over to client-side WebCrypto (finish FEAT-0285 Option A)
type: feature
status: specced
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

- `src/services/tradeService.ts`: `X-Api-Key` / `X-Api-Secret` headers at 4 call
  sites (order placement, cancel, modify, TP/SL handling)
- `src/services/syncService.ts`: same header pair at 3 call sites (orders,
  positions and balance sync)

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
`X-Api-Secret` on the migrated routes. Record the fallback decision for
mixed-version self-hosted deployments in this item before building (preferred:
hard cutover, no silent dual path).

## Acceptance criteria

- [ ] No REST trade/sync request carries a raw exchange secret out of the browser
      (asserted by test: signature material only, `X-Api-Secret` absent)
- [ ] The server proxy has no silent dual path on the migrated routes
- [ ] Existing `exchangeSigning` conformance vectors still pass; order and sync
      happy paths covered by integration tests
- [ ] WS private login recorded as audited-clean (documentation only, no code change)
- [ ] Whitepaper transitional note (chapters 2 and 6) updated to completed state

## Out of scope

- Changing venue signing algorithms themselves
- AI routes and backup encryption (unrelated at-rest concern)
- ADR-0013 itself (exists)

## Links

- [`FEAT-0285`](FEAT-0285-credential-transit-boundary.md)
- [`docs/adr/0013-client-side-exchange-signing.md`](../../adr/0013-client-side-exchange-signing.md)
- [`docs/adr/0001-local-first-boundary.md`](../../adr/0001-local-first-boundary.md)
- `src/services/tradeService.ts`, `src/services/syncService.ts`
- `src/utils/crypto/exchangeSigning.ts`, `src/utils/crypto/exchangeSigning.test.ts`
- `src/services/bitunixWs.ts`, `src/services/bitgetWs.ts` (audited, no change)
