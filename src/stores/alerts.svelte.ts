import { _ } from "../locales/i18n";
import { get } from "svelte/store";
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

import { browser } from "$app/environment";
import { alertEngine, type AlertDefinition, type WasmModuleLoader } from "../services/alertEngine/alertEngine";
import { migrateAlertsToRuleDocuments } from "../services/alertEngine/migrateAlertsToRules";
import { logger } from "../services/logger";
import { toastService } from "../services/toastService.svelte";


export interface AlertState {
    definitions: AlertDefinition[];
}

/**
 * Whether the evaluation engine is actually running.
 *
 * `failed` is the state that matters: definitions are still stored, but
 * nothing evaluates them, so an armed alert cannot fire. That has to be
 * visible in the UI — a stored alert that silently never fires is BUG-0382.
 */
export type AlertEngineStatus = "idle" | "ready" | "failed";

class AlertsManager {
    // Local-First Class A Data
    private static STORAGE_KEY = "cachy_alerts_v1";

    definitions = $state<AlertDefinition[]>([]);
    engineStatus = $state<AlertEngineStatus>("idle");

    constructor() {
        this.loadFromStorage();
    }

    private loadFromStorage() {
        try {
            const data = localStorage.getItem(AlertsManager.STORAGE_KEY);
            if (data) {
                const parsed = JSON.parse(data);
                this.definitions = parsed;
            }
        } catch (e) {
            logger.error('alerts', "Failed to load alerts from storage", e);
        }
    }

    private saveToStorage() {
        try {
            localStorage.setItem(AlertsManager.STORAGE_KEY, JSON.stringify(this.definitions));
        } catch (e) {
             logger.error('alerts', "Failed to save alerts to storage", e);
        }
    }

    addAlert(alert: AlertDefinition) {
        this.definitions.push(alert);
        this.saveToStorage();
        alertEngine.addAlert(alert);
    }

    removeAlert(id: string) {
        this.definitions = this.definitions.filter(a => a.id !== id);
        this.saveToStorage();
        alertEngine.removeAlert(id);
    }

    updateAlert(id: string, updates: Partial<AlertDefinition>) {
        const idx = this.definitions.findIndex(a => a.id === id);
        if (idx !== -1) {
            this.definitions[idx] = { ...this.definitions[idx], ...updates };
            this.saveToStorage();
            alertEngine.addAlert(this.definitions[idx]); // engine replaces if ID exists
        }
    }

    syncEngine() {
        alertEngine.setAlerts(this.definitions);
    }
}

alertEngine.onAlertFired((event) => {
    // 1. Toast Notification
    const t = get(_);
    const msg = (t as (key: string, options?: Record<string, unknown>) => string)("dashboard.alerts.priceReached", { values: { symbol: event.symbol, price: event.price.toString() } }) || `${event.symbol} reached ${event.price}`;
    toastService.success(msg);

    // 2. Mark alert as inactive locally so UI updates
    const idx = alertState.definitions.findIndex(a => a.id === event.alert_id);
    if (idx !== -1) {
        alertState.definitions[idx] = { ...alertState.definitions[idx], active: false };
        // Don't call saveToStorage directly from outside the class easily without a public method,
        // so we'll just use updateAlert which saves and syncs.
        alertState.updateAlert(event.alert_id, { active: false });
    }
});

export const alertState = new AlertsManager();

/**
 * Brings the alert engine up at client startup. BUG-0382: without this, every
 * method on `alertEngine` early-returns on a null instance and no alert can
 * ever fire, even though the market hot path calls `evaluate()` on every tick.
 *
 * The two steps are ordered and belong together: the engine has to exist
 * before definitions can be pushed into it, and definitions rehydrated from
 * `localStorage` only reach it via `syncEngine()` — `addAlert` covers alerts
 * armed in the current session, nothing covers alerts armed before a reload.
 *
 * Client-only: `ensureLoaded()` dynamically imports `/wasm/technicals_wasm.js`,
 * which does not exist during SSR.
 *
 * On failure this reports to the user itself — a toast now, and
 * `engineStatus: "failed"` for as long as it lasts — rather than leaving each
 * caller to remember. Alerts that are stored but never evaluated must not fail
 * silently a second time. It still rejects afterwards so a caller (or a test)
 * can tell that startup did not complete.
 */
export async function initAlertEngine(loadModule?: WasmModuleLoader): Promise<void> {
    if (!browser) return;

    // FEAT-0388: one-shot, best-effort — migrateAlertsToRuleDocuments()
    // never throws, so a migration hiccup cannot block the engine below.
    await migrateAlertsToRuleDocuments();

    try {
        await alertEngine.ensureLoaded(loadModule);
    } catch (e) {
        alertState.engineStatus = "failed";
        const t = get(_) as (key: string) => string;
        toastService.error(t("dashboard.alerts.engineUnavailable"));
        throw e;
    }

    alertState.syncEngine();
    alertState.engineStatus = "ready";
}
