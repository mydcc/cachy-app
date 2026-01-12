<script lang="ts">
    import favicon from "../assets/favicon.svg";
    import { tradeStore } from "../stores/tradeStore";
    import { uiStore } from "../stores/uiStore";
    import { settingsStore } from "../stores/settingsStore";
    import DisclaimerModal from "../components/shared/DisclaimerModal.svelte";
    import JournalView from "../components/shared/JournalView.svelte";
    import SettingsModal from "../components/settings/SettingsModal.svelte";
    import CustomModal from "../components/shared/CustomModal.svelte";
    import { onMount } from "svelte";
    import { initZoomPlugin } from "../lib/chartSetup";

    // Removed Svelte 5 $props() and children destructuring
    // let { children, data } = $props();
    export let data; // Restore standard Svelte 4 data prop

    import "../app.css";

    import { CONSTANTS } from "../lib/constants";

    let showJulesOverlay = false;
    let julesOverlayMessage = "";

    onMount(() => {
        // Initialize Zoom Plugin (Client-side only)
        initZoomPlugin();

        // The server provides a theme from the cookie.
        // On the client, we prioritize localStorage as it might be more up-to-date
        // if the cookie failed to set for any reason.
        const storedTheme = localStorage.getItem(
            CONSTANTS.LOCAL_STORAGE_THEME_KEY,
        );
        const themeToSet = storedTheme || data.theme; // Use localStorage theme, fallback to cookie theme
        uiStore.setTheme(themeToSet);

        // --- CachyLog Integration ---
        // Connect to Server-Sent Events stream for real-time server logs
        let evtSource: EventSource | null = null;

        if (typeof EventSource !== "undefined") {
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
                        console.log(
                            `%cCL:%c [${logEntry.level.toUpperCase()}] ${logEntry.message}`,
                            clStyle,
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
        };
    });

    // Dynamic theme color for PWA/Android status bar
    $: if (typeof document !== "undefined" && $uiStore.currentTheme) {
        updateThemeColor();
    }

    function updateThemeColor() {
        // Small timeout to allow the DOM/CSS variables to update after class change
        setTimeout(() => {
            const metaThemeColor = document.querySelector(
                'meta[name="theme-color"]',
            );
            if (metaThemeColor) {
                // We need to read the background color of the body, which carries the theme variable
                const style = getComputedStyle(document.body);
                const bgColor = style.backgroundColor;
                metaThemeColor.setAttribute("content", bgColor);
            }
        }, 50);
    }
</script>

<svelte:head>
    <title>Cachy - Position Size & Risk Calculator</title>
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
    <slot />

    <!-- Global Modals -->
    <JournalView />
    <SettingsModal />
    <CustomModal />
    <!-- ToastManager Removed as not found -->
    <!-- LoadingSpinner Removed as not found -->

    <!-- Jules Report Overlay -->
    {#if showJulesOverlay}
        <div
            class="fixed inset-0 z-[9999] flex items-center justify-center pointer-events-none"
        >
            <div
                class="bg-black/80 text-white px-8 py-4 rounded-lg shadow-2xl backdrop-blur-sm transform transition-all animate-fade-in-out text-center border border-[var(--accent-color)]"
            >
                <div class="text-xl font-bold text-[var(--accent-color)] mb-1">
                    🤖 Jules SDK
                </div>
                <div class="text-lg whitespace-pre-wrap max-w-lg">
                    {julesOverlayMessage}
                </div>
            </div>
        </div>
    {/if}
</div>

{#if !$settingsStore.disclaimerAccepted}
    <DisclaimerModal />
{/if}
