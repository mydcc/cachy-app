import { get } from "svelte/store";
import { Decimal } from "decimal.js";
import type { Writable } from "svelte/store";
import { CONSTANTS } from "../lib/constants";
import { calculator } from "../lib/calculator";
import { parseDecimal, formatDynamicDecimal } from "../utils/utils";
import { updateTradeStore } from "../stores/tradeStore";
import { resultsStore, initialResultsState } from "../stores/resultsStore";
import { uiStore } from "../stores/uiStore";
import { trackCustomEvent } from "./trackingService";
import { onboardingService } from "./onboardingService";
import type {
    TradeValues,
    BaseMetrics,
    IndividualTpResult,
} from "../stores/types";

interface ValidationResult {
    status: string;
    message?: string;
    fields?: string[];
    data?: TradeValues;
}

/**
 * CalculatorService Class
 *
 * Handles all trade calculations with robust error handling.
 * Extracted from app.ts for better maintainability and testability.
 */
export class CalculatorService {
    /**
     * Main calculation entry point - delegates to app.clearResults()
     */
    private clearResults: (showGuidance?: boolean) => void;
    private togglePositionSizeLock: (locked: boolean) => void;

    constructor(
        clearResultsFn: (showGuidance?: boolean) => void,
        togglePositionSizeLockFn: (locked: boolean) => void
    ) {
        this.clearResults = clearResultsFn;
        this.togglePositionSizeLock = togglePositionSizeLockFn;
    }

    /**
     * Main calculation and display method with comprehensive error handling
     */
    calculateAndDisplay<T>(tradeStore: Writable<T>): void {
        try {
            uiStore.hideError();
            const currentTradeState = get(tradeStore) as any;
            const newResults = { ...initialResultsState };

            const getAndValidateInputs = (): ValidationResult => {
                const values: TradeValues = {
                    accountSize: parseDecimal(currentTradeState.accountSize),
                    riskPercentage: parseDecimal(currentTradeState.riskPercentage),
                    entryPrice: parseDecimal(currentTradeState.entryPrice),
                    leverage: parseDecimal(
                        currentTradeState.leverage || parseFloat(CONSTANTS.DEFAULT_LEVERAGE)
                    ),
                    fees: parseDecimal(
                        currentTradeState.fees || parseFloat(CONSTANTS.DEFAULT_FEES)
                    ),
                    symbol: currentTradeState.symbol || "",
                    useAtrSl: currentTradeState.useAtrSl,
                    atrValue: parseDecimal(currentTradeState.atrValue),
                    atrMultiplier: parseDecimal(
                        currentTradeState.atrMultiplier ||
                        parseFloat(CONSTANTS.DEFAULT_ATR_MULTIPLIER)
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
                    requiredFieldMap[field as keyof typeof requiredFieldMap].isZero()
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
                        4
                    )} ${operator} (${values.atrValue} × ${values.atrMultiplier}) = ${values.stopLossPrice.toFixed(
                        4
                    )}`;
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

                for (const tp of values.targets) {
                    if (tp.price.gt(0)) {
                        if (currentTradeState.tradeType === CONSTANTS.TRADE_TYPE_LONG) {
                            if (tp.price.lte(values.stopLossPrice))
                                return {
                                    status: CONSTANTS.STATUS_INVALID,
                                    message: `Long: Take-Profit Ziel ${tp.price.toFixed(
                                        4
                                    )} muss über dem Stop-Loss liegen.`,
                                    fields: ["targets"],
                                };
                            if (tp.price.lte(values.entryPrice))
                                return {
                                    status: CONSTANTS.STATUS_INVALID,
                                    message: `Long: Take-Profit Ziel ${tp.price.toFixed(
                                        4
                                    )} muss über dem Einstiegspreis liegen.`,
                                    fields: ["targets"],
                                };
                        } else {
                            if (tp.price.gte(values.stopLossPrice))
                                return {
                                    status: CONSTANTS.STATUS_INVALID,
                                    message: `Short: Take-Profit Ziel ${tp.price.toFixed(
                                        4
                                    )} muss unter dem Stop-Loss liegen.`,
                                    fields: ["targets"],
                                };
                            if (tp.price.gte(values.entryPrice))
                                return {
                                    status: CONSTANTS.STATUS_INVALID,
                                    message: `Short: Take-Profit Ziel ${tp.price.toFixed(
                                        4
                                    )} muss unter dem Einstiegspreis liegen.`,
                                    fields: ["targets"],
                                };
                        }
                    }
                }

                values.totalPercentSold = values.targets.reduce(
                    (sum: Decimal, t) => sum.plus(t.percent),
                    new Decimal(0)
                );

                if (values.totalPercentSold.gt(100)) {
                    return {
                        status: CONSTANTS.STATUS_INVALID,
                        message: `Die Summe der Verkaufsprozente (${values.totalPercentSold.toFixed(
                            0
                        )}%) darf 100% nicht überschreiten.`,
                        fields: [],
                    };
                }

                return { status: CONSTANTS.STATUS_VALID, data: values };
            };

            const validationResult = getAndValidateInputs();

            if (newResults.isAtrSlInvalid) {
                resultsStore.set({
                    ...initialResultsState,
                    showAtrFormulaDisplay: newResults.showAtrFormulaDisplay,
                    atrFormulaText: newResults.atrFormulaText,
                    isAtrSlInvalid: true,
                });
                return;
            }

            if (validationResult.status === CONSTANTS.STATUS_INVALID) {
                trackCustomEvent("Calculation", "Error", validationResult.message);
                uiStore.showError(validationResult.message || "");
                this.clearResults();
                return;
            }

            if (validationResult.status === CONSTANTS.STATUS_INCOMPLETE) {
                this.clearResults(true);
                return;
            }

            let values = validationResult.data as TradeValues;
            let baseMetrics: BaseMetrics | null;

            if (currentTradeState.isRiskAmountLocked) {
                const riskAmount = parseDecimal(currentTradeState.riskAmount);
                if (riskAmount.gt(0) && values.accountSize.gt(0)) {
                    const newRiskPercentage = riskAmount.div(values.accountSize).times(100);
                    updateTradeStore((state) => ({
                        ...state,
                        riskPercentage: newRiskPercentage.toNumber(),
                    }));
                    values.riskPercentage = newRiskPercentage;
                }
                baseMetrics = calculator.calculateBaseMetrics(
                    values,
                    currentTradeState.tradeType
                );
            } else if (
                currentTradeState.isPositionSizeLocked &&
                currentTradeState.lockedPositionSize &&
                currentTradeState.lockedPositionSize.gt(0)
            ) {
                const riskPerUnit = values.entryPrice.minus(values.stopLossPrice).abs();
                if (riskPerUnit.lte(0)) {
                    uiStore.showError(
                        "Stop-Loss muss einen gültigen Abstand zum Einstiegspreis haben."
                    );
                    this.clearResults();
                    return;
                }
                const riskAmount = riskPerUnit.times(currentTradeState.lockedPositionSize);
                const newRiskPercentage = values.accountSize.isZero()
                    ? new Decimal(0)
                    : riskAmount.div(values.accountSize).times(100);

                updateTradeStore((state) => ({
                    ...state,
                    riskPercentage: newRiskPercentage.toNumber(),
                    riskAmount: riskAmount.toNumber(),
                }));
                values.riskPercentage = newRiskPercentage;

                baseMetrics = calculator.calculateBaseMetrics(
                    values,
                    currentTradeState.tradeType
                );
                if (baseMetrics)
                    baseMetrics.positionSize = currentTradeState.lockedPositionSize;
            } else {
                baseMetrics = calculator.calculateBaseMetrics(
                    values,
                    currentTradeState.tradeType
                );
                if (baseMetrics) {
                    const finalMetrics = baseMetrics;
                    updateTradeStore((state) => ({
                        ...state,
                        riskAmount: finalMetrics.riskAmount.toNumber(),
                    }));
                }
            }

            if (!baseMetrics || baseMetrics.positionSize.lte(0)) {
                this.clearResults();
                if (currentTradeState.isPositionSizeLocked)
                    this.togglePositionSizeLock(false);
                return;
            }

            newResults.positionSize = formatDynamicDecimal(baseMetrics.positionSize, 4);
            newResults.requiredMargin = formatDynamicDecimal(
                baseMetrics.requiredMargin,
                2
            );

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
            newResults.breakEvenPrice = formatDynamicDecimal(baseMetrics.breakEvenPrice);
            newResults.entryFee = formatDynamicDecimal(baseMetrics.entryFee, 4);

            const calculatedTpDetails: IndividualTpResult[] = [];
            values.targets.forEach((tp, index) => {
                if (tp.price.gt(0) && tp.percent.gt(0)) {
                    const details = calculator.calculateIndividualTp(
                        tp.price,
                        tp.percent,
                        baseMetrics,
                        values,
                        index
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

            const totalMetrics = calculator.calculateTotalMetrics(
                values.targets,
                baseMetrics,
                values,
                currentTradeState.tradeType
            );

            if (values.totalPercentSold.gt(0)) {
                newResults.totalRR = formatDynamicDecimal(totalMetrics.totalRR, 2);
                newResults.totalNetProfit = `+${formatDynamicDecimal(
                    totalMetrics.totalNetProfit,
                    2
                )}`;
                newResults.totalPercentSold = `${formatDynamicDecimal(
                    values.totalPercentSold,
                    0
                )}%`;
                newResults.riskAmountCurrency = `-${formatDynamicDecimal(
                    totalMetrics.riskAmount,
                    2
                )}`;
                newResults.totalFees = formatDynamicDecimal(totalMetrics.totalFees, 2);
                newResults.maxPotentialProfit = `+${formatDynamicDecimal(
                    totalMetrics.maxPotentialProfit,
                    2
                )}`;
                newResults.showTotalMetricsGroup = true;
            } else {
                newResults.showTotalMetricsGroup = false;
            }

            resultsStore.set(newResults);

            const activeTargets = values.targets.filter(
                (t) => t.price.gt(0) && t.percent.gt(0)
            ).length;
            trackCustomEvent(
                "Calculation",
                "Success",
                currentTradeState.tradeType,
                activeTargets
            );
            onboardingService.trackFirstCalculation();

            updateTradeStore((state) => ({
                ...state,
                currentTradeData: {
                    ...values,
                    ...baseMetrics,
                    ...totalMetrics,
                    tradeType: currentTradeState.tradeType,
                    status: "Open",
                    calculatedTpDetails,
                },
                stopLossPrice: values.stopLossPrice.toNumber(),
            }));
        } catch (error) {
            console.error("[CalculatorService] Calculation error:", error);
            const errorMessage =
                error instanceof Error
                    ? `Berechnungsfehler: ${error.message}`
                    : "Ein unerwarteter Fehler ist bei der Berechnung aufgetreten.";

            uiStore.showError(errorMessage);
            this.clearResults();
            trackCustomEvent("Calculation", "Error", errorMessage);
        }
    }
}
