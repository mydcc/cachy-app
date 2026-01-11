import { Decimal } from 'decimal.js';

export interface TradeValues {
    accountSize: Decimal;
    riskPercentage: Decimal;
    entryPrice: Decimal;
    leverage: Decimal;
    fees: Decimal;
    exitFees?: Decimal; // Optional: if defined, used for exit calculation
    symbol: string;
    useAtrSl: boolean;
    atrValue: Decimal;
    atrMultiplier: Decimal;
    stopLossPrice: Decimal;
    targets: Array<{ price: Decimal; percent: Decimal; isLocked: boolean; }>;
    totalPercentSold: Decimal;
    tags?: string[];
}

export interface BaseMetrics {
    positionSize: Decimal;
    requiredMargin: Decimal;
    netLoss: Decimal;
    breakEvenPrice: Decimal;
    liquidationPrice: Decimal;
    entryFee: Decimal;
    riskAmount: Decimal;
}

export interface IndividualTpResult {
    netProfit: Decimal;
    riskRewardRatio: Decimal;
    priceChangePercent: Decimal;
    returnOnCapital: Decimal;
    partialVolume: Decimal;
    exitFee: Decimal;
    index: number;
    percentSold: Decimal;
}

export interface TotalMetrics {
    totalNetProfit: Decimal;
    totalRR: Decimal;
    totalFees: Decimal;
    maxPotentialProfit: Decimal;
    riskAmount: Decimal;
}

export interface AppState {
    // Inputs
    tradeType: string;
    accountSize: number | null;
    riskPercentage: number | null;
    entryPrice: number | null;
    stopLossPrice: number | null;
    leverage: number | null;
    fees: number | null;
    exitFees?: number | null;
    feeMode?: 'maker_maker' | 'maker_taker' | 'taker_taker' | 'taker_maker';
    symbol: string;
    atrValue: number | null;
    atrMultiplier: number | null;
    useAtrSl: boolean;
    atrMode: 'manual' | 'auto';
    atrTimeframe: string;
    tradeNotes: string;
    tags: string[];
    targets: Array<{ price: number | null; percent: number | null; isLocked: boolean }>;

    // Calculated Results
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
    calculatedTpDetails: IndividualTpResult[];

    // UI State
    isPositionSizeLocked: boolean;
    lockedPositionSize: Decimal | null;
    isRiskAmountLocked: boolean;
    riskAmount: number | null;
    errorMessage: string;
    showErrorMessage: boolean;
    showTotalMetricsGroup: boolean;
    showAtrFormulaDisplay: boolean;
    atrFormulaText: string;
    isAtrSlInvalid: boolean;
    isMarginExceeded?: boolean;
    isPriceFetching: boolean;
    showCopyFeedback: boolean;
    showSaveFeedback: boolean;
    currentTheme: string;
    symbolSuggestions: string[];
    showSymbolSuggestions: boolean;
    showJournalModal: boolean;
    showChangelogModal: boolean; // Added for changelog modal
    journalSearchQuery: string;
    journalFilterStatus: string;
    currentTradeData: CurrentTradeData | null;

    // Remote / Synced Data (Optional)
    remoteLeverage?: number;
    remoteMarginMode?: string;
    remoteMakerFee?: number;
    remoteTakerFee?: number;
}

export interface CurrentTradeData extends TradeValues, BaseMetrics, TotalMetrics {
    tradeType: string;
    status: string;
    calculatedTpDetails: IndividualTpResult[];
}

export interface JournalEntry {
    id: number;
    date: string;
    exitDate?: string; // New field for duration calculation
    symbol: string;
    tradeType: string;
    status: string;
    accountSize: Decimal;
    riskPercentage: Decimal;
    leverage: Decimal;
    fees: Decimal;
    entryPrice: Decimal;
    stopLossPrice: Decimal;
    totalRR: Decimal;
    totalNetProfit: Decimal;
    riskAmount: Decimal;
    totalFees: Decimal;
    maxPotentialProfit: Decimal;
    notes: string;
    targets: Array<{ price: Decimal; percent: Decimal; isLocked: boolean }>;
    calculatedTpDetails: IndividualTpResult[];
    // Extended fields for Bitunix sync
    tradeId?: string; // Bitunix trade ID
    orderId?: string;
    fundingFee?: Decimal;
    tradingFee?: Decimal;
    realizedPnl?: Decimal;
    isManual?: boolean;
    tags?: string[];
}
