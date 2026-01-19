/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import { browser } from "$app/environment";
import { CONSTANTS } from "../lib/constants";

class UiManager {
    currentTheme = $state("dark");
    showJournalModal = $state(false);
    showChangelogModal = $state(false);
    showGuideModal = $state(false);
    showPrivacyModal = $state(false);
    showWhitepaperModal = $state(false);
    showCopyFeedback = $state(false);
    showSaveFeedback = $state(false);
    errorMessage = $state("");
    showErrorMessage = $state(false);
    isPriceFetching = $state(false);
    isAtrFetching = $state(false);
    symbolSuggestions = $state<string[]>([]);
    showSymbolSuggestions = $state(false);
    showSettingsModal = $state(false);
    settingsTab = $state("general");

    // Loading State
    isLoading = $state(false);
    loadingMessage = $state("");

    // Sync Progress State
    syncProgress = $state<{
        total: number;
        current: number;
        step: string;
    } | null>(null);

    tooltip = $state<{
        visible: boolean;
        type: "position" | "order" | null;
        data: any;
        x: number;
        y: number;
    }>({
        visible: false,
        type: null,
        data: null,
        x: 0,
        y: 0,
    });

    constructor() {
        if (browser) {
            this.currentTheme =
                localStorage.getItem(CONSTANTS.LOCAL_STORAGE_THEME_KEY) || "dark";
        }
    }

    // Legacy Subscribe for backward compatibility (simulates readable store)
    subscribe(fn: (value: any) => void) {
        return $effect.root(() => {
            // Create a snapshot of the current state
            const stateSnapshot = {
                currentTheme: this.currentTheme,
                showJournalModal: this.showJournalModal,
                showChangelogModal: this.showChangelogModal,
                showGuideModal: this.showGuideModal,
                showPrivacyModal: this.showPrivacyModal,
                showWhitepaperModal: this.showWhitepaperModal,
                showCopyFeedback: this.showCopyFeedback,
                showSaveFeedback: this.showSaveFeedback,
                errorMessage: this.errorMessage,
                showErrorMessage: this.showErrorMessage,
                isPriceFetching: this.isPriceFetching,
                isAtrFetching: this.isAtrFetching,
                symbolSuggestions: this.symbolSuggestions,
                showSymbolSuggestions: this.showSymbolSuggestions,
                showSettingsModal: this.showSettingsModal,
                settingsTab: this.settingsTab,
                isLoading: this.isLoading,
                loadingMessage: this.loadingMessage,
                syncProgress: this.syncProgress,
                tooltip: this.tooltip,
            };
            fn(stateSnapshot);
            return () => { };
        });
    }

    // Helper method to make migration easier (maps update(fn) to direct state changes)
    update(fn: (state: any) => any) {
        // This is a rough approximation. 
        // Since we are migrating to direct property access, we shouldn't heavily rely on this.
        // However, for parts of the code we haven't touched yet, this might help avoid runtime crashes.
        // Ideally, we replace all uiStore.update(...) calls with direct assignments.
        const stateSnapshot = {
            currentTheme: this.currentTheme,
            showJournalModal: this.showJournalModal,
            showChangelogModal: this.showChangelogModal,
            showGuideModal: this.showGuideModal,
            showPrivacyModal: this.showPrivacyModal,
            showWhitepaperModal: this.showWhitepaperModal,
            showCopyFeedback: this.showCopyFeedback,
            showSaveFeedback: this.showSaveFeedback,
            errorMessage: this.errorMessage,
            showErrorMessage: this.showErrorMessage,
            isPriceFetching: this.isPriceFetching,
            isAtrFetching: this.isAtrFetching,
            symbolSuggestions: this.symbolSuggestions,
            showSymbolSuggestions: this.showSymbolSuggestions,
            showSettingsModal: this.showSettingsModal,
            settingsTab: this.settingsTab,
            isLoading: this.isLoading,
            loadingMessage: this.loadingMessage,
            syncProgress: this.syncProgress,
            tooltip: this.tooltip,
        };
        const newState = fn(stateSnapshot);
        Object.assign(this, newState);
    }

    setTheme(themeName: string) {
        if (this.currentTheme === themeName) return;
        this.currentTheme = themeName;
        this.applyThemeToDom(themeName);
    }

    applyThemeToDom(themeName: string) {
        if (!browser) return;

        const html = document.documentElement;
        const currentThemeClass = Array.from(html.classList).find((c) =>
            c.startsWith("theme-"),
        );
        const expectedClass = themeName !== "dark" ? `theme-${themeName}` : null;

        if (
            currentThemeClass === expectedClass ||
            (!currentThemeClass && !expectedClass)
        ) {
            // DOM is already correct
        } else {
            html.classList.forEach((className) => {
                if (className.startsWith("theme-")) {
                    html.classList.remove(className);
                }
            });

            document.body.classList.forEach((className) => {
                if (className.startsWith("theme-")) {
                    document.body.classList.remove(className);
                }
            });

            if (themeName !== "dark") {
                html.classList.add(`theme-${themeName}`);
            }
        }

        // Update background color for immediate feedback
        const bgColors: Record<string, string> = {
            dark: "#0f172a",
            light: "#f1f5f9",
            VIP: "#121212",
            matrix: "#000000",
            meteorite: "#0c082f",
            steel: "#08103f",
            dracula: "#282a36",
            "solarized-light": "#fdf6e3",
            "solarized-dark": "#002b36",
            nord: "#2e3440",
            "gruvbox-dark": "#282828",
            monokai: "#1e1f1c",
            "tokyo-night": "#1a1b26",
            "everforest-dark": "#2d353b",
            "github-dark": "#0d1117",
            "github-light": "#ffffff",
            "ayu-dark": "#0f1419",
            "ayu-light": "#f8f9fa",
            "ayu-mirage": "#1f2430",
            midnight: "#0d1117",
            cobalt2: "#193549",
        };
        const bgColor = bgColors[themeName] || bgColors["dark"];
        html.style.backgroundColor = bgColor;

        // Browser-native integration
        const isLightTheme = [
            "light",
            "solarized-light",
            "github-light",
            "ayu-light",
        ].includes(themeName);
        html.style.colorScheme = isLightTheme ? "light" : "dark";
        html.style.backgroundImage = "none";

        try {
            localStorage.setItem(CONSTANTS.LOCAL_STORAGE_THEME_KEY, themeName);
            const expires = new Date(
                Date.now() + 365 * 24 * 60 * 60 * 1000,
            ).toUTCString(); // 1 year
            document.cookie = `${CONSTANTS.LOCAL_STORAGE_THEME_KEY}=${themeName}; expires=${expires}; path=/; SameSite=Lax`;

            if (typeof window !== "undefined" && (window as any)._mtm) {
                (window as any)._mtm.push({
                    event: "customEvent",
                    "custom-event-category": "Settings",
                    "custom-event-action": "ChangeTheme",
                    "custom-event-name": themeName,
                });
            }
        } catch (e) {
            console.warn("Could not save theme.", e);
        }
    }

    toggleJournalModal(show: boolean) {
        this.showJournalModal = show;
    }
    toggleChangelogModal(show: boolean) {
        this.showChangelogModal = show;
    }
    toggleGuideModal(show: boolean) {
        this.showGuideModal = show;
    }
    togglePrivacyModal(show: boolean) {
        this.showPrivacyModal = show;
    }
    toggleWhitepaperModal(show: boolean) {
        this.showWhitepaperModal = show;
    }
    toggleSettingsModal(show: boolean) {
        this.showSettingsModal = show;
    }

    openSettings(tab = "general") {
        this.showSettingsModal = true;
        this.settingsTab = tab;
    }

    showFeedback(type: "copy" | "save", duration = 2000) {
        if (type === "copy") this.showCopyFeedback = true;
        else this.showSaveFeedback = true;

        setTimeout(() => {
            if (type === "copy") this.showCopyFeedback = false;
            else this.showSaveFeedback = false;
        }, duration);
    }

    showError(message: string) {
        this.errorMessage = message;
        this.showErrorMessage = true;
    }

    hideError() {
        this.errorMessage = "";
        this.showErrorMessage = false;
    }

    showLoading(message = "Loading...") {
        this.isLoading = true;
        this.loadingMessage = message;
    }

    hideLoading() {
        this.isLoading = false;
        this.loadingMessage = "";
    }

    setSyncProgress(progress: { total: number; current: number; step: string } | null) {
        this.syncProgress = progress;
    }

    showTooltip(type: "position" | "order", data: any, x: number, y: number) {
        this.tooltip = { visible: true, type, data, x, y };
    }

    hideTooltip() {
        this.tooltip.visible = false;
    }
}

export const uiState = new UiManager();
