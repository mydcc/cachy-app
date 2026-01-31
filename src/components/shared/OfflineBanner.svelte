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
    import { marketState } from "../../stores/market.svelte";
    import { settingsState } from "../../stores/settings.svelte";
    import { _ } from "../../locales/i18n";
    import { app } from "../../services/app";

    let isOffline = $derived(
        marketState.connectionStatus === "disconnected" ||
            marketState.connectionStatus === "error",
    );

    function handleReconnect() {
        app.setupRealtimeUpdates();
    }

    function handleSwitchProvider() {
        const newProvider =
            settingsState.apiProvider === "bitunix" ? "bitget" : "bitunix";
        settingsState.apiProvider = newProvider;
        app.setupRealtimeUpdates();
    }

    function handleSettings() {
        // Navigate to settings (can be implemented via router or modal)
        if (typeof window !== "undefined") {
            window.location.hash = "#settings";
        }
    }
</script>

{#if isOffline}
    <div
        class="fixed top-0 left-0 right-0 z-[100] bg-danger-bg border-b border-danger-color"
        data-testid="offline-banner"
        role="alert"
        aria-live="assertive"
    >
        <div
            class="container mx-auto px-4 py-3 flex flex-col md:flex-row items-center justify-between gap-3"
        >
            <div class="flex items-center gap-3">
                <svg
                    class="w-5 h-5 text-danger-color"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                >
                    <path
                        fill-rule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                        clip-rule="evenodd"
                    />
                </svg>
                <div class="flex flex-col">
                    <strong class="text-danger-color font-semibold"
                        >{$_("offline.title")}</strong
                    >
                    <span class="text-sm text-muted-foreground"
                        >{$_("offline.message")}</span
                    >
                </div>
            </div>

            <div class="flex gap-2 flex-wrap">
                <button
                    onclick={handleReconnect}
                    class="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors"
                >
                    {$_("offline.reconnect")}
                </button>

                <button
                    onclick={handleSwitchProvider}
                    class="px-3 py-1.5 text-sm bg-secondary text-secondary-foreground rounded hover:bg-secondary/90 transition-colors"
                >
                    {$_("offline.switchProvider")}
                </button>

                <button
                    onclick={handleSettings}
                    class="px-3 py-1.5 text-sm border border-border rounded hover:bg-accent transition-colors"
                >
                    {$_("offline.checkSettings")}
                </button>
            </div>
        </div>
    </div>
{/if}

<style>
    /* Ensure banner is above all other content */
    [data-testid="offline-banner"] {
        box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);
    }
</style>
