<!--
  Copyright (C) 2026 MYDCT

  This program is free software: you can redistribute it and/or modify
  it under the terms of the GNU Affero General Public License as published by
  the Free Software Foundation, either version 3 of the License, or
  (at your option) any later version.
-->

<script lang="ts">
    import { apiQuotaTracker } from "../../services/apiQuotaTracker.svelte";
    import { _, locale } from "../../locales/i18n";

    // Reactive derived state (no polling needed)
    let cryptoPanicStats = $derived(apiQuotaTracker.getStats("cryptopanic"));
    let newsApiStats = $derived(apiQuotaTracker.getStats("newsapi"));

    function formatDate(timestamp: number | null): string {
        if (!timestamp) return "-";
        return new Date(timestamp).toLocaleDateString($locale ?? "en-US", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
        });
    }

    function getStatusColor(stats: any): string {
        if (!stats) return "var(--text-secondary)";
        if (stats.last429At) {
            const hoursSince =
                (Date.now() - stats.last429At) / (1000 * 60 * 60);
            if (hoursSince < 6) return "var(--danger-color)";
        }
        if (stats.failedCalls > 5) return "var(--warning-color)";
        return "var(--success-color)";
    }

    function handleReset(provider: "cryptopanic" | "newsapi") {
        if (confirm($_("settings.apiQuota.resetConfirm", { values: { provider } }))) {
            apiQuotaTracker.manualReset(provider);
            cryptoPanicStats = apiQuotaTracker.getStats("cryptopanic");
            newsApiStats = apiQuotaTracker.getStats("newsapi");
        }
    }
</script>

<div class="quota-panel">
    <h4 class="text-sm font-semibold text-[var(--text-primary)] mb-3">
        {$_("settings.apiQuota.title")}
    </h4>

    {#if cryptoPanicStats}
        <div
            class="quota-item mb-3 p-3 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border-color)]"
        >
            <div class="flex justify-between items-center mb-2">
                <span class="font-medium text-[var(--text-primary)]"
                    >{$_("settings.apiQuota.cryptopanic")}</span
                >
                <span
                    class="status-dot w-2 h-2 rounded-full"
                    style="background-color: {getStatusColor(cryptoPanicStats)}"
                ></span>
            </div>
            <div
                class="stats-grid text-xs text-[var(--text-secondary)] space-y-1"
            >
                <div class="flex justify-between">
                    <span>{$_("settings.apiQuota.totalCalls")}:</span>
                    <span class="text-[var(--text-primary)]"
                        >{cryptoPanicStats.totalCalls}</span
                    >
                </div>
                <div class="flex justify-between">
                    <span>{$_("settings.apiQuota.errors")}:</span>
                    <span
                        class="font-semibold"
                        style="color: {cryptoPanicStats.failedCalls > 0
                            ? 'var(--warning-color)'
                            : 'var(--text-primary)'}"
                        >{cryptoPanicStats.failedCalls}</span
                    >
                </div>
                {#if cryptoPanicStats.last429At}
                    <div class="flex justify-between">
                        <span>{$_("settings.apiQuota.last429")}:</span>
                        <span class="text-[var(--danger-color)] font-semibold"
                            >{formatDate(cryptoPanicStats.last429At)}</span
                        >
                    </div>
                {/if}
                <div class="flex justify-between">
                    <span>{$_("settings.apiQuota.resetAt")}:</span>
                    <span class="text-[var(--text-primary)]"
                        >{formatDate(cryptoPanicStats.resetDate)}</span
                    >
                </div>
            </div>
            <button
                class="mt-2 text-xs px-2 py-1 rounded bg-[var(--bg-secondary)] hover:bg-[var(--bg-primary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                onclick={() => handleReset("cryptopanic")}
            >
                {$_("settings.apiQuota.resetButton")}
            </button>
        </div>
    {/if}

    {#if newsApiStats}
        <div
            class="quota-item p-3 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border-color)]"
        >
            <div class="flex justify-between items-center mb-2">
                <span class="font-medium text-[var(--text-primary)]"
                    >{$_("settings.apiQuota.newsapi")}</span
                >
                <span
                    class="status-dot w-2 h-2 rounded-full"
                    style="background-color: {getStatusColor(newsApiStats)}"
                ></span>
            </div>
            <div
                class="stats-grid text-xs text-[var(--text-secondary)] space-y-1"
            >
                <div class="flex justify-between">
                    <span>{$_("settings.apiQuota.totalCalls")}:</span>
                    <span class="text-[var(--text-primary)]"
                        >{newsApiStats.totalCalls}</span
                    >
                </div>
                <div class="flex justify-between">
                    <span>{$_("settings.apiQuota.errors")}:</span>
                    <span
                        class="font-semibold"
                        style="color: {newsApiStats.failedCalls > 0
                            ? 'var(--warning-color)'
                            : 'var(--text-primary)'}"
                        >{newsApiStats.failedCalls}</span
                    >
                </div>
                <div class="flex justify-between">
                    <span>{$_("settings.apiQuota.resetAt")}:</span>
                    <span class="text-[var(--text-primary)]"
                        >{formatDate(newsApiStats.resetDate)}</span
                    >
                </div>
            </div>
            <button
                class="mt-2 text-xs px-2 py-1 rounded bg-[var(--bg-secondary)] hover:bg-[var(--bg-primary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                onclick={() => handleReset("newsapi")}
            >
                {$_("settings.apiQuota.resetButton")}
            </button>
        </div>
    {/if}

    {#if !cryptoPanicStats && !newsApiStats}
        <p class="text-xs text-[var(--text-secondary)] italic">
            {$_("settings.apiQuota.noCalls")}
        </p>
    {/if}
</div>

<style>
    .status-dot {
        animation: pulse 2s ease-in-out infinite;
    }

    @keyframes pulse {
        0%,
        100% {
            opacity: 1;
        }
        50% {
            opacity: 0.5;
        }
    }
</style>
