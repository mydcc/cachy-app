---
id: BUG-0360
title: TradeCalculator drops trailing calculations when inputs change rapidly within throttle interval
type: bug
status: in-progress
priority: P1
milestone: none
editions: [community, pro, private]
area: calculation
data_class: none
adr: none
depends_on: []
size: S
assignee: claude
branch: fix/bug-0360-trailing-calculation
---

# BUG-0360 — TradeCalculator drops trailing calculations when inputs change rapidly within throttle interval

## Symptom

When a user types rapidly in input fields (e.g. Stop Loss, Entry Price, Account Size), drags a risk percentage slider quickly, or when rapid price ticks arrive, the final typed value is sometimes ignored and the calculation dashboard displays outdated results calculated from an intermediate keystroke.

## Evidence

**Derived** from `src/services/tradeCalculator.svelte.ts:82-99`:

```typescript
// 2. Throttle check
const now = Date.now();
if (now - this.lastCalcTime < this.CALC_THROTTLE_MS) return;

// 3. Validation and Execution
if (
    _s.accountSize !== undefined &&
    _s.riskPercentage !== undefined &&
    _s.entryPrice !== undefined &&
    _s.symbol !== undefined &&
    _s.tradeType !== undefined &&
    _s.targets !== undefined
) {
    untrack(() => {
        this.calculateFn?.();
        this.lastCalcTime = Date.now();
    });
}
```

The throttle logic returns immediately if `now - this.lastCalcTime < 250`. Crucially, it does **not** schedule a trailing execution via `setTimeout`. If three changes arrive at `t=0ms`, `t=100ms`, and `t=200ms`, the first runs at `t=0ms`, and the updates at 100ms and 200ms are permanently dropped without ever triggering a trailing calculation.

## Cause

The throttling logic in `TradeCalculator` implements leading-edge throttling without a trailing-edge timer.

## Fix

1. Maintain a `private trailingTimer: ReturnType<typeof setTimeout> | null = null;`.
2. When the throttle blocks execution because `now - this.lastCalcTime < this.CALC_THROTTLE_MS`:
   - Calculate remaining delay `const remaining = this.CALC_THROTTLE_MS - (now - this.lastCalcTime);`.
   - Clear existing `trailingTimer`.
   - Schedule `trailingTimer = setTimeout(() => { this.executeCalculation(); }, remaining);`.
3. When `executeCalculation()` runs (either immediate leading edge or scheduled trailing edge), clear `trailingTimer` and update `this.lastCalcTime`.
4. Ensure `destroy()` clears `trailingTimer`.

## Evaluation

- **Umfang (Scope):** S (approx. 25 lines of code in `tradeCalculator.svelte.ts`)
- **Priorität (Priority):** P1 (Financial accuracy: ensures displayed calculation always matches final inputs)
- **Schwierigkeit (Difficulty):** Medium (must coordinate reactivity, untrack, and timer cleanup)
- **Dringlichkeit (Urgency):** High

## Acceptance criteria

- [ ] A test simulates rapid consecutive input mutations (e.g. at 0ms, 50ms, 100ms) and proves that after the throttle window elapses, the calculation for the final state (100ms) executes.
- [ ] Trailing timer is cancelled and reset if a newer mutation arrives before it fires.
- [ ] No race conditions where stale calculations overwrite newer ones.

## Out of scope

- Altering the mathematical formulas inside `CalculatorService`.
- Changing default debounce values on individual text inputs.

## Open questions

None.

## Links

- `src/services/tradeCalculator.svelte.ts:82-99`
- `src/services/calculatorService.ts`
