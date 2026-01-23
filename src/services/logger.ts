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
    | "general"
    | "journal"
    | "ui";

class LoggerService {

    private isEnabled(category: LogCategory, force = false): boolean {
        if (!browser) return false;
        if (force) return true;

        const settings = settingsState;

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

    error(category: LogCategory, message: string, error?: any, force = true) {
        if (!this.isEnabled(category, force)) return;

        const prefix = `[${category.toUpperCase()}]`;
        console.error(`${prefix} ${message}`, error || "");
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
            default: return "color: #ccc;";
        }
    }
}

export const logger = new LoggerService();
