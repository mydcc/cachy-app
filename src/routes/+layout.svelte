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
  import { tradeStore } from "../stores/tradeStore";
  import { uiStore } from "../stores/uiStore";
  import { settingsState } from "../stores/settings.svelte";
  import DisclaimerModal from "../components/shared/DisclaimerModal.svelte";
  import JournalView from "../components/shared/JournalView.svelte";
  import SettingsModal from "../components/settings/SettingsModal.svelte";
  import CustomModal from "../components/shared/CustomModal.svelte";
  import SymbolPickerModal from "../components/shared/SymbolPickerModal.svelte";
  import PositionTooltip from "../components/shared/PositionTooltip.svelte";
  import OrderDetailsTooltip from "../components/shared/OrderDetailsTooltip.svelte";
  import { onMount } from "svelte";
  import { initZoomPlugin } from "../lib/chartSetup";

  import { _ } from "../locales/i18n";

  import "../app.css";

  import { CONSTANTS } from "../lib/constants";

  import { julesStore } from "../stores/julesStore";
  interface Props {
    children?: import("svelte").Snippet;
  }

  let { children }: Props = $props();

  // Removed local Jules state variables in favor of julesStore

  onMount(() => {
    // Initialize Zoom Plugin (Client-side only)
    initZoomPlugin();

    // Global Error Handling
    const handleGlobalError = (event: ErrorEvent) => {
      console.error("Caught global error:", event.error);
      uiStore.showError(event.message || "An unexpected error occurred.");
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      console.error("Caught unhandled rejection:", event.reason);
      const message =
        event.reason instanceof Error
          ? event.reason.message
          : String(event.reason);
      uiStore.showError(message);
    };

    window.addEventListener("error", handleGlobalError);
    window.addEventListener("unhandledrejection", handleUnhandledRejection);

    // Theme is already initialized in uiStore, no need to set it here

    // --- CachyLog Integration (Development Only) ---
    // Connect to Server-Sent Events stream for real-time server logs
    let evtSource: EventSource | null = null;

    // Only enable CachyLog in development mode
    const isDevelopment =
      import.meta.env.DEV ||
      window.location.hostname.includes("localhost") ||
      window.location.hostname.includes("dev.");

    if (typeof EventSource !== "undefined" && isDevelopment) {
      try {
        evtSource = new EventSource("/api/stream-logs");

        evtSource.onmessage = (event) => {
          try {
            const logEntry = JSON.parse(event.data);
            // Styling for console
            const clStyle =
              "background: #333; color: #00ff9d; padding: 2px 5px; border-radius: 3px; font-weight: bold;";
            const levelStyle =
              logEntry.level === "error"
                ? "color: #ff4444;"
                : logEntry.level === "warn"
                  ? "color: #ffbb33;"
                  : "color: #88ccff;";

            // "CL: [LEVEL] Message"
            // Note: console.log supports format specifiers like %c
            // console.log(
            //   `%cCL:%c [${logEntry.level.toUpperCase()}] ${logEntry.message}`,
            //   clStyle,
            //   levelStyle,
            //   logEntry.data ? logEntry.data : "",
            // );
          } catch (e) {
            // console.log(
            //   "%cCL:%c [RAW]",
            //   "background: #333; color: #00ff9d;",
            //   "",
            //   event.data,
            // );
          }
        };

        evtSource.onerror = (err) => {
          // Quietly fail or retry, don't spam console
          // console.error('CL: EventSource failed:', err);
        };
      } catch (e) {
        console.error("CL: Failed to init EventSource", e);
      }
    }

    return () => {
      if (evtSource) {
        evtSource.close();
      }
      window.removeEventListener("error", handleGlobalError);
      window.removeEventListener(
        "unhandledrejection",
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
    if (typeof document !== "undefined" && $uiStore.currentTheme) {
      updateThemeColor();
    }
  });

  // Toggle glass-enabled class based on settings
  $effect(() => {
    if (typeof document !== "undefined") {
      if (settingsState.enableGlassmorphism) {
        document.documentElement.classList.add("glass-enabled");
      } else {
        document.documentElement.classList.remove("glass-enabled");
      }
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
  {@render children?.()}

  <!-- Global Modals -->
  <JournalView />
  <SettingsModal />
  <CustomModal />
  <SymbolPickerModal />
  <!-- ToastManager Removed as not found -->
  <!-- LoadingSpinner Removed as not found -->

  <!-- Jules Report Overlay -->
  <!-- Jules Report Overlay -->
  {#if $julesStore.isVisible || $julesStore.isLoading}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div
      class="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm transition-all animate-fade-in"
      onclick={() => julesStore.hideReport()}
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
          onclick={() => julesStore.hideReport()}
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

        {#if $julesStore.isLoading}
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
              class="whitespace-pre-wrap font-mono text-xs">{$julesStore.message}</pre>
          </div>
        {/if}

        <div class="mt-4 flex justify-end">
          <button
            class="px-4 py-2 bg-[var(--accent-color)] text-[var(--btn-accent-text)] rounded hover:opacity-90 transition-opacity font-bold text-sm"
            onclick={() => julesStore.hideReport()}
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

{#if $uiStore.tooltip.visible}
  <div
    class="fixed z-[10000] pointer-events-auto"
    style="top: {$uiStore.tooltip.y}px; left: {$uiStore.tooltip.x}px;"
    onmouseenter={() => {}}
    onmouseleave={() => uiStore.hideTooltip()}
    role="tooltip"
  >
    {#if $uiStore.tooltip.type === "position"}
      <PositionTooltip position={$uiStore.tooltip.data} />
    {:else if $uiStore.tooltip.type === "order"}
      <OrderDetailsTooltip order={$uiStore.tooltip.data} />
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
