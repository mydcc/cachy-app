# Bitget REST response fixtures

Captured `api.bitget.com` responses, transcribed from the response bodies and
re-serialised as pretty JSON, so the parsers are pinned to the venue's envelope
rather than to a hand-written object. Whitespace is not the wire's — only the
JSON values are the capture. Any secrets are stripped: these envelopes carry no
API key, no signature and no account data.

| File | Endpoint | Captured | Entries |
|---|---|---|---|
| `unfilled-orders-empty.json` | `GET /api/v3/trade/unfilled-orders?category=USDT-FUTURES` | 2026-10-03 | none (`list: []`) |
| `history-orders-empty.json` | `GET /api/v3/trade/history-orders?category=USDT-FUTURES` | 2026-10-04 | none (`list: []`) |

`[]` means "no order in the queried window", not "no orders on the account": the
query carried `category` only.

**No populated order has been captured.** Both files prove the envelope
(`data` is `{ list, cursor }`, not an array) and the empty-list spelling. They
carry no field name for an order entry — those come from the vendor's
documented samples, labelled as such in
`src/utils/server/venues/bitgetUtaReads.test.ts`. The missing filled-order
capture is tracked in BUG-0590; do not add a populated fixture without real
captured bytes.

The WebSocket fixtures one level up belong to the adapter conformance suite
(`adapterConformance.test.ts`). These are REST reads, loaded by
`bitgetUtaReads.test.ts`.
