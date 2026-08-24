Code Review for 159f57c

**Verdict:** FEAT-0017 acceptance criteria are met and the capability model is well-architected — but a critical integration bug remains: `tradeService.placeOrder` still applies a `?? "GTC"` default that defeats the capability-aware logic in `orderPlacementService`, so every Bitget limit entry reaches the gate carrying `effect: "GTC"` and is refused.

---

### Acceptance Criteria (FEAT-0017)
- ✅ Capabilities declared per adapter (`bitunixCapabilities.ts` / `bitgetCapabilities.ts`), adapter reads its own, panel reads the same through `capabilitiesOf`
- ✅ Unsupported controls rendered disabled *with reason*, tested against both venues (`PlaceOrderPanel.capabilities.component.test.ts`)
- ✅ Gate refuses independently of the UI — it looks capabilities up itself rather than trusting `displayed`
- ✅ Per-symbol step sizes / leverage bounds kept (stricter than exchange-wide fields)
- ✅ Venue isolation pinned: separate declaration objects, no shared array instances, everything frozen

**Out of Scope:** Respected. BUG-0297 is documented and pinned by tests, not fixed here — correct call for money-safety logic.

---

### Non-Negotiable Rules
- **Svelte 5 runes only** — Clean. `PlaceOrderPanel.svelte` uses `$derived`, `$state`, snippets; no `export let`, `$:`, `createEventDispatcher`, or `<slot>`.
- **decimal.js for all financial values** — Clean. New gate logic compares counts/strings; no native `number` for prices/amounts.
- **No hardcoded colors** — Clean. CSS uses `var(--bg-primary)`, `var(--accent-color)`, etc. and paired classes from `src/themes.css`.
- **Local-First boundary** — Clean. Capability modules are import-free data; `orderGate` imports nothing but `decimal.js`. No `src/lib/spacetimedb/` or `src/services/cloudService.ts` in core code.
- **Every `$effect` has cleanup** — No new `$effect` added in this PR.

---

### Critical Correctness Finding: Silent GTC Re-introduction in `tradeService`

**File:** `src/services/tradeService.ts:878`
```ts
effect: orderType === "MARKET" ? undefined : (params.effect ?? "GTC"),
```

**What happens:**
1. `orderPlacementService` correctly computes `effect = undefined` for Bitget (which declares `timeInForce: []`) — it drops *only* GTC, lets IOC/FOK/POST_ONLY through for the gate to refuse loudly.
2. It calls `tradeService.placeOrder({ ..., effect: undefined })`.
3. `tradeService` ignores the explicit `undefined` and reapplies `"GTC"` via `?? "GTC"`.
4. The payload reaches `orderGate` with `effect: "GTC"`.
5. `orderGate` refuses it as `unsupportedTimeInForce` — a value the trader never chose (the UI showed "—").

**Why the tests didn't catch it:**
- `orderPlacementService.test.ts` mocks `tradeService.placeOrder`, so it only verifies what *orderPlacementService* passes to the mock (which is `undefined` — correct).
- `orderGate.capabilities.test.ts` builds payloads directly, bypassing `tradeService`.
- No test exercises the real chain: `placeEntryGroup → tradeService.placeOrder → gate` for a no-TIF venue.

**Fix direction:** Remove the `?? "GTC"` default in `tradeService`. The caller (`orderPlacementService`, or any direct caller) is now responsible for providing the correct effect. If they want GTC, pass `"GTC"`; if the venue takes none, pass `undefined`. This matches the "refuse, don't guess" philosophy of the PR.

---

### Other Findings (Minor / Already Addressed)

1. **Trigger coverage at the gate** — Fixed in `159f57c`. `entryTypeOf` now returns three outcomes (`known`/`unreadable`/`absent`); unreadable is refused, trigger spellings map to `trigger` for capability checking.

2. **Silent TIF downgrade in `orderPlacementService`** — Fixed in `159f57c`. Only GTC is dropped; IOC/FOK/POST_ONLY travel and the gate refuses them.

3. **Ladder check nesting** — Fixed in `159f57c`. Now keyed on `payload.tpPrice` (not inside `attachesProtection` branch).

4. **Audit trail overclaim** — Fixed. `checked` records only comparisons that actually ran.

5. **DE copy** — Fixed: "verfallen" → "verworfen" in `de.json`.

6. **Accessibility** — Fixed. Disabled TIF select carries reason as `aria-label` (not just `title`).

7. **Prototype-chain guard** — Excellent. `capabilitiesOf` uses `Object.prototype.hasOwnProperty.call` with tests for `"constructor"`/`"toString"` — correct given venue id comes from user-writable localStorage.

---

### CI Status
- `npm run check`: **0 errors** (3 warnings, pre-existing)
- `npm test`: **2214 passed, 0 failed**
- `check_translations.sh`: 0 missing, 0 empty, 0 one-sided
- Conventional Commits: The PR description has `Fixes #1781`; commit messages in this branch do not carry closing keywords.

---

### Sensitivity Check
- `area: exchange` — this PR
- Surfaces **BUG-0297** (`area: execution`, P1) — a `tpSlAtEntry: false` venue cannot produce an accepted entry order at all (size rule needs displayed stop, price rule demands payload stop, capability forbids sending one). Properly documented, pinned by test, not fixed here.

👤 **Human review recommended before merge** — especially on whether shipping the capability gate while every Bitget calculator entry is deadlocked by BUG-0297 *and* the GTC fallback is acceptable for this release.

---

### Summary
The capability model itself is genuinely well-built — the "two paths agree by construction" property with tests pinning identity between adapter and aggregator is exactly how this should be modeled. **But the `tradeService` fallback must be fixed before merge**, otherwise Bitget limit entries are silently broken (refused for a TIF the user never selected, masked today only by BUG-0297).

Nice work on the infrastructure — the honest deviations section and disabled-with-reason rule made this a pleasure to review. 🎯