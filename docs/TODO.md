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

## 9. `src/utils/wasmTechnicals.ts` appears to be unreachable

**Roadmap item 21.** Found while typing this file's `any` casts during a
lint pass — the same shape of finding as items 5 and 8
(`WasmTechnicalsCalculator.ts`, `ContentWindow.svelte.ts`).

Nothing in `src/` imports `loadWasm()`, `isWasmAvailable()`, or
`WASM_SUPPORTED_INDICATORS` from this file — a `grep -rln` for both
`from ".../wasmTechnicals"` and a bare `wasmTechnicals\b` (excluding the
file's own definition line) both come back empty. The project's actual
WASM-accelerated technicals path goes through `src/services/wasmCalculator.ts`
(see item 5's note that this is the file that's actually wired into
`technicalsService.ts`) — this file reads like an earlier or
alternative loader for the same `technicals_wasm.js`/`.wasm` static
assets, superseded and never removed.

**The decision:** either delete `src/utils/wasmTechnicals.ts`, or, if
it's kept intentionally (e.g. as a planned entry point for a future
loader consolidation), say what that reason is so the next pass doesn't
re-flag it. Left in place and merely typed here per this repo's
defensive-deletion rule: code whose purpose isn't fully clear doesn't
get deleted without a person confirming it's safe to.

## 10. `SymbolPickerWindow` can resolve its Promise with `null`, but the Promise's type says `boolean | string`

**Roadmap item 21.** Found while typing this class's `any` casts during a
lint pass — recording before the typing makes the mismatch invisible
again.

`stores/modal.svelte.ts`'s `showModal()` constructs `new
Promise<boolean | string>((resolve) => { ... new SymbolPickerWindow(resolve)
... })` for the `'symbolPicker'` case. `SymbolPickerWindow` calls that
`resolve` two ways:

- `closeWith(value)` (called from `SymbolPickerView.svelte`'s
  `selectSymbol()`) — always a real symbol `string`.
- `destroy()` — calls `resolve(null)` unconditionally if the window is
  closed without a selection (e.g. the user clicks away or hits Escape),
  explicitly to signal "closed without selection."

`null` is not `boolean | string`. Any caller of `showModal(..., 'symbolPicker')`
that does `const result = await showModal(...)` and treats the result as
always a `string` (or always truthy/falsy in the `boolean` sense) will get
a real `null` on cancel instead — a shape the type signature says can't
happen.

**Consequence, not yet demonstrated:** whether this causes a visible bug
depends on how each caller of the symbol-picker modal handles the awaited
result — if a caller does e.g. `result.toUpperCase()` assuming `result` is
always a string, a cancel would throw.

**The decision:** either widen `showModal()`'s return type for the
`'symbolPicker'` case to `Promise<boolean | string | null>` (and update
every caller to handle `null`), or change `SymbolPickerWindow.destroy()`
to resolve with `false` instead of `null` to match the existing
`boolean | string` contract. Left as a lint-pass finding rather than
fixed inline because it changes a return type/call contract other code
depends on, not something safe to guess at without checking every caller.

## 11. `src/services/workerPool.ts` appears to be unreachable

**Roadmap item 21.** Found while typing this file's `any` casts during a
lint pass — the same shape of finding as items 5, 8, and 9.

Nothing in `src/` imports or instantiates `WorkerPool` — `grep -rln
"workerPool\b" src` (excluding the file's own definition and its test)
comes back empty. Its own test file (`workerPool.test.ts`) exercises it
directly, but no production code ever constructs a pool or calls
`execute()`. The class is a complete, generic wrapper for
`technicals.worker.ts` (a fixed pool of workers, task queuing, timeout-
based recycling), structurally ready to use but not wired into anything
that calculates technicals today — that path currently goes through
different code (see `technicalsService.ts`/`wasmCalculator.ts`, the
files item 5 already identified as what's actually used).

**The decision:** either wire `WorkerPool` in somewhere (it looks built
for exactly the multi-symbol-dashboard parallelism `engineBenchmark.ts`'s
docstring describes), or delete it if the calculation path it was meant
to accelerate is already covered elsewhere. Left in place and merely
typed here per this repo's defensive-deletion rule: code whose purpose
isn't fully clear doesn't get deleted without a person confirming it's
safe to.

## 12. Legacy AES-CBC blobs may no longer be decryptable — `LEGACY_ITERATIONS` was dropped in the Web Crypto rewrite

**Roadmap item 21.** Found while looking for a home for two newly-unused
constants (`LEGACY_ITERATIONS`, `IV_SIZE_CBC`) flagged by a lint pass —
`git log`/`git show` on the file traced the regression before deciding
whether the constants were safe to delete.

`src/services/cryptoService.ts` predates commit `560a15c7` ("feat:
Implementation of a new crypto service with Web Crypto API...") as a
CryptoJS-based implementation. That old version's decrypt path tried
**three** PBKDF2 configurations in order before giving up:

```ts
const attempts = [
  { iter: STRONG_ITERATIONS, hash: "SHA-256" },
  { iter: STRONG_ITERATIONS, hash: "SHA-1" },
  { iter: LEGACY_ITERATIONS, hash: "SHA-1" },  // for blobs older still
];
```

Commit `560a15c7` rewrote the file to use `window.crypto.subtle`
directly and kept the `AES-CBC` blob-format tag (`EncryptedBlob.method
=== "AES-CBC"`) as the marker for "this is a legacy blob," but dropped
the iteration-count fallback entirely. Today's `attemptDecrypt()`
(the `blob.method !== "AES-GCM"` branch) always derives the key with
`STRONG_ITERATIONS` (600000), regardless of the blob's age. The
`LEGACY_ITERATIONS` (10000) and `IV_SIZE_CBC` constants are what's left
of the old fallback — declared, never read by the new implementation.

**Consequence, not yet demonstrated against a real old blob.** `encrypt()`
only ever produces `method: "AES-GCM"` today, so this only affects
pre-rewrite `AES-CBC` blobs a user might still be carrying around (e.g.
in an old exported backup file, or migrated `localStorage` that was
never re-encrypted since). If such a blob was originally encrypted at
`LEGACY_ITERATIONS`, decrypting it now derives the wrong key at
`STRONG_ITERATIONS` — for AES-CBC specifically, which has no
authentication tag, a wrong key does not throw, it silently produces
garbage plaintext (the file's own comment on `decrypt()` already notes
this: *"AES-CBC lacks an authentication tag, so decrypting with the
wrong key can silently return garbage instead of throwing"*).

**The decision:** either restore a `LEGACY_ITERATIONS` retry inside the
`AES-CBC` branch of `attemptDecrypt()` (mirroring the old
`STRONG_ITERATIONS` → `LEGACY_ITERATIONS` fallback order, now via
`crypto.subtle.deriveKey` instead of CryptoJS), or confirm no
production blob still uses the pre-rewrite iteration count (e.g.
because every user has since re-saved their credentials, which
re-encrypts at `STRONG_ITERATIONS`/`AES-GCM`) and delete both constants
as confirmed-dead. Left as a lint-pass finding rather than fixed
inline because Klasse-A credential decryption needs a verified fix
with a test reproducing a real legacy blob, not a drive-by guess at
the missing fallback's exact shape.

## 13. `src/service-worker.ts` declares a runtime cache with a size bound that's never used

**Roadmap item 21.** Found while looking for a home for an unused
`MAX_RUNTIME_CACHE_ENTRIES` constant flagged by a lint pass.

The service worker declares two cache names: `CACHE` (build-time
assets) and `RUNTIME_CACHE` (for presumably dynamically-fetched,
non-build assets), plus `MAX_RUNTIME_CACHE_ENTRIES = 50` clearly meant
to bound the runtime cache's size (an LRU-style eviction policy is the
usual reason to track an entry-count cap). In the code as it stands:

- `RUNTIME_CACHE` is referenced exactly once — in `deleteOldCaches()`,
  to *exclude* it from deletion (`key !== CACHE && key !== RUNTIME_CACHE`).
  Nothing ever calls `caches.open(RUNTIME_CACHE)` or writes to it.
- `MAX_RUNTIME_CACHE_ENTRIES` is never read anywhere.
- The `fetch` handler's `respond()` function only ever opens `CACHE`,
  and only caches a response when `ASSETS.includes(url.pathname)` —
  i.e. only build-time assets get cached at all. Anything fetched at
  runtime that isn't in the build's static asset list (API responses
  aside, which are explicitly excluded) is never cached, runtime or
  otherwise.

**Consequence:** this reads like scaffolding for a runtime-caching
feature (cache dynamically-fetched assets too, bounded to the last N
entries) that was named and half-wired but never finished — not a bug
in the sense of wrong behavior, since nothing currently claims to
provide runtime caching, but a dead declaration next to an empty
implementation.

**The decision:** either implement the runtime cache (open
`RUNTIME_CACHE` in `respond()` for non-build-asset GET responses,
trim it to `MAX_RUNTIME_CACHE_ENTRIES` on write), or remove both
constants if build-time-only caching is intentional and sufficient.
Left as a lint-pass finding rather than fixed inline: service-worker
caching behavior affects offline support and cache staleness across
every user's PWA install, which needs deliberate design and testing
(does eviction go by insertion order or last-access order? does a
100th write evict silently or reject?), not a guess made while
clearing an unused-variable warning.

## 14. `OrderManagementSystem.pruneOrders()`'s "protected buffer" for recent orders is never enforced

**Roadmap item 21.** Found while tracing an unused `PRESERVE_LATEST`
constant flagged by a lint pass.

`omsService.ts`'s `pruneOrders(forceOne = false)` has two steps once
`this.orders.size > this.MAX_ORDERS`:

1. **Safe Prune:** remove the oldest *finalized* orders (`filled`,
   `cancelled`, `rejected`, `expired`), iterating oldest-first.
2. **Force Prune** (only if step 1 wasn't enough): delete the
   single absolute-oldest order, active or not. Its own comment says
   *"unless we are inside the protected buffer"*.

`const PRESERVE_LATEST = 20;` is declared right above both steps with
the comment *"Protect recent orders from being pruned immediately (UI
needs to see them)"* — but neither step reads it. Step 2 deletes
`this.orders.keys().next().value` (the literal oldest) unconditionally
whenever the map is over `MAX_ORDERS`, with no check for how recently
it was inserted.

**Consequence, not yet demonstrated against a live session:** under
sustained order volume, Force Prune can evict an order inserted only
moments ago (well inside the last 20) once the map fills past
`MAX_ORDERS`, even though the code's own comments say that shouldn't
happen. Whether this is visible to a user depends on `MAX_ORDERS`'s
value relative to real trading volume and how quickly orders finalize
— not evaluated here.

**The decision:** the exact intended rule isn't fully spelled out by
the comments (skip Force-Prune entirely while `orders.size <=
PRESERVE_LATEST`? Or always keep the most-recently-inserted
`PRESERVE_LATEST` orders untouched regardless of map size, falling
back to some other eviction candidate when everything left is
"recent"?) — needs a person to pick the rule, then implement it with a
test that fills the ring buffer and asserts a just-inserted order
survives. Left as a lint-pass finding rather than guessed at inline:
this is live order-tracking state for a real-money trading engine: a
wrong guess about the eviction rule is worse than the current gap.

## 15. `modalState.show()`'s `extraClasses` parameter is accepted but never applied

**Roadmap item 21.** Found while typing/cleaning an unused-parameter
warning on `ModalManager.show()`.

`show(title, message, type, defaultValue, extraClasses)` in
`modal.svelte.ts` takes an `extraClasses` string but never reads it —
neither `DialogWindow`'s constructor call nor `SymbolPickerWindow`'s
gets it passed through. `uiManager.ts`'s `showReadme()` calls `show(
..., "modal-size-instructions")` with a comment explaining exactly why:
*"Pass the 'modal-size-instructions' class here to ensure it uses the
updated 80vw width."* That class is a real, working mechanism
elsewhere — `ModalFrame.svelte` has its own `extraClasses` prop
(`class="modal-content glass-panel {extraClasses}"`) that
`AcademyModal.svelte` uses directly. But `modalState.show()`'s dialogs
render through `DialogWindow` → `DialogView.svelte`, which doesn't use
`ModalFrame.svelte` and has no `extraClasses`/sizing mechanism of its
own to receive it.

**Consequence:** the instructions modal (dashboard/journal/changelog
readme, opened via `uiManager.showReadme()`) never gets the wider
80vw layout the comment says it should — it renders at whatever
`DialogView.svelte`'s own fixed/default width is instead.

**The decision:** wiring this through means picking where the class
should land — `DialogWindow` would need a new field (mirroring how it
already threads `title`/`message`/`type`/`defaultValue`), and
`DialogView.svelte` would need to actually apply it to its root
element the way `ModalFrame.svelte` does. Left as a lint-pass finding
rather than fixed inline: it touches the shared window-rendering path
every `modalState.show()` alert/confirm/prompt goes through, so a
rushed change risks affecting more than the one instructions-modal
call site it was written for. The parameter itself is kept (not
deleted) with a `docs/TODO.md` pointer, since `uiManager.ts` still
depends on its position in the call signature.

## 16. Ichimoku's lagging span (Chikou Span) is accepted as a parameter but never computed

**Roadmap item 21.** Found while typing/cleaning an unused-parameter
warning on `JSIndicators.ichimoku()`.

`ichimoku(high, low, conversionPeriod, basePeriod, spanBPeriod,
laggingSpan2)` in `src/utils/indicators.ts` takes a `laggingSpan2`
parameter — both call sites pass a real value (`technicalsCalculator.ts`
passes the user's configured `displacement` setting, `indicators.test.ts`
passes a literal `5`) — but the function body never references it.
Conversion, base, and both spans (A and B, each correctly shifted forward
by `displacement`) are all computed; the return object's `lagging` field
is unconditionally `new Float64Array(0)`, an empty array.

**Consequence:** none currently, because nothing reads `.lagging` —
`grep -rn "\.lagging\b"` across `src/` turns up only the assignment
itself. `technicalsCalculator.ts` only destructures `conversion`/`base`/
`spanA`/`spanB` from the result. So this is a documented-but-inert gap,
not a live bug: standard Ichimoku display includes the Chikou (lagging)
span, and this implementation silently omits it rather than computing it
wrong.

**The decision:** either implement the lagging span (the Chikou Span is
typically `close` shifted *backward* by `laggingSpan2` periods, which
needs `close` threaded into `ichimoku()` — it isn't currently a
parameter) and wire `.lagging` into whatever chart component ends up
displaying it, or drop the parameter and rename/document `lagging` as
"reserved, not implemented" if Chikou Span support isn't planned. Left
as a lint-pass finding rather than guessed at inline: adding a new
parameter (`close`) to a shared indicator function's signature affects
every caller, and picking the wrong shift direction or source series
would ship a wrong-but-plausible-looking chart line.

## Add new items below

<!--
Template:

## N. Short title

**Where it came from.** One line, so the entry survives without you.

What has to happen, and what the options are.
-->
