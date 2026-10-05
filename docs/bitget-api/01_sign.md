# Signature (Sign)

Source: <https://www.bitget.com/legacy-docs/classic/quickStart/intro> (REST),
<https://www.bitget.com/legacy-docs/classic/quickStart/websocket-intro> (WebSocket)
Crawled on: 2026-09-28

## Access preparation

Each UID may create up to **10 API keys**, each with read-only or read/write
permissions. Permissions are scoped: read, trade, transfer, withdraw.
Bitget recommends binding a key to an IP address.

Three values come back from key creation:

- `APIKey` — the identity of the request
- `SecretKey` — used for signature generation
- `Passphrase` — chosen by the user

> **The passphrase cannot be retrieved.** If it is lost, the API key has to be
> recreated. This is why Cachy's WebSocket reconnect key includes the passphrase
> (`src/services/appEffects.svelte.ts:33`): losing it is not a recoverable
> credentials-state transition, it is a key rotation.

Sub-accounts (virtual and standard) can create and manage their own API keys
independently, once the main account enables the API Key Management permission
for the sub-account. It is **disabled by default**.

## REST API signature

### Headers

Every signed REST request carries:

| Header | Description |
|---|---|
| `ACCESS-KEY` | API key as a string |
| `ACCESS-SIGN` | Signature, base64-encoded |
| `ACCESS-TIMESTAMP` | Milliseconds since epoch |
| `ACCESS-PASSPHRASE` | The password set when the key was created |
| `Content-Type` | `application/json` for all POST requests |
| `locale` | Optional, e.g. `zh-CN`, `en-US` |

There is no `recvWindow` parameter. The equivalent is a fixed **30-second**
timestamp window, documented under *Standard Specification* below.

### Generating ACCESS-TIMESTAMP

| Language | Expression |
|---|---|
| Java | `System.currentTimeMillis()` |
| Python | `time.time_ns() / 1000000` |
| Go | `int64(time.Now().UnixNano() / 1000000)` |
| JS | `Math.round(new Date())` |
| PHP | `microtime(true) * 1000` |

> ⚠️ `Math.round(new Date())` is the doc's JavaScript snippet and it is **not**
> epoch milliseconds — it is a rounded timestamp *value* (seconds since epoch,
> rounded). The value that actually works is `Date.now()`, which is what
> [`src/utils/crypto/exchangeSigning.ts:243`](../../src/utils/crypto/exchangeSigning.ts) uses. See `08_error_codes.md`.

### Signature content

Bitget: encrypt the string

```
timestamp + method.toUpperCase() + requestPath + "?" + queryString + body
```

(+ is string concatenation) with **HMAC-SHA256** keyed by `secretKey`, then
**Base64**-encode the result.

| Part | Description |
|---|---|
| `timestamp` | Same value as the `ACCESS-TIMESTAMP` header, milliseconds since epoch |
| `method` | `GET` or `POST`, uppercased |
| `requestPath` | The request interface path |
| `queryString` | The query string after `?` |
| `body` | Request body as a string; omitted or empty for GET |

**If the query string is empty**, the content to sign is:

```
timestamp + method.toUpperCase() + requestPath + body
```

**If it is not empty**:

```
timestamp + method.toUpperCase() + requestPath + "?" + queryString + body
```

Two steps to the final signature:

```
payload   = hmac_sha256(secretKey, message)
signature = base64.encode(payload)
```

### Worked examples from the docs

Public depth, `BTCUSDT`:

- `timestamp` = `16273667805456`
- `method` = `GET`
- `requestPath` = `/api/mix/v2/market/depth`
- `queryString` = `?limit=20&symbol=BTCUSDT`

```
16273667805456GET/api/mix/v2/market/depth?limit=20&symbol=BTCUSDT
```

Order placement, `BTCUSDT`:

- `timestamp` = `16273667805456`
- `method` = `POST`
- `requestPath` = `/api/v2/mix/order/place-order`
- `body` = `{"productType":"usdt-futures","symbol":"BTCUSDT","size":"8","marginMode":"crossed","side":"buy","orderType":"limit","clientOid":"channel#123456"}`

```
16273667805456POST/api/v2/mix/order/place-order{"productType":"usdt-futures",…}
```

Three defects are visible in these examples and are collected in
`08_error_codes.md`: the path `/api/mix/v2/market/depth` matches neither
generation, `usdt-futures` is lowercased where the enum says `USDT-FUTURES`, and
the sample bodies carry `"force":"normal"` where the Place Order enum allows
only `ioc`, `fok`, `gtc`, `post_only`.

### ⚠️ Query parameter ordering is contradicted by the docs

Every code sample on this page — Java, Python and JS — carries the comment:

> `// Need to be sorted in ascending alphabetical order by key`

and the Java and Python samples sort before signing (`params.sort(...)`), as
does the JS RSA sample, whose query string is visibly alphabetical
(`clientOid=123&coin=USDT&endTime=…&pageNo=1&pageSize=20&startTime=…`). Both
worked `queryString` examples are alphabetical too (`limit=20&symbol=BTCUSDT`,
`marginCoin=usdt&symbol=btcusdt`).

Cachy does the opposite. `signBitgetRequest` builds the query with
`new URLSearchParams(params).toString()`, which is **insertion order, unsorted**,
and [`src/utils/exchange/restSigningPlan.ts:202`](../../src/utils/exchange/restSigningPlan.ts) forbids applying the
sorted comparator to a Bitget route, on the grounds that it would reorder the
prehash relative to what the signer does.

### ✅ Resolved for `/api/v3/*` (UTA) — observed live 2026-10-03

Settled against a UTA account with a control proving the signature was actually
checked (`docs/bitget-api/14_uta_v3.md`, "Query ordering before signing"):

| Request | Result |
|---|---|
| wrong secret (control) | HTTP 400, `code=40009` |
| valid secret, insertion order | HTTP 200, `code=00000` |
| valid secret, sorted order | HTTP 200, `code=00000` |

**Both orders are accepted on V3.** The venue verifies against a canonicalised
query, so insertion order — what Cachy sends — is correct as written and needs
no change. The control is load-bearing: an earlier run returned `40085` from
both variants, which is the UTA gate firing before signature validation and
means nothing about ordering.

**Not carried to Classic `/api/v2/*`.** A UTA account is refused there with
`40085`, so the Classic rule is unverified — and unneeded: per ADR-0023 Cachy
targets UTA only and Classic is refused, not ported.

Do not resolve the remaining half by picking a side in a code review. See BUG-0576.

### RSA signing

Also supported, as an alternative to HMAC:

```
hash = SHA256(content, rsaPrivateKey)
sign = base64.encode(hash)
```

Cachy implements HMAC only.

## WebSocket API signature

### Login frame

```json
{
  "op": "login",
  "args": [
    {
      "apiKey": "<api_key>",
      "passphrase": "<passphrase>",
      "timestamp": "<timestamp>",
      "sign": "<sign>"
    }
  ]
}
```

`method` is always `GET` and `requestPath` is always `/user/verify` — a signing
path string, **not** a URL you connect to. The docs document no separate
private-channel URL form; the private endpoint is a distinct WebSocket host
(see `07_websocket.md`).

```
sign = Base64(HMAC-SHA256(timestamp + "GET" + "/user/verify", secretKey))
```

Worked wire example from the docs:

```json
{
  "op": "login",
  "args": [
    {
      "apiKey": "xx_xxx",
      "passphrase": "xxx",
      "timestamp": "1538054050",
      "sign": "8RCOqCJAhhEh4PWcZB/96QojLDqMAg4qNynIixFzS3E="
    }
  ]
}
```

### ⚠️ The WebSocket login timestamp is in seconds — the prose says milliseconds

This page contradicts itself three ways:

| Source | Says |
|---|---|
| Field description | *"Unix timestamp in milliseconds, which will expire in 30 seconds"* |
| JS snippet | `const timestamp = '' + Date.now()` — milliseconds |
| Java step 1 | `Long timestamp = System.currentTimeMillis() / 1000;` — **seconds** |
| Wire example | `"timestamp": "1538054050"` — **seconds** (as ms it would be 1970) |

`1538054050` is 2018-09-27 as seconds. As milliseconds it is 1970-01-18, which
cannot be a valid timestamp for a credential created in 2018.

Two of the four sources say seconds and the one concrete value on the wire is
seconds. Cachy's implementation follows them —
`Math.floor(Date.now() / 1000)` at [`src/services/bitgetWs.ts:424`](../../src/services/bitgetWs.ts). **Cachy is
right and the prose is wrong.** REST uses milliseconds; WebSocket login uses
seconds. Both use the same HMAC-SHA256 + base64.

This asymmetry is a permanent trap for anyone unifying the two signers.

### WebSocket login success code — resolved live (2026-10-03)

The page documents success as:

```json
{ "event": "login", "code": "0", "msg": "" }
```

and failure as `{ "event": "error", "code": "30005", "msg": "error" }`.

**Neither documented spelling is what the venue sends.** Four authenticated
logins on 2026-10-03 — both private hosts (`wss://ws.bitget.com/v3/ws/private`
and `wss://ws.bitget.com/v2/ws/private`), millisecond and second timestamps —
all answered with `code` as the JSON **number** `0`:

```json
{"event":"login","code":0,"connId":"0621ccff…"}
```

So `code === "00000"` fails, and `code === "0"` fails too — strict equality
against a number. Cachy normalizes with `String(msg.code)` before comparing and
accepts `"00000"` and `"0"`, which covers the observed `0` together with both
documented spellings (`src/services/bitgetWs.ts`, BUG-0581, fixed in #3769). An
unrecognised code logs loudly instead of falling through silently.

"If login fails, it will automatically disconnect."

## Standard specification

### Timestamp

> The unit of ACCESS-TIMESTAMP in the HTTP request signature is milliseconds.
> The timestamp of the request must be within 30 seconds of the API server time,
> otherwise the request will be considered expired and rejected.

That fixed 30-second window is Bitget's substitute for Bitunix's `recvWindow`.
There is no parameter to widen it. Bitget recommends querying the server time
endpoint and comparing when clocks drift.

Cachy corrects for drift rather than widening the window — see the
`correctedNow()` override in [`src/utils/exchange/browserSigning.ts:255`](../../src/utils/exchange/browserSigning.ts).

### Rate limiting

- Public interface: market-information endpoints share a unified ceiling of
  **20 requests per second**
- Private interface: limited by API key; see each endpoint's own limit
- **Overall: 6000 requests per IP per minute**

Exceeding any of these returns `429 Too Many Requests`.

The 20/s public ceiling is where Cachy's Bitget rate limiter setting comes from
(`src/services/api/requestManager.ts:62`, commented *"Bitget: Usually 20 req/s"*).
It is a public-market-data figure applied at the Cachy request layer, so it is
neither the per-endpoint private limit nor the 6000/min overall ceiling.

### Request format

Only `GET` and `POST` are supported.

- `GET` — parameters travel in the query string
- `POST` — parameters travel as JSON

### Request interaction

1. Build parameters per the endpoint's request-parameter table
2. Submit as `GET` or `POST`
3. The server validates parameter security, then returns JSON
4. Process the response

### Common HTTP error codes

- `400` Bad Request — invalid request format
- `401` Unauthorized — invalid API key
- `403` Forbidden — no access to the requested resource
- `404` Not Found
- `429` Too Many Requests — throttled
- `500` Internal Server Error

On failure the body usually carries the error message. But note that a
**business** failure is an HTTP `200` with a non-zero `code` in the body — see
`00_common.md`.

## API domains

| Purpose | Domain |
|---|---|
| REST | `https://api.bitget.com` |
| WebSocket public | `wss://ws.bitget.com/v2/ws/public` |
| WebSocket private | `wss://ws.bitget.com/v2/ws/private` |

### VIP line domains

A low-latency line for VIP and institutional users that bypasses the CDN.
Eligibility is by BD/RM application. Usage is *"simply replace the domain with
the VIP Line request domain"*, and it supports both account modes.

| Purpose | Classic | UTA |
|---|---|---|
| REST | `https://vip-api.bitget.com` | `https://vip-api.bitget.com` |
| WebSocket public | `wss://vip-ws.bitget.com/v2/ws/public` | `wss://vip-ws.bitget.com/v3/ws/public` |
| WebSocket private | `wss://vip-ws.bitget.com/v2/ws/private` | `wss://vip-ws.bitget.com/v3/ws/private` |

The `v2`/`v3` split is a useful confirmation that Classic and UTA are on
different WebSocket protocol versions, not just different path prefixes.

## Official SDKs

| Language | Package path |
|---|---|
| Java | `com.bitget.openapi.api.v2` |
| Python | `v2` |
| Node.js | `src/lib/v2` |
| Go | `pkg/client/v2` |
| PHP | `src/api/v2` |

All in <https://github.com/BitgetLimited/v3-bitget-api-sdk>.

> The same repository also ships `v1/mix/order_api.py`, which still posts to
> `/api/mix/v1/order/placeOrder`. The shipped SDK carrying a dead endpoint is
> the most likely reason the V1 surface went unnoticed. See `09_v1_vs_v2.md`.

---

**For:** Cachy App - Trade Execution Integration
**File:** `docs/bitget-api/01_sign.md`
