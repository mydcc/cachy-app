/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import type { JournalEntry } from "../../stores/types";
import type { JournalContext } from "./types";
import {
  calculateJournalStats,
  calculatePerformanceStats,
  getCalendarData,
  getDisciplineData,
  getDurationStats,
  getTagData,
  getTimingData,
} from "./stats";
import {
  getPerformanceData,
  getQualityData,
  getDirectionData,
  getCostData,
  getDurationData,
  getAssetData,
  getRiskData,
  getMarketData,
  getPsychologyData,
  getTagEvolution,
  getConfluenceData,
  getMonteCarloData,
  getExecutionEfficiencyData,
  getVisualRiskRadarData,
  getVolatilityMatrixData,
  getSystemQualityData,
} from "./charts";

export function getJournalAnalysis(journal: JournalEntry[]) {
  // 1. Single Pass Filtering & Sorting
  const closedTrades: JournalEntry[] = [];
  const openTrades: JournalEntry[] = [];

  // Filter pass
  for (const t of journal) {
    if (t.status === "Won" || t.status === "Lost") {
      closedTrades.push(t);
    } else if (t.status === "Open") {
      openTrades.push(t);
    }
    // Ignore others? (e.g. Cancelled, BreakEven if not Won/Lost)
  }

  // Sort closed trades by date once
  closedTrades.sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );

  // 2. Initialize Context with Pre-calculated Stats
  // We construct the context partially first
  const context: JournalContext = {
    closedTrades,
    openTrades,
  };

  // Pre-calculate heaviest stats to cache them
  // calculateJournalStats iterates closedTrades.
  context.journalStats = calculateJournalStats(journal, context);

  // calculatePerformanceStats iterates closedTrades multiple times (sorts, filters won/lost, etc)
  // Our refactored version uses context.closedTrades (sorted), so it skips sort!
  context.performanceStats = calculatePerformanceStats(journal, context) || undefined;

  // 3. Compute All Metrics using Shared Context
  return {
    performanceMetrics: getPerformanceData(journal, context),
    qualityMetrics: getQualityData(journal, context),
    directionMetrics: getDirectionData(journal, context),
    tagMetrics: getTagData(journal, context), // From stats
    calendarMetrics: getCalendarData(journal, context), // From stats
    disciplineMetrics: getDisciplineData(journal, context), // From stats
    costMetrics: getCostData(journal, context),

    // Deep Dive
    timingMetrics: getTimingData(journal, context), // From stats
    confluenceMetrics: getConfluenceData(journal, context),
    durationStatsMetrics: getDurationStats(journal, context), // From stats
    durationDataMetrics: getDurationData(journal, context),
    tagEvolutionMetrics: getTagEvolution(journal, context),
    assetMetrics: getAssetData(journal, context),
    riskMetrics: getRiskData(journal, context),
    marketMetrics: getMarketData(journal, context),
    psychologyMetrics: getPsychologyData(journal, context),

    // 6-Pillars
    executionMetrics: getExecutionEfficiencyData(journal, context),
    riskRadarMetrics: getVisualRiskRadarData(journal, context),
    marketContextMetrics: getVolatilityMatrixData(journal, context),
    systemQualityMetrics: getSystemQualityData(journal, context),
  };
}
