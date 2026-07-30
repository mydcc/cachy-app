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

## Add new items below

<!--
Template:

## N. Short title

**Where it came from.** One line, so the entry survives without you.

What has to happen, and what the options are.
-->
