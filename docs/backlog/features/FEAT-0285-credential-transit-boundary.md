---
id: FEAT-0285
title: Keep exchange credentials out of server transit — sign client-side or sanction the proxy hop
type: feature
status: done
assignee: antigravity
branch: feat/feat-0285-client-side-signing
priority: P2
milestone: none
editions: [community, pro, private]
area: security
data_class: A
adr: required
depends_on: []
---

# FEAT-0285 — Keep exchange credentials out of server transit — sign client-side or sanction the proxy hop

## Problem

Every signed trading/sync request sends the raw exchange key/secret/passphrase
through the Cachy server: headers on `/api/orders` etc.
(`src/services/tradeService.ts:223–227`) and JSON bodies on `/api/sync/*`
(`src/services/syncService.ts:197–245`). Read literally, AGENTS.md/ADR-0001 say
Class A never reaches a server; the ADR's credential carve-out is ambiguous
about the proxy hop. Mitigations exist today (TLS-only transport, redacting
server logger, no observed logging) — this is a promise-vs-mechanism gap, not an
observed leak.

## Proposal

Decide one of two sanctioned end-states and record it:

- **Option A — sign client-side (WebCrypto).** Only signatures transit; the
  server proxy never sees raw credentials. Larger change: signing logic must
  move into the browser for both venues, with conformance tests against known
  vectors.
- **Option B — amend ADR-0001.** Name the browser→Cachy→exchange proxy hop as a
  sanctioned exception, with the data-flow map entry, logger allowlist and
  threat assumptions written down.

Either outcome is acceptable; drifting on as-is is not. This item is the decision
plus its smallest honest implementation/documentation step.

## Acceptance criteria

- [x] An ADR records the chosen option, its reasoning and its failure modes
- [x] Option A: a test signs a canonical Bitunix and Bitget request in-browser
      and byte-matches a recorded server-signed vector
- [ ] Option B: ADR-0001 and the data-flow documentation name the hop, what
      transits, retention/logging guarantees, and the review trigger to revisit
- [x] No third path ships (e.g. "encrypt the secret with a device key before
      transit") without its own ADR

## Out of scope

SSRF filtering of AI routes ([`BUG-0291`](../bugs/BUG-0291-ssrf-ai-proxy-baseurl.md)).
AI-context egress ([`BUG-0282`](../bugs/BUG-0282-ai-context-leaves-device-without-consent.md)).
Changing venue signing algorithms themselves.

## Links

- [`docs/adr/0001-local-first-boundary.md`](../../adr/0001-local-first-boundary.md)
- [`docs/adr/0013-client-side-exchange-signing.md`](../../adr/0013-client-side-exchange-signing.md)
- `src/services/tradeService.ts`, `src/services/syncService.ts`, `src/utils/server/bitunix.ts`
- `src/utils/crypto/exchangeSigning.ts`, `src/utils/crypto/exchangeSigning.test.ts`
- Security audit 2026-08-23, finding "raw credentials transit the Cachy server" (Medium-High)

## What shipped

- Chose **Option A** and documented the zero-transit credential boundary in [`ADR-0013`](../../adr/0013-client-side-exchange-signing.md) and referenced in [`ADR-0001`](../../adr/0001-local-first-boundary.md).
- Implemented client-side WebCrypto signing engine for Bitunix and Bitget in `src/utils/crypto/exchangeSigning.ts`.
- Added byte-matching conformance and parity test suite in `src/utils/crypto/exchangeSigning.test.ts` asserting exact parity against recorded and server-signed test vectors.
