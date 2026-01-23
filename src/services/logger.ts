/*
 * Copyright (C) 2026 MYDCT
 *
 * Centralized Logger Service
 * Enables granular control over console output via Settings.
 */

import { settingsState } from "../stores/settings.svelte";
import { browser } from "$app/environment";

export type LogCategory =
    | "technicals"
    | "network"
    | "ai"
    | "market"
    | "general";

class LoggerService {

    private isEnabled(category: LogCategory): boolean {
        if (!browser) return false;
        // Master switch (optional, using existing enableNetworkLogs for network)
        // or specific categories in settings

        const settings = settingsState;
        if (!settings.logSettings) return category === "general";

        return !!settings.logSettings[category];
    }

    log(category: LogCategory, message: string, data?: any) {
        if (!this.isEnabled(category)) return;

        const prefix = `[${category.toUpperCase()}]`;
        const style = this.getStyle(category);

        if (import.meta.env.DEV) {
            if (data !== undefined) {
                console.log(`%c${prefix} ${message}`, style, data);
            } else {
                console.log(`%c${prefix} ${message}`, style);
            }
        }
    }

    warn(category: LogCategory, message: string, data?: any) {
        if (!this.isEnabled(category)) return;
        const prefix = `[${category.toUpperCase()}]`;
        if (import.meta.env.DEV) {
            console.warn(`${prefix} ${message}`, data || "");
        }
    }

    error(category: LogCategory, message: string, error?: any) {
        // Errors might be always visible regardless of settings? 
        // Usually yes, but let's allow filtering if desired for noise reduction.
        // For now, FORCE errors to be visible unless explicitly suppressed is safer,
        // but user asked to filter logs. We'll respect the filter but maybe default "error" types to ON.
        if (!this.isEnabled(category)) return;

        const prefix = `[${category.toUpperCase()}]`;
        if (import.meta.env.DEV) {
            console.error(`${prefix} ${message}`, error || "");
        }
    }

    private getStyle(category: LogCategory): string {
        switch (category) {
            case "technicals": return "color: #ad8; font-weight: bold;";
            case "network": return "color: #8af; font-weight: bold;";
            case "ai": return "color: #d8f; font-weight: bold;";
            case "market": return "color: #fd8; font-weight: bold;";
            default: return "color: #ccc;";
        }
    }
}

export const logger = new LoggerService();
