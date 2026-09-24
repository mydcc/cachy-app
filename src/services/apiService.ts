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

/**
 * Public market-data surface (FEAT-0342).
 *
 * Implementation lives in ./api/* (marketData, requestManager,
 * rateLimiter, marketTypes, apiErrors). This module only re-exports
 * the historical surface so existing importers and tests keep working.
 */

export { ApiStatusError } from "./api/apiErrors";
export type {
  Kline,
  Ticker24h,
  FundingRateEntry,
  FundingRateHistoryItem,
} from "./api/marketTypes";
export { RateLimiter } from "./api/rateLimiter";
export { requestManager, clearApiCache } from "./api/requestManager";
import { setNetworkLogProvider, setRequestTelemetrySink } from "./api/telemetry";
// This module predates the services-must-not-import-stores boundary (see the
// grandfather entry in eslint.architecture.boundaries.js), so the store-to-
// service wiring lives here: the api/* modules read everything through ports.
import { settingsState } from "../stores/settings.svelte";
import { marketState } from "../stores/market.svelte";

setNetworkLogProvider(() => settingsState.enableNetworkLogs);
setRequestTelemetrySink({
  recordApiCall: () => marketState.recordApiCall(),
  updateTelemetry: (telemetry) => marketState.updateTelemetry(telemetry),
});
import {
  normalizeSymbol,
  safeJson,
  fetchBitunixPrice,
  fetchBitgetKlines,
  fetchBitunixKlines,
  fetchMarketSnapshot,
  fetchTicker24h,
  fetchBitunixFundingRates,
  fetchBitunixFundingRateHistory,
} from "./api/marketData";

export const apiService = {
  normalizeSymbol,
  safeJson,
  fetchBitunixPrice,
  fetchBitgetKlines,
  fetchBitunixKlines,
  fetchMarketSnapshot,
  fetchTicker24h,
  fetchBitunixFundingRates,
  fetchBitunixFundingRateHistory,
};
