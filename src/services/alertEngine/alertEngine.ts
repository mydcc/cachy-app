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

class AlertEngineService {
  private wasmModule: WasmModule | null = null;
  private instance: WasmAlertEngineInstance | null = null;
  private loadingPromise: Promise<void> | null = null;
  private onAlertFiredCallbacks: ((event: AlertEvent) => void)[] = [];

  async ensureLoaded(): Promise<void> {
    if (this.wasmModule) return;
    if (this.loadingPromise) return this.loadingPromise;

    this.loadingPromise = (async () => {
      try {
        const wasmJsPath = '/wasm/technicals_wasm.js';
        const wasmBinaryPath = '/wasm/technicals_wasm_bg.wasm';

        const mod = await import(/* @vite-ignore */ wasmJsPath);
        await mod.default(wasmBinaryPath);

        this.wasmModule = mod;
        this.instance = new mod.AlertEngineWasm();

        logger.log('alerts', '[AlertEngine] WASM Alert Engine loaded successfully.');
      } catch (err) {
        logger.error('alerts', '[AlertEngine] Failed to load WASM alert engine', err);
        throw err;
      }
    })();

    return this.loadingPromise;
  }

  setAlerts(alerts: AlertDefinition[]) {
    if (!this.instance) return;
    try {
      this.instance.set_alerts(JSON.stringify(alerts));
    } catch (e) {
      logger.error('alerts', '[AlertEngine] Error setting alerts', e);
    }
  }

  addAlert(alert: AlertDefinition) {
    if (!this.instance) return;
    try {
      this.instance.add_alert(JSON.stringify(alert));
    } catch (e) {
      logger.error('alerts', '[AlertEngine] Error adding alert', e);
    }
  }

  removeAlert(id: string) {
    if (!this.instance) return;
    try {
      this.instance.remove_alert(id);
    } catch (e) {
      logger.error('alerts', '[AlertEngine] Error removing alert', e);
    }
  }

  evaluate(symbol: string, currentPriceStr: string, timestamp: number) {
    if (!this.instance) return;
    try {
      const events: AlertEvent[] = this.instance.evaluate(symbol, currentPriceStr, timestamp);
      if (events && events.length > 0) {
        events.forEach(event => {
            logger.log('alerts', `[AlertEngine] ALERT FIRED for ${event.symbol} at ${event.price}`);
            this.notifyFired(event);
        });
      }
    } catch (e) {
        logger.error('alerts', `[AlertEngine] Evaluation error for ${symbol}`, e);
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
