# ADR-0013: Client-Side Exchange Request Signing and Zero-Transit Credential Boundary

- **Status:** Accepted
- **Date:** 2026-08-26
- **Amended:** 2026-09-15 — named exception for the Bitget `ACCESS-PASSPHRASE` transport header (see below)
- **Deciders:** @mydcc, Antigravity

## Context

[`ADR-0001`](0001-local-first-boundary.md) established Cachy's core architectural principle:
- **Class A data (never leaves the device):** Journal entries, settings, private notes, API keys and secrets, presets, and trade drafts.

Historically, authenticated exchange requests (Bitunix and Bitget) for trading (`/api/orders`), balances (`/api/balance`), positions (`/api/positions`), and sync (`/api/sync/*`) transmitted the raw API Secret and Passphrase from the browser to the Cachy server runtime in HTTP headers. The Node.js server runtime then computed the HMAC or SHA256 signatures before forwarding requests upstream to the exchange.

While mitigations existed (TLS transport, zero persistence, logger redactions formalized in `BUG-0272`), this created a gap between the architectural promise of ADR-0001 ("Class A never leaves the device / reaches a server") and the physical proxy transit mechanism.

During the security audit on 2026-08-23 and subsequent backlog specification in [`FEAT-0285`](../backlog/features/FEAT-0285-credential-transit-boundary.md), two options were framed:
1. Option A: Move signing logic into the client via standard WebCrypto (`crypto.subtle`) so raw secrets never transit to any Cachy server.
2. Option B: Formally sanction the proxy hop as an exception in ADR-0001.

## Decision

We adopt **Option A**: **All authenticated exchange requests are signed client-side in the browser using the standard Web Crypto API (`crypto.subtle`).**

1. **Zero-Transit of Secrets:**
   - Raw API Secrets and Passphrases remain strictly within client-side memory and local encrypted storage (`localStorage`).
   - They MUST NEVER be transmitted over HTTP headers, query strings, or request bodies to any Cachy server endpoint.

2. **Precomputed Signature Transit:**
   - The browser computes the venue-specific signature (`X-Signature`, `X-Timestamp`, `X-Nonce`, etc.) before initiating the proxy request.
   - The Cachy server proxy acts purely as an opaque, authenticated transport forwarder to handle CORS and network isolation, receiving only the public API key and precomputed signature headers.

3. **Cryptographic Standards:**
   - **Bitunix:** Computed using WebCrypto SHA-256 (`SHA256(SHA256(nonce + timestamp + apiKey + queryParamsStr + bodyStr) + apiSecret)`).
   - **Bitget:** Computed using WebCrypto HMAC-SHA256 (`Base64(HMAC-SHA256(timestamp + method + requestPath + bodyStr, apiSecret))`).

### Named exception: the Bitget `ACCESS-PASSPHRASE` transport header

Recorded 2026-09-15, while planning [`FEAT-0405`](../backlog/features/FEAT-0405-client-side-signing-cutover.md).

**The exception.** On Bitget-reachable proxy routes, the API **passphrase** may continue to transit the Cachy server as a request header (`X-Api-Passphrase` client→Cachy, `ACCESS-PASSPHRASE` Cachy→Bitget). The API **secret** may not, on any route, for any venue.

**Why a client-side computation cannot remove it.** The passphrase is not a signing input. §3 above states the Bitget prehash as `timestamp + method + requestPath + bodyStr`, and the implementation confirms it — `generateBitgetSignature(apiSecret, method, path, params, body)` takes no passphrase (`src/utils/server/bitget.ts:75-117`). Bitget upstream nonetheless requires the header on every authenticated request; all seven outbound builders set it unconditionally (`src/utils/server/venues/bitget.ts:110,154,210,272,310,352,484`). Cachy must proxy because the browser cannot reach the Bitget REST API directly. There is therefore no client-side computation that keeps the passphrase off the wire.

**Why the residual exposure is acceptable.** Post-cutover, a compromised Cachy runtime holds at most `apiKey` + `passphrase` for Bitget — a pair that cannot produce a valid signature, because the secret is the HMAC key and remains exclusively client-side. Credential exfiltration no longer yields signable material. The passphrase degrades from a signing credential to an additional identifier travelling with the request. Bitunix has no passphrase, so nothing changes there; the exception is Bitget-only.

**Boundary conditions — the exception is narrow.**

- Confined to the passphrase. The secret stays forbidden everywhere.
- Confined to a request header. The passphrase remains forbidden in query strings, request bodies, and any log output; the server-side redaction from [`BUG-0272`](../backlog/bugs/BUG-0272-proxy-route-credential-transport-drift.md) continues to cover it.
- No new passphrase-accepting route may be added on the strength of this exception. It covers the five Bitget-reachable routes that exist (`orders`, `balance`, `positions`, `account`, `account-settings`) and nothing further.
- Removed the moment Bitget REST becomes reachable client-direct, which is the outcome the exception is a stopgap for.

## Failure Modes & Mitigations

1. **Clock Skew (NTP Drift):**
   - *Risk:* Exchanges enforce tight timestamp windows (typically 5–30 seconds). A drifted client clock could cause signature rejection (`timestamp expired`).
   - *Mitigation:* The client tracks clock drift against server response `Date` headers and market WebSocket timestamps to adjust signing offsets when necessary.
2. **Deterministic Serialization:**
   - *Risk:* Differences in JSON stringification or query parameter sorting between client and server could yield divergent digests.
   - *Mitigation:* Canonical sorting of query parameters and strict JSON serialization identical to exchange API specifications, verified by byte-level conformance test suites.
3. **Execution Context:**
   - *Risk:* `crypto.subtle` is restricted to secure contexts (`https://` or `http://localhost`).
   - *Mitigation:* Cachy operates strictly in secure browser contexts and local instances.

## Consequences

### What this enables

- Full mechanical alignment with ADR-0001 Class A boundary: API Secrets never leave the user's browser sandbox.
- Immunity against credential exfiltration even if intermediate server logs or proxy interceptors are compromised.
- Direct path toward direct-to-exchange client requests where CORS permits, with zero backend dependency.

### What this costs

- Client-side signing implementations must be maintained and verified against exchange API updates across all supported venues.
- Conformance suites must continuously assert byte-for-byte output equivalence against recorded exchange test vectors.
- The Bitget passphrase continues to transit the Cachy server. The "zero-transit" promise in this ADR therefore holds in full for the signing secret on every route and for every credential on Bitunix, but not for the Bitget passphrase, which the named exception above covers.

### What is now forbidden

- Accepting a raw API **secret** on any proxy route, new or existing. No exception exists for this.
- Adding new proxy routes or modifying existing routes to accept a raw passphrase. The Bitget exception above is a closed list of five pre-existing routes, not a precedent.
- Logging, echoing, or caching signature prehash payloads containing secrets.

## References

- [`ADR-0001: Local-First boundary and optional server features`](0001-local-first-boundary.md)
- [`ADR-0007: Put every exchange behind one client-side adapter`](0007-exchange-adapter-boundary.md)
- [`FEAT-0285: Keep exchange credentials out of server transit`](../backlog/features/FEAT-0285-credential-transit-boundary.md)
- [`BUG-0272: Proxy routes drift on credential transport schema validation and error redaction`](../backlog/bugs/BUG-0272-proxy-route-credential-transport-drift.md)
