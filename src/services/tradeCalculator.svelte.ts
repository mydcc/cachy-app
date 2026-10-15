/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import { untrack } from "svelte";
import { tradeState } from "../stores/trade.svelte";

/**
 * The exact input surface the calculator consumes, as one comparable key.
 *
 * The calculation writes the derived side of two-way fields back into the
 * store (the risk amount follows the risk percentage, and vice versa; in ATR
 * mode the stop loss is derived from the ATR inputs). Those write-backs must
 * not re-trigger the watcher, which used to be the job of a 250 ms throttle.
 * The key removes that failure mode by construction: it contains exactly the
 * fields a trader can edit, never the side the calculation derives from
 * them.
 *
 * The two-way risk pair is the subtle part. Only the side the trader actually
 * edits is an input:
 *
 * - risk amount locked → the dirty side is the amount, the percentage is a result;
 * - position size locked → both are results, neither belongs in the key;
 * - otherwise → the dirty side is the percentage, the amount is a result.
 *
 * This is the same mode table the risk lens (`lib/risk.ts`) implements from
 * the other side: the lens derives whatever is not the edited side, so the
 * calculation holds no write-back into these fields at all. If a mode is
 * added here, it must be added there.
 *
 * One deliberate exception: when the calculation flips a *mode* the key does
 * track — the position-size lock auto-reset on a failed sizing — the key
 * changes and exactly one extra run follows, with the new mode's semantics.
 * That run is required, not a loop: the flip is one-way, so it converges.
 */
function inputKey(s: typeof tradeState): string {
  const targets = s.targets
    .map((t) => `${t.price ?? ""}|${t.percent ?? ""}|${t.isLocked ? 1 : 0}`)
    .join(",");

  const parts: unknown[] = [
    s.accountSize,
    s.entryPrice,
    s.symbol,
    s.tradeType,
    s.leverage,
    s.fees,
    // FEAT-0253: the per-leg rates are their own triggers. `fees` mirrors the
    // *exit* rate only, so switching the entry between MARKET and LIMIT moves
    // `entryFees` and nothing else.
    s.entryFees,
    s.exitFees,
    s.useAtrSl,
    s.isRiskAmountLocked,
    s.isPositionSizeLocked,
    s.lockedPositionSize,
    targets,
  ];

  // Stop loss is an input only in manual mode; with ATR it is a result.
  if (s.useAtrSl) {
    parts.push(s.atrValue, s.atrMultiplier, s.atrMode, s.atrTimeframe);
  } else {
    parts.push(s.stopLossPrice);
  }

  if (!s.isPositionSizeLocked) {
    parts.push(
      s.isRiskAmountLocked ? `amt:${s.riskAmount}` : `pct:${s.riskPercentage}`,
    );
  }

  return parts.join("\u0000");
}

/**
 * Trade Calculator Service
 *
 * Responsibilities:
 * - Watches the trade inputs and schedules the calculation when they change
 * - Coalesces several changes in the same task into one calculation
 * - Triggers the main calculation logic (in CalculatorService)
 *
 * This service extracts the reactive logic previously hosted in +page.svelte,
 * enabling a "Thin View" architecture where the UI only binds data and the
 * service handles business logic triggers.
 */
class TradeCalculator {
    private calculateFn: (() => void) | null = null;
    private initialized = false;
    private stopEffects: (() => void) | null = null;
    /** Input surface of the last scheduled calculation (see `inputKey`). */
    private lastInputKey: string | null = null;
    private scheduled = false;
    /** Bumped by `destroy()` so a queued microtask cannot run after teardown. */
    private generation = 0;

    /**
     * True while a recalculation is queued for the current task's microtask
     * checkpoint, or running inside it. Reactive so the UI can hold back the
     * "stale calculation" note during that window instead of flashing it on
     * every keystroke — the displayed figures are only behind because the
     * recalculation is already on its way.
     *
     * Written only by the scheduler below, `destroy()`, and tests driving the
     * note-visibility contract. Reading it never affects the submit guard:
     * `PlaceOrderPanel.submit()` refuses on `staleInputs` alone, so even a
     * stuck flag could hide the note but never let a stale order through.
     */
    pending = $state(false);

    /**
     * Validates inputs and runs the calculation. Coalesced by the caller, so
     * it always reads the live `tradeState` for the final state of a burst.
     */
    private runCalculation() {
        const _s = tradeState;
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
            });
        }
    }

    /**
     * Queues one calculation for the end of the current task. Several input
     * changes in the same task (a burst of ticks, a multi-field write) collapse
     * into a single run with the final state; separate tasks each get their own,
     * so typing stays immediate without a timer.
     */
    private schedule() {
        if (this.scheduled) return;
        this.scheduled = true;
        this.pending = true;
        const generation = this.generation;
        queueMicrotask(() => {
            if (generation !== this.generation) return; // destroyed since
            this.scheduled = false;
            try {
                this.runCalculation();
            } finally {
                // Cleared after the run, not before: the flag covers the whole
                // queued-or-running window, and a throwing calculation cannot
                // wedge it set.
                this.pending = false;
            }
        });
    }

    /** Stops the watcher and drops a queued calculation. */
    destroy() {
        this.generation++;
        this.scheduled = false;
        this.pending = false;
        // Stop the reactive watcher so a re-init starts clean instead of
        // stacking another $effect.root on top of the old one.
        this.stopEffects?.();
        this.stopEffects = null;
        this.lastInputKey = null;
        this.calculateFn = null;
        this.initialized = false;
    }

    /**
     * Initialize the calculator watcher.
     * @param calculateFn The function to call when calculation is needed (usually app.calculateAndDisplay)
     */
    init(calculateFn: () => void) {
        if (this.initialized) return;
        this.calculateFn = calculateFn;
        this.initialized = true;

        // Use $effect.root to ensure the effect lives as long as the app
        // independent of any component lifecycle.
        this.stopEffects = $effect.root(() => {
            $effect(() => {
                // Reading every input here — inside `inputKey` — is what
                // subscribes this effect to them. A re-run caused by anything
                // else (including the calculation's own write-backs) produces
                // the same key and stops here instead of chaining another run.
                const key = inputKey(tradeState);
                if (key === this.lastInputKey) return;
                this.lastInputKey = key;
                this.schedule();
            });
        });
    }
}

export const tradeCalculator = new TradeCalculator();

// HMR: stop the reactive watcher and drop any queued calculation on module
// disposal, so a re-evaluated module starts clean instead of stacking a
// second $effect.root next to the detached one.
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    tradeCalculator.destroy();
  });
}
