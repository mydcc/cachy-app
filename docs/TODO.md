# TODO

Open items that need a decision or an action from a person, as opposed to work
that is planned and specified. Planned engineering work lives in
[`ROADMAP.md`](ROADMAP.md); this is the shorter list of things waiting on you.

Add entries as they come up. Keep the "why it is here" line — an entry nobody
can act on without re-deriving the context is how the roadmap got long.

---

## 1. Rotate the imgbb API key — and decide whether it stays

**Roadmap item 24e.** Needs your decision, but one part is not optional.

`defaultSettings.imgbbApiKey` in `src/stores/settings.svelte.ts` is not empty
like every other credential — it holds a real 32-character imgbb key.
`imgbbService.ts` uploads screenshots with whatever is in that field, so **every
user of every build shares one imgbb account**, and the key ships in the client
bundle by construction.

**Do this regardless of what you decide:** the key is in the git history, so
removing it from the code would not undo the exposure. It has to be **rotated at
imgbb**.

Then choose:

| Option | Consequence |
| --- | --- |
| **Rotate, keep a shared key as the default** | Screenshot upload keeps working out of the box for everyone. The new key is exposed the same way the old one was — acceptable only if you are content with a shared free-tier account being public. |
| **Rotate, remove the default, let users enter their own** | No shared key anywhere. Screenshot upload stops working until each user registers an imgbb key and enters it in Settings. |

It was deliberately not deleted during the cleanup: unlike the `VITE_*` key
fallbacks, this one is load-bearing, and removing it silently breaks a feature.

---

## 2. Numbers are stored where the trade state declares strings

**Roadmap item 21.** Surfaced by typing `tradeState.update()` / `set()`, which
were `(curr: any) => any`. Giving them the real `TradeStateSnapshot` type made
the typechecker reject three call sites — so the signature was **left as `any`
with an explicit `eslint-disable` and a comment**, rather than casting the
disagreement away.

`TradeStateSnapshot` declares:

```ts
entryPrice: string | null;
targets: TradeTarget[];        // TradeTarget.price: string | null
```

Callers pass numbers:

| Site | What it passes |
| --- | --- |
| `src/services/app.ts:130` | `targets: [{ price: 120000, percent: 50 }]` |
| `src/components/shared/MarketOverview.svelte:356` | `newState.entryPrice = new Decimal(...).toNumber()` |
| `src/lib/presets.ts:97` | a snapshot whose fields disagree the same way |

**Why it is not merely cosmetic.** `trade.svelte.ts` filters targets with:

```ts
(t) => t.price !== null && t.price !== "0"
```

`"0" !== "0"` is false, so a string zero is filtered out — as intended. But
`0 !== "0"` is **true**, so a *numeric* zero price passes a filter written to
remove zero-price targets. Demonstrated in isolation; **not** demonstrated to
occur in practice, because no path was traced that puts a numeric `0` there.
Treat that as the open question, not as a known bug.

**The decision:** either fix the callers to pass strings, or widen the declared
types to `string | number` and make every comparison go through `Decimal`. The
second is more honest about what the store actually holds; the first keeps the
comparisons simple. Both are better than the current state, where the type says
one thing and three callers do another.

## 3. Bitget WS order/position sync sends field names the account store never reads

**Roadmap item 21.** Found while typing the `any`-cast payloads in
`bitgetWs.ts`'s `handleMessage()`. Not fixed here — it is a live-trading
correctness bug, not a typing nit, and needs its own verified fix with a
test, not a drive-by inside a lint pass.

`accountState.updatePositionFromWs(data)` and `.updateOrderFromWs(data)`
(`src/stores/account.svelte.ts:68` and `:157`) are shared between the
Bitunix and Bitget WS handlers. Their field reads match **Bitunix's** raw
payload naming — `data.qty`, `data.positionId`, `data.orderStatus`,
`data.dealAmount`, `data.ctime`. `bitgetWs.ts`'s `handleMessage()`
(around line 489 for positions, line 471 for orders) builds a differently
-shaped object for Bitget:

| Function reads | Bitget's `handleMessage()` sends instead |
| --- | --- |
| `data.positionId` | *(not sent at all)* |
| `data.qty` | `size` |
| `data.orderStatus` | `status` |
| `data.dealAmount` | `filled` |
| `data.ctime` | *(not sent at all)* |

Two concrete consequences, both provable by reading the two call sites
side by side, not yet confirmed against a live Bitget account:

- `updatePositionFromWs`'s `isClose` check is
  `data.event === "CLOSE" || new Decimal(data.qty || 0).isZero()`. Since
  Bitget never sends `qty`, this evaluates to `true` on *every* position
  update, so the function only ever takes its splice-if-present branch —
  a newly opened Bitget position is never added to `accountState.positions`
  via WS.
- Every position that *is* somehow present is keyed by
  `String(data.positionId)`, which is `"undefined"` for every Bitget
  update (the field is never sent) — a second symbol's update would match
  and overwrite the first symbol's slot instead of creating its own.

**The decision:** either give `bitgetWs.ts` its own
`updatePositionFromWs`/`updateOrderFromWs`-equivalent that reads Bitget's
actual field names, or normalize Bitget's payload to the Bitunix field
names before calling the shared functions. Either way, this needs a test
that fails without the fix before being called done — the same discipline
that caught two overstated bug claims earlier in this item (see the
"Pass one" and "Pass nine" entries in `ROADMAP.md`'s item 21 log).

**A second, related finding in the same function, possibly why the first
one never surfaced in practice.** `handleMessage()` parses every incoming
message through `BitgetWSMessageSchema.safeParse(message)` before doing
anything else (`bitgetWs.ts:369`). That schema requires `action: z.string()`
and does not declare `event`/`code` fields and is not `.passthrough()`, so
a Bitget login acknowledgement shaped `{ event: "login", code: "00000" }`
either fails validation outright (if it has no `action` field, `safeParse`
returns `success: false` and the function returns before reaching the
login check) or, even if it somehow also carries an `action`, has `event`
and `code` stripped by zod before the login check ever sees them. The
code comment directly above the check already flags this uncertainty
("Assuming action is login for response? ... I might need to adjust
schema"). If this reads correctly, `isAuthenticated` never becomes `true`
via this path, `subscribePrivate()` never fires, and the private
order/position channels this file forwards to `accountState` never
actually get subscribed to over Bitget — which would make the field-name
mismatch above moot in practice, but leaves Bitget account sync silently
non-functional rather than merely wrong. Needs the same treatment: confirm
against a real Bitget login response, then fix the schema (or the check)
with a test.

## Add new items below

<!--
Template:

## N. Short title

**Where it came from.** One line, so the entry survives without you.

What has to happen, and what the options are.
-->
