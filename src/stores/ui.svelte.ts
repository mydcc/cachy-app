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

class FloatingWindow {
  id = $state("");
  visible = $state(true);
  url = $state("");
  title = $state("");
  width = $state(768);
  height = $state(465);
  x = $state(100);
  y = $state(100);
  zIndex = $state(70);

  constructor(data: {
    id: string;
    url: string;
    title: string;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    zIndex?: number;
  }) {
    this.id = data.id;
    this.url = data.url;
    this.title = data.title;
    if (data.x !== undefined) this.x = data.x;
    if (data.y !== undefined) this.y = data.y;
    if (data.width !== undefined) this.width = data.width;
    if (data.height !== undefined) this.height = data.height;
    if (data.zIndex !== undefined) this.zIndex = data.zIndex;
  }
}

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
  isSyncing = $state(false); // Prevents concurrent sync operations
  isAtrFetching = $state(false);
  symbolSuggestions = $state<string[]>([]);
  showSymbolSuggestions = $state(false);
  showSettingsModal = $state(false);
  settingsTab = $state("profile");
  settingsProfileTab = $state<"general" | "appearance" | "controls">("general");
  settingsWorkspaceTab = $state("sidebar");

  // Floating Windows Management
  windows = $state<FloatingWindow[]>([]);
  private windowOffset = 30; // Cascading offset
  private basePosition = { x: 100, y: 100 };
  private maxZIndex = 70; // Starting z-index for floating windows

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
        isSyncing: this.isSyncing,
        isAtrFetching: this.isAtrFetching,
        symbolSuggestions: this.symbolSuggestions,
        showSymbolSuggestions: this.showSymbolSuggestions,
        showSettingsModal: this.showSettingsModal,
        settingsTab: this.settingsTab,
        settingsProfileTab: this.settingsProfileTab,
        settingsWorkspaceTab: this.settingsWorkspaceTab,
        isLoading: this.isLoading,
        loadingMessage: this.loadingMessage,
        syncProgress: this.syncProgress,
        tooltip: this.tooltip,
        windows: this.windows, // Expose windows
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
      isSyncing: this.isSyncing,
      isAtrFetching: this.isAtrFetching,
      symbolSuggestions: this.symbolSuggestions,
      showSymbolSuggestions: this.showSymbolSuggestions,
      showSettingsModal: this.showSettingsModal,
      settingsTab: this.settingsTab,
      settingsProfileTab: this.settingsProfileTab,
      settingsWorkspaceTab: this.settingsWorkspaceTab,
      isLoading: this.isLoading,
      loadingMessage: this.loadingMessage,
      syncProgress: this.syncProgress,
      tooltip: this.tooltip,
      windows: this.windows,
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

  openSettings(tab = "profile") {
    this.showSettingsModal = true;
    this.settingsTab = tab;
  }

  // --- Dynamic Window Management ---
  openWindow(id: string, url: string, title: string) {
    const existingIndex = this.windows.findIndex((w) => w.id === id);

    if (existingIndex !== -1) {
      // Window exists, bring to front/update
      const w = this.windows[existingIndex];
      w.visible = true;
      w.url = url;
      w.title = title;
      this.bringToFront(id);
    } else {
      // Create new window
      // Calculate cascade position based on number of open windows
      const count = this.windows.length;
      const x = this.basePosition.x + (count * this.windowOffset) % 200;
      const y = this.basePosition.y + (count * this.windowOffset) % 200;

      this.windows.push(
        new FloatingWindow({
          id,
          url,
          title,
          x,
          y,
          zIndex: ++this.maxZIndex,
        }),
      );
    }
  }

  bringToFront(id: string) {
    const window = this.windows.find((w) => w.id === id);
    if (window) {
      window.zIndex = ++this.maxZIndex;
    }
  }

  closeWindow(id: string) {
    this.windows = this.windows.filter((w) => w.id !== id);
  }

  toggleWindow(id: string, url: string, title: string) {
    const existingIndex = this.windows.findIndex((w) => w.id === id);
    if (existingIndex !== -1) {
      this.closeWindow(id);
    } else {
      this.openWindow(id, url, title);
    }
  }

  // Legacy Wrapper for "Genesis" (Main) Modal
  toggleIframeModal(visible: boolean, url = "", title = "") {
    if (visible) {
      this.openWindow("genesis", url, title);
    } else {
      this.closeWindow("genesis");
    }
  }

  // Legacy Wrapper for "Channel" Modal
  toggleIframeModal2(visible: boolean, url = "", title = "") {
    // For legacy channel calls, we might need a unique ID if not provided.
    // However, existing usages likely want a specific channel.
    // If this is called generically, we might need to know WHICH channel.
    // But since this was just added, we can assume 'channel' ID or similar.
    // For now, let's map it to a generic 'channel_secondary' if no better info exists,
    // BUT strictly speaking, the updated code in MarketOverview uses toggleIframeModal2
    // with a specific URL/Title.
    // Actually, MarketOverview refactor is part of this plan.
    // We should deprecate this method and update MarketOverview directly.
    // But to keep TypeScript happy until then:
    if (visible) {
      // Use title as pseudo-ID if unique enough, or just 'secondary'
      // Better: MarketOverview will be updated to use openWindow directly.
      this.openWindow("secondary_legacy", url, title);
    } else {
      this.closeWindow("secondary_legacy");
    }
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
}

export const uiState = new UiManager();
