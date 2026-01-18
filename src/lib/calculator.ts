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

import * as Core from "./calculators/core";
import * as Stats from "./calculators/stats";
import * as Charts from "./calculators/charts";

export const calculator = {
  ...Core,
  ...Stats,
  ...Charts,
};

// Re-export specific functions if needed by some imports that use destructuring from the module instead of the object
// But usually the codebase uses `import { calculator } from ...` and then `calculator.foo`.
// If there are direct imports like `import { getTradePnL } from ...`, we should export them too.
export const {
  getTradePnL,
  calculateBaseMetrics,
  calculateIndividualTp,
  calculateTotalMetrics,
} = Core;

export const {
  calculateATR,
  calculateJournalStats,
  calculatePerformanceStats,
  getTagData,
  getCalendarData,
  getRollingData,
  getLeakageData,
  getDurationStats,
  calculateSymbolPerformance,
  getTimingData, // Exported from Stats now
} = Stats;

export const {
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
  getDisciplineData,
  getExecutionEfficiencyData,
  getVisualRiskRadarData,
  getVolatilityMatrixData,
  getSystemQualityData,
} = Charts;
