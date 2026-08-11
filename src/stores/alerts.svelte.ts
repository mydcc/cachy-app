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

import { alertEngine, type AlertDefinition } from "../services/alertEngine/alertEngine";
import { logger } from "../services/logger";
import { toastService } from "../services/toastService.svelte";
import { get } from "svelte/store";

export interface AlertState {
    definitions: AlertDefinition[];
}

class AlertsManager {
    // Local-First Class A Data
    private static STORAGE_KEY = "cachy_alerts_v1";

    definitions = $state<AlertDefinition[]>([]);

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
    const msg = `${event.symbol} reached ${event.price}`; // We use dynamic string formatting, or i18n via Svelte component later, but this ensures it works immediately
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
