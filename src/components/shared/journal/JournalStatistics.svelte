<script lang="ts">
    import { _ } from "../../../locales/i18n";
    import type { Readable } from "svelte/store";

    // Props - Metrics from derived stores
    export let performanceData: any;
    export let qualityData: any;
    export let isPro: boolean = false;
</script>

{#if isPro}
    <div class="journal-statistics">
        <div class="stats-grid">
            <!-- Total P/L -->
            <div class="stat-card">
                <div class="stat-label">{$_("journal.stats.totalPnL")}</div>
                <div
                    class="stat-value"
                    class:positive={(performanceData?.totalPnl ?? 0) >= 0}
                    class:negative={(performanceData?.totalPnl ?? 0) < 0}
                >
                    {(performanceData?.totalPnl ?? 0) >= 0 ? "+" : ""}{(
                        performanceData?.totalPnl ?? 0
                    ).toFixed(2)} $
                </div>
            </div>

            <!-- Win Rate -->
            <div class="stat-card">
                <div class="stat-label">{$_("journal.stats.winRate")}</div>
                <div
                    class="stat-value"
                    class:positive={(performanceData?.winRate ?? 0) >= 50}
                    class:neutral={(performanceData?.winRate ?? 0) < 50}
                >
                    {(performanceData?.winRate ?? 0).toFixed(1)}%
                </div>
            </div>

            <!-- Profit Factor -->
            <div class="stat-card">
                <div class="stat-label">{$_("journal.stats.profitFactor")}</div>
                <div
                    class="stat-value"
                    class:positive={(performanceData?.profitFactor ?? 0) >= 1.5}
                    class:neutral={(performanceData?.profitFactor ?? 0) < 1.5}
                >
                    {(performanceData?.profitFactor ?? 0).toFixed(2)}
                </div>
            </div>

            <!-- Total Trades -->
            <div class="stat-card">
                <div class="stat-label">{$_("journal.stats.totalTrades")}</div>
                <div class="stat-value neutral">
                    {performanceData?.totalTrades ?? 0}
                </div>
            </div>

            <!-- Avg R/R -->
            <div class="stat-card">
                <div class="stat-label">{$_("journal.stats.avgRR")}</div>
                <div
                    class="stat-value"
                    class:positive={(qualityData?.avgR ?? 0) >= 1}
                    class:neutral={(qualityData?.avgR ?? 0) < 1}
                >
                    {(qualityData?.avgR ?? 0).toFixed(2)}R
                </div>
            </div>

            <!-- Max Drawdown -->
            <div class="stat-card">
                <div class="stat-label">{$_("journal.stats.maxDrawdown")}</div>
                <div class="stat-value negative">
                    {(performanceData?.maxDrawdown ?? 0).toFixed(2)} $
                </div>
            </div>
        </div>
    </div>
{/if}

<style>
    .journal-statistics {
        background: var(--card-bg);
        border-radius: var(--border-radius);
        padding: 1.5rem;
        margin-bottom: 1.5rem;
        box-shadow: var(--shadow-sm);
    }

    .stats-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
        gap: 1rem;
    }

    @media (max-width: 768px) {
        .stats-grid {
            grid-template-columns: repeat(2, 1fr);
        }
    }

    .stat-card {
        background: var(--bg-secondary);
        border: 1px solid var(--border-color);
        border-radius: var(--border-radius);
        padding: 1rem;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        transition: transform 0.2s ease, box-shadow 0.2s ease;
    }

    .stat-card:hover {
        transform: translateY(-2px);
        box-shadow: var(--shadow-md);
    }

    .stat-label {
        font-size: 0.75rem;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--text-secondary);
        font-weight: 600;
    }

    .stat-value {
        font-size: 1.5rem;
        font-weight: 700;
        font-variant-numeric: tabular-nums;
    }

    .stat-value.positive {
        color: var(--success-color);
    }

    .stat-value.negative {
        color: var(--danger-color);
    }

    .stat-value.neutral {
        color: var(--text-primary);
    }
</style>
