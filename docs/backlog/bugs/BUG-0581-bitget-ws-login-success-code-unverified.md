---
id: BUG-0581
title: "Bitget WebSocket login success may never be detected because the vendor documents code \"0\" but Cachy tests \"00000\""
type: bug
status: in-progress
priority: P2
area: exchange
created: "2026-09-28"
milestone: none
editions: ["community", "pro", "private"]
data_class: none
adr: none
depends_on: []
assignee: opencode
---

# Verify the Bitget WebSocket login success code before trusting private streams

## Resolution (2026-10-03, verified live)

**Answer: neither hypothesis in this item is right.** Bitget sends `code` as the
JSON **number** `0`:

```json
{"event":"login","code":0,"connId":"0621ccfffe50d3cd-000019e1-00e0283f-…"}
```

Four connections, both private hosts (`wss://ws.bitget.com/v3/ws/private` and
`wss://ws.bitget.com/v2/ws/private`), identical answer. Consequences for the
check at `src/services/bitgetWs.ts:469`:

| Comparison | Result |
|---|---|
| `msg.code === "00000"` | fails — the bug this item predicted |
| `msg.code === "0"` | **also fails** — strict equality against a number |
| `msg.code === 0` | the only form that matches |

So the fix is not "accept `"0"` instead of `"00000"`" — it is to stop
string-comparing a field whose type varies by generation.

Two side findings:

- **Timestamp unit does not matter.** Milliseconds and seconds were each accepted
  with a signature computed over the value sent, on both hosts. The doc
  self-contradiction recorded in `docs/bitget-api/01_sign.md` (prose says ms,
  Java sample and wire example say seconds) has no effect on the venue. Not
  tested: whether a *wrong* WS signature is rejected.
- **The 40085 UTA gate is REST-only.** A UTA account can open
  `wss://ws.bitget.com/v2/ws/private` and log in successfully.

Evidence and captures: `docs/bitget-api/14_uta_v3.md`. Remaining work on this
item is the one-line check in `bitgetWs.ts`; the code change is not made yet, so
the status stays `in-progress`.

## Symptom

Cachy recognises a successful Bitget WebSocket login only when the venue
answers with `code: "00000"`:

```ts
// src/services/bitgetWs.ts:469
if (msg.event === "login" && msg.code === "00000") {
  this.isAuthenticated = true;
  …
  this.subscribePrivate();
  return;
}
```

Bitget's WebSocket documentation shows login success as `code: "0"` — a single
zero, not the five-character `"00000"` that every REST endpoint uses.

If the venue sends `"0"`, this branch never fires. The consequences cascade in
the worst possible direction, because nothing reports the failure:

- `isAuthenticated` stays `false`, so the reconnect guard keeps the socket
  cycling instead of settling into an authenticated session.
- `subscribePrivate()` is never called, so **no order, position or account push
  is ever requested**.
- The public channels the socket is already subscribed to keep working, so
  tickers and klines flow normally.

The visible result is a socket that reports healthy — live prices, an open
connection, no errors in the log — while carrying **no private stream at all**.
Order and position state then only ever comes from REST polling, which is
slower and, for anything the polls do not cover, absent.

This is the same silent-degradation shape as BUG-0579 on the Bitunix side: a
condition that is not an error and produces no signal.

## Evidence

**Vendor, verbatim**, from the WebSocket introduction page, transcribed in
[`docs/bitget-api/01_sign.md`](../../bitget-api/01_sign.md):

```json
{ "event": "login", "code": "0", "msg": "" }
```

and the failure case on the same page:

```json
{ "event": "error", "code": "30005", "msg": "error" }
```

**REST, by contrast**, uses `"00000"` throughout — the success value in the
response envelope, in every documented example, and in the code that checks it
(`src/utils/server/venues/bitget.ts`, which holds eight `!== "00000"` success
checks). `src/types/apiSchemas.ts` does **not** check the value: it types
`code` as `z.union([z.number(), z.string()])` and performs no success test, so
it neither supports nor contradicts the observation.

**A third spelling exists in Bitget's own material.** Bitget's best-practices
guidance, transcribed in [`docs/bitget-api/13_vendor_guidance.md`](../../bitget-api/13_vendor_guidance.md),
shows a WebSocket response frame with `"code": 0` as a **JSON number**, not a
string. So across three Bitget sources the login code appears as a number `0`,
a string `"0"`, and (by REST convention) the string `"00000"`.

**The same page is already known to be wrong elsewhere.** The WebSocket
timestamp field is documented in the same prose as milliseconds while every code
sample and the concrete wire example on that page use seconds. That one is
resolved — seconds is correct, and Cachy is right. It is recorded here because
it means the page cannot be treated as authoritative on its own: it has a
demonstrated defect, which is exactly why the `"0"` versus `"00000"` question
has to be answered by observation rather than by picking the tidier reading.

**Unverified.** No authenticated WebSocket connection has been made, so it is
not established whether the venue sends `"0"`, `"00000"`, `0`, or something
else.

**The schema is not the blocker, and two existing items are stale on this
point.** `BitgetWSMessageSchema` (`src/types/bitgetValidation.ts:36-37`) admits
`code` and `event` as optional strings and refines only on
`action || event` — a login frame carrying `event` passes, so `msg.code` does
reach the comparison at `bitgetWs.ts:469`. The spelling is therefore the only
open question. `BUG-0001` (closed) and item 3 in `docs/TODO.md` both assert the
schema "does not declare `event`/`code`" and conclude the login branch can
never fire. That is no longer true of the code, and `BUG-0001` carrying
`status: done` lends the stale claim false authority — a reader who checks it
will conclude the fix belongs in the schema rather than in the comparison.

## Cause

Same class as BUG-0580: a wire-format detail is pinned in code on the strength
of a convention inferred from a different part of the API (REST), while the part
of the API that actually governs it (WebSocket) documents something else. No
observation backs either spelling.

There is a second, independent weakness worth fixing regardless of the answer:
the check is an exact string comparison on a field whose format the vendor
documents inconsistently. A tolerant check would have survived the discrepancy
instead of failing closed and silently.

## Fix

**Ask Bitget, or observe one login frame.** The question is small enough to ride
along with the BUG-0580 enquiry to the same support channel:

> On the V2 WebSocket private endpoint, what is the exact `code` value in the
> successful `login` response frame? Is it `"0"`, `"00000"`, or something else?

Without that, one authenticated connection to
`wss://ws.bitget.com/v2/ws/private` plus a login frame answers it, and Bitget
also offers demo trading on a separate host (`wss://wspap.bitget.com/v2/ws/private`)
for anyone who would rather not use a funded key.

Then, regardless of the answer:

1. **Make the check tolerant.** Accept the documented spellings rather than one
   of them — `"00000"`, `"0"`, and numeric `0` all meaning success. Normalise
   before comparing. This is the change worth making even if the current value
   turns out to be right, because it removes a whole class of silent failure at
   the cost of one normalisation step.
2. **Add a negative test.** A `login` event with a non-success code must leave
   `isAuthenticated` false and must not call `subscribePrivate`. There is
   currently no test that would catch a login that silently fails to be
   recognised.
3. **Fail loudly on an unrecognised login response.** If a `login` event arrives
   whose code is not in the accepted set, log it and surface it. Right now any
   unexpected value falls through to the `if (!msg.arg || !msg.data) return;`
   guard and disappears.
4. **Record the answer** in
   [`docs/bitget-api/01_sign.md`](../../bitget-api/01_sign.md), replacing the
   unresolved marking.

**Sequencing note.** This is P2 rather than P1 because the Bitget socket is on
the decommissioned V1 endpoint anyway, so it is blocked behind BUG-0576's
migration. It becomes live the moment the WebSocket moves to V2 — and the V2
migration splits one socket into two (`/v2/ws/public` + `/v2/ws/private`), which
means the private socket's login is about to be written or re-verified anyway.
Fold the verification into that work rather than doing it twice.

## Acceptance criteria

- [ ] Bitget support has confirmed the login success code, **or** one
      authenticated login frame has been observed and its `code` recorded
      verbatim — **open**: needs one authenticated connection (demo host
      `wss://wspap.bitget.com/v2/ws/private` suffices, no funded key).
      The tolerance below makes the code correct under every documented
      spelling; the observation decides which one is real.
- [x] The success check accepts every spelling the venue or the best-practices
      guidance actually uses, rather than one exact string — `"00000"`, `"0"`,
      numeric `0` (normalized via `String()`; schema widened to
      `string | number` so the numeric frame reaches the check)
- [x] A test asserts that a non-success `login` code leaves `isAuthenticated`
      false and does not trigger `subscribePrivate`
- [x] An unrecognised `login` code produces a visible log or state rather than
      falling through silently — `logger.warn` with the code, plus explicit
      `return` so the frame can never slide into channel parsing
- [x] `src/services/bitgetWs.ts:469` no longer relies on a single hard-coded
      string without a recorded source
- [ ] [`docs/bitget-api/01_sign.md`](../../bitget-api/01_sign.md) records the
      answer in place of the current unresolved marking — **open**, with AC1
- [ ] The V2 WebSocket migration in BUG-0576 reuses this check rather than
      reimplementing it — pending that migration; the normalized block is
      written to be moved verbatim

## Progress 2026-09-30 (code half, no venue)

Tests first: the two tolerance tests and the loud-log test fail on the old
code (3 failed / 3 passed), suite 12/12 green with the fix
(`src/services/bitgetWs.test.ts` + `bitgetWs.leak.test.ts`), plus 6/6 in
`apiSchemas.money.test.ts` (only other consumer of the validation module).
No venue was contacted — nothing here asserts which spelling the venue sends.

## Links

- BUG-0576 — the V2 migration; this becomes live with the WebSocket split
- BUG-0580 — the other unverified Bitget signing detail, same vendor and the
  same support enquiry
- BUG-0001 — never guess an exchange's wire format for a call that moves money
- [`docs/bitget-api/01_sign.md`](../../bitget-api/01_sign.md) — the vendor
  transcription and the current unresolved marking
- [`docs/bitget-api/07_websocket.md`](../../bitget-api/07_websocket.md) — the
  socket this gates
