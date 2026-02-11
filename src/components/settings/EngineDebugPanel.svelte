<!--
  Copyright (C) 2026 MYDCT
  
  Engine Debug Panel - DEV-only dashboard showing engine telemetry,
  circuit breaker state, and recent performance history.
-->

<script lang="ts">
    import { calculationStrategy } from "../../services/calculationStrategy";
    
    let telemetry = $state(calculationStrategy.exportTelemetry());
    let showHistory = $state(false);
    
    function refresh() {
        telemetry = calculationStrategy.exportTelemetry();
    }
    
    // Auto-refresh every 5s
    $effect(() => {
        const interval = setInterval(refresh, 5000);
        return () => clearInterval(interval);
    });
    
    function formatMs(ms: number | undefined): string {
        if (ms === undefined || ms === null) return '–';
        return ms < 1 ? '<1ms' : `${ms.toFixed(1)}ms`;
    }
    
    function formatMemory(bytes: number | undefined): string {
        if (!bytes) return '–';
        const mb = bytes / (1024 * 1024);
        return `${mb.toFixed(1)}MB`;
    }
    
    const engines = ['ts', 'wasm', 'gpu'] as const;
    
    const recentHistory = $derived(
        telemetry.performanceHistory.slice(-10).reverse()
    );
</script>

<div class="debug-panel">
    <div class="panel-header">
        <h4 class="panel-title">⚡ Engine Debug Panel</h4>
        <button class="refresh-btn" onclick={refresh} title="Refresh">🔄</button>
    </div>

    <!-- Capabilities -->
    <div class="section">
        <div class="section-label">Capabilities</div>
        <div class="caps-grid">
            <span class="cap" class:cap-on={telemetry.capabilities.ts}>TS</span>
            <span class="cap" class:cap-on={telemetry.capabilities.wasm}>WASM</span>
            <span class="cap" class:cap-on={telemetry.capabilities.simd}>SIMD</span>
            <span class="cap" class:cap-on={telemetry.capabilities.sharedMemory}>SharedMem</span>
            <span class="cap" class:cap-on={telemetry.capabilities.gpu}>GPU</span>
        </div>
    </div>

    <!-- Context -->
    <div class="section">
        <div class="section-label">Context</div>
        <div class="caps-grid">
            <span class="ctx" class:ctx-warn={telemetry.context.lowBattery}>
                {telemetry.context.lowBattery ? '🪫 Low Battery' : '🔋 OK'}
            </span>
            <span class="ctx" class:ctx-warn={telemetry.context.lowMemory}>
                {telemetry.context.lowMemory ? '⚠️ Low RAM' : '💾 OK'}
            </span>
            <span class="ctx">
                {telemetry.context.isMobile ? '📱 Mobile' : '🖥️ Desktop'}
            </span>
        </div>
    </div>

    <!-- Engine Stats Table -->
    <div class="section">
        <div class="section-label">Engine Stats</div>
        <table class="stats-table">
            <thead>
                <tr>
                    <th>Engine</th>
                    <th>Health</th>
                    <th>Avg</th>
                    <th>Samples</th>
                </tr>
            </thead>
            <tbody>
                {#each engines as engine}
                    {#if telemetry.stats && telemetry.stats[engine]}
            {@const stats = telemetry.stats[engine]}
            {@const usage = telemetry.usagePercent ? telemetry.usagePercent[engine] : 0}
            <tr>
              <td class="engine-name">
                {engine.toUpperCase()}
                {#if usage > 0}
                  <span class="usage-badge" title="Usage Share">{usage}%</span>
                {/if}
              </td>
              <td class="status-cell">
                {#if telemetry.circuitBreaker && telemetry.circuitBreaker[engine]}
                  {@const health = telemetry.circuitBreaker[engine]}
                  {#if health.healthy}
                    <span class="status-ok">✅ Healthy</span>
                  {:else}
                    <span class="status-err" title={health.lastError}>
                      ❌ Disabled ({health.failures})
                    </span>
                  {/if}
                {/if}
              </td>
              <td>
                {#if stats.calls > 0}
                  {(stats.totalTime / stats.calls).toFixed(1)}ms
                {:else}
                  -
                {/if}
              </td>
              <td>{stats.calls}</td>
            </tr>
          {:else}
            <tr>
              <td class="engine-name">{engine.toUpperCase()}</td>
              <td class="status-cell"><span class="status-neutral">No Data</span></td>
              <td>-</td>
              <td>0</td>
            </tr>
          {/if}
                {/each}
            </tbody>
        </table>
    </div>

    <!-- Recent History -->
    <div class="section">
        <button class="history-toggle" onclick={() => showHistory = !showHistory}>
            {showHistory ? '▾' : '▸'} Recent History ({telemetry.performanceHistory.length})
        </button>
        
        {#if showHistory && recentHistory.length > 0}
            <table class="stats-table history-table">
                <thead>
                    <tr>
                        <th>Engine</th>
                        <th>Candles</th>
                        <th>Time</th>
                        <th>Memory</th>
                    </tr>
                </thead>
                <tbody>
                    {#each recentHistory as entry}
                        <tr>
                            <td class="engine-name">{entry.engine}</td>
                            <td>{entry.candleCount.toLocaleString()}</td>
                            <td>{formatMs(entry.executionTime)}</td>
                            <td>{formatMemory(entry.memoryUsed)}</td>
                        </tr>
                    {/each}
                </tbody>
            </table>
        {:else if showHistory}
            <div class="no-data">No calculations recorded yet.</div>
        {/if}
    </div>
</div>

<style>
    .debug-panel {
        margin-top: 1rem;
        padding: 0.75rem;
        background: var(--bg-secondary);
        border: 1px solid var(--border-color);
        border-radius: 8px;
        font-size: 0.75rem;
    }
    .panel-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 0.5rem;
    }
    .panel-title {
        font-size: 0.8rem;
        font-weight: 700;
        color: var(--text-primary);
        margin: 0;
    }
    .refresh-btn {
        background: none;
        border: none;
        cursor: pointer;
        font-size: 0.8rem;
        padding: 2px 4px;
        border-radius: 4px;
    }
    .refresh-btn:hover {
        background: var(--bg-tertiary);
    }
    .section {
        margin-bottom: 0.5rem;
    }
    .section-label {
        font-size: 0.65rem;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--text-secondary);
        margin-bottom: 0.25rem;
    }
    .caps-grid {
        display: flex;
        flex-wrap: wrap;
        gap: 0.35rem;
    }
    .cap {
        padding: 1px 6px;
        border-radius: 4px;
        font-size: 0.65rem;
        font-weight: 600;
        background: var(--bg-tertiary);
        color: var(--text-secondary);
        opacity: 0.5;
    }
    .cap-on {
        opacity: 1;
        background: rgba(52, 211, 153, 0.15);
        color: rgb(52, 211, 153);
    }
    .ctx {
        padding: 1px 6px;
        border-radius: 4px;
        font-size: 0.65rem;
        background: var(--bg-tertiary);
        color: var(--text-secondary);
    }
    .ctx-warn {
        background: rgba(251, 191, 36, 0.15);
        color: rgb(251, 191, 36);
    }
    .stats-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 0.7rem;
    }
    .usage-badge {
        font-size: 0.6rem;
        background: var(--bg-tertiary);
        padding: 0 4px;
        border-radius: 4px;
        margin-left: 4px;
        opacity: 0.8;
    }
    .status-ok {
        color: rgb(52, 211, 153);
        font-weight: 500;
    }
    .status-err {
        color: rgb(239, 68, 68);
        font-weight: 500;
    }
    .status-neutral {
        color: var(--text-tertiary);
        font-style: italic;
    }
    .stats-table {
        width: 100%;
        margin-top: 0.35rem;
        border-collapse: collapse;
    }
    .stats-table th {
        text-align: left;
        color: var(--text-secondary);
        font-weight: 500;
        padding-bottom: 0.25rem;
        border-bottom: 1px solid var(--border-color);
    }
    .stats-table td {
        padding: 0.35rem 0;
        border-bottom: 1px solid var(--bg-tertiary);
    }
    .stats-table td:last-child {
        text-align: right;
    }
    .stats-table th:last-child {
        text-align: right;
    }
    .engine-name {
        font-weight: 600;
        color: var(--accent-primary);
        display: flex;
        align-items: center;
    }
    .history-toggle {
        background: none;
        border: none;
        color: var(--text-secondary);
        font-size: 0.7rem;
        cursor: pointer;
        padding: 2px 0;
        font-weight: 600;
        display: flex;
        align-items: center;
        gap: 4px;
    }
    .history-toggle:hover {
        color: var(--text-primary);
    }
    .history-table {
        margin-top: 0.35rem;
    }
    .no-data {
        font-size: 0.65rem;
        color: var(--text-secondary);
        padding: 0.5rem 0;
        text-align: center;
    }
</style>
