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
  Performance Monitor Component
  Real-time display of system performance metrics
-->

<script lang="ts">
    import { onMount } from "svelte";
    import { _ } from "../../locales/i18n";
    import { marketState } from "../../stores/market.svelte";

    let apiCallHistory: number[] = $state([]);
    let lastUpdateTime = $state(Date.now());

    // Calculate memory usage approximation
    function calculateMemoryUsage(): number {
        if (
            typeof window !== "undefined" &&
            performance &&
            (performance as any).memory
        ) {
            const memory = (performance as any).memory;
            return Math.round(
                (memory.usedJSHeapSize / memory.jsHeapSizeLimit) * 100,
            );
        }
        return 0;
    }

    // Get color based on value and thresholds
    function getColor(value: number, thresholds: [number, number]): string {
        const [warning, critical] = thresholds;
        if (value >= critical) return "text-red-500";
        if (value >= warning) return "text-orange-500";
        return "text-green-500";
    }

    // Get status badge
    function getStatusBadge(
        value: number,
        thresholds: [number, number],
    ): string {
        const [warning, critical] = thresholds;
        if (value >= critical) return "🔴 Critical";
        if (value >= warning) return "🟡 Warning";
        return "🟢 Optimal";
    }

    onMount(() => {
        const interval = setInterval(() => {
            lastUpdateTime = Date.now();
        }, 2000);
        return () => clearInterval(interval);
    });
</script>

<div class="performance-monitor">
    <div class="monitor-header">
        <h3>{$_("performance.monitor")}</h3>
        <div class="last-update">
            {$_("performance.lastUpdate", {
                values: { time: new Date(lastUpdateTime).toLocaleTimeString() },
            })}
        </div>
    </div>

    <div class="metrics-grid">
        <!-- Analysis Time (was CPU Usage) -->
        <div class="metric-card">
            <div class="metric-header">
                <svg
                    class="metric-icon"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                >
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12" />
                    <line x1="12" y1="12" x2="16" y2="10" />
                </svg>
                <span class="metric-label">{$_("performance.analysisTime")}</span>
            </div>
            <div
                class="metric-value {getColor(
                    marketState.telemetry.lastCalcDuration,
                    [200, 500],
                )}"
            >
                {marketState.telemetry.lastCalcDuration.toFixed(0)}ms
            </div>
            <div class="metric-status">
                {getStatusBadge(
                    marketState.telemetry.lastCalcDuration,
                    [200, 500],
                )}
            </div>
            <div class="metric-bar">
                <div
                    class="metric-bar-fill {getColor(
                        marketState.telemetry.lastCalcDuration,
                        [200, 500],
                    )}"
                    style="width: {Math.min(
                        100,
                        (marketState.telemetry.lastCalcDuration / 500) * 100,
                    )}%"
                ></div>
            </div>
        </div>

        <!-- Memory Usage -->
        <div class="metric-card">
            <div class="metric-header">
                <svg
                    class="metric-icon"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                >
                    <rect x="4" y="4" width="16" height="16" rx="2" />
                    <path d="M9 9h.01" />
                    <path d="M15 9h.01" />
                    <path d="M9 15h.01" />
                    <path d="M15 15h.01" />
                </svg>
                <span class="metric-label">{$_("performance.memory")}</span>
            </div>
            <div
                class="metric-value {getColor(
                    calculateMemoryUsage(),
                    [60, 85],
                )}"
            >
                {calculateMemoryUsage().toFixed(1)}%
            </div>
            <div class="metric-status">
                {getStatusBadge(calculateMemoryUsage(), [60, 85])}
            </div>
            <div class="metric-bar">
                <div
                    class="metric-bar-fill {getColor(
                        calculateMemoryUsage(),
                        [60, 85],
                    )}"
                    style="width: {calculateMemoryUsage()}%"
                ></div>
            </div>
        </div>

        <!-- API Calls -->
        <div class="metric-card">
            <div class="metric-header">
                <svg
                    class="metric-icon"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                >
                    <path
                        d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"
                    />
                    <path
                        d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"
                    />
                </svg>
                <span class="metric-label">{$_("performance.apiCallsMin")}</span>
            </div>
            <div
                class="metric-value {getColor(
                    marketState.telemetry.apiCallsLastMinute,
                    [60, 120],
                )}"
            >
                {marketState.telemetry.apiCallsLastMinute}
            </div>
            <div class="metric-status">
                {getStatusBadge(
                    marketState.telemetry.apiCallsLastMinute,
                    [60, 120],
                )}
            </div>
            <div class="metric-info">
                {#if marketState.telemetry.apiCallsLastMinute > 120}
                    ⚠️ {$_("performance.statusHighApi")}
                {:else if marketState.telemetry.apiCallsLastMinute > 60}
                    ℹ️ {$_("performance.statusModerate")}
                {:else}
                    ✓ {$_("performance.statusNormal")}
                {/if}
            </div>
        </div>

        <!-- Cache Hit Rate -->
        <div class="metric-card">
            <div class="metric-header">
                <svg
                    class="metric-icon"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                >
                    <path d="M12 2v20M2 12h20" />
                    <circle cx="12" cy="12" r="8" />
                </svg>
                <span class="metric-label">{$_("performance.cacheHitRate")}</span>
            </div>
            <div
                class="metric-value {getColor(
                    100 - marketState.telemetry.cacheHitRate,
                    [40, 70],
                )}"
            >
                {marketState.telemetry.cacheHitRate}%
            </div>
            <div class="metric-status">
                {getStatusBadge(
                    100 - marketState.telemetry.cacheHitRate,
                    [40, 70],
                )}
            </div>
            <div class="metric-info">
                {#if marketState.telemetry.cacheHitRate > 80}
                    ✓ {$_("performance.statusExcellentCache")}
                {:else if marketState.telemetry.cacheHitRate > 50}
                    ℹ️ {$_("performance.statusGoodCache")}
                {:else}
                    ⚠️ {$_("performance.statusIncreaseCache")}
                {/if}
            </div>
        </div>

        <!-- Latency -->
        <div class="metric-card">
            <div class="metric-header">
                <svg
                    class="metric-icon"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                >
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                </svg>
                <span class="metric-label">{$_("performance.avgLatency")}</span>
            </div>
            <div
                class="metric-value {getColor(
                    marketState.telemetry.apiLatency,
                    [200, 500],
                )}"
            >
                {marketState.telemetry.apiLatency.toFixed(0)}ms
            </div>
            <div class="metric-status">
                {getStatusBadge(marketState.telemetry.apiLatency, [200, 500])}
            </div>
            <div class="metric-info">
                {#if marketState.telemetry.apiLatency < 100}
                    ⚡ {$_("performance.statusExcellentLatency")}
                {:else if marketState.telemetry.apiLatency < 200}
                    ✓ {$_("performance.statusGoodLatency")}
                {:else if marketState.telemetry.apiLatency < 500}
                    ℹ️ {$_("performance.statusAcceptableLatency")}
                {:else}
                    ⚠️ {$_("performance.statusHighLatency")}
                {/if}
            </div>
        </div>

        <!-- Network Status -->
        <div class="metric-card">
            <div class="metric-header">
                <svg
                    class="metric-icon"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                >
                    <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z" />
                    <path d="M2 12h20" />
                    <path
                        d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"
                    />
                </svg>
                <span class="metric-label">{$_("performance.networkStatus")}</span>
            </div>
            <div class="metric-value text-blue-500">
                {marketState.telemetry.activeConnections}
                <span
                    class="text-sm text-[var(--text-secondary)] font-normal ml-1"
                    >{$_("performance.active")}</span
                >
            </div>
            <div class="metric-info flex justify-between items-center">
                <span>
                    {#if marketState.telemetry.activeConnections > 0}
                        🟢 {$_("performance.online")}
                    {:else}
                        🔴 {$_("performance.offline")}
                    {/if}
                </span>
                {#if marketState.telemetry.wsLatency > 0}
                    <span
                        class="text-xs px-1.5 py-0.5 rounded bg-[var(--bg-tertiary)] text-[var(--text-secondary)]"
                    >
                        {marketState.telemetry.wsLatency}ms
                    </span>
                {/if}
            </div>
        </div>
    </div>

    <!-- Performance Tips -->
    <div class="performance-tips">
        <h4>
            {$_("performance.tips")}
        </h4>
        <div class="tips-list">
            {#if marketState.telemetry.lastCalcDuration > 500}
                <div class="tip warning">
                    <span class="tip-icon">⚠️</span>
                    <span class="tip-text"
                        >{$_("performance.highAnalysisTime")}</span
                    >
                </div>
            {/if}
            {#if calculateMemoryUsage() > 85}
                <div class="tip warning">
                    <span class="tip-icon">⚠️</span>
                    <span class="tip-text"
                        >{$_("performance.highMemory")}</span
                    >
                </div>
            {/if}
            {#if marketState.telemetry.apiCallsLastMinute > 120}
                <div class="tip warning">
                    <span class="tip-icon">⚠️</span>
                    <span class="tip-text"
                        >{$_("performance.highApiUsage")}</span
                    >
                </div>
            {/if}
            {#if marketState.telemetry.cacheHitRate < 50}
                <div class="tip info">
                    <span class="tip-icon">ℹ️</span>
                    <span class="tip-text"
                        >{$_("performance.lowCacheHit")}</span
                    >
                </div>
            {/if}
            {#if marketState.telemetry.apiLatency > 500 || marketState.telemetry.wsLatency > 500}
                <div class="tip warning">
                    <span class="tip-icon">⚠️</span>
                    <span class="tip-text"
                        >{$_("performance.highLatency")}</span
                    >
                </div>
            {/if}
            {#if marketState.telemetry.lastCalcDuration < 200 && calculateMemoryUsage() < 50}
                <div class="tip success">
                    <span class="tip-icon">✓</span>
                    <span class="tip-text"
                        >{$_("performance.optimal")}</span
                    >
                </div>
            {/if}
        </div>
    </div>
</div>

<style>
    .performance-monitor {
        display: flex;
        flex-direction: column;
        gap: 1.5rem;
    }

    .monitor-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding-bottom: 1rem;
        border-bottom: 1px solid var(--border-color);
    }

    .monitor-header h3 {
        font-size: 1.1rem;
        font-weight: 600;
        margin: 0;
    }

    .last-update {
        font-size: 0.75rem;
        color: var(--text-secondary);
    }

    .metrics-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
        gap: 1rem;
    }

    .metric-card {
        padding: 1.25rem;
        background: var(--bg-secondary);
        border: 1px solid var(--border-color);
        border-radius: 0.75rem;
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
        transition: all 0.2s;
    }

    .metric-card:hover {
        border-color: var(--accent-color);
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    }

    .metric-header {
        display: flex;
        align-items: center;
        gap: 0.5rem;
    }

    .metric-icon {
        width: 20px;
        height: 20px;
        color: var(--text-secondary);
    }

    .metric-label {
        font-size: 0.85rem;
        font-weight: 500;
        color: var(--text-secondary);
        text-transform: uppercase;
        letter-spacing: 0.05em;
    }

    .metric-value {
        font-size: 2rem;
        font-weight: 700;
        line-height: 1;
    }

    .metric-status {
        font-size: 0.75rem;
        font-weight: 600;
    }

    .metric-info {
        font-size: 0.75rem;
        color: var(--text-secondary);
    }

    .metric-bar {
        height: 4px;
        background: var(--bg-tertiary);
        border-radius: 2px;
        overflow: hidden;
    }

    .metric-bar-fill {
        height: 100%;
        transition: width 0.3s ease;
    }

    .performance-tips {
        padding: 1rem;
        background: var(--bg-tertiary);
        border-radius: 0.75rem;
    }

    .performance-tips h4 {
        font-size: 0.95rem;
        font-weight: 600;
        margin: 0 0 1rem 0;
    }

    .tips-list {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
    }

    .tip {
        display: flex;
        align-items: flex-start;
        gap: 0.75rem;
        padding: 0.75rem;
        border-radius: 0.5rem;
        font-size: 0.85rem;
    }

    .tip.warning {
        background: color-mix(in srgb, var(--warning-color), transparent 90%);
        border-left: 3px solid var(--warning-color);
    }

    .tip.info {
        background: color-mix(in srgb, var(--info-color), transparent 90%);
        border-left: 3px solid var(--info-color);
    }

    .tip.success {
        background: color-mix(in srgb, var(--success-color), transparent 90%);
        border-left: 3px solid var(--success-color);
    }

    .tip-icon {
        font-size: 1.1rem;
        line-height: 1;
    }

    .tip-text {
        flex: 1;
        line-height: 1.4;
    }
</style>
