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

        // Auto-toast for critical UI errors, or if specifically requested
        // For now, we only automatically toast if 'force' is true and category is 'ui'
        // or if we decide to add a specific parameter.
        // Let's rely on explicit calls for now to avoid noise, 
        // BUT the user asked for "silent" errors to be shown.
        // We can add a 'toast' parameter to the error signature or overload it.
        // For this refactor, let's keep it simple: existing 'error' calls typically don't expect toasts.
        // We will add specific instrumentation in the next step.
    }

    errorWithToast(category: LogCategory, message: string, error?: any) {
        this.error(category, message, error, true);
        toastService.error(message);
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
