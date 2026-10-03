---
id: BUG-0580
title: "Bitget signed GET requests may be signed with unsorted query parameters, contradicting the vendor documentation"
type: bug
status: specced
priority: P1
area: exchange
created: "2026-09-28"
milestone: none
editions: ["community", "pro", "private"]
data_class: none
adr: none
depends_on: []
---

# Settle whether Bitget requires query parameters to be sorted before signing

## Result (2026-10-03): no, on `/api/v3/*` — still unverified on `/api/v2/*`

Settled live against a UTA account, with a control that proves the signature was
actually checked on the endpoint under test:

| Request | Result |
|---|---|
| wrong secret (control) | HTTP 400, `code=40009` |
| valid secret, insertion order | HTTP 200, `code=00000` |
| valid secret, sorted order | HTTP 200, `code=00000` |

**Both orders are accepted.** The venue verifies against a canonicalised query,
so Cachy signing in `URLSearchParams` insertion order is correct as written and
needs no change. The control is the load-bearing part: an earlier run of this
same test returned `40085` from both variants, which looked like "neither works"
and meant nothing — `40085` is the UTA gate, and it fires *before* signature
validation.

**Not settled for `/api/v2/*`.** A UTA account is refused by every Classic path
with `40085`, so the Classic signing question needs an account in Classic mode.
Do not carry the V3 result across: that inference is what this item exists to
prevent.

## Symptom

If Bitget requires query parameters to be sorted alphabetically before the
signature is computed — as its documentation says — then **every signed Bitget
GET request carrying two or more query parameters is signed incorrectly** and
the venue rejects it. In practice that is one route, `/api/positions`; see
"Only one route is actually order-sensitive" under Evidence.

Cachy signs them in insertion order instead. The two orders are different
byte strings, so the signature does not match what the venue reconstructs.

This is currently invisible. Bitget's V1 API is decommissioned, so every V1
request fails with `30032` *before* the signature is ever checked. A signing
defect and an API deprecation produce the same symptom from the client's side,
and the deprecation is masking the second cause. Whoever migrates to V2 will
hit both at once, and the natural misdiagnosis is "the V2 port is still
wrong".

## Evidence

**The vendor says sort.** Every code sample on Bitget's Classic signature page
carries the comment *"Need to be sorted in ascending alphabetical order by
key"*, sorts before signing, and both worked `queryString` examples come out
alphabetical:

| Vendor example | Query string |
|---|---|
| Get contract depth, `BTCUSDT` | `?limit=20&symbol=BTCUSDT` |
| Get account info, `BTCUSDT` | `?marginCoin=usdt&symbol=btcusdt` |
| JS RSA sample | `clientOid=123&coin=USDT&endTime=…&pageNo=1&pageSize=20&startTime=…` |

Transcribed in [`docs/bitget-api/01_sign.md`](../../bitget-api/01_sign.md).

**Cachy does not sort.** `signBitgetRequest` builds the query with
`new URLSearchParams(params).toString()`, which is insertion order:

```ts
// src/utils/crypto/exchangeSigning.ts:257
queryString = new URLSearchParams(params).toString();
```

And the rule is asserted explicitly, in a comment on `canonicalQueryString`
that names this exact concern:

```ts
// src/utils/exchange/restSigningPlan.ts:207
* It is *not* the Bitget rule. `signBitgetRequest` and `generateBitgetSignature`
* take the parameters in insertion order and do not sort at all, so this
* comparator applied to a Bitget route would reorder the prehash. A3/A4 must not
* reach for it on the Bitget half of the table.
```

A second comment restates the rule for the URL-serialising helper at
`restSigningPlan.ts:236`: *"Bitunix sorts; Bitget takes insertion order — see the
warning on `canonicalQueryString` above."* A third assertion sits in prose in the
conformance suite at `src/services/__tests__/signingConformance.test.ts:300-306`.

So the codebase asserts the Bitget rule in three places — and the suite that
looks like it settles the question does not. `signingConformance.test.ts:336`
builds the expected path with `new URLSearchParams(sample.params).toString()`,
which is the same insertion-order expression the implementation uses: for
ordering it is a tautology, not an oracle. Worse, the two "vendor spec oracle"
Bitget cases at `:186-200` and `:216-219` pass `params = {}`, so ordering is a
no-op there too. The Bitunix oracle was deliberately made non-vacuous with two
keys (`:168-169`); the Bitget one never was.

### Only one route is actually order-sensitive

Not every signed Bitget GET is affected. Of the three Bitget query-signed routes
(`/api/balance`, `/api/positions`, `/api/account` —
`restSigningPlan.ts:93-95`; every other `signed: "query"` row is
`venues: ["bitunix"]`), only `/api/positions` carries more than one parameter.
`src/utils/exchange/venueQueries.ts:282` builds it as

```ts
{ productType: "umcbl", marginCoin: "USDT" }
```

Insertion order is `productType,marginCoin`; alphabetical is
`marginCoin,productType` — a different byte string, so a real divergence. The
other two carry a single parameter, where ordering cannot matter and the
signature is byte-identical under either rule. If sorted turns out to be
required, the blast radius is one route, not every signed request.

The server-side twin `generateBitgetSignature`
(`src/utils/server/bitget.ts:75`) is identical on the ordering line, so both
sides of the ADR-0013
envelope check agree with each other and disagree with the venue. That is the
worst shape for this class of bug: the envelope guard cannot see it, because
the guard only compares the two halves of Cachy's own computation. (The two
functions are not byte-identical overall — the browser signer also handles
`overrides?.timestamp` and a three-clause body guard — but ordering is the only
line that matters here.)

**No live evidence either way.** The V1 API cannot be used to settle it — it
rejects every request at routing, before signature validation. And V2 cannot be
tried with Cachy's current code without first settling this, which is the
circularity that makes it a bug rather than a question.

## Cause

The `restSigningPlan.ts` comment asserts a fact about Bitget's signing rule that
the vendor's own documentation contradicts. The comment may well be right — the
sorted comparator is shared with Bitunix, where sorted genuinely *is* required,
and the author may have been reasoning from Bitunix's rule rather than from
Bitget's docs. But nothing in the repository records an observation, a sandbox
run, or a vendor confirmation that would justify the assertion.

Per BUG-0001 this is a wire-format question, and the standing rule is not to
guess it. It was not guessed here so much as **asserted in a comment**, which
behaves the same way while being much harder to notice.

## Fix

**The cheap route is to ask Bitget.** This is a one-sentence question and the
vendor's own documentation is self-contradictory, so the vendor is the only
authoritative source. Bitget's contact channels are recorded in
[`docs/bitget-api/01_sign.md`](../../bitget-api/01_sign.md): the API Telegram
group linked from the docs, or a BD/RM contact. The question to ask:

> For the V2 REST API, must query parameters be sorted in ascending
> alphabetical order by key before computing ACCESS-SIGN, or is insertion order
> accepted?

**If that goes unanswered**, one signed V2 GET settles it. Any Bitget key with
read permission, against a live V2 endpoint carrying **at least two** query
parameters — for example `GET /api/v2/mix/account/account?productType=USDT-FUTURES&marginCoin=USDT`
— signed both ways, one request each.

The two-parameter requirement is not pedantry. Ordering is a no-op for a
single-parameter query, so a one-parameter probe cannot distinguish the rules
at all. And the obvious candidate endpoint is disqualified:
`docs/bitget-api/09_v1_vs_v2.md:20-28` records that
`GET /api/v2/mix/market/contracts` answers `200` **from an unauthenticated
client**, i.e. it does not validate `ACCESS-SIGN`. Signing it both ways returns
`200` twice, which reads as "both rules work" — a false negative on the one
question this experiment exists to answer. Use a route the signature actually
guards.

Then act on the answer:

- **If sorted is required** — change `signBitgetRequest` and
  `generateBitgetSignature` to sort for the Bitget branch only, and delete the
  misleading part of the `restSigningPlan.ts:207` comment. Add a test that pins
  the prehash for a known multi-parameter Bitget request, so the rule cannot
  drift again.
- **If insertion order is correct** — annotate the vendor documentation as
  defective in `08_error_codes.md` / `12_doc_defects.md`, and reword the
  `restSigningPlan.ts` comment so its authority is legible to the next reader.

Either way the comment's current framing is the thing to fix: it states a
vendor rule as settled fact on no evidence, which is the failure mode that lets
a wrong answer survive indefinitely.

**This is a prerequisite for BUG-0576.** The V2 migration cannot be validated
while signed GETs are of unknown correctness, which is why it is step 1 of that
item's migration order.

## Acceptance criteria

- [ ] Bitget support has answered the sorting question, **or** one signed V2 GET
      has been made in both orderings and the outcome recorded verbatim
- [ ] The answer is written into
      [`docs/bitget-api/01_sign.md`](../../bitget-api/01_sign.md), replacing the
      current "unresolved" marking
- [ ] A test pins the exact prehash for a Bitget request with two or more query
      parameters, in the order the venue requires
- [ ] `src/utils/exchange/restSigningPlan.ts:207` and `:236` no longer assert
      the Bitget rule without a recorded source
- [ ] If the rule changed, `signBitgetRequest` and `generateBitgetSignature`
      are both updated and stay byte-identical to each other
- [ ] The Bitunix signing path is unaffected — its sorted requirement is
      separate and already correct
- [ ] BUG-0576's step 1 can be marked satisfied

## Links

- BUG-0576 — the V2 migration; this is its first step and its gate
- BUG-0001 — never guess an exchange's wire format for a call that moves money
- [`docs/bitget-api/01_sign.md`](../../bitget-api/01_sign.md) — the vendor
  transcription and the current unresolved marking
- [`docs/bitget-api/09_v1_vs_v2.md`](../../bitget-api/09_v1_vs_v2.md) — why the
  V1 decommission hides this
- [`adr/0013-client-side-exchange-signing.md`](../../adr/0013-client-side-exchange-signing.md)
  — why the envelope guard cannot catch a wrong rule
