import { writable } from "svelte/store";
import { browser } from "$app/environment";
import { CONSTANTS } from "../lib/constants";

interface UiState {
  currentTheme: string;
  showJournalModal: boolean;
  showChangelogModal: boolean;
  showGuideModal: boolean;
  showPrivacyModal: boolean;
  showWhitepaperModal: boolean;
  showCopyFeedback: boolean;
  showSaveFeedback: boolean;
  errorMessage: string;
  showErrorMessage: boolean;
  isPriceFetching: boolean;
  isAtrFetching: boolean;
  symbolSuggestions: string[];
  showSymbolSuggestions: boolean;
  showSettingsModal: boolean;
  settingsTab: string;
  // Loading State
  isLoading: boolean;
  loadingMessage: string;
  // Sync Progress State
  syncProgress: {
    total: number;
    current: number;
    step: string; // e.g. "Fetching History", "Processing 10/50"
  } | null;
}

const initialUiState: UiState = {
  currentTheme: "dark", // Default state
  showJournalModal: false,
  showChangelogModal: false,
  showGuideModal: false,
  showPrivacyModal: false,
  showWhitepaperModal: false,
  showSettingsModal: false,
  settingsTab: "general",
  showCopyFeedback: false,
  showSaveFeedback: false,
  errorMessage: "",
  showErrorMessage: false,
  isPriceFetching: false,
  isAtrFetching: false,
  symbolSuggestions: [],
  showSymbolSuggestions: false,
  isLoading: false,
  loadingMessage: "",
  syncProgress: null,
};

// Synchron mit HTML-Script: Lade Theme VOR Store-Erstellung
function getInitialTheme(): string {
  if (!browser) return "dark";
  try {
    return localStorage.getItem(CONSTANTS.LOCAL_STORAGE_THEME_KEY) || "dark";
  } catch {
    return "dark";
  }
}

// Initialize with actual user theme to sync with HTML inline script
const hydratedInitialState: UiState = {
  ...initialUiState,
  currentTheme: getInitialTheme(),
};

function createUiStore() {
  const { subscribe, update, set } = writable<UiState>(hydratedInitialState);

  return {
    subscribe,
    update,
    set,
    setTheme: (themeName: string) => {
      update((state) => {
        // Skip if theme is already set to prevent unnecessary DOM manipulation
        if (state.currentTheme === themeName) {
          return state;
        }
        return { ...state, currentTheme: themeName };
      });
      if (browser) {
        // Only update DOM if theme actually changed
        const html = document.documentElement;
        const currentThemeClass = Array.from(html.classList).find((c) =>
          c.startsWith("theme-"),
        );
        const expectedClass =
          themeName !== "dark" ? `theme-${themeName}` : null;

        // Skip DOM update if already correct
        if (
          currentThemeClass === expectedClass ||
          (!currentThemeClass && !expectedClass)
        ) {
          return;
        }

        // Clean up body classes just in case (migration)
        document.body.classList.forEach((className) => {
          if (className.startsWith("theme-")) {
            document.body.classList.remove(className);
          }
        });

        // Update HTML classes
        html.classList.forEach((className) => {
          if (className.startsWith("theme-")) {
            html.classList.remove(className);
          }
        });

        if (themeName !== "dark") {
          html.classList.add(`theme-${themeName}`);
        }

        // Update background color for immediate feedback (matches app.html logic)
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

        // Ensure background-image is cleared when manually setting background color
        // to prevent gradients from sticking around if theme changes from gradient to solid
        html.style.backgroundImage = "none";

        try {
          localStorage.setItem(CONSTANTS.LOCAL_STORAGE_THEME_KEY, themeName);
          const expires = new Date(
            Date.now() + 365 * 24 * 60 * 60 * 1000,
          ).toUTCString(); // 1 year
          document.cookie = `${CONSTANTS.LOCAL_STORAGE_THEME_KEY}=${themeName}; expires=${expires}; path=/; SameSite=Lax`;

          // Track theme change (import trackCustomEvent at top of file)
          if (typeof window !== "undefined" && (window as any)._mtm) {
            const trackCustomEvent = (
              category: string,
              action: string,
              name?: string,
            ) => {
              (window as any)._mtm.push({
                event: "customEvent",
                "custom-event-category": category,
                "custom-event-action": action,
                "custom-event-name": name || "",
              });
            };
            trackCustomEvent("Settings", "ChangeTheme", themeName);
          }
        } catch (e) {
          console.warn("Could not save theme.", e);
        }
      }
    },
    toggleJournalModal: (show: boolean) =>
      update((state) => ({ ...state, showJournalModal: show })),
    toggleChangelogModal: (show: boolean) =>
      update((state) => ({ ...state, showChangelogModal: show })),
    toggleGuideModal: (show: boolean) =>
      update((state) => ({ ...state, showGuideModal: show })),
    togglePrivacyModal: (show: boolean) =>
      update((state) => ({ ...state, showPrivacyModal: show })),
    toggleWhitepaperModal: (show: boolean) =>
      update((state) => ({ ...state, showWhitepaperModal: show })),
    toggleSettingsModal: (show: boolean) =>
      update((state) => ({ ...state, showSettingsModal: show })),
    openSettings: (tab = "general") =>
      update((state) => ({
        ...state,
        showSettingsModal: true,
        settingsTab: tab,
      })),
    showFeedback: (type: "copy" | "save", duration = 2000) => {
      const key = type === "copy" ? "showCopyFeedback" : "showSaveFeedback";
      update((state) => ({ ...state, [key]: true }));
      setTimeout(
        () => update((state) => ({ ...state, [key]: false })),
        duration,
      );
    },
    showError: (message: string) =>
      update((state) => ({
        ...state,
        errorMessage: message,
        showErrorMessage: true,
      })),
    hideError: () =>
      update((state) => ({
        ...state,
        errorMessage: "",
        showErrorMessage: false,
      })),
    // Added methods for loading state
    showLoading: (message = "Loading...") =>
      update((state) => ({
        ...state,
        isLoading: true,
        loadingMessage: message,
      })),
    hideLoading: () =>
      update((state) => ({ ...state, isLoading: false, loadingMessage: "" })),
    setSyncProgress: (progress: UiState["syncProgress"]) =>
      update((state) => ({ ...state, syncProgress: progress })),
  };
}

export const uiStore = createUiStore();
