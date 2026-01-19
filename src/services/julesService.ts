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
import { settingsState } from "../stores/settings.svelte";
import { julesStore } from "../stores/julesStore";
import { tradeStore } from "../stores/tradeStore";
import { uiState } from "../stores/ui.svelte";
import { accountStore } from "../stores/accountStore";
import { marketStore, wsStatusStore } from "../stores/marketStore"; // Import wsStatusStore separately

interface JulesReportContext {
  settings?: any;
  tradeState?: any;
  accountSummary?: any;
  marketStatus?: any;
  uiState?: any;
  timestamp: string;
  userAgent: string;
}

export const julesService = {
  /**
   * Collects a snapshot of the current application state.
   * Sanitizes sensitive keys (like API secrets) before returning.
   */
  getSystemSnapshot(): JulesReportContext {
    const settings = settingsState;
    const trade = get(tradeStore);
    const ui = uiState;
    const account = get(accountStore);
    const wsStatus = get(wsStatusStore); // Get WS status from its dedicated store

    // Sanitize Settings (remove API Secrets)
    const safeSettings = {
      ...settings,
      apiKeys: settings.apiKeys
        ? Object.fromEntries(
          Object.entries(settings.apiKeys).map(([provider, keys]) => [
            provider,
            { ...(keys as any), apiSecret: "***REDACTED***" },
          ]),
        )
        : {},
    };

    // Simplify Trade State
    const safeTradeState = {
      symbol: trade.symbol,
      entryPrice: trade.entryPrice,
      stopLossPrice: trade.stopLossPrice,
      takeProfitTargets: trade.targets ? trade.targets.length : 0,
      tradeType: trade.tradeType,
      leverage: trade.leverage,
      riskAmount: trade.riskAmount,
    };

    // Simplify Account Store
    const safeAccount = {
      balance: (account as any).balance,
      availableBalance: (account as any).availableBalance,
      positionsCount: account.positions ? account.positions.length : 0,
      ordersCount: account.openOrders ? account.openOrders.length : 0,
      isConnected: wsStatus === "connected", // Use the value from wsStatusStore
    };

    return {
      settings: safeSettings,
      tradeState: safeTradeState,
      accountSummary: safeAccount,
      uiState: {
        theme: ui.currentTheme,
        activeModal: ui.showJournalModal
          ? "Journal"
          : ui.showSettingsModal
            ? "Settings"
            : "None",
      },
      timestamp: new Date().toISOString(),
      userAgent:
        typeof navigator !== "undefined" ? navigator.userAgent : "Server/Test",
    };
  },

  /**
   * Sends a report to the Jules API Backend.
   */
  async reportToJules(error: any = null, mode: "AUTO" | "MANUAL" = "MANUAL") {
    julesStore.setLoading(true);
    try {
      const context = this.getSystemSnapshot();

      const response = await fetch("/api/jules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          context,
          error: error
            ? {
              message: error.message || error.toString(),
              stack: error.stack,
              name: error.name,
            }
            : null,
        }),
      });

      if (!response.ok) {
        throw new Error(`Server returned ${response.status}`);
      }

      const result = await response.json();

      julesStore.showReport(result.message);
      return result.message;
    } catch (err) {
      console.error("[JulesService] Failed to report:", err);
      julesStore.setLoading(false);
      return null; // Silent fail
    }
  },
};
