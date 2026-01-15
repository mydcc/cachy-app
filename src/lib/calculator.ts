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
