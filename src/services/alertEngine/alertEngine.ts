/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import { logger } from "../logger";

// Define the shape of our WASM glue module
interface WasmAlertEngineInstance {
  set_alerts(alertsJson: string): void;
  add_alert(alertJson: string): void;
  remove_alert(id: string): void;
  evaluate(symbol: string, currentPriceStr: string, timestamp: number): AlertEvent[];
  free(): void;
}

interface WasmModule {
  default: (wasmBinaryPath: string) => Promise<void>;
  AlertEngineWasm: new () => WasmAlertEngineInstance;
}

export interface AlertCondition {
  // Decimal strings only — the Rust side deserializes AlertCondition's
  // threshold with rust_decimal's `serde-with-str`, which rejects a bare
  // JSON number. e.g. { price_reached: "50000.0" }
  [key: string]: string;
}

export interface AlertDefinition {
  id: string;
  symbol: string;
  condition: AlertCondition;
  active: boolean;
}

export interface AlertEvent {
  alert_id: string;
  symbol: string;
  timestamp: number;
  price: string;
}

export type WasmModuleLoader = () => Promise<WasmModule>;

/**
 * Loads the WASM glue and initialises its binary. Extracted so a test can
 * substitute a fake module at this seam and still exercise the real
 * `ensureLoaded` path. Mocking the whole service instead would only prove that
 * a mock was called, not that `instance` is ever assigned — which is precisely
 * what BUG-0382 got wrong.
 */
const loadWasmModule: WasmModuleLoader = async () => {
  const wasmJsPath = '/wasm/technicals_wasm.js';
  const wasmBinaryPath = '/wasm/technicals_wasm_bg.wasm';

  const mod = (await import(/* @vite-ignore */ wasmJsPath)) as WasmModule;
  await mod.default(wasmBinaryPath);
  return mod;
};

class AlertEngineService {
  private wasmModule: WasmModule | null = null;
  private instance: WasmAlertEngineInstance | null = null;
  private loadingPromise: Promise<void> | null = null;
  private onAlertFiredCallbacks: ((event: AlertEvent) => void)[] = [];

  /**
   * The exact payload `set_alerts` last accepted, or `null` whenever the
   * engine's alert set is not known to match one.
   *
   * FEAT-0387 turns `setAlerts` from an occasional call into a periodic one:
   * every candle close re-syncs legacy coverage, and so does the re-sync timer
   * in `alerts.svelte.ts`. Nearly every one of those pushes is identical to the
   * one before it, and each costs a full `JSON.stringify` of the alert set plus
   * a crossing of the WASM boundary.
   *
   * Comparing the *serialised payload* rather than the coverage set that
   * produced it is what makes skipping safe. It is the very argument
   * `set_alerts` would receive, so an identical one provably leaves the engine
   * in the state it is already in. Coverage itself is still recomputed on every
   * call — nothing can go stale here by not being looked at.
   *
   * Every other path that moves the engine's alert set clears this: `add_alert`,
   * `remove_alert`, a failed push, and a freshly constructed instance, which
   * starts empty and would otherwise be skipped into holding nothing at all —
   * BUG-0382 reached through a cache.
   */
  private lastAlertsJson: string | null = null;

  /**
   * What the engine holds, by id — BUG-0448.
   *
   * The core keeps its alert set behind the WASM boundary and offers no read
   * back, but a replay has to know which alerts it would reach before it runs.
   * Every path that moves the core's set moves this one only once the core
   * accepted the change, and `evaluate` mirrors the core's fire-once flip of
   * `active`, so putting a withheld alert back can never re-arm one that fired.
   */
  private held = new Map<string, AlertDefinition>();

  /**
   * Whether the engine can actually evaluate. While this is false every method
   * below early-returns and no alert can fire — the state BUG-0382 shipped in.
   */
  get isLoaded(): boolean {
    return this.instance !== null;
  }

  async ensureLoaded(loadModule: WasmModuleLoader = loadWasmModule): Promise<void> {
    if (this.wasmModule) return;
    if (this.loadingPromise) return this.loadingPromise;

    this.loadingPromise = (async () => {
      try {
        const mod = await loadModule();

        this.wasmModule = mod;
        this.instance = new mod.AlertEngineWasm();
        // Belt and braces: a second instance is not reachable today
        // (ensureLoaded returns early once wasmModule is set), but a new one
        // holds no alerts, and anything remembered about the previous one
        // would let the next setAlerts() skip the push that fills it.
        this.lastAlertsJson = null;
        this.held = new Map();

        logger.log('alerts', '[AlertEngine] WASM Alert Engine loaded successfully.');
      } catch (err) {
        // Clear the cached promise so a later attempt can retry. Leaving the
        // rejected promise in place would make one transient failure permanent
        // for the lifetime of the tab.
        this.loadingPromise = null;
        logger.error('alerts', '[AlertEngine] Failed to load WASM alert engine', err);
        throw err;
      }
    })();

    return this.loadingPromise;
  }

  setAlerts(alerts: AlertDefinition[]) {
    if (!this.instance) return;

    const alertsJson = JSON.stringify(alerts);
    if (alertsJson === this.lastAlertsJson) return;

    try {
      this.instance.set_alerts(alertsJson);
      this.lastAlertsJson = alertsJson;
      this.held = new Map(alerts.map((alert) => [alert.id, { ...alert }]));
    } catch (e) {
      // Deliberately not remembered: after a failed push the engine's set is
      // unknown, and the next call has to send again rather than assume this
      // one landed.
      this.lastAlertsJson = null;
      logger.error('alerts', '[AlertEngine] Error setting alerts', e);
    }
  }

  addAlert(alert: AlertDefinition) {
    if (!this.instance) return;
    // Cleared before the call, not after: whether it throws or not, the set
    // this holds no longer describes the engine.
    this.lastAlertsJson = null;
    try {
      this.instance.add_alert(JSON.stringify(alert));
      this.held.set(alert.id, { ...alert });
    } catch (e) {
      logger.error('alerts', '[AlertEngine] Error adding alert', e);
    }
  }

  removeAlert(id: string) {
    if (!this.instance) return;
    this.lastAlertsJson = null;
    try {
      this.instance.remove_alert(id);
      this.held.delete(id);
    } catch (e) {
      logger.error('alerts', '[AlertEngine] Error removing alert', e);
    }
  }

  /** Copies of the alerts the engine holds for `symbol`, fired ones included. */
  heldAlertsFor(symbol: string): AlertDefinition[] {
    return Array.from(this.held.values())
      .filter((alert) => alert.symbol === symbol)
      .map((alert) => ({ ...alert }));
  }

  /**
   * Runs `run` with the given alerts out of the engine, then puts back exactly
   * the ones it took — BUG-0448.
   *
   * An id the engine does not hold is ignored rather than added afterwards: an
   * alert the rule engine covers is absent here on purpose, and putting it back
   * would arm it on both engines. An alert `run` itself re-added is left as
   * `run` left it.
   */
  withAlertsWithheld<T>(ids: readonly string[], run: () => T): T {
    const withheld = ids
      .map((id) => this.held.get(id))
      .filter((alert): alert is AlertDefinition => alert !== undefined);
    for (const alert of withheld) this.removeAlert(alert.id);
    try {
      return run();
    } finally {
      for (const alert of withheld) {
        if (!this.held.has(alert.id)) this.addAlert(alert);
      }
    }
  }

  /**
   * Evaluates one price against the engine's alert set.
   *
   * Returns `true` only when the engine actually ran and returned without
   * throwing. The return value is ignored on the hot path (`applyUpdate`) — it
   * exists so BUG-0441's replay can tell a completed evaluation from a WASM
   * refusal, which this method otherwise swallows, and report the latter as a
   * failed replay instead of a clean one.
   */
  evaluate(symbol: string, currentPriceStr: string, timestamp: number): boolean {
    if (!this.instance) return false;
    try {
      const events: AlertEvent[] = this.instance.evaluate(symbol, currentPriceStr, timestamp);
      if (events && events.length > 0) {
        events.forEach(event => {
            // Mirrors the core's hysteresis before anyone is told, so a
            // listener that withholds or re-reads the set sees it spent.
            const fired = this.held.get(event.alert_id);
            if (fired) this.held.set(event.alert_id, { ...fired, active: false });
            logger.log('alerts', `[AlertEngine] ALERT FIRED for ${event.symbol} at ${event.price}`);
            this.notifyFired(event);
        });
      }
      return true;
    } catch (e) {
        logger.error('alerts', `[AlertEngine] Evaluation error for ${symbol}`, e);
        return false;
    }
  }

  onAlertFired(callback: (event: AlertEvent) => void) {
      this.onAlertFiredCallbacks.push(callback);
      // Return a cleanup function
      return () => {
          this.onAlertFiredCallbacks = this.onAlertFiredCallbacks.filter(cb => cb !== callback);
      };
  }

  private notifyFired(event: AlertEvent) {
      this.onAlertFiredCallbacks.forEach(cb => cb(event));
  }
}

export const alertEngine = new AlertEngineService();
