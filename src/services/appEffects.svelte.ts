import { untrack } from "svelte";
import { tradeState } from "../stores/trade.svelte";
import { settingsState, type Settings } from "../stores/settings.svelte";
import { marketState } from "../stores/market.svelte";
import { marketWatcher } from "./marketWatcher";
import { connectionManager } from "./connectionManager";
import { normalizeSymbol } from "../utils/symbolUtils";
import { Decimal } from "decimal.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function setupRealtimeUpdatesEffect(app: any) {
  const computeKeys = (s: Settings) =>
    s.apiProvider === "bitget"
      ? `${s.apiKeys.bitget.key}:${s.apiKeys.bitget.secret}:${s.apiKeys.bitget.passphrase}`
      : `${s.apiKeys.bitunix.key}:${s.apiKeys.bitunix.secret}`;

  let lastProvider = settingsState.apiProvider || "";
  let lastKeys = settingsState.apiKeys ? computeKeys(settingsState) : "";
  let currentWatchedSymbol: string | null = null;
  let symbolDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  return $effect.root(() => {
    // 1. Settings / Connection Manager
    $effect(() => {
      const s = settingsState;
      const provider = s.apiProvider;
      const keys = s.apiKeys;
      
      untrack(() => {
        if (!keys) return;

        const currentKeys = computeKeys(s);
        const providerChanged = provider !== lastProvider;
        const keysChanged = currentKeys !== lastKeys;

        if (providerChanged || keysChanged) {
          lastKeys = currentKeys;
          lastProvider = provider || "";
          connectionManager.switchProvider(provider || "bitunix", { force: true });
        }
      });
    });

    // 2. Trade State Symbol -> Market Watcher Registration
    $effect(() => {
      const currentSymbol = tradeState.symbol;
      untrack(() => {
        const newSymbol = currentSymbol
          ? normalizeSymbol(currentSymbol, settingsState.apiProvider || "bitunix")
          : "";

        if (symbolDebounceTimer) clearTimeout(symbolDebounceTimer);

        symbolDebounceTimer = setTimeout(() => {
          if (newSymbol && newSymbol !== currentWatchedSymbol) {
            if (currentWatchedSymbol) {
              marketWatcher.unregister(currentWatchedSymbol, "price");
              marketWatcher.unregister(currentWatchedSymbol, "ticker");
            }
            marketWatcher.register(newSymbol, "price");
            marketWatcher.register(newSymbol, "ticker");
            currentWatchedSymbol = newSymbol;
          } else if (!newSymbol && currentWatchedSymbol) {
            marketWatcher.unregister(currentWatchedSymbol, "price");
            marketWatcher.unregister(currentWatchedSymbol, "ticker");
            currentWatchedSymbol = null;
          }
        }, 500);
      });
    });

    // 3. Market State Data -> Trade State Entry Price
    $effect(() => {
      const currentSymbol = tradeState.symbol;
      if (currentSymbol) {
        const normSymbol = normalizeSymbol(currentSymbol, settingsState.apiProvider || "bitunix");
        const marketData = marketState.data[normSymbol];
        
        if (marketData && marketData.lastPrice) {
          const lastPrice = marketData.lastPrice;
          untrack(() => {
            app.currentMarketPrice = lastPrice;
            if (settingsState.autoUpdatePriceInput) {
              const newPrice = new Decimal(lastPrice).toString();
              if (tradeState.entryPrice !== newPrice) {
                tradeState.entryPrice = newPrice;
              }
            }
          });
        }
      }
    });

    // 4. Market State Status
    $effect(() => {
      const status = marketState.connectionStatus;
      untrack(() => {
        if (status === "disconnected" || status === "reconnecting") {
          const settings = settingsState;
          if (settings.autoUpdatePriceInput) {
            // Fallback handled by marketWatcher polling
          }
        }
      });
    });
  });
}
