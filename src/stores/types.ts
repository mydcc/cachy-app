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

import { Decimal } from "decimal.js";

export interface TradeValues {
  accountSize: Decimal;
  riskPercentage: Decimal;
  entryPrice: Decimal;
  leverage: Decimal;
  fees: Decimal;
  exitFees?: Decimal; // Optional: if defined, used for exit calculation
  maintenanceMarginRate?: Decimal; // Optional: Maintenance Margin Rate (e.g. 0.005 for 0.5%)
  symbol: string;
  useAtrSl: boolean;
  atrValue: Decimal;
  atrMultiplier: Decimal;
  stopLossPrice: Decimal;
  targets: Array<{ price: Decimal; percent: Decimal; isLocked: boolean }>;
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
  accountSize: string; // Serialized Decimal
  riskPercentage: string; // Serialized Decimal
  entryPrice: string; // Serialized Decimal
  stopLossPrice: string; // Serialized Decimal
  leverage: string; // Serialized Decimal
  fees: string; // Serialized Decimal
  exitFees?: string; // Serialized Decimal
  maintenanceMarginRate?: string; // Serialized Decimal
  feeMode?: "maker_maker" | "maker_taker" | "taker_taker" | "taker_maker";
  symbol: string;
  atrValue: string; // Serialized Decimal
  atrMultiplier: string; // Serialized Decimal
  useAtrSl: boolean;
  atrMode: "manual" | "auto";
  atrTimeframe: string;
  analysisTimeframe: string; // Separate timeframe for Analysis/Technicals
  tradeNotes: string;
  tags: string[];
  targets: Array<{
    price: string; // Serialized Decimal
    percent: string; // Serialized Decimal
    isLocked: boolean;
  }>;

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
  riskAmount: string; // Serialized Decimal
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
  remoteLeverage?: Decimal;
  remoteMarginMode?: string;
  remoteMakerFee?: Decimal;
  remoteTakerFee?: Decimal;
  remoteMmr?: Decimal;
}

export interface CurrentTradeData
  extends TradeValues, BaseMetrics, TotalMetrics {
  tradeType: string;
  status: string;
  calculatedTpDetails: IndividualTpResult[];
}

export interface JournalEntry {
  id: number;
  date: string;
  entryDate?: string; // For duration calculation
  exitDate?: string; // New field for duration calculation
  symbol: string;
  tradeType: string;
  status: string;
  accountSize: Decimal;
  riskPercentage: Decimal;
  leverage: Decimal;
  fees: Decimal;
  entryPrice: Decimal;
  exitPrice?: Decimal;
  stopLossPrice: Decimal;
  atrValue?: Decimal;
  mae?: Decimal;
  mfe?: Decimal;
  efficiency?: Decimal;
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
  screenshot?: string;
  positionSize?: Decimal;
  provider?: "bitunix" | "bitget" | "custom";
}
