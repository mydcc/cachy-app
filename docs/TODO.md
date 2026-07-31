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

## 4. GPU-accelerated CHOP (Choppiness) indicator writes to a field nobody reads

**Roadmap item 21.** Found while typing `webGpuCalculator.ts`'s
`injectResult()`. Low severity (WebGPU is the optional acceleration path,
most users run the WASM/CPU calculator), not fixed here — needs the same
"confirm with a test" treatment as everything else in this file.

`injectResult(..., category: 'volatility')` is only ever called for one
indicator: `this.injectResult(result, 'CHOP', chop, closes, 'volatility')`
(`webGpuCalculator.ts:526`). It writes the value to
`result.volatility['CHOP']` — a key `TechnicalsData.volatility` doesn't
declare (only `atr`/`bb` are declared fields).

The WASM/CPU reference implementation computes the same indicator
differently: `wasmCalculator.ts:320-324` puts it under
`result.advanced.choppiness = { value, state }`, a completely different
location with a completely different shape (an object with `value`/`state`,
not a bare number).

**Consequence, not yet confirmed against a running app:** whatever UI reads
Choppiness data presumably reads `result.advanced.choppiness` (matching the
WASM path, the one most users run) — if so, the GPU path's CHOP value is
computed and then written somewhere nothing reads, i.e. the Choppiness
indicator silently doesn't update for users on the GPU acceleration path.
**The decision:** confirm what the UI actually reads, then either move the
GPU path's CHOP output to `result.advanced.choppiness` to match, or decide
`volatility.CHOP` is the intended home and update the WASM path and the
`TechnicalsData` type to match instead.

## 5. `src/utils/WasmTechnicalsCalculator.ts` appears to be unreachable

**Roadmap item 21.** Found while typing this file's `any` casts — worth
recording before the typing work makes it look more alive than it is.

Nothing in `src/` imports or instantiates `WasmTechnicalsCalculator`. The
only other reference in the repository is
`tests/integration/wasm_parity.test.ts`, which mentions it in comments
only (never imports it) and whose one real test is `it.skip(...)`. The
class this project actually uses for WASM-accelerated technicals is a
different file, `src/services/wasmCalculator.ts` (wired into
`technicalsService.ts`, cleaned in the same pass as this one) — this looks
like an earlier implementation that was superseded and never removed.

**The decision:** either delete `src/utils/WasmTechnicalsCalculator.ts`
(and update or remove the comments in `wasm_parity.test.ts` that refer to
it), or, if it's kept intentionally for a reason not visible from the code
alone, say what that reason is so the next pass doesn't re-flag it. Left
in place and merely typed here per this repo's defensive-deletion rule:
code whose purpose isn't fully clear doesn't get deleted without a person
confirming it's safe to.

## 6. `forceRecalculateAtr()` in JournalContent.svelte has no trigger

**Roadmap item 21.** Found while typing/cleaning this file's unused-var
warnings. Small, low-risk gap — a maintenance action, not a correctness
bug — left in place rather than guessed at.

`JournalContent.svelte` defines a complete, working
`forceRecalculateAtr()`: it confirms with the user
(`journal.confirmRecalculateAtr`), shows loading/progress feedback
(`journal.messages.atrRecalcStart`), calls
`dataRepairService.repairMissingAtr(..., true)` — the `true` forces a
recalculation even for trades the scan doesn't flag as missing ATR — and
reports success or failure. Dedicated i18n strings exist for all of it.
But nothing in the file calls it: no button, no menu entry, no keyboard
shortcut.

For context, `journal.svelte.ts`'s `autoCalculateMissingAtr()` already
runs a silent background repair automatically on load for trades the scan
detects as missing ATR (`repairMissingAtr(callback)`, no force flag, no
UI feedback by design). `forceRecalculateAtr` reads like the manual
escape hatch for cases the automatic scan misses — useful, but only if a
person can actually reach it.

**The decision:** add a trigger (a button, likely near the other journal
maintenance/import actions) and decide the copy, or decide the automatic
repair is sufficient and remove this function. Left in place, not
removed, since a fully-built feature with prepared translations is not
"purpose unclear" — it's "purpose clear, UI incomplete," which needs a
placement decision, not deletion.

## 7. Sentiment cache and AI response are trusted without schema validation

**Roadmap item 21.** Found while removing two unused Zod schemas from
`newsService.ts` during a lint pass — worth recording before the removal
makes the gap invisible.

`newsService.ts` had `SentimentAnalysisSchema` and `SentimentCacheSchema`
defined but never referenced anywhere. `analyzeSentiment()` instead trusts
two values by direct cast, no validation:

- The IDB read: `dbService.get<{ data: SentimentAnalysis; timestamp: number;
  newsHash: string }>("sentiment", newsHash)` — a type parameter, not a
  runtime check.
- The AI provider's response: `const analysis: SentimentAnalysis =
  data.analysis;` — same thing, a type annotation on untrusted JSON from
  `/api/sentiment`.

This is inconsistent with the rest of the file: `fetchNews()` validates its
IDB cache read through `NewsCacheEntrySchema.safeParse()` a few lines above
(clearing and re-fetching on mismatch), and the CryptoPanic/NewsAPI
responses are validated server-side against `CryptoPanicResponseSchema` /
`NewsApiResponseSchema` before this file ever sees them. The sentiment path
is the one place that skips it.

**Consequence, not yet demonstrated:** a malformed or schema-drifted AI
response (or a stale/corrupted IDB entry) would flow straight into
`SentimentAnalysis`-typed state and out to the UI — `regime` outside the
four expected values, missing `score`, etc. — instead of being caught and
falling back to the existing neutral-sentiment error path this function
already has for every other failure mode.

**The decision:** wire the two schemas back in — `safeParse()` the IDB read
before trusting `cached.data`, and `safeParse()` `data.analysis` before
assigning it, falling back to the same `{score: 0, regime: "UNCERTAIN", ...}`
response the `catch` block already returns on any other failure. Left as a
lint-pass finding rather than fixed inline because it adds a new rejection
branch to a live external-AI call path, which needs its own test rather
than a drive-by change.

## 8. `src/lib/windows/implementations/ContentWindow.svelte.ts` appears to be unreachable

**Roadmap item 21.** Found while typing this file's `any` casts during a
lint pass — the same shape of finding as item 5
(`WasmTechnicalsCalculator.ts`).

Nothing in `src/` imports or instantiates `ContentWindow` — a `grep -rl
"ContentWindow" src` turns up only its own file. It's a small, generic
"wrap any Svelte component in a window" class (`component`, `title`,
`options.props`), structurally similar to `ModalWindow` and `IframeWindow`,
both of which *do* have real callers via `windowManager.openModal()` /
`.openIframe()`. `ContentWindow` has no equivalent `windowManager` method
and no direct construction site anywhere.

**The decision:** either wire it up (a `windowManager.openContent()` or
similar, if the generic-component-window capability is still wanted), or
delete it if `ModalWindow`/`IframeWindow` already cover every case it was
meant for. Left in place and merely typed here per this repo's
defensive-deletion rule: code whose purpose isn't fully clear doesn't get
deleted without a person confirming it's safe to.

## Add new items below

<!--
Template:

## N. Short title

**Where it came from.** One line, so the entry survives without you.

What has to happen, and what the options are.
-->
