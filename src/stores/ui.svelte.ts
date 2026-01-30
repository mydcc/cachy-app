/*
* Copyright (C) 2026 MYDCT
*
* This program is free software: you can redistribute it and/or modify
* it under the terms of the GNU Affero General Public License as published by
* the Free Software Foundation, either version 3 of the License, or
* (at your option) any later version.
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
import { untrack } from "svelte";
import { CONSTANTS } from "../lib/constants";
import { toastService } from "../services/toastService.svelte";
import { windowManager } from "../lib/windows/WindowManager.svelte";
import { ModalWindow } from "../lib/windows/implementations/ModalWindow.svelte";
import { MarkdownWindow } from "../lib/windows/implementations/MarkdownWindow.svelte";
// Components are imported dynamically in toggle methods to avoid circular dependencies

class UiManager {
  currentTheme = $state("dark");
  showCopyFeedback = $state(false);
  showSaveFeedback = $state(false);
  toastMessage = $state("");
  errorMessage = $state("");
  showErrorMessage = $state(false);
  isPriceFetching = $state(false);
  isSyncing = $state(false);
  isAtrFetching = $state(false);
  symbolSuggestions = $state<string[]>([]);
  showSymbolSuggestions = $state(false);
  settingsTab = $state("trading");
  settingsTradingSubTab = $state("market");
  settingsVisualsSubTab = $state("appearance");
  settingsAiSubTab = $state("intelligence");
  settingsConnectionsSubTab = $state("exchanges");
  settingsSystemSubTab = $state("performance");
  settingsIndicatorCategory = $state("general");
  settingsProfileTab = $state<"general" | "appearance" | "controls">("general");
  settingsWorkspaceTab = $state("sidebar");
  showMarketDashboardModal = $state(false);
  showAcademyModal = $state(false);

  get windows() {
    return windowManager.windows;
  }

  get showJournalModal() {
    return windowManager.isOpen("journal");
  }

  get showSettingsModal() {
    return windowManager.isOpen("settings");
  }

  get showGuideModal() {
    return windowManager.isOpen("guide");
  }

  get showChangelogModal() {
    return windowManager.isOpen("changelog");
  }

  get showPrivacyModal() {
    return windowManager.isOpen("privacy");
  }

  get showWhitepaperModal() {
    return windowManager.isOpen("whitepaper");
  }

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

  private notifyTimer: any = null;

  // Legacy Subscribe for backward compatibility
  subscribe(fn: (value: any) => void) {
    const getSnapshot = () => ({
      currentTheme: this.currentTheme,
      showCopyFeedback: this.showCopyFeedback,
      showSaveFeedback: this.showSaveFeedback,
      errorMessage: this.errorMessage,
      showErrorMessage: this.showErrorMessage,
      isPriceFetching: this.isPriceFetching,
      isSyncing: this.isSyncing,
      isAtrFetching: this.isAtrFetching,
      symbolSuggestions: this.symbolSuggestions,
      showSymbolSuggestions: this.showSymbolSuggestions,
      showMarketDashboardModal: this.showMarketDashboardModal,
      showAcademyModal: this.showAcademyModal,
      settingsTab: this.settingsTab,
      settingsTradingSubTab: this.settingsTradingSubTab,
      settingsVisualsSubTab: this.settingsVisualsSubTab,
      settingsAiSubTab: this.settingsAiSubTab,
      settingsConnectionsSubTab: this.settingsConnectionsSubTab,
      settingsSystemSubTab: this.settingsSystemSubTab,
      settingsProfileTab: this.settingsProfileTab,
      settingsWorkspaceTab: this.settingsWorkspaceTab,
      isLoading: this.isLoading,
      loadingMessage: this.loadingMessage,
      syncProgress: this.syncProgress,
      tooltip: this.tooltip,
    });

    fn(getSnapshot());

    return $effect.root(() => {
      $effect(() => {
        const snap = getSnapshot();
        untrack(() => {
          if (this.notifyTimer) clearTimeout(this.notifyTimer);
          this.notifyTimer = setTimeout(() => {
            fn(snap);
            this.notifyTimer = null;
          }, 20);
        });
      });
    });
  }

  // Legacy mapping to update(fn) to direct state changes
  update(fn: (state: any) => any) {
    const stateSnapshot = {
      currentTheme: this.currentTheme,
      showCopyFeedback: this.showCopyFeedback,
      showSaveFeedback: this.showSaveFeedback,
      errorMessage: this.errorMessage,
      showErrorMessage: this.showErrorMessage,
      isPriceFetching: this.isPriceFetching,
      isSyncing: this.isSyncing,
      isAtrFetching: this.isAtrFetching,
      symbolSuggestions: this.symbolSuggestions,
      showSymbolSuggestions: this.showSymbolSuggestions,
      showMarketDashboardModal: this.showMarketDashboardModal,
      showAcademyModal: this.showAcademyModal,
      settingsTab: this.settingsTab,
      settingsTradingSubTab: this.settingsTradingSubTab,
      settingsVisualsSubTab: this.settingsVisualsSubTab,
      settingsAiSubTab: this.settingsAiSubTab,
      settingsConnectionsSubTab: this.settingsConnectionsSubTab,
      settingsSystemSubTab: this.settingsSystemSubTab,
      settingsProfileTab: this.settingsProfileTab,
      settingsWorkspaceTab: this.settingsWorkspaceTab,
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
      ).toUTCString();
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

  async toggleJournalModal(show: boolean) {
    if (show) {
      const { default: JournalContent } = await import("../components/shared/JournalContent.svelte");
      windowManager.toggle("journal", () => {
        const win = new ModalWindow(JournalContent, "Trading Journal", {
          id: "journal",
          width: 1200,
          height: 800,
        });
        return win;
      });
    } else {
      windowManager.close("journal");
    }
  }
  async toggleGuideModal(show: boolean) {
    if (show) {
      const { loadInstruction } = await import("../services/markdownLoader");
      const { html, title } = await loadInstruction("guide");
      windowManager.toggle("guide", () => new MarkdownWindow(html, title, { id: "guide" }));
    } else {
      windowManager.close("guide");
    }
  }

  async toggleChangelogModal(show: boolean) {
    if (show) {
      const { loadInstruction } = await import("../services/markdownLoader");
      const { html, title } = await loadInstruction("changelog");
      windowManager.toggle("changelog", () => new MarkdownWindow(html, title, { id: "changelog" }));
    } else {
      windowManager.close("changelog");
    }
  }

  async togglePrivacyModal(show: boolean) {
    if (show) {
      const { loadInstruction } = await import("../services/markdownLoader");
      const { html, title } = await loadInstruction("privacy");
      windowManager.toggle("privacy", () => new MarkdownWindow(html, title, { id: "privacy" }));
    } else {
      windowManager.close("privacy");
    }
  }

  async toggleWhitepaperModal(show: boolean) {
    if (show) {
      const { loadInstruction } = await import("../services/markdownLoader");
      const { html, title } = await loadInstruction("whitepaper");
      windowManager.toggle("whitepaper", () => new MarkdownWindow(html, title, { id: "whitepaper" }));
    } else {
      windowManager.close("whitepaper");
    }
  }
  async toggleSettingsModal(show: boolean) {
    if (show) {
      const { default: SettingsContent } = await import("../components/settings/SettingsContent.svelte");
      windowManager.toggle("settings", () => {
        const win = new ModalWindow(SettingsContent, "Settings", {
          id: "settings",
          width: 900,
          height: 700,
        });
        return win;
      });
    } else {
      windowManager.close("settings");
    }
  }

  openSettings(tab: string = "trading") {
    this.settingsTab = tab;
    this.toggleSettingsModal(true);
  }

  toggleMarketDashboardModal(show: boolean) {
    this.showMarketDashboardModal = show;
  }

  toggleAcademyModal(show: boolean) {
    this.showAcademyModal = show;
  }

  showFeedback(type: "copy" | "save", duration = 2000) {
    if (type === "copy") this.showCopyFeedback = true;
    else {
      this.showSaveFeedback = true;
      this.toastMessage = "";
    }

    setTimeout(() => {
      if (type === "copy") this.showCopyFeedback = false;
      else {
        this.showSaveFeedback = false;
        this.toastMessage = "";
      }
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

  setSyncProgress(
    progress: { total: number; current: number; step: string } | null,
  ) {
    this.syncProgress = progress;
  }

  showTooltip(type: "position" | "order", data: any, x: number, y: number) {
    this.tooltip = { visible: true, type, data, x, y };
  }

  hideTooltip() {
    this.tooltip.visible = false;
  }

  showToast(message: string, type: "success" | "error" | "info" = "info") {
    if (type === "error") {
      this.showError(message);
      toastService.error(message);
    } else {
      if (type === "success") toastService.success(message);
      else toastService.info(message);

      console.log(`[Toast ${type}] ${message}`);
      this.toastMessage = message;
      this.showSaveFeedback = true;
      setTimeout(() => {
        this.showSaveFeedback = false;
        this.toastMessage = "";
      }, 2000);
    }
  }
}

export const uiState = new UiManager();
