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
import { get } from "svelte/store";
import { settingsState } from "../stores/settings.svelte";
import { julesState } from "../stores/jules.svelte";
import { tradeState } from "../stores/trade.svelte";
import { uiState } from "../stores/ui.svelte";
import { accountState } from "../stores/account.svelte";
import { marketState } from "../stores/market.svelte";

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
    const trade = tradeState;
    const ui = uiState;
    const account = accountState;
    const wsStatus = marketState.connectionStatus;

    // Get Market/Technicals Context for current symbol
    const currentSymbol = trade.symbol;
    const marketData = currentSymbol ? marketState.data[currentSymbol] : null;

    // Resolve technicals for active timeframe (default 1h if not set)
    const tf = trade.analysisTimeframe || "1h";
    const techs = marketData?.technicals?.[tf];

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

    const safeAccount = {
      // accountState has no 'balance' field on root, it uses 'assets' array.
      // We need to find USDT balance or just summary.
      // Legacy accountStore had computed props, but AccountManager splits them.
      // Let's sum up available or just take USDT.
      balance:
        new Decimal(account.assets.find((a) => a.currency === "USDT")?.total || 0).toNumber(),
      availableBalance:
        new Decimal(
          account.assets.find((a) => a.currency === "USDT")?.available || 0,
        ).toNumber(),
      positionsCount: account.positions.length,
      ordersCount: account.openOrders.length,
      isConnected: wsStatus === "connected",
    };

    return {
      settings: safeSettings,
      tradeState: safeTradeState,
      accountSummary: safeAccount,
      marketStatus: {
        connected: wsStatus === "connected",
        data: marketData
          ? {
            lastPrice: marketData.lastPrice,
            priceChange: marketData.priceChangePercent,
            technicals: techs
              ? {
                summary: techs.summary,
                confluence: techs.confluence,
                // We send key signals to AI, not entire array of 1000s of numbers
                signals: {
                  rsi: techs.oscillators.find(
                    (o) => o.name === "RSI",
                  )?.value,
                  macdAction: techs.oscillators.find(
                    (o) => o.name === "MACD",
                  )?.action,
                  divergences: techs.divergences,
                  ichimokuAction:
                    techs.advanced?.ichimoku?.action,
                },
              }
              : "Calculating...",
          }
          : "No Data",
      },
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
    try {
      julesState.setLoading(true);
      julesState.showReport(
        "Analyzing market conditions and your portfolio...",
      );
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

      julesState.showReport(result.message);
      return result.message;
    } catch (err: any) {
      console.error("[JulesService] Failed to report:", err);
      julesState.setLoading(false);
      return null;
    }
  },
};
