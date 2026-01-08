import { get } from 'svelte/store';
import { settingsStore } from '../stores/settingsStore';
import { tradeStore } from '../stores/tradeStore';
import { uiStore } from '../stores/uiStore';
import { accountStore } from '../stores/accountStore';
import { marketStore } from '../stores/marketStore';

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
        const market = get(marketStore);

        // Sanitize Settings (remove API Secrets)
        const safeSettings = {
            ...settings,
            apiKeys: settings.apiKeys ? Object.fromEntries(
                Object.entries(settings.apiKeys).map(([provider, keys]) => [
                    provider,
                    { ...keys, apiSecret: '***REDACTED***' }
                ])
            ) : {}
        };

        // Simplify Trade State (too large)
        const safeTradeState = {
            symbol: trade.symbol,
            entryPrice: trade.entryPrice,
            stopLossPrice: trade.stopLossPrice,
            takeProfitTargets: trade.takeProfitTargets.length,
            isLong: trade.isLong,
            leverage: trade.leverage,
            riskAmount: trade.riskAmount,
            // Add other relevant fields, exclude massive history arrays if any
        };

        // Simplify Account Store
        const safeAccount = {
            balance: account.balance,
            availableBalance: account.availableBalance,
            positionsCount: account.positions.length,
            ordersCount: account.openOrders.length,
            isConnected: market.wsStatus === 'connected' // mapping from market/ws store
        };

        return {
            settings: safeSettings,
            tradeState: safeTradeState,
            accountSummary: safeAccount,
            uiState: {
                theme: ui.theme,
                isMobile: ui.isMobile,
                activeModal: ui.activeModal
            },
            timestamp: new Date().toISOString(),
            userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'Server/Test'
        };
    },

    /**
     * Sends a report to the Jules API Backend.
     */
    async reportToJules(error: any = null, mode: 'AUTO' | 'MANUAL' = 'MANUAL') {
        try {
            const context = this.getSystemSnapshot();

            // If manual, we might want to show a loading toast here
            // logging for now
            console.log(`[JulesService] Sending ${mode} report...`);

            const response = await fetch('/api/jules', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    mode,
                    context,
                    error: error ? {
                        message: error.message || error.toString(),
                        stack: error.stack,
                        name: error.name
                    } : null
                })
            });

            if (!response.ok) {
                throw new Error(`Server returned ${response.status}`);
            }

            const result = await response.json();

            console.log('[JulesService] Response:', result.message);
            return result.message;

        } catch (err) {
            console.error('[JulesService] Failed to report:', err);
            return null; // Silent fail to not crash the app further
        }
    }
};
