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

<!--
  Calculation Dashboard
  Live monitoring of analysis cycles, cache usage, and performance metrics
-->

<script lang="ts">
    import { settingsState } from "../../stores/settings.svelte";
    import { analysisState } from "../../stores/analysis.svelte";
    import { _ } from "../../locales/i18n";
    import DOMPurify from "dompurify";

    let currentTime = $state(Date.now());
    let nextCycleIn = $state(0);
    let cycleProgress = $state(0); // 0-100%

    // Update every 1 second
    $effect(() => {
        const interval = setInterval(() => {
            currentTime = Date.now();
        }, 1000);
        return () => clearInterval(interval);
    });

    // Calculate next cycle time
    $effect(() => {
        if (analysisState.lastAnalysisTime > 0) {
            const interval = settingsState.marketAnalysisInterval * 1000;
            const nextCycle = analysisState.lastAnalysisTime + interval;
            nextCycleIn = Math.max(0, nextCycle - currentTime);
            cycleProgress = Math.min(
                100,
                ((interval - nextCycleIn) / interval) * 100,
            );
        }
    });

    function formatTime(ms: number): string {
        const seconds = Math.floor(ms / 1000);
        if (seconds < 60) return `${seconds}s`;
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
        const hours = Math.floor(minutes / 60);
        return `${hours}h ${minutes % 60}m`;
    }

    function getHealthStatus(): "good" | "warning" | "critical" {
        const analyzed = Object.keys(analysisState.results).length;
        const cacheUsage = analyzed / settingsState.marketCacheSize;

        if (cacheUsage > 0.9) return "critical";
        if (cacheUsage > 0.7) return "warning";
        return "good";
    }

    function getMemoryEstimate(): number {
        // Rough estimate: ~50KB per analyzed symbol + base overhead
        const analyzed = Object.keys(analysisState.results).length;
        return (analyzed * 50 + 100) / 1024; // in MB
    }
</script>

<div class="calculation-dashboard">
    <!-- Status Overview -->
    <section class="status-overview">
        <h3>{$_("calculationDashboard.liveAnalysisStatus")}</h3>

        <div class="status-grid">
            <!-- Cycle Status -->
            <div class="status-card">
                <div class="card-header">
                    <span class="card-label">{$_("calculationDashboard.nextCycleIn")}</span>
                    <span
                        class="status-indicator {analysisState.isAnalyzing
                            ? 'active'
                            : ''}"
                    >
                        {analysisState.isAnalyzing
                            ? $_("calculationDashboard.analyzing")
                            : $_("calculationDashboard.waiting")}
                    </span>
                </div>
                <div class="card-value">{formatTime(nextCycleIn)}</div>
                <div class="progress-bar">
                    <div
                        class="progress-fill"
                        style="width: {cycleProgress}%"
                    ></div>
                </div>
                <p class="card-desc">
                    {$_("calculationDashboard.interval", {
                        values: { seconds: settingsState.marketAnalysisInterval },
                    })}
                </p>
            </div>

            <!-- Cache Usage -->
            <div class="status-card">
                <div class="card-header">
                    <span class="card-label">{$_("calculationDashboard.cacheUsage")}</span>
                    <span class="status-indicator {getHealthStatus()}">
                        {#if getHealthStatus() === "critical"}
                            {$_("calculationDashboard.critical")}
                        {:else if getHealthStatus() === "warning"}
                            {$_("calculationDashboard.warning")}
                        {:else}
                            {$_("calculationDashboard.healthy")}
                        {/if}
                    </span>
                </div>
                <div class="card-value">
                    {Object.keys(analysisState.results).length} / {settingsState.marketCacheSize}
                </div>
                <div class="progress-bar">
                    <div
                        class="progress-fill {getHealthStatus()}"
                        style="width: {(Object.keys(analysisState.results)
                            .length /
                            settingsState.marketCacheSize) *
                            100}%"
                    ></div>
                </div>
                <p class="card-desc">{$_("calculationDashboard.symbolsInMemory")}</p>
            </div>

            <!-- Estimated Memory -->
            <div class="status-card">
                <div class="card-header">
                    <span class="card-label">{$_("calculationDashboard.estMemory")}</span>
                    <span class="card-value-small"
                        >{getMemoryEstimate().toFixed(1)} MB</span
                    >
                </div>
                <div class="memory-bar">
                    <div
                        class="memory-fill"
                        style="width: {Math.min(
                            100,
                            (getMemoryEstimate() / 50) * 100,
                        )}%"
                    ></div>
                </div>
                <p class="card-desc">{$_("calculationDashboard.memoryDesc")}</p>
            </div>

            <!-- Performance Profile -->
            <div class="status-card">
                <div class="card-header">
                    <span class="card-label">{$_("calculationDashboard.profile")}</span>
                    <span class="profile-badge">
                        {#if settingsState.marketAnalysisInterval === 300}
                            {$_("calculationDashboard.profileLight")}
                        {:else if settingsState.marketAnalysisInterval === 60}
                            {$_("calculationDashboard.profileBalanced")}
                        {:else if settingsState.marketAnalysisInterval === 10}
                            {$_("calculationDashboard.profilePro")}
                        {:else}
                            {$_("calculationDashboard.profileCustom")}
                        {/if}
                    </span>
                </div>
                <div class="card-value-small">
                    {settingsState.analyzeAllFavorites
                        ? $_("calculationDashboard.allFavorites")
                        : $_("calculationDashboard.top4")}
                </div>
                <p class="card-desc">{$_("calculationDashboard.activeConfig")}</p>
            </div>
        </div>
    </section>

    <!-- Current Symbols Being Tracked -->
    <section class="tracked-symbols">
        <h3>{$_("calculationDashboard.currentlyAnalyzing")}</h3>

        {#if Object.keys(analysisState.results).length === 0}
            <p class="empty-state">
                {$_("calculationDashboard.noSymbols")}
            </p>
        {:else}
            <div class="symbols-list">
                {#each Object.entries(analysisState.results)
                    .slice(0, 8)
                    .sort(([, a], [, b]) => (b.updatedAt || 0) - (a.updatedAt || 0)) as [symbol, data] (symbol)}
                    <div class="symbol-item">
                        <div class="symbol-name">{symbol}</div>
                        <div class="symbol-info">
                            <span class="info-tag">
                                {#if data.updatedAt}
                                    {formatTime(currentTime - data.updatedAt)} ago
                                {:else}
                                    {$_("calculationDashboard.pending")}
                                {/if}
                            </span>
                            {#if data.confluenceScore !== undefined}
                                <span
                                    class="info-tag score"
                                    title="Confluence score"
                                >
                                    {data.confluenceScore.toFixed(0)}%
                                </span>
                            {/if}
                            {#if data.condition}
                                <span
                                    class="info-tag condition"
                                    class:trending={data.condition ===
                                        "trending"}
                                    class:overbought={data.condition ===
                                        "overbought"}
                                    class:oversold={data.condition ===
                                        "oversold"}
                                >
                                    {data.condition}
                                </span>
                            {/if}
                        </div>
                    </div>
                {/each}
            </div>

            {#if Object.keys(analysisState.results).length > 8}
                <p class="more-text">
                    {$_("calculationDashboard.moreSymbols", {
                        values: {
                            count: Object.keys(analysisState.results).length - 8,
                        },
                    })}
                </p>
            {/if}
        {/if}
    </section>

    <!-- Configuration Hints -->
    <section class="hints">
        <h3>{$_("calculationDashboard.quickTips")}</h3>
        <div class="hints-list">
            {#if settingsState.marketAnalysisInterval < 20}
                <div class="hint warning">
                    {@html DOMPurify.sanitize($_("calculationDashboard.hintHighFreq", {
                        values: {
                            seconds: settingsState.marketAnalysisInterval,
                        },
                    }))}
                </div>
            {/if}

            {#if settingsState.analyzeAllFavorites && settingsState.favoriteSymbols.length > 10}
                <div class="hint warning">
                    {@html DOMPurify.sanitize($_("calculationDashboard.hintFavorites", {
                        values: {
                            count: settingsState.favoriteSymbols.length,
                        },
                    }))}
                </div>
            {/if}

            {#if Object.keys(analysisState.results).length / settingsState.marketCacheSize > 0.85}
                <div class="hint critical">
                    {@html DOMPurify.sanitize($_("calculationDashboard.hintCache"))}
                </div>
            {/if}

            {#if !settingsState.pauseAnalysisOnBlur}
                <div class="hint info">
                    {@html DOMPurify.sanitize($_("calculationDashboard.hintSmartPause"))}
                </div>
            {/if}

            {#if getHealthStatus() === "good"}
                <div class="hint good">
                    {@html DOMPurify.sanitize($_("calculationDashboard.hintGood"))}
                </div>
            {/if}
        </div>
    </section>
</div>

<style>
    .calculation-dashboard {
        display: flex;
        flex-direction: column;
        gap: 2rem;
        padding: 1.5rem;
    }

    section {
        display: flex;
        flex-direction: column;
        gap: 1rem;
    }

    h3 {
        font-size: 1.1rem;
        font-weight: 600;
        margin: 0;
        color: var(--text-primary);
    }

    /* Status Grid */
    .status-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 1rem;
    }

    .status-card {
        padding: 1rem;
        background: var(--bg-secondary);
        border: 1px solid var(--border-color);
        border-radius: 0.75rem;
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
    }

    .card-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 0.5rem;
    }

    .card-label {
        font-size: 0.85rem;
        color: var(--text-secondary);
        font-weight: 500;
    }

    .status-indicator {
        display: inline-flex;
        padding: 0.25rem 0.5rem;
        border-radius: 0.4rem;
        font-size: 0.75rem;
        font-weight: 600;
        background: var(--bg-tertiary);
        color: var(--text-secondary);
    }

    .status-indicator.active {
        background: var(--success-color);
        color: var(--text-on-success);
        animation: pulse 1s infinite;
    }

    @keyframes pulse {
        0%,
        100% {
            opacity: 1;
        }
        50% {
            opacity: 0.7;
        }
    }

    .status-indicator.good {
        background: var(--success-color);
        color: var(--text-on-success);
    }

    .status-indicator.warning {
        background: var(--warning-color);
        color: var(--text-on-warning, var(--bg-primary));
    }

    .status-indicator.critical {
        background: var(--danger-color);
        color: var(--text-on-danger);
    }

    .card-value {
        font-size: 1.75rem;
        font-weight: 700;
        color: var(--primary-color);
    }

    .card-value-small {
        font-size: 1.1rem;
        font-weight: 600;
        color: var(--primary-color);
    }

    .progress-bar {
        height: 6px;
        background: var(--bg-tertiary);
        border-radius: 3px;
        overflow: hidden;
    }

    .progress-fill {
        height: 100%;
        background: linear-gradient(90deg, var(--success-color), color-mix(in srgb, var(--success-color), white 20%));
        transition: width 0.3s ease;
    }

    .progress-fill.warning {
        background: linear-gradient(90deg, var(--warning-color), color-mix(in srgb, var(--warning-color), white 20%));
    }

    .progress-fill.critical {
        background: linear-gradient(90deg, var(--danger-color), color-mix(in srgb, var(--danger-color), white 20%));
    }

    .memory-bar {
        height: 4px;
        background: var(--bg-tertiary);
        border-radius: 2px;
        overflow: hidden;
    }

    .memory-fill {
        height: 100%;
        background: var(--info-color);
        transition: width 0.3s ease;
    }

    .card-desc {
        font-size: 0.8rem;
        color: var(--text-tertiary);
        margin: 0;
    }

    .profile-badge {
        font-size: 0.85rem;
        font-weight: 600;
        color: var(--primary-color);
    }

    /* Symbols List */
    .symbols-list {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }

    .symbol-item {
        padding: 0.75rem;
        background: var(--bg-secondary);
        border: 1px solid var(--border-color);
        border-radius: 0.5rem;
        display: flex;
        justify-content: space-between;
        align-items: center;
    }

    .symbol-name {
        font-weight: 600;
        color: var(--text-primary);
        flex: 1;
    }

    .symbol-info {
        display: flex;
        gap: 0.5rem;
        flex-wrap: wrap;
    }

    .info-tag {
        padding: 0.25rem 0.5rem;
        border-radius: 0.3rem;
        font-size: 0.75rem;
        background: var(--bg-tertiary);
        color: var(--text-secondary);
        white-space: nowrap;
    }

    .info-tag.score {
        background: var(--info-color);
        color: white;
    }

    .info-tag.condition {
        background: var(--bg-tertiary);
        color: var(--text-secondary);
    }

    .info-tag.condition.trending {
        background: var(--success-color);
        color: var(--text-on-success);
    }

    .info-tag.condition.overbought {
        background: var(--danger-color);
        color: var(--text-on-danger);
    }

    .info-tag.condition.oversold {
        background: var(--info-color);
        color: white;
    }

    .empty-state {
        color: var(--text-secondary);
        text-align: center;
        padding: 1rem;
    }

    .more-text {
        font-size: 0.85rem;
        color: var(--text-secondary);
        text-align: center;
        margin: 0;
    }

    /* Hints */
    .hints-list {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
    }

    .hint {
        padding: 0.75rem;
        border-radius: 0.5rem;
        border-left: 3px solid;
        font-size: 0.85rem;
        background: var(--bg-secondary);
    }

    .hint.info {
        border-color: var(--info-color);
        background: color-mix(in srgb, var(--info-color), transparent 95%);
    }

    .hint.warning {
        border-color: var(--warning-color);
        background: color-mix(in srgb, var(--warning-color), transparent 95%);
        color: var(--text-primary);
    }

    .hint.critical {
        border-color: var(--danger-color);
        background: color-mix(in srgb, var(--danger-color), transparent 95%);
        color: var(--text-primary);
    }

    .hint.good {
        border-color: var(--success-color);
        background: color-mix(in srgb, var(--success-color), transparent 95%);
        color: var(--text-primary);
    }
</style>
