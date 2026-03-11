/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import { Decimal } from "decimal.js"; // Type import only if using values, here we just use primitives mostly or objects
import { untrack } from "svelte";

export interface CalculatedTpDetail {
  index: number;
  price: Decimal;
  percent: Decimal;
  percentSold: Decimal;
  riskRewardRatio: Decimal;
  netProfit: Decimal;
  priceChangePercent: Decimal;
  returnOnCapital: Decimal;
  partialVolume: Decimal;
  exitFee: Decimal;
}

export interface ResultsState {
  positionSize: string;
  requiredMargin: string;
  netLoss: string;
  entryFee: string;
  liquidationPrice: string;
  breakEvenPrice: string;
  totalRR: string;
  totalNetProfit: string;
  totalPercentSold: string;
  riskAmountCurrency: string;
  totalFees: string;
  maxPotentialProfit: string;
  calculatedTpDetails: CalculatedTpDetail[];
  showTotalMetricsGroup: boolean;
  showAtrFormulaDisplay: boolean;
  atrFormulaText: string;
  isAtrSlInvalid: boolean;
  isMarginExceeded: boolean;
}

export const INITIAL_RESULTS_STATE: ResultsState = {
  positionSize: "-",
  requiredMargin: "-",
  netLoss: "-",
  entryFee: "-",
  liquidationPrice: "-",
  breakEvenPrice: "-",
  totalRR: "-",
  totalNetProfit: "-",
  totalPercentSold: "-",
  riskAmountCurrency: "-",
  totalFees: "-",
  maxPotentialProfit: "-",
  calculatedTpDetails: [],
  showTotalMetricsGroup: false,
  showAtrFormulaDisplay: false,
  atrFormulaText: "",
  isAtrSlInvalid: false,
  isMarginExceeded: false,
};

class ResultsManager {
  private notifyTimer: any = null;
  // We use a single state object to allow easy resetting/bulk updates
  // or we can use individual fields. Individual fields are cleaner for fine-grained reactivity.
  // Given the calculator updates almost everything at once, a single object or spread might be fine.
  // But let's stick to individual props for idiomatic Svelte 5 if access patterns vary.
  // Actually, widespread use updates mostly potentially all.
  // Let's use individual props for clarity + 'reset' method.

  positionSize = $state("-");
  requiredMargin = $state("-");
  netLoss = $state("-");
  entryFee = $state("-");
  liquidationPrice = $state("-");
  breakEvenPrice = $state("-");
  totalRR = $state("-");
  totalNetProfit = $state("-");
  totalPercentSold = $state("-");
  riskAmountCurrency = $state("-");
  totalFees = $state("-");
  maxPotentialProfit = $state("-");
  calculatedTpDetails = $state<CalculatedTpDetail[]>([]);
  showTotalMetricsGroup = $state(false);
  showAtrFormulaDisplay = $state(false);
  atrFormulaText = $state("");
  isAtrSlInvalid = $state(false);
  isMarginExceeded = $state(false);

  reset() {
    Object.assign(this, INITIAL_RESULTS_STATE);
  }

  // Bulk update helper for calculatorService
  update(data: Partial<ResultsState>) {
    Object.assign(this, data);
  }

  // Compatibility for legacy 'reset' which was resultsStore.set(initialResultsState)
  set(data: ResultsState) {
    Object.assign(this, data);
  }

  // Legacy subscribe
  subscribe(fn: (value: ResultsState) => void) {
    // Construct object to match legacy shape
    const getSnapshot = () => ({
      positionSize: this.positionSize,
      requiredMargin: this.requiredMargin,
      netLoss: this.netLoss,
      entryFee: this.entryFee,
      liquidationPrice: this.liquidationPrice,
      breakEvenPrice: this.breakEvenPrice,
      totalRR: this.totalRR,
      totalNetProfit: this.totalNetProfit,
      totalPercentSold: this.totalPercentSold,
      riskAmountCurrency: this.riskAmountCurrency,
      totalFees: this.totalFees,
      maxPotentialProfit: this.maxPotentialProfit,
      calculatedTpDetails: this.calculatedTpDetails,
      showTotalMetricsGroup: this.showTotalMetricsGroup,
      showAtrFormulaDisplay: this.showAtrFormulaDisplay,
      atrFormulaText: this.atrFormulaText,
      isAtrSlInvalid: this.isAtrSlInvalid,
      isMarginExceeded: this.isMarginExceeded,
    });

    fn(getSnapshot());
    return $effect.root(() => {
      $effect(() => {
        const snap = getSnapshot(); // track dependencies
        untrack(() => {
          if (this.notifyTimer) clearTimeout(this.notifyTimer);
          this.notifyTimer = setTimeout(() => {
            fn(snap);
            this.notifyTimer = null;
          }, 10);
        });
      });
    });
  }
}

export const resultsState = new ResultsManager();
export const initialResultsState = INITIAL_RESULTS_STATE;
