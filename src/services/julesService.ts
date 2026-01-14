import { get } from "svelte/store";
import { settingsStore } from "../stores/settingsStore";
import { julesStore } from "../stores/julesStore";
import { tradeStore } from "../stores/tradeStore";
import { uiStore } from "../stores/uiStore";
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
    const settings = get(settingsStore);
    const trade = get(tradeStore);
    const ui = get(uiStore);
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
          ])
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
