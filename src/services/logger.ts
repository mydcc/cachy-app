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

/*
 * Copyright (C) 2026 MYDCT
 *
 * Centralized Logger Service
 * Enables granular control over console output via Settings.
 */

import { settingsState } from "../stores/settings.svelte";
import { browser } from "$app/environment";
import { toastService } from "./toastService.svelte";

export type LogCategory =
    | "technicals"
    | "network"
    | "ai"
    | "market"
    | "general"
    | "governance"
    | "journal"
    | "data"
    | "ui";

export interface LogOptions {
    force?: boolean;
    toast?: boolean;
    silent?: boolean;
}

class LoggerService {

    private isEnabled(category: LogCategory, force = false): boolean {
        if (!browser) return false;
        if (force) return true;

        // Use a safe access for settingsState to avoid circular dependency / initialization issues
        let settings;
        try {
            settings = settingsState;
            if (!settings) return category === "general";
        } catch (e) {
            // settingsState not yet initialized
            return category === "general";
        }

        // If debugMode is on, let everything through
        if (settings.debugMode) return true;

        if (!settings.logSettings) return category === "general";

        return !!(settings.logSettings as any)[category];
    }

    log(category: LogCategory, message: string, data?: any, force = false) {
        if (!this.isEnabled(category, force)) return;

        const prefix = `[${category.toUpperCase()}]`;
        const style = this.getStyle(category);

        if (data !== undefined) {
            console.log(`%c${prefix} ${message}`, style, data);
        } else {
            console.log(`%c${prefix} ${message}`, style);
        }
    }

    warn(category: LogCategory, message: string, data?: any, force = false) {
        if (!this.isEnabled(category, force)) return;
        const prefix = `[${category.toUpperCase()}]`;
        console.warn(`${prefix} ${message}`, data || "");
    }

    error(category: LogCategory, message: string, error?: any, options: LogOptions | boolean = true) {
        // Normalize options
        const opts: LogOptions = typeof options === 'boolean'
            ? { force: options }
            : options;

        const force = opts.force ?? true; // Default force to true for errors if not specified, matching legacy default
        const silent = opts.silent ?? false;

        // Console output logic
        if (!silent && this.isEnabled(category, force)) {
            const prefix = `[${category.toUpperCase()}]`;
            console.error(`${prefix} ${message}`, error || "");
        }

        // Toast logic
        // Auto-toast if explicitly requested OR if it's a forced UI error (critical UI issue)
        const shouldToast = opts.toast === true || (category === 'ui' && force === true);

        if (shouldToast) {
            toastService.error(message);
        }
    }

    debug(category: LogCategory, message: string, data?: any) {
        if (import.meta.env.DEV) {
            this.log(category, `DEBUG: ${message}`, data);
        }
    }

    private getStyle(category: LogCategory): string {
        switch (category) {
            case "technicals": return "color: #ad8; font-weight: bold;";
            case "network": return "color: #8af; font-weight: bold;";
            case "ai": return "color: #d8f; font-weight: bold;";
            case "market": return "color: #fd8; font-weight: bold;";
            case "journal": return "color: #f8a; font-weight: bold;";
            case "ui": return "color: #8df; font-weight: bold;";
            case "governance": return "color: #fca; font-weight: bold; border-left: 3px solid #f84; padding-left: 4px;";
            default: return "color: #ccc;";
        }
    }
}

export const logger = new LoggerService();
