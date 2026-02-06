/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import { Decimal } from "decimal.js";
import type { JournalEntry } from "../../stores/types";

export interface JournalStats {
  totalNetProfit: Decimal;
  winRate: Decimal;
  wonTrades: number;
  lostTrades: number;
  profitFactor: Decimal;
  avgTrade: Decimal;
}

export interface PerformanceStats {
  totalTrades: number;
  winRate: number; // Keep as number to match existing implementation
  profitFactor: Decimal;
  expectancy: Decimal;
  avgRMultiple: Decimal;
  avgRR: Decimal;
  avgWin: Decimal;
  avgLossOnly: Decimal;
  winLossRatio: Decimal;
  largestProfit: Decimal;
  largestLoss: Decimal;
  maxDrawdown: Decimal;
  recoveryFactor: Decimal;
  currentStreakText: string;
  longestWinningStreak: number;
  longestLosingStreak: number;
  totalProfitLong: Decimal;
  totalLossLong: Decimal;
  totalProfitShort: Decimal;
  totalLossShort: Decimal;
}

export interface JournalContext {
  closedTrades: JournalEntry[]; // Pre-sorted by date
  openTrades: JournalEntry[];
  journalStats?: JournalStats;   // Cached result
  performanceStats?: PerformanceStats; // Cached result
}
