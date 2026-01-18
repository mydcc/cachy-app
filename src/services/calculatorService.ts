/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import { get } from "svelte/store";
import { type Writable } from "svelte/store";
import Decimal from "decimal.js";
import { parseDecimal, formatDynamicDecimal } from "../utils/utils";
import { CONSTANTS } from "../lib/constants";
import type {
  TradeValues,
  IndividualTpResult,
  BaseMetrics,
} from "../stores/types";
import { initialTradeState } from "../stores/tradeStore";
import { initialResultsState } from "../stores/resultsStore";
import { trackCustomEvent } from "./trackingService";
import { onboardingService } from "./onboardingService";

// Derive types from initial states
type TradeState = typeof initialTradeState;
type ResultsState = typeof initialResultsState;

// Define interfaces for dependencies to improve testability
interface Calculator {
  calculateBaseMetrics: (
    values: TradeValues,
    tradeType: string,
  ) => BaseMetrics | null;
  calculateIndividualTp: (
    price: Decimal,
    percent: Decimal,
    baseMetrics: BaseMetrics,
    values: TradeValues,
    index: number,
  ) => IndividualTpResult;
  calculateTotalMetrics: (
    targets: any[],
    baseMetrics: BaseMetrics,
    values: TradeValues,
    tradeType: string,
  ) => any;
}

interface UiManager {
  showError: (message: string) => void;
  hideError: () => void;
}

export class CalculatorService {
  constructor(
    private calculator: Calculator,
    private resultsStore: Writable<ResultsState>,
    private tradeStore: Writable<TradeState>,
    private uiManager: UiManager,
    private initialResultsState: ResultsState,
    private updateTradeStore: (
      updater: (state: TradeState) => TradeState,
    ) => void,
  ) {}

  /**
   * Main calculation and display method with robust error handling
   */
  public calculateAndDisplay(): void {
    try {
      this.uiManager.hideError();
      const currentTradeState = get(this.tradeStore);
      const newResults = { ...this.initialResultsState };

      const validationResult = this.getAndValidateInputs(
        currentTradeState,
        newResults,
      );

      if (this.handleValidationResult(validationResult, newResults)) {
        return;
      }

      // If status is Valid, proceed with calculation
      if (
        validationResult.status === CONSTANTS.STATUS_VALID &&
        validationResult.data
      ) {
        const values = validationResult.data;
        this.performCalculation(currentTradeState, values, newResults);
      }
    } catch (error) {
      this.handleCalculationError(error);
    }
  }

  public clearResults(showGuidance = false): void {
    this.resultsStore.set(this.initialResultsState);
    if (showGuidance) {
      this.uiManager.showError("dashboard.promptForData");
    } else {
      this.uiManager.hideError();
    }
  }

  private handleValidationResult(
    validationResult: { status: string; message?: string; fields?: string[] },
    newResults: ResultsState,
  ): boolean {
    if (newResults.isAtrSlInvalid) {
      this.resultsStore.set({
        ...this.initialResultsState,
        showAtrFormulaDisplay: newResults.showAtrFormulaDisplay,
        atrFormulaText: newResults.atrFormulaText,
        isAtrSlInvalid: true,
      });
      return true; // Stop
    }

    if (validationResult.status === CONSTANTS.STATUS_INVALID) {
      trackCustomEvent("Calculation", "Error", validationResult.message);
      this.uiManager.showError(validationResult.message || "");
      this.clearResults();
      return true; // Stop
    }

    if (validationResult.status === CONSTANTS.STATUS_INCOMPLETE) {
      this.clearResults(true);
      return true; // Stop
    }

    return false; // Continue
  }

  private performCalculation(
    currentTradeState: TradeState,
    values: TradeValues,
    newResults: ResultsState,
  ) {
    let baseMetrics: BaseMetrics | null;

    if (currentTradeState.isRiskAmountLocked) {
      const riskAmount = parseDecimal(currentTradeState.riskAmount);
      if (riskAmount.gt(0) && values.accountSize.gt(0)) {
        const newRiskPercentage = riskAmount.div(values.accountSize).times(100);
        const delta = Math.abs(
          (currentTradeState.riskPercentage || 0) -
            newRiskPercentage.toNumber(),
        );
        if (delta > 0.000001) {
          this.updateTradeStore((state) => ({
            ...state,
            riskPercentage: newRiskPercentage.toNumber(),
          }));
        }
        values.riskPercentage = newRiskPercentage;
      }
      baseMetrics = this.calculator.calculateBaseMetrics(
        values,
        currentTradeState.tradeType,
      );
    } else if (
      currentTradeState.isPositionSizeLocked &&
      currentTradeState.lockedPositionSize &&
      currentTradeState.lockedPositionSize.gt(0)
    ) {
      const riskPerUnit = values.entryPrice.minus(values.stopLossPrice).abs();
      if (riskPerUnit.lte(0)) {
        this.uiManager.showError(
          "Stop-Loss muss einen gültigen Abstand zum Einstiegspreis haben.",
        );
        this.clearResults();
        return;
      }
      const riskAmount = riskPerUnit.times(
        currentTradeState.lockedPositionSize,
      );
      const newRiskPercentage = values.accountSize.isZero()
        ? new Decimal(0)
        : riskAmount.div(values.accountSize).times(100);

      const riskPercentageDelta = Math.abs(
        (currentTradeState.riskPercentage || 0) - newRiskPercentage.toNumber(),
      );
      const riskAmountDelta = Math.abs(
        (currentTradeState.riskAmount || 0) - riskAmount.toNumber(),
      );

      if (riskPercentageDelta > 0.000001 || riskAmountDelta > 0.000001) {
        this.updateTradeStore((state) => ({
          ...state,
          riskPercentage: newRiskPercentage.toNumber(),
          riskAmount: riskAmount.toNumber(),
        }));
      }
      values.riskPercentage = newRiskPercentage;

      baseMetrics = this.calculator.calculateBaseMetrics(
        values,
        currentTradeState.tradeType,
      );
      if (baseMetrics)
        baseMetrics.positionSize = currentTradeState.lockedPositionSize;
    } else {
      baseMetrics = this.calculator.calculateBaseMetrics(
        values,
        currentTradeState.tradeType,
      );
      if (baseMetrics) {
        const finalMetrics = baseMetrics;
        const riskAmountDelta = Math.abs(
          (currentTradeState.riskAmount || 0) -
            finalMetrics.riskAmount.toNumber(),
        );
        if (riskAmountDelta > 0.000001) {
          this.updateTradeStore((state) => ({
            ...state,
            riskAmount: finalMetrics.riskAmount.toNumber(),
          }));
        }
      }
    }

    if (!baseMetrics || baseMetrics.positionSize.lte(0)) {
      this.clearResults();
      if (currentTradeState.isPositionSizeLocked) {
        // We need to access app's togglePositionSizeLock or implement it via store update
        // For now, let's assume we can update the store directly
        // @ts-ignore - Dynamic key access warning might occur but we know AppState
        this.updateTradeStore((state) => ({
          ...state,
          isPositionSizeLocked: false,
        }));
      }
      return;
    }

    // --- Fill Results ---
    newResults.positionSize = formatDynamicDecimal(baseMetrics.positionSize, 4);
    newResults.requiredMargin = formatDynamicDecimal(
      baseMetrics.requiredMargin,
      2,
    );

    // Check if required margin exceeds account size
    if (
      values.accountSize.gt(0) &&
      baseMetrics.requiredMargin.gt(values.accountSize)
    ) {
      newResults.isMarginExceeded = true;
    } else {
      newResults.isMarginExceeded = false;
    }

    newResults.netLoss = `-${formatDynamicDecimal(baseMetrics.netLoss, 2)}`;
    newResults.liquidationPrice = values.leverage.gt(1)
      ? formatDynamicDecimal(baseMetrics.liquidationPrice)
      : "N/A";
    newResults.breakEvenPrice = formatDynamicDecimal(
      baseMetrics.breakEvenPrice,
    );
    newResults.entryFee = formatDynamicDecimal(baseMetrics.entryFee, 4);

    // --- TP Details ---
    const calculatedTpDetails: IndividualTpResult[] = [];
    values.targets.forEach((tp: any, index: number) => {
      if (tp.price.gt(0) && tp.percent.gt(0)) {
        const details = this.calculator.calculateIndividualTp(
          tp.price,
          tp.percent,
          baseMetrics!, // asserted non-null
          values,
          index,
        );
        if (
          (currentTradeState.tradeType === "long" &&
            tp.price.gt(values.entryPrice)) ||
          (currentTradeState.tradeType === "short" &&
            tp.price.lt(values.entryPrice))
        ) {
          calculatedTpDetails.push(details);
        }
      }
    });
    newResults.calculatedTpDetails = calculatedTpDetails;

    // --- Total Metrics ---
    const totalMetrics = this.calculator.calculateTotalMetrics(
      values.targets,
      baseMetrics,
      values,
      currentTradeState.tradeType,
    );
    if (values.totalPercentSold.gt(0)) {
      newResults.totalRR = formatDynamicDecimal(totalMetrics.totalRR, 2);
      newResults.totalNetProfit = `+${formatDynamicDecimal(
        totalMetrics.totalNetProfit,
        2,
      )}`;
      newResults.totalPercentSold = `${formatDynamicDecimal(
        values.totalPercentSold,
        0,
      )}%`;
      newResults.riskAmountCurrency = `-${formatDynamicDecimal(
        totalMetrics.riskAmount,
        2,
      )}`;
      newResults.totalFees = formatDynamicDecimal(totalMetrics.totalFees, 2);
      newResults.maxPotentialProfit = `+${formatDynamicDecimal(
        totalMetrics.maxPotentialProfit,
        2,
      )}`;
      newResults.showTotalMetricsGroup = true;
    } else {
      newResults.showTotalMetricsGroup = false;
    }

    // --- Final Store Update ---
    this.resultsStore.set(newResults);

    // Note: Event tracking moved to explicit user actions (e.g., addTrade)
    // to prevent hundreds of redundant events from reactive calculations
    onboardingService.trackFirstCalculation();

    const newStopLoss = values.stopLossPrice.toNumber();
    const stopLossChange = Math.abs(
      (currentTradeState.stopLossPrice || 0) - newStopLoss,
    );
    const hasNoData = !currentTradeState.currentTradeData;

    if (stopLossChange > 0.000001 || hasNoData) {
      this.updateTradeStore((state) => ({
        ...state,
        currentTradeData: {
          ...values,
          ...baseMetrics!,
          ...totalMetrics,
          tradeType: currentTradeState.tradeType,
          status: "Open",
          calculatedTpDetails,
        },
        stopLossPrice: newStopLoss,
      }));
    }
  }

  private handleCalculationError(error: unknown): void {
    console.error("Calculation Error:", error);
    this.uiManager.showError("Ein Fehler ist bei der Berechnung aufgetreten.");
  }

  private getAndValidateInputs(
    currentTradeState: TradeState,
    newResults: ResultsState,
  ): {
    status: string;
    message?: string;
    fields?: string[];
    data?: TradeValues;
  } {
    const values: TradeValues = {
      accountSize: parseDecimal(currentTradeState.accountSize),
      riskPercentage: parseDecimal(currentTradeState.riskPercentage),
      entryPrice: parseDecimal(currentTradeState.entryPrice),
      leverage: parseDecimal(
        currentTradeState.leverage || parseFloat(CONSTANTS.DEFAULT_LEVERAGE),
      ),
      fees: parseDecimal(
        currentTradeState.fees || parseFloat(CONSTANTS.DEFAULT_FEES),
      ),
      symbol: currentTradeState.symbol || "",
      useAtrSl: currentTradeState.useAtrSl,
      atrValue: parseDecimal(currentTradeState.atrValue),
      atrMultiplier: parseDecimal(
        currentTradeState.atrMultiplier ||
          parseFloat(CONSTANTS.DEFAULT_ATR_MULTIPLIER),
      ),
      stopLossPrice: parseDecimal(currentTradeState.stopLossPrice),
      targets: currentTradeState.targets.map((t: any) => ({
        price: parseDecimal(t.price),
        percent: parseDecimal(t.percent),
        isLocked: t.isLocked,
      })),
      totalPercentSold: new Decimal(0),
    };

    const requiredFieldMap: { [key: string]: Decimal } = {
      accountSize: values.accountSize,
      riskPercentage: values.riskPercentage,
      entryPrice: values.entryPrice,
    };

    if (values.useAtrSl) {
      requiredFieldMap.atrValue = values.atrValue;
      requiredFieldMap.atrMultiplier = values.atrMultiplier;
    } else {
      requiredFieldMap.stopLossPrice = values.stopLossPrice;
    }

    const emptyFields = Object.keys(requiredFieldMap).filter((field) =>
      requiredFieldMap[field].isZero(),
    );

    if (emptyFields.length > 0) {
      return { status: CONSTANTS.STATUS_INCOMPLETE };
    }

    if (!values.useAtrSl) {
      newResults.showAtrFormulaDisplay = false;
      newResults.atrFormulaText = "";
    } else if (
      values.entryPrice.gt(0) &&
      values.atrValue.gt(0) &&
      values.atrMultiplier.gt(0)
    ) {
      const operator =
        currentTradeState.tradeType === CONSTANTS.TRADE_TYPE_LONG ? "-" : "+";
      values.stopLossPrice =
        currentTradeState.tradeType === CONSTANTS.TRADE_TYPE_LONG
          ? values.entryPrice.minus(values.atrValue.times(values.atrMultiplier))
          : values.entryPrice.plus(values.atrValue.times(values.atrMultiplier));

      newResults.showAtrFormulaDisplay = true;
      newResults.atrFormulaText = `SL = ${values.entryPrice.toFixed(
        4,
      )} ${operator} (${values.atrValue} × ${
        values.atrMultiplier
      }) = ${values.stopLossPrice.toFixed(4)}`;
    } else if (values.atrValue.gt(0) && values.atrMultiplier.gt(0)) {
      return { status: CONSTANTS.STATUS_INCOMPLETE };
    }

    newResults.isAtrSlInvalid = values.useAtrSl && values.stopLossPrice.lte(0);

    if (values.stopLossPrice.lte(0) && !newResults.isAtrSlInvalid) {
      return { status: CONSTANTS.STATUS_INCOMPLETE };
    }

    if (
      currentTradeState.tradeType === CONSTANTS.TRADE_TYPE_LONG &&
      values.entryPrice.lte(values.stopLossPrice)
    ) {
      return {
        status: CONSTANTS.STATUS_INVALID,
        message: "Long: Stop-Loss muss unter dem Kaufpreis liegen.",
        fields: ["stopLossPrice", "entryPrice"],
      };
    }
    if (
      currentTradeState.tradeType === CONSTANTS.TRADE_TYPE_SHORT &&
      values.entryPrice.gte(values.stopLossPrice)
    ) {
      return {
        status: CONSTANTS.STATUS_INVALID,
        message: "Short: Stop-Loss muss über dem Verkaufspreis liegen.",
        fields: ["stopLossPrice", "entryPrice"],
      };
    }

    // Validate Targets
    for (const tp of values.targets) {
      if (tp.price.gt(0)) {
        if (currentTradeState.tradeType === CONSTANTS.TRADE_TYPE_LONG) {
          if (tp.price.lte(values.stopLossPrice))
            return {
              status: CONSTANTS.STATUS_INVALID,
              message: `Long: Take-Profit Ziel ${tp.price.toFixed(
                4,
              )} muss über dem Stop-Loss liegen.`,
              fields: ["targets"],
            };
          if (tp.price.lte(values.entryPrice))
            return {
              status: CONSTANTS.STATUS_INVALID,
              message: `Long: Take-Profit Ziel ${tp.price.toFixed(
                4,
              )} muss über dem Einstiegspreis liegen.`,
              fields: ["targets"],
            };
        } else {
          if (tp.price.gte(values.stopLossPrice))
            return {
              status: CONSTANTS.STATUS_INVALID,
              message: `Short: Take-Profit Ziel ${tp.price.toFixed(
                4,
              )} muss unter dem Stop-Loss liegen.`,
              fields: ["targets"],
            };
          if (tp.price.gte(values.entryPrice))
            return {
              status: CONSTANTS.STATUS_INVALID,
              message: `Short: Take-Profit Ziel ${tp.price.toFixed(
                4,
              )} muss unter dem Einstiegspreis liegen.`,
              fields: ["targets"],
            };
        }
      }
    }

    values.totalPercentSold = values.targets.reduce(
      (sum: Decimal, t: any) => sum.plus(t.percent),
      new Decimal(0),
    );
    if (values.totalPercentSold.gt(100)) {
      return {
        status: CONSTANTS.STATUS_INVALID,
        message: `Die Summe der Verkaufsprozente (${values.totalPercentSold.toFixed(
          0,
        )}%) darf 100% nicht überschreiten.`,
        fields: [],
      };
    }

    return { status: CONSTANTS.STATUS_VALID, data: values };
  }
}
