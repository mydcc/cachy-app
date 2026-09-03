import { untrack } from "svelte";
import { tradeState } from "../stores/trade.svelte";
import { settingsState, type Settings } from "../stores/settings.svelte";
import { keysForActiveAccount } from "../stores/settings/accounts";
import { marketState } from "../stores/market.svelte";
import { marketWatcher } from "./marketWatcher";
import { connectionManager } from "./connectionManager";
import { accountSession } from "./accountSession.svelte";
import { fundingRateService } from "./fundingRateService.svelte";
import { normalizeSymbol } from "../utils/symbolUtils";
import { paperTradingService } from "./paperTradingService";
import { Decimal } from "decimal.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function setupRealtimeUpdatesEffect(app: any) {
  // FEAT-0026: the account id is part of the fingerprint now.
  //
  // It is *appended* to the credential string, never a replacement for it.
  // The credentials still have to be in here, because this effect's other
  // job is reconnecting when a user edits their keys without switching
  // anything — `app_realtimeUpdates.test.ts` pins that. Two accounts on one
  // venue will usually differ in their keys too, so the id looks redundant;
  // it is not, because "usually" is doing real work in that sentence and an
  // account switch must force a reconnect whether or not the keys happen to
  // differ.
  const computeKeys = (
    s: Pick<Settings, "apiProvider" | "accounts" | "activeAccountId">,
  ) => {
    const keys = keysForActiveAccount(s.accounts, s.activeAccountId, s.apiProvider);
    const credentials =
      s.apiProvider === "bitget"
        ? `${keys.key}:${keys.secret}:${keys.passphrase}`
        : `${keys.key}:${keys.secret}`;
    return `${s.activeAccountId}|${credentials}`;
  };

  let lastProvider = settingsState.apiProvider || "";
  let lastKeys = settingsState.accounts ? computeKeys(settingsState) : "";
  let currentWatchedSymbol: string | null = null;
  let symbolDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  const knownFundingRateSymbols = new Set<string>();

  return $effect.root(() => {
    // 1. Settings / Connection Manager
    $effect(() => {
      const s = settingsState;
      const provider = s.apiProvider;
      const keys = s.accounts;
      // Read so the effect re-runs on a switch. `computeKeys` reads it too,
      // but that call is inside `untrack`, so this is the only subscription.
      void s.activeAccountId;
      
      untrack(() => {
        if (!keys) return;

        const currentKeys = computeKeys(s);
        const providerChanged = provider !== lastProvider;
        const keysChanged = currentKeys !== lastKeys;

        if (providerChanged || keysChanged) {
          lastKeys = currentKeys;
          lastProvider = provider || "";

          // FEAT-0026: clear before reconnecting, not after.
          //
          // The clear lives here rather than inside a `switchAccount()`
          // helper because `activeAccountId` moves for more reasons than a
          // user clicking it: `removeAccount`, the cross-tab storage listener
          // calling `load()`, and a restored backup all change it. Only this
          // effect observes all of them.
          //
          // Not in `connectionManager.killAll()` either — that also runs on
          // shutdown and on a transient disconnect, where the cached
          // positions are stale but still true, and clearing there would
          // blank a trader's position view on a dropped packet.
          accountSession.reset(providerChanged ? "venue-switch" : "account-switch");

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

      // BUG-0289: a debounce timer armed just before the root is disposed
      // (HMR/teardown) would still fire and register watchers for a dead
      // symbol. Svelte also runs this teardown before every re-run, which is
      // what keeps rapid symbol changes debounced to the last one.
      return () => {
        if (symbolDebounceTimer) {
          clearTimeout(symbolDebounceTimer);
          symbolDebounceTimer = null;
        }
      };
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
            // FEAT-0012: the simulator fills resting orders against the same
            // live feed the chart draws, so paper results are produced by the
            // prices that actually happened. No-op while paper mode is off.
            paperTradingService.onPrice(normSymbol, new Decimal(lastPrice));
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

    // 5. Funding Rate Polling (REST, Bitunix only - see fundingRateService)
    $effect(() => {
      const provider = settingsState.apiProvider;
      if (provider !== "bitunix") return;
      fundingRateService.start();
      return () => fundingRateService.stop();
    });

    // 6. Backfill funding rate immediately for symbols newly added to
    // marketState (from fundingRateService's cache of the last REST poll).
    // Without this, a symbol that starts being tracked between polls - e.g.
    // right after page load, before the first poll's tracked-symbol set
    // includes it - would show no funding rate for up to POLL_INTERVAL_MS.
    $effect(() => {
      const symbols = Object.keys(marketState.data);
      untrack(() => {
        for (const symbol of symbols) {
          if (knownFundingRateSymbols.has(symbol)) continue;
          knownFundingRateSymbols.add(symbol);
          fundingRateService.applyCachedRateFor(symbol);
        }
      });
    });
  });
}
