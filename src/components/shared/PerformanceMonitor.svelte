<!--
  Performance Monitor Component
  Real-time display of system performance metrics
-->

<script lang="ts">
    import { onMount } from "svelte";
    import { _ } from "../../locales/i18n";

    interface PerformanceMetrics {
        cpuUsage: number;
        memoryUsage: number;
        apiCallsPerMinute: number;
        cacheHitRate: number;
        averageLatency: number;
        activeConnections: number;
    }

    let metrics = $state<PerformanceMetrics>({
        cpuUsage: 0,
        memoryUsage: 0,
        apiCallsPerMinute: 0,
        cacheHitRate: 0,
        averageLatency: 0,
        activeConnections: 0,
    });

    let apiCallHistory: number[] = $state([]);
    let lastUpdateTime = $state(Date.now());

    // Track API calls (can be called from other components)
    export function trackApiCall() {
        const now = Date.now();
        apiCallHistory.push(now);
        // Keep only last 60 seconds
        apiCallHistory = apiCallHistory.filter((t) => now - t < 60000);
    }

    // Calculate CPU usage approximation based on calculation times
    function calculateCPUUsage(): number {
        // This is an approximation - in browser we can't get real CPU
        // We estimate based on calculation duration vs interval
        const lastCalcTime = parseFloat(
            localStorage.getItem("cachy_last_calc_time") || "0",
        );
        const calcInterval = parseFloat(
            localStorage.getItem("cachy_calc_interval") || "60000",
        );

        if (lastCalcTime && calcInterval) {
            return Math.min(100, (lastCalcTime / calcInterval) * 100);
        }
        return 0;
    }

    // Calculate memory usage approximation
    function calculateMemoryUsage(): number {
        if (performance && (performance as any).memory) {
            const memory = (performance as any).memory;
            return Math.round(
                (memory.usedJSHeapSize / memory.jsHeapSizeLimit) * 100,
            );
        }
        return 0;
    }

    // Calculate cache hit rate
    function calculateCacheHitRate(): number {
        const hits = parseFloat(
            localStorage.getItem("cachy_cache_hits") || "0",
        );
        const misses = parseFloat(
            localStorage.getItem("cachy_cache_misses") || "0",
        );
        const total = hits + misses;

        return total > 0 ? Math.round((hits / total) * 100) : 0;
    }

    // Update metrics periodically
    function updateMetrics() {
        metrics.cpuUsage = calculateCPUUsage();
        metrics.memoryUsage = calculateMemoryUsage();
        metrics.apiCallsPerMinute = apiCallHistory.length;
        metrics.cacheHitRate = calculateCacheHitRate();
        metrics.averageLatency = parseFloat(
            localStorage.getItem("cachy_avg_latency") || "0",
        );
        metrics.activeConnections = parseFloat(
            localStorage.getItem("cachy_active_connections") || "0",
        );

        lastUpdateTime = Date.now();
    }

    // Get color based on value and thresholds
    function getColor(value: number, thresholds: [number, number]): string {
        const [warning, critical] = thresholds;
        if (value >= critical) return "text-red-500";
        if (value >= warning) return "text-orange-500";
        return "text-green-500";
    }

    // Get status badge
    function getStatusBadge(value: number, thresholds: [number, number]): string {
        const [warning, critical] = thresholds;
        if (value >= critical) return "🔴 Critical";
        if (value >= warning) return "🟡 Warning";
        return "🟢 Optimal";
    }

    onMount(() => {
        updateMetrics();
        const interval = setInterval(updateMetrics, 2000); // Update every 2 seconds
        return () => clearInterval(interval);
    });
</script>

<div class="performance-monitor">
    <div class="monitor-header">
        <h3>{$_("settings.performance.monitor") || "Performance Monitor"}</h3>
        <div class="last-update">
            {$_("settings.performance.lastUpdate") || "Last update"}:
            {new Date(lastUpdateTime).toLocaleTimeString()}
        </div>
    </div>

    <div class="metrics-grid">
        <!-- CPU Usage -->
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
                    <rect x="9" y="9" width="6" height="6" />
                    <line x1="9" y1="1" x2="9" y2="4" />
                    <line x1="15" y1="1" x2="15" y2="4" />
                    <line x1="9" y1="20" x2="9" y2="23" />
                    <line x1="15" y1="20" x2="15" y2="23" />
                    <line x1="20" y1="9" x2="23" y2="9" />
                    <line x1="20" y1="14" x2="23" y2="14" />
                    <line x1="1" y1="9" x2="4" y2="9" />
                    <line x1="1" y1="14" x2="4" y2="14" />
                </svg>
                <span class="metric-label">CPU Usage</span>
            </div>
            <div class="metric-value {getColor(metrics.cpuUsage, [40, 70])}">
                {metrics.cpuUsage.toFixed(1)}%
            </div>
            <div class="metric-status">
                {getStatusBadge(metrics.cpuUsage, [40, 70])}
            </div>
            <div class="metric-bar">
                <div
                    class="metric-bar-fill {getColor(metrics.cpuUsage, [40, 70])}"
                    style="width: {metrics.cpuUsage}%"
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
                <span class="metric-label">Memory</span>
            </div>
            <div class="metric-value {getColor(metrics.memoryUsage, [60, 85])}">
                {metrics.memoryUsage.toFixed(1)}%
            </div>
            <div class="metric-status">
                {getStatusBadge(metrics.memoryUsage, [60, 85])}
            </div>
            <div class="metric-bar">
                <div
                    class="metric-bar-fill {getColor(metrics.memoryUsage, [60, 85])}"
                    style="width: {metrics.memoryUsage}%"
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
                <span class="metric-label">API Calls/min</span>
            </div>
            <div class="metric-value {getColor(metrics.apiCallsPerMinute, [60, 120])}">
                {metrics.apiCallsPerMinute}
            </div>
            <div class="metric-status">
                {getStatusBadge(metrics.apiCallsPerMinute, [60, 120])}
            </div>
            <div class="metric-info">
                {#if metrics.apiCallsPerMinute > 120}
                    ⚠️ High API usage
                {:else if metrics.apiCallsPerMinute > 60}
                    ℹ️ Moderate usage
                {:else}
                    ✓ Normal usage
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
                <span class="metric-label">Cache Hit Rate</span>
            </div>
            <div class="metric-value {getColor(100 - metrics.cacheHitRate, [40, 70])}">
                {metrics.cacheHitRate}%
            </div>
            <div class="metric-status">
                {getStatusBadge(100 - metrics.cacheHitRate, [40, 70])}
            </div>
            <div class="metric-info">
                {#if metrics.cacheHitRate > 80}
                    ✓ Excellent caching
                {:else if metrics.cacheHitRate > 50}
                    ℹ️ Good caching
                {:else}
                    ⚠️ Consider increasing cache size
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
                <span class="metric-label">Avg Latency</span>
            </div>
            <div class="metric-value {getColor(metrics.averageLatency, [200, 500])}">
                {metrics.averageLatency.toFixed(0)}ms
            </div>
            <div class="metric-status">
                {getStatusBadge(metrics.averageLatency, [200, 500])}
            </div>
            <div class="metric-info">
                {#if metrics.averageLatency < 100}
                    ⚡ Excellent
                {:else if metrics.averageLatency < 200}
                    ✓ Good
                {:else if metrics.averageLatency < 500}
                    ℹ️ Acceptable
                {:else}
                    ⚠️ High latency
                {/if}
            </div>
        </div>

        <!-- Active Connections -->
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
                <span class="metric-label">Connections</span>
            </div>
            <div class="metric-value text-blue-500">
                {metrics.activeConnections}
            </div>
            <div class="metric-info">
                {#if metrics.activeConnections > 0}
                    🟢 Connected
                {:else}
                    🔴 Offline
                {/if}
            </div>
        </div>
    </div>

    <!-- Performance Tips -->
    <div class="performance-tips">
        <h4>
            {$_("settings.performance.tips") || "Optimization Tips"}
        </h4>
        <div class="tips-list">
            {#if metrics.cpuUsage > 70}
                <div class="tip warning">
                    <span class="tip-icon">⚠️</span>
                    <span class="tip-text"
                        >High CPU usage detected. Consider switching to Light or
                        Balanced profile.</span
                    >
                </div>
            {/if}
            {#if metrics.memoryUsage > 85}
                <div class="tip warning">
                    <span class="tip-icon">⚠️</span>
                    <span class="tip-text"
                        >High memory usage. Try reducing cache size or closing
                        unused tabs.</span
                    >
                </div>
            {/if}
            {#if metrics.apiCallsPerMinute > 120}
                <div class="tip warning">
                    <span class="tip-icon">⚠️</span>
                    <span class="tip-text"
                        >API rate limit approaching. Consider increasing
                        intervals or disabling news analysis.</span
                    >
                </div>
            {/if}
            {#if metrics.cacheHitRate < 50}
                <div class="tip info">
                    <span class="tip-icon">ℹ️</span>
                    <span class="tip-text"
                        >Low cache hit rate. Increase market cache size for
                        better performance.</span
                    >
                </div>
            {/if}
            {#if metrics.averageLatency > 500}
                <div class="tip warning">
                    <span class="tip-icon">⚠️</span>
                    <span class="tip-text"
                        >High latency detected. Check your internet connection
                        or API status.</span
                    >
                </div>
            {/if}
            {#if metrics.cpuUsage < 30 && metrics.memoryUsage < 50}
                <div class="tip success">
                    <span class="tip-icon">✓</span>
                    <span class="tip-text"
                        >Performance is optimal. You can enable more features
                        or switch to Pro profile.</span
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
        background: rgba(255, 152, 0, 0.1);
        border-left: 3px solid #ff9800;
    }

    .tip.info {
        background: rgba(33, 150, 243, 0.1);
        border-left: 3px solid #2196f3;
    }

    .tip.success {
        background: rgba(76, 175, 80, 0.1);
        border-left: 3px solid #4caf50;
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
