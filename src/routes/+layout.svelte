<!--
  Copyright (C) 2026 MYDCT

  This program is free software: you can redistribute it and/or modify
  it under the terms of the GNU Affero General Public License as published by
  the Free Software Foundation, either version 3 of the License, or
  (at your option) any later version.

  This program is distributed in the hope that it will be useful,
  but WITHOUT ANY WARRANTY; without even the implied warranty of
  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
  GNU Affero General Public License for more details.

  You should have received a copy of the GNU Affero General Public License
  along with this program.  If not, see <https://www.gnu.org/licenses/>.
-->

<script lang="ts">
  import favicon from "../assets/favicon.svg";
  import { uiState } from "../stores/ui.svelte";
  import { settingsState } from "../stores/settings.svelte";
  import DisclaimerModal from "../components/shared/DisclaimerModal.svelte";
  import JournalView from "../components/shared/JournalView.svelte";
  import SettingsModal from "../components/settings/SettingsModal.svelte";
  import MarketDashboardModal from "../components/shared/MarketDashboardModal.svelte";
  import CustomModal from "../components/shared/CustomModal.svelte";
  import SymbolPickerModal from "../components/shared/SymbolPickerModal.svelte";
  import FloatingIframe from "../components/shared/FloatingIframe.svelte";
  import FloatingWindowsContainer from "../components/shared/FloatingWindowsContainer.svelte";
  import PositionTooltip from "../components/shared/PositionTooltip.svelte";
  import OrderDetailsTooltip from "../components/shared/OrderDetailsTooltip.svelte";
  import OfflineBanner from "../components/shared/OfflineBanner.svelte";
  import { onMount } from "svelte";
  import { initZoomPlugin } from "../lib/chartSetup";
  import BackgroundRenderer from "../components/shared/BackgroundRenderer.svelte";

  import ToastContainer from "../components/shared/ToastContainer.svelte";
  import FireOverlay from "../components/shared/FireOverlay.svelte";
  import FXOverlay from "../components/shared/FXOverlay.svelte";

  import { _ } from "../locales/i18n";

  import WindowContainer from "../components/shared/windows/WindowContainer.svelte";

  import "../app.css";

  import { CONSTANTS } from "../lib/constants";

  import { julesState } from "../stores/jules.svelte";
  import { browser } from "$app/environment";
  interface Props {
    children?: import("svelte").Snippet;
  }

  let { children }: Props = $props();

  // Removed local Jules state variables in favor of julesStore

  // --- CachyLog Integration (Developer & Manual Opt-in) ---
  // Connect to Server-Sent Events stream for real-time server logs
  $effect(() => {
    if (!browser) return;
    let evtSource: EventSource | null = null;

    const isDevDomain =
      window.location.hostname.includes("localhost") ||
      window.location.hostname.includes("dev.");

    const shouldEnable =
      settingsState.enableNetworkLogs || import.meta.env.DEV || isDevDomain;

    if (typeof EventSource !== "undefined" && shouldEnable) {
      try {
        evtSource = new EventSource("/api/stream-logs");

        evtSource.onmessage = (event) => {
          try {
            const logEntry = JSON.parse(event.data);
            const now = new Date();
            const timeStr =
              now.toLocaleTimeString([], {
                hour12: false,
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              }) +
              "." +
              now.getMilliseconds().toString().padStart(3, "0");

            // Styling for console
            const clStyle =
              "background: #1a1a1a; color: #00ff9d; padding: 2px 5px; border-radius: 3px 0 0 3px; font-weight: bold; border: 1px solid #333;";
            const timeStyle =
              "background: #333; color: #aaa; padding: 2px 5px; border-radius: 0 3px 3px 0; font-family: monospace; border: 1px solid #333; border-left: none;";
            const levelStyle =
              logEntry.level === "error"
                ? "color: #ff4444; font-weight: bold;"
                : logEntry.level === "warn"
                  ? "color: #ffbb33; font-weight: bold;"
                  : "color: #88ccff;";

            // "CL | 22:10:24.572 [LEVEL] Message"
            console.log(
              `%cCL%c${timeStr}%c [${logEntry.level.toUpperCase()}] ${logEntry.message}`,
              clStyle,
              timeStyle,
              levelStyle,
              logEntry.data ? logEntry.data : "",
            );
          } catch (e) {
            console.log(
              "%cCL:%c [RAW]",
              "background: #333; color: #00ff9d;",
              "",
              event.data,
            );
          }
        };

        evtSource.onerror = () => {
          // Silence error to stay transparent
        };
      } catch (e) {
        if (import.meta.env.DEV) {
          console.error("CL: Failed to init EventSource", e);
        }
      }
    }

    return () => {
      if (evtSource) {
        evtSource.close();
      }
    };
  });

  onMount(() => {
    // Initialize Zoom Plugin (Client-side only)
    initZoomPlugin();

    // Global Error Handling
    const handleGlobalError = (event: ErrorEvent) => {
      if (import.meta.env.DEV) {
        console.error("Caught global error:", {
          message: event.message,
          error: event.error,
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
        });
      }

      // Don't show modal for harmless or empty errors
      if (!event.message && !event.error) return;

      // Ignore harmless ResizeObserver loop error
      if (
        event.message.includes(
          "ResizeObserver loop completed with undelivered notifications",
        ) ||
        event.message.includes("ResizeObserver loop limit exceeded")
      ) {
        return;
      }

      uiState.showError(event.message || "An unexpected error occurred.");
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      if (import.meta.env.DEV) {
        console.error("Caught unhandled rejection:", event.reason);
      }

      // Stop if reason is null/undefined to avoid showing empty error modals
      if (event.reason === null || event.reason === undefined) return;

      const message =
        event.reason instanceof Error
          ? event.reason.message
          : String(event.reason);

      // Filter out common harmless network or cancellation errors
      if (
        message.includes("The user aborted a request") || // i18n-ignore
        message === "AbortError"
      )
        return;

      uiState.showError(message);
    };

    window.addEventListener("error", handleGlobalError);
    window.addEventListener("unhandledrejection", handleUnhandledRejection);

    // Theme is already initialized in uiStore, no need to set it here

    return () => {
      window.removeEventListener("error", handleGlobalError);
      window.removeEventListener(
        "unhandledrejection", // Event name
        handleUnhandledRejection,
      );
    };
  });

  function updateThemeColor() {
    // Small timeout to allow the DOM/CSS variables to update after class change
    setTimeout(() => {
      const metaThemeColor = document.querySelector('meta[name="theme-color"]');
      if (metaThemeColor) {
        // Since the background was moved to the html tag, we read from document.documentElement
        const style = getComputedStyle(document.documentElement);
        const bgColor = style.backgroundColor;
        metaThemeColor.setAttribute("content", bgColor);
      }
    }, 100); // 100ms for safety
  }
  // Dynamic theme color for PWA/Android status bar
  $effect(() => {
    if (typeof document !== "undefined" && uiState.currentTheme) {
      updateThemeColor();
    }
  });

  // Update Font Family
  $effect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.style.setProperty(
        "--app-font-family",
        settingsState.fontFamily,
      );
    }
  });

  // Dynamic Glassmorphism & Background Contrast
  $effect(() => {
    if (typeof document !== "undefined") {
      const html = document.documentElement;

      // 1. Enable/Disable Glassmorphism class
      if (settingsState.enableGlassmorphism) {
        html.classList.add("glass-enabled");
      } else {
        html.classList.remove("glass-enabled");
      }

      // 2. Apply Custom Glass Settings
      html.style.setProperty("--glass-blur", `${settingsState.glassBlur}px`);
      html.style.setProperty(
        "--glass-saturate",
        `${settingsState.glassSaturate}%`,
      );
      html.style.setProperty(
        "--glass-opacity",
        settingsState.glassOpacity.toString(),
      );
    }
  });

  // Watch for changes to cache settings
  $effect(() => {
    if (!browser) return;
    const cacheSize = settingsState.technicalsCacheSize;
    const cacheTTL = settingsState.technicalsCacheTTL;

    // Import dynamically but register the effect correctly at top-level
    import("../services/technicalsService").then(({ updateCacheSettings }) => {
      updateCacheSettings(cacheSize, cacheTTL);
    });
  });

  // Start Market Analyst
  onMount(() => {
    import("../services/marketAnalyst").then(({ marketAnalyst }) => {
      marketAnalyst.start();
    });
    return () => {
      import("../services/marketAnalyst").then(({ marketAnalyst }) => {
        marketAnalyst.stop();
      });
    };
  });
</script>

<svelte:head>
  <title>{$_("seo.pageTitle")}</title>
  <meta
    name="description"
    content="Cachy is a comprehensive trading calculator for position sizing, risk management, and take-profit targets. Optimize your trades with real-time calculations and visual analysis."
  />
  {@html `<script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      "name": "Cachy",
      "applicationCategory": "FinanceApplication",
      "operatingSystem": "Web",
      "offers": {
        "@type": "Offer",
        "price": "0",
        "priceCurrency": "USD"
      },
      "image": "https://www.cachy.app/og-image.jpg",
      "description": "Advanced Position Size & Risk Calculator for crypto trading. Optimize your position sizing and manage trading risk effectively."
    }
    </script>`}
</svelte:head>

<div class="app-container">
  <OfflineBanner />
  <BackgroundRenderer />
  <!-- Rendering Layers for Visual Effects -->
  <FireOverlay layer="tiles" zIndex={10} />
  <FireOverlay layer="windows" zIndex={200} />
  <FireOverlay layer="modals" zIndex={20000} />
  {@render children?.()}

  <!-- Global Modals -->
  <JournalView />
  <SettingsModal />
  <MarketDashboardModal />
  <CustomModal />
  <SymbolPickerModal />
  <!-- Dynamic Floating Windows -->
  {#each uiState.windows as window (window.id)}
    <FloatingIframe
      iframeState={window}
      onClose={() => uiState.closeWindow(window.id)}
    />
  {/each}
  <!-- ToastManager Removed as not found -->
  <!-- LoadingSpinner Removed as not found -->

  <!-- Jules Report Overlay -->
  <!-- Jules Report Overlay -->
  <!-- Jules Report Overlay -->
  {#if julesState.isVisible || julesState.isLoading}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div
      class="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm transition-all animate-fade-in"
      onclick={() => julesState.hideReport()}
      role="dialog"
      tabindex="-1"
    >
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="bg-[var(--bg-secondary)] text-[var(--text-primary)] p-6 rounded-lg shadow-2xl border border-[var(--accent-color)] max-w-2xl w-full mx-4 relative transform transition-all"
        onclick={(e) => e.stopPropagation()}
        role="document"
      >
        <button
          class="absolute top-2 right-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          aria-label="Close"
          onclick={() => julesState.hideReport()}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-6 w-6"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>

        <div class="flex items-center gap-3 mb-4">
          <span class="text-2xl">🤖</span>
          <h3 class="text-xl font-bold text-[var(--accent-color)]">
            Jules Inspector
          </h3>
        </div>

        {#if julesState.isLoading}
          <div class="flex flex-col items-center justify-center py-8 gap-4">
            <div
              class="w-8 h-8 border-2 border-[var(--accent-color)] border-t-transparent rounded-full animate-spin"
            ></div>
            <p class="text-sm text-[var(--text-secondary)] animate-pulse">
              Analyzing system state...
            </p>
          </div>
        {:else}
          <div
            class="prose prose-invert prose-sm max-w-none max-h-[60vh] overflow-y-auto custom-scrollbar p-2 bg-[var(--bg-tertiary)] rounded"
          >
            <pre
              class="whitespace-pre-wrap font-mono text-xs">{julesState.message}</pre>
          </div>
        {/if}

        <div class="mt-4 flex justify-end">
          <button
            class="px-4 py-2 bg-[var(--accent-color)] text-[var(--btn-accent-text)] rounded hover:opacity-90 transition-opacity font-bold text-sm"
            onclick={() => julesState.hideReport()}
          >
            Close Report
          </button>
        </div>
      </div>
    </div>
  {/if}
</div>

{#if !settingsState.disclaimerAccepted}
  <DisclaimerModal />
{/if}

<WindowContainer />
<FloatingWindowsContainer />
<ToastContainer />
<FXOverlay />

{#if uiState.tooltip.visible}
  <div
    class="fixed z-[10000] pointer-events-auto"
    style="top: {uiState.tooltip.y}px; left: {uiState.tooltip.x}px;"
    onmouseenter={() => {}}
    onmouseleave={() => uiState.hideTooltip()}
    role="tooltip"
  >
    {#if uiState.tooltip.type === "position"}
      <PositionTooltip position={uiState.tooltip.data} />
    {:else if uiState.tooltip.type === "order"}
      <OrderDetailsTooltip order={uiState.tooltip.data} />
    {/if}
  </div>
{/if}

<style>
  @media (max-width: 768px) {
    :global(.app-container) {
      padding: 0 !important;
    }
  }
</style>
