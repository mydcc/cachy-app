# 🚀 Real-Time Technicals Implementation Plan

## Executive Summary

**Current State:**

- Technicals update slowly or not at all (CALC_THROTTLE_MS = 250ms on +page, 1000ms in TechnicalsPanel)
- Cache TTL: 5 minutes (too aggressive for real-time)
- MAX_CACHE_SIZE: 5 entries (too small)
- No user-configurable calculation intervals
- Indicators cannot be toggled on/off to reduce computation
- RAM usage: <1MB (can safely increase to 100MB)

**Goals:**

1. Real-time technical indicators matching real-time prices
2. User-configurable calculation frequency
3. Individual indicator on/off toggles
4. Efficient data flow throughout app
5. Balance memory usage vs. update frequency
6. Maintain financial platform data consistency standards

---

## Phase 1: Analysis & Current Architecture

### 1.1 Current Calculation Flow

```
[Price Update] → WebSocket → marketWatcher
  ↓
[TechnicalsPanel] → $effect on currentKline
  ↓
THROTTLE: 1000ms (!)
  ↓
[technicalsService.calculateTechnicals]
  → Cache check (5min TTL, 5 entries max)
  → If miss: Calculate via Worker
  ↓
[technicals.worker.ts]
  → calculateAllIndicators (40+ indicators)
  → Returns to main thread
  ↓
[UI Update]
```

### 1.2 Bottlenecks Identified

| Component | Current Value | Issue |
|-----------|---------------|-------|
| `CALC_THROTTLE_MS` (+page.svelte) | 250ms | Only for trade calculations, not technicals |
| `CALCULATION_THROTTLE_MS` (TechnicalsPanel) | 1000ms | **TOO SLOW** for real-time |
| `CACHE_TTL_MS` | 5 minutes | Good for background, bad for active trading |
| `MAX_CACHE_SIZE` | 5 entries | Too small, evicts too often |
| No indicator filtering | All 40+ calculated | Wastes CPU on disabled indicators |
| No user config | Hardcoded | No flexibility |

### 1.3 Current Settings

```typescript
// Settings that affect calculations:
marketDataInterval: 10          // WebSocket price updates (seconds)
marketAnalysisInterval: 60       // Background analyst cycle (seconds)
pauseAnalysisOnBlur: true       // Smart throttle when hidden
analyzeAllFavorites: false      // Top 4 vs. all symbols
marketCacheSize: 20             // LRU cache for market data
marketMode: "balanced"          // performance|balanced|pro|custom

// Missing Settings:
technicalsUpdateInterval        // ❌ Not configurable
indicatorCacheStrategy          // ❌ Not configurable
enableIndicatorCaching          // ❌ Not toggle-able
maxTechnicalsHistory            // ❌ Uses indicatorSettings.historyLimit (750)
```

---

## Phase 2: Detailed Implementation Plan

### 2.1 New Settings Schema

Add to `src/stores/settings.svelte.ts`:

```typescript
export interface Settings {
  // ... existing settings ...

  // NEW: Technicals Performance Settings
  technicalsUpdateMode: "realtime" | "fast" | "balanced" | "conservative";
  technicalsUpdateInterval?: number; // Custom interval in ms (only for "custom" mode)
  technicalsCacheSize: number;        // Separate cache size for technicals
  technicalsCacheTTL: number;         // Cache TTL in seconds
  maxTechnicalsHistory: number;       // Max klines to keep in memory
  enableIndicatorOptimization: boolean; // Only calculate enabled indicators
  
  // NEW: Individual Indicator Toggles (add to existing or create new object)
  enabledIndicators: {
    // Oscillators
    rsi: boolean;
    stochRsi: boolean;
    macd: boolean;
    stochastic: boolean;
    williamsR: boolean;
    cci: boolean;
    adx: boolean;
    ao: boolean;
    momentum: boolean;
    mfi: boolean;
    
    // Moving Averages
    ema: boolean;
    sma: boolean;
    
    // Volatility
    bollingerBands: boolean;
    atr: boolean;
    
    // Volume
    vwap: boolean;
    volumeMa: boolean;
    volumeProfile: boolean;
    
    // Advanced
    pivots: boolean;
    superTrend: boolean;
    ichimoku: boolean;
    parabolicSar: boolean;
    divergences: boolean;
    marketStructure: boolean;
  };
}

const defaultSettings: Settings = {
  // ... existing defaults ...
  
  // NEW DEFAULTS:
  technicalsUpdateMode: "balanced",
  technicalsUpdateInterval: undefined, // Auto-calculated from mode
  technicalsCacheSize: 20,
  technicalsCacheTTL: 60, // 1 minute
  maxTechnicalsHistory: 750,
  enableIndicatorOptimization: true,
  
  enabledIndicators: {
    // Core indicators enabled by default
    rsi: true,
    macd: true,
    ema: true,
    bollingerBands: true,
    atr: true,
    vwap: true,
    pivots: true,
    
    // Advanced disabled by default
    stochRsi: false,
    stochastic: false,
    williamsR: false,
    cci: false,
    adx: false,
    ao: false,
    momentum: false,
    mfi: false,
    sma: false,
    volumeMa: false,
    volumeProfile: false,
    superTrend: false,
    ichimoku: false,
    parabolicSar: false,
    divergences: false,
    marketStructure: false,
  },
};
```

### 2.2 Update Mode Presets

```typescript
// Add to settings.svelte.ts or new config file:
export const TECHNICALS_UPDATE_PRESETS = {
  realtime: {
    interval: 100,        // 100ms (10 updates/sec)
    cacheSize: 30,
    cacheTTL: 10,         // 10 seconds
    historyLimit: 500,
    description: "Maximum responsiveness, higher CPU usage"
  },
  fast: {
    interval: 250,        // 250ms (4 updates/sec)
    cacheSize: 20,
    cacheTTL: 30,         // 30 seconds
    historyLimit: 750,
    description: "Fast updates, moderate CPU usage"
  },
  balanced: {
    interval: 500,        // 500ms (2 updates/sec)
    cacheSize: 15,
    cacheTTL: 60,         // 1 minute
    historyLimit: 750,
    description: "Balanced performance and accuracy"
  },
  conservative: {
    interval: 2000,       // 2 seconds
    cacheSize: 10,
    cacheTTL: 300,        // 5 minutes
    historyLimit: 500,
    description: "Lower CPU usage, slower updates"
  }
} as const;
```

### 2.3 Update TechnicalsPanel.svelte

```typescript
// Replace hardcoded throttle with dynamic value:
let lastCalculationTime = 0;
let calculationThrottleMs = $derived(
  settingsState.technicalsUpdateInterval ?? 
  TECHNICALS_UPDATE_PRESETS[settingsState.technicalsUpdateMode].interval
);

$effect(() => {
  // ... existing dependencies ...
  
  const now = Date.now();
  if (now - lastCalculationTime < calculationThrottleMs) return;
  
  if (klinesHistory.length > 0) {
    untrack(() => {
      updateTechnicals();
      lastCalculationTime = Date.now();
    });
  }
});

// NEW: Only request calculation for enabled indicators
async function updateTechnicals() {
  if (!klinesHistory.length) return;
  
  try {
    const newData = await technicalsService.calculateTechnicals(
      klinesHistory,
      indicatorSettings,
      settingsState.enabledIndicators // Pass filter
    );
    data = newData;
    
    if (symbol) {
      marketState.updateSymbol(symbol, { technicals: newData });
    }
  } catch (e) {
    if (import.meta.env.DEV) {
      console.error("[Technicals] Calculation error:", e);
    }
    error = "Calculation failed";
  }
}
```

### 2.4 Update technicalsService.ts

```typescript
// Update cache configuration from settings:
let MAX_CACHE_SIZE = 5;
let CACHE_TTL_MS = 5 * 60 * 1000;

// Add initialization function
export function updateCacheSettings(cacheSize: number, cacheTTL: number) {
  MAX_CACHE_SIZE = cacheSize;
  CACHE_TTL_MS = cacheTTL * 1000;
  
  if (import.meta.env.DEV) {
    console.log(`[Technicals] Cache updated: size=${MAX_CACHE_SIZE}, TTL=${CACHE_TTL_MS}ms`);
  }
}

// Update calculateTechnicals signature:
export const technicalsService = {
  async calculateTechnicals(
    klinesInput: {...}[],
    settings?: IndicatorSettings,
    enabledIndicators?: Partial<Record<string, boolean>> // NEW
  ): Promise<TechnicalsData> {
    // ... existing validation ...
    
    // Generate cache key with enabled indicators hash
    const indicatorsHash = enabledIndicators 
      ? Object.entries(enabledIndicators)
          .filter(([_, enabled]) => enabled)
          .map(([name]) => name)
          .sort()
          .join(',')
      : 'all';
    
    const cacheKey = `${lastKline.time}-${lastPrice}-${settingsJson}-${indicatorsHash}`;
    
    // ... rest of implementation ...
    
    // Pass enabledIndicators to worker
    const payload = {
      klines: serializableKlines,
      settings: settings || indicatorState.getAllSettings(),
      enabledIndicators: enabledIndicators || null
    };
    
    // ... worker communication ...
  }
};
```

### 2.5 Update technicals.worker.ts

```typescript
// Add indicator filtering:
self.onmessage = async (e: MessageEvent) => {
  const { klines, settings, enabledIndicators } = e.data;
  
  try {
    const result = calculateAllIndicators(klines, settings, enabledIndicators);
    self.postMessage({ success: true, data: result });
  } catch (error) {
    self.postMessage({ 
      success: false, 
      error: error instanceof Error ? error.message : String(error) 
    });
  }
};
```

### 2.6 Update technicalsCalculator.ts

```typescript
export function calculateAllIndicators(
  klines: Kline[],
  settings?: IndicatorSettings,
  enabledIndicators?: Partial<Record<string, boolean>>
): TechnicalsData {
  if (!klines || klines.length === 0) {
    return getEmptyData();
  }

  const config = settings || DEFAULT_INDICATOR_SETTINGS;
  const shouldCalculate = (name: string) => 
    !enabledIndicators || enabledIndicators[name] !== false;

  const result: TechnicalsData = {
    oscillators: [],
    movingAverages: [],
    pivots: { daily: null, weekly: null, monthly: null },
    atr: null,
    vwap: null,
    superTrend: null,
    ichimoku: null,
    parabolicSar: null,
    bollingerBands: null,
    divergences: [],
    marketStructure: null,
    confluence: { score: 0, signals: { bullish: 0, bearish: 0, neutral: 0 } },
    summary: { trend: "NEUTRAL", strength: 0, volatility: 0 },
    lastUpdate: Date.now(),
  };

  // Only calculate enabled indicators
  if (shouldCalculate('rsi')) {
    result.oscillators.push(calculateRSI(klines, config.rsi));
  }
  
  if (shouldCalculate('macd')) {
    result.oscillators.push(calculateMACD(klines, config.macd));
  }
  
  // ... repeat for all indicators ...
  
  // Recalculate confluence and summary based on available data
  result.confluence = calculateConfluence(result);
  result.summary = calculateSummary(result);
  
  return result;
}
```

### 2.7 Create New Settings UI Component

Create `src/components/settings/TechnicalsPerformanceSettings.svelte`:

```svelte
<script lang="ts">
  import { settingsState } from "../../stores/settings.svelte";
  import { TECHNICALS_UPDATE_PRESETS } from "../../stores/settings.svelte";
  import { _ } from "../../locales/i18n";

  let mode = $derived(settingsState.technicalsUpdateMode);
  let preset = $derived(TECHNICALS_UPDATE_PRESETS[mode]);
  let customInterval = $state(settingsState.technicalsUpdateInterval || 500);
  
  let memoryEstimate = $derived.by(() => {
    const historySize = settingsState.maxTechnicalsHistory;
    const cacheSize = settingsState.technicalsCacheSize;
    // Rough estimate: ~1KB per kline, ~50KB per calculated technicals entry
    return Math.round((historySize * 1 + cacheSize * 50) / 1024); // MB
  });

  function applyPreset(newMode: typeof mode) {
    settingsState.technicalsUpdateMode = newMode;
    const newPreset = TECHNICALS_UPDATE_PRESETS[newMode];
    settingsState.technicalsCacheSize = newPreset.cacheSize;
    settingsState.technicalsCacheTTL = newPreset.cacheTTL;
    settingsState.maxTechnicalsHistory = newPreset.historyLimit;
  }
</script>

<div class="settings-section">
  <h3>{$_('settings.technicals.performance')}</h3>
  
  <!-- Update Mode Selector -->
  <div class="setting-group">
    <label>{$_('settings.technicals.updateMode')}</label>
    <div class="mode-selector">
      {#each Object.keys(TECHNICALS_UPDATE_PRESETS) as modeKey}
        <button
          class="mode-button"
          class:active={mode === modeKey}
          onclick={() => applyPreset(modeKey)}
        >
          <div class="mode-name">{modeKey}</div>
          <div class="mode-desc">{TECHNICALS_UPDATE_PRESETS[modeKey].description}</div>
          <div class="mode-interval">{TECHNICALS_UPDATE_PRESETS[modeKey].interval}ms</div>
        </button>
      {/each}
    </div>
  </div>

  <!-- Advanced Settings -->
  <details>
    <summary>{$_('settings.technicals.advanced')}</summary>
    
    <!-- Cache Size -->
    <div class="setting-group">
      <label for="technicalsCacheSize">
        <span class="label-text">{$_('settings.technicals.cacheSize')}</span>
        <span class="current-value">{settingsState.technicalsCacheSize} entries</span>
      </label>
      <input
        id="technicalsCacheSize"
        type="range"
        min="5"
        max="50"
        step="5"
        bind:value={settingsState.technicalsCacheSize}
      />
    </div>

    <!-- Cache TTL -->
    <div class="setting-group">
      <label for="technicalsCacheTTL">
        <span class="label-text">{$_('settings.technicals.cacheTTL')}</span>
        <span class="current-value">{settingsState.technicalsCacheTTL}s</span>
      </label>
      <input
        id="technicalsCacheTTL"
        type="range"
        min="10"
        max="300"
        step="10"
        bind:value={settingsState.technicalsCacheTTL}
      />
    </div>

    <!-- History Limit -->
    <div class="setting-group">
      <label for="maxTechnicalsHistory">
        <span class="label-text">{$_('settings.technicals.historyLimit')}</span>
        <span class="current-value">{settingsState.maxTechnicalsHistory} candles</span>
      </label>
      <input
        id="maxTechnicalsHistory"
        type="range"
        min="200"
        max="2000"
        step="100"
        bind:value={settingsState.maxTechnicalsHistory}
      />
    </div>

    <!-- Memory Estimate -->
    <div class="setting-info">
      <span class="info-label">{$_('settings.technicals.memoryEstimate')}</span>
      <span class="info-value">{memoryEstimate} MB</span>
    </div>
  </details>

  <!-- Indicator Optimization -->
  <div class="setting-group">
    <label class="checkbox-label">
      <input
        type="checkbox"
        bind:checked={settingsState.enableIndicatorOptimization}
      />
      <span class="label-text">{$_('settings.technicals.optimizeCalculations')}</span>
    </label>
    <p class="help-text">
      {$_('settings.technicals.optimizeCalculationsHelp')}
    </p>
  </div>

  <!-- Performance Warning -->
  {#if mode === 'realtime'}
    <div class="warning-box">
      ⚠️ {$_('settings.technicals.realtimeWarning')}
    </div>
  {/if}
</div>

<style>
  .settings-section {
    padding: 1rem;
  }

  .mode-selector {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 0.5rem;
    margin-top: 0.5rem;
  }

  .mode-button {
    padding: 1rem;
    border: 2px solid var(--border-color);
    border-radius: 8px;
    background: var(--bg-secondary);
    cursor: pointer;
    transition: all 0.2s;
  }

  .mode-button.active {
    border-color: var(--accent-color);
    background: var(--accent-color-10);
  }

  .mode-name {
    font-weight: bold;
    text-transform: capitalize;
  }

  .mode-desc {
    font-size: 0.85rem;
    color: var(--text-muted);
    margin: 0.25rem 0;
  }

  .mode-interval {
    font-size: 0.9rem;
    color: var(--accent-color);
    font-weight: 500;
  }

  .warning-box {
    padding: 0.75rem;
    background: rgba(255, 193, 7, 0.1);
    border: 1px solid rgba(255, 193, 7, 0.3);
    border-radius: 4px;
    margin-top: 1rem;
  }
</style>
```

### 2.8 Create Indicator Toggle UI

Create `src/components/settings/IndicatorToggles.svelte`:

```svelte
<script lang="ts">
  import { settingsState } from "../../stores/settings.svelte";
  import { _ } from "../../locales/i18n";

  const indicatorGroups = {
    oscillators: ['rsi', 'stochRsi', 'macd', 'stochastic', 'williamsR', 'cci', 'adx', 'ao', 'momentum', 'mfi'],
    movingAverages: ['ema', 'sma'],
    volatility: ['bollingerBands', 'atr'],
    volume: ['vwap', 'volumeMa', 'volumeProfile'],
    advanced: ['pivots', 'superTrend', 'ichimoku', 'parabolicSar', 'divergences', 'marketStructure']
  };

  let enabledCount = $derived(
    Object.values(settingsState.enabledIndicators).filter(v => v).length
  );
  let totalCount = $derived(
    Object.keys(settingsState.enabledIndicators).length
  );

  function toggleAll(group: string, enabled: boolean) {
    const indicators = indicatorGroups[group];
    indicators.forEach(indicator => {
      settingsState.enabledIndicators[indicator] = enabled;
    });
  }

  function toggleAllIndicators(enabled: boolean) {
    Object.keys(settingsState.enabledIndicators).forEach(key => {
      settingsState.enabledIndicators[key] = enabled;
    });
  }
</script>

<div class="indicator-toggles">
  <div class="header">
    <h3>{$_('settings.technicals.indicators')}</h3>
    <div class="counter">{enabledCount} / {totalCount} enabled</div>
    <div class="bulk-actions">
      <button onclick={() => toggleAllIndicators(true)}>Enable All</button>
      <button onclick={() => toggleAllIndicators(false)}>Disable All</button>
    </div>
  </div>

  {#each Object.entries(indicatorGroups) as [groupName, indicators]}
    <details open={groupName === 'oscillators'}>
      <summary>
        <span class="group-name">{$_(settings.technicals.group.${groupName})}</span>
        <span class="group-count">
          {indicators.filter(i => settingsState.enabledIndicators[i]).length} / {indicators.length}
        </span>
        <div class="group-actions">
          <button onclick|stopPropagation={() => toggleAll(groupName, true)}>All</button>
          <button onclick|stopPropagation={() => toggleAll(groupName, false)}>None</button>
        </div>
      </summary>
      
      <div class="indicator-list">
        {#each indicators as indicator}
          <label class="indicator-item">
            <input
              type="checkbox"
              bind:checked={settingsState.enabledIndicators[indicator]}
            />
            <span class="indicator-name">{$_(`settings.technicals.${indicator}`)}</span>
            <span class="indicator-badge" class:enabled={settingsState.enabledIndicators[indicator]}>
              {settingsState.enabledIndicators[indicator] ? 'ON' : 'OFF'}
            </span>
          </label>
        {/each}
      </div>
    </details>
  {/each}
</div>

<style>
  .indicator-toggles {
    padding: 1rem;
  }

  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 1rem;
  }

  .counter {
    font-size: 0.9rem;
    color: var(--text-muted);
  }

  .bulk-actions {
    display: flex;
    gap: 0.5rem;
  }

  .bulk-actions button {
    padding: 0.25rem 0.75rem;
    font-size: 0.85rem;
    border: 1px solid var(--border-color);
    border-radius: 4px;
    background: var(--bg-secondary);
    cursor: pointer;
  }

  details {
    margin-bottom: 1rem;
    border: 1px solid var(--border-color);
    border-radius: 8px;
    padding: 0.5rem;
  }

  summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.5rem;
    cursor: pointer;
    font-weight: bold;
  }

  .group-name {
    text-transform: capitalize;
  }

  .group-count {
    font-size: 0.85rem;
    color: var(--accent-color);
  }

  .group-actions {
    display: flex;
    gap: 0.25rem;
  }

  .group-actions button {
    padding: 0.125rem 0.5rem;
    font-size: 0.75rem;
    border: 1px solid var(--border-color);
    border-radius: 4px;
    background: var(--bg-tertiary);
  }

  .indicator-list {
    padding: 0.5rem;
    display: grid;
    gap: 0.5rem;
  }

  .indicator-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem;
    border-radius: 4px;
    transition: background 0.2s;
  }

  .indicator-item:hover {
    background: var(--bg-hover);
  }

  .indicator-name {
    flex: 1;
  }

  .indicator-badge {
    font-size: 0.75rem;
    padding: 0.125rem 0.5rem;
    border-radius: 12px;
    background: var(--bg-muted);
    color: var(--text-muted);
  }

  .indicator-badge.enabled {
    background: var(--accent-color-20);
    color: var(--accent-color);
  }
</style>
```

---

## Phase 3: Integration & Testing

### 3.1 Integration Steps

1. **Update Settings Store**
   - Add new settings interface properties
   - Add default values
   - Add preset configurations
   - Implement cache update propagation

2. **Update TechnicalsService**
   - Add updateCacheSettings() function
   - Update calculateTechnicals() signature
   - Implement indicator filtering in cache key
   - Export cache metrics for monitoring

3. **Update Worker**
   - Accept enabledIndicators parameter
   - Filter calculations based on enabled state
   - Optimize performance by skipping disabled indicators

4. **Update TechnicalsPanel**
   - Replace hardcoded throttle with dynamic value
   - Pass enabledIndicators to service
   - Add visual indicator of update frequency

5. **Create UI Components**
   - TechnicalsPerformanceSettings.svelte
   - IndicatorToggles.svelte
   - Integrate into Settings modal

6. **Add Monitoring**
   - Cache hit/miss rate
   - Calculation time metrics
   - Memory usage tracking
   - Update frequency visualization

### 3.2 Testing Plan

#### 3.2.1 Unit Tests

```typescript
// tests/services/technicalsService.test.ts
describe('TechnicalsService with Indicator Filtering', () => {
  test('should only calculate enabled indicators', async () => {
    const klines = generateMockKlines(100);
    const enabledIndicators = { rsi: true, macd: false };
    
    const result = await technicalsService.calculateTechnicals(
      klines,
      undefined,
      enabledIndicators
    );
    
    expect(result.oscillators.find(o => o.name === 'RSI')).toBeDefined();
    expect(result.oscillators.find(o => o.name === 'MACD')).toBeUndefined();
  });

  test('should respect cache TTL from settings', () => {
    updateCacheSettings(10, 30); // 10 entries, 30s TTL
    // ... cache behavior tests ...
  });
});
```

#### 3.2.2 E2E Tests

```typescript
// tests/e2e/technicals-realtime.spec.ts
import { test, expect } from '@playwright/test';

test('technicals update in real-time mode', async ({ page }) => {
  await page.goto('/');
  
  // Open settings
  await page.click('[data-testid="settings-button"]');
  
  // Set to realtime mode
  await page.click('[data-testid="mode-realtime"]');
  
  // Open technicals panel
  await page.click('[data-testid="technicals-toggle"]');
  
  // Wait for initial data
  await page.waitForSelector('[data-testid="rsi-value"]');
  
  // Get initial RSI value
  const initialRSI = await page.textContent('[data-testid="rsi-value"]');
  
  // Wait 500ms (should update multiple times in realtime mode)
  await page.waitForTimeout(500);
  
  // Check if RSI updated
  const updatedRSI = await page.textContent('[data-testid="rsi-value"]');
  
  // In realtime mode with price changes, should be different
  // (This may be flaky if price doesn't change, consider mocking)
  expect(updatedRSI).not.toBe(initialRSI);
});

test('disabled indicators are not displayed', async ({ page }) => {
  await page.goto('/');
  
  // Open settings
  await page.click('[data-testid="settings-button"]');
  await page.click('[data-testid="indicators-tab"]');
  
  // Disable MACD
  await page.uncheck('[data-testid="indicator-macd"]');
  
  // Open technicals panel
  await page.click('[data-testid="technicals-toggle"]');
  
  // MACD should not be visible
  await expect(page.locator('[data-testid="macd-container"]')).not.toBeVisible();
});
```

### 3.3 Performance Benchmarks

Create monitoring dashboard to track:

```typescript
// src/utils/performanceMonitor.ts
export class TechnicalsPerformanceMonitor {
  private metrics = {
    calculationTime: [] as number[],
    cacheHitRate: { hits: 0, misses: 0 },
    updateFrequency: [] as number[],
    memoryUsage: [] as number[],
  };

  recordCalculation(timeMs: number, cacheHit: boolean) {
    this.metrics.calculationTime.push(timeMs);
    if (cacheHit) {
      this.metrics.cacheHitRate.hits++;
    } else {
      this.metrics.cacheHitRate.misses++;
    }
  }

  getStats() {
    const avgCalcTime = 
      this.metrics.calculationTime.reduce((a, b) => a + b, 0) / 
      this.metrics.calculationTime.length;
    
    const cacheHitRate = 
      this.metrics.cacheHitRate.hits / 
      (this.metrics.cacheHitRate.hits + this.metrics.cacheHitRate.misses);

    return {
      avgCalculationTime: avgCalcTime,
      cacheHitRate: cacheHitRate * 100,
      totalCalculations: this.metrics.calculationTime.length,
    };
  }
}
```

---

## Phase 4: Financial Platform Standards

### 4.1 Data Consistency Guarantees

```typescript
// Ensure calculations are deterministic
export function ensureDataConsistency(data: TechnicalsData): TechnicalsData {
  // 1. Validate all numeric values are finite
  const validateNumber = (n: number | null): number | null => {
    if (n === null || n === undefined) return null;
    if (!Number.isFinite(n)) return null;
    return n;
  };

  // 2. Ensure no NaN or Infinity
  data.oscillators.forEach(osc => {
    osc.value = validateNumber(osc.value);
    if (osc.signal) osc.signal = validateNumber(osc.signal);
  });

  // 3. Validate timestamp is recent
  const now = Date.now();
  if (!data.lastUpdate || data.lastUpdate > now || now - data.lastUpdate > 60000) {
    data.lastUpdate = now;
  }

  // 4. Ensure confluence score is in valid range
  if (data.confluence.score < 0) data.confluence.score = 0;
  if (data.confluence.score > 100) data.confluence.score = 100;

  return data;
}
```

### 4.2 Calculation Audit Trail

```typescript
// Add to technicalsService.ts
export interface CalculationMetadata {
  timestamp: number;
  symbol: string;
  timeframe: string;
  klineCount: number;
  enabledIndicators: string[];
  calculationTime: number;
  cacheHit: boolean;
  cacheKey: string;
}

const calculationLog: CalculationMetadata[] = [];

export function getCalculationHistory(): CalculationMetadata[] {
  return calculationLog.slice(-100); // Last 100 calculations
}
```

### 4.3 Error Handling & Fallbacks

```typescript
// Robust error handling
export const technicalsService = {
  async calculateTechnicals(...args): Promise<TechnicalsData> {
    try {
      // Try worker calculation
      return await this.calculateWithWorker(...args);
    } catch (workerError) {
      console.warn('[Technicals] Worker failed, using inline calculation', workerError);
      
      try {
        // Fallback to inline calculation
        return this.calculateTechnicalsInline(...args);
      } catch (inlineError) {
        console.error('[Technicals] All calculations failed', inlineError);
        
        // Return cached data if available
        const cached = this.getLastKnownGood(args[0]);
        if (cached) {
          console.warn('[Technicals] Using stale cached data');
          return { ...cached, isStale: true };
        }
        
        // Last resort: empty data
        return getEmptyData();
      }
    }
  },

  private lastKnownGood = new Map<string, TechnicalsData>(),

  private getLastKnownGood(klines: any[]): TechnicalsData | null {
    // Implementation to retrieve last successful calculation
  }
};
```

---

## Phase 5: Migration & Rollout

### 5.1 Backward Compatibility

```typescript
// Ensure old settings work during migration
export function migrateSettingsV1toV2(oldSettings: any): Settings {
  return {
    ...oldSettings,
    
    // Set defaults for new settings
    technicalsUpdateMode: oldSettings.marketMode === 'pro' ? 'fast' : 'balanced',
    technicalsCacheSize: oldSettings.marketCacheSize || 20,
    technicalsCacheTTL: 60,
    maxTechnicalsHistory: 750,
    enableIndicatorOptimization: true,
    
    enabledIndicators: {
      // Enable core indicators by default
      rsi: true,
      macd: true,
      ema: true,
      bollingerBands: true,
      atr: true,
      vwap: true,
      pivots: true,
      // Rest disabled
      stochRsi: false,
      stochastic: false,
      williamsR: false,
      cci: false,
      adx: false,
      ao: false,
      momentum: false,
      mfi: false,
      sma: false,
      volumeMa: false,
      volumeProfile: false,
      superTrend: false,
      ichimoku: false,
      parabolicSar: false,
      divergences: false,
      marketStructure: false,
    },
  };
}
```

### 5.2 Feature Flags

```typescript
// Add to settings
export interface Settings {
  // ... existing ...
  
  // Feature flags
  features: {
    enableRealtimeTechnicals: boolean;
    enableIndicatorOptimization: boolean;
    enablePerformanceMonitoring: boolean;
  };
}

// Check before enabling new features
if (settingsState.features.enableRealtimeTechnicals) {
  // Use new real-time calculation flow
} else {
  // Use legacy calculation flow
}
```

### 5.3 Rollout Plan

1. **Phase 5.1: Internal Testing (Week 1)**
   - Deploy to dev environment
   - Enable for internal users only
   - Monitor performance metrics
   - Fix critical bugs

2. **Phase 5.2: Beta Release (Week 2)**
   - Add feature flag `enableRealtimeTechnicals`
   - Enable for 10% of users
   - Collect feedback
   - Monitor error rates

3. **Phase 5.3: Gradual Rollout (Week 3-4)**
   - Increase to 25% of users
   - Then 50%
   - Then 75%
   - Monitor stability

4. **Phase 5.4: Full Release (Week 5)**
   - Enable for all users
   - Make it default
   - Remove feature flag

---

## Phase 6: Documentation & User Education

### 6.1 User Guide

Create `docs/technicals-performance-guide.md`:

```markdown
# Technicals Performance Guide

## Understanding Update Modes

### Realtime Mode
- **Update Frequency:** 100ms (10 times per second)
- **Best For:** Active day traders, scalpers
- **CPU Usage:** High
- **Memory:** ~75-100MB
- **Battery Impact:** Significant

### Fast Mode
- **Update Frequency:** 250ms (4 times per second)
- **Best For:** Swing traders, active monitoring
- **CPU Usage:** Moderate
- **Memory:** ~50-75MB
- **Battery Impact:** Moderate

### Balanced Mode (Default)
- **Update Frequency:** 500ms (2 times per second)
- **Best For:** Most users, position traders
- **CPU Usage:** Low
- **Memory:** ~25-50MB
- **Battery Impact:** Minimal

### Conservative Mode
- **Update Frequency:** 2 seconds
- **Best For:** Long-term investors, low-end devices
- **CPU Usage:** Very Low
- **Memory:** ~10-25MB
- **Battery Impact:** Negligible

## Optimizing for Your Device

### High-End Desktop/Laptop
- Mode: Realtime or Fast
- Cache Size: 30-50
- History Limit: 1000-2000
- Enable all indicators

### Standard Laptop
- Mode: Fast or Balanced
- Cache Size: 15-30
- History Limit: 500-1000
- Enable core indicators only

### Tablet/Low-End Device
- Mode: Balanced or Conservative
- Cache Size: 10-15
- History Limit: 200-500
- Enable essential indicators only

## Troubleshooting

### Indicators not updating
1. Check update mode setting
2. Verify enabled indicators
3. Check browser console for errors
4. Clear cache and reload

### High CPU usage
1. Switch to Conservative mode
2. Disable unused indicators
3. Reduce history limit
4. Lower cache size

### High memory usage
1. Reduce cache size
2. Lower history limit
3. Disable advanced indicators
```

### 6.2 Translation Keys

Add to `src/locales/en/translation.json`:

```json
{
  "settings": {
    "technicals": {
      "performance": "Technicals Performance",
      "updateMode": "Update Mode",
      "advanced": "Advanced Settings",
      "cacheSize": "Cache Size",
      "cacheTTL": "Cache Duration",
      "historyLimit": "History Limit",
      "memoryEstimate": "Estimated Memory Usage",
      "optimizeCalculations": "Optimize Calculations",
      "optimizeCalculationsHelp": "Only calculate enabled indicators to save CPU",
      "realtimeWarning": "Real-time mode uses significant CPU and battery. Recommended for active trading only.",
      "indicators": "Indicator Toggles",
      "group": {
        "oscillators": "Oscillators",
        "movingAverages": "Moving Averages",
        "volatility": "Volatility",
        "volume": "Volume",
        "advanced": "Advanced"
      },
      "rsi": "RSI",
      "stochRsi": "Stochastic RSI",
      "macd": "MACD",
      "stochastic": "Stochastic",
      "williamsR": "Williams %R",
      "cci": "CCI",
      "adx": "ADX",
      "ao": "Awesome Oscillator",
      "momentum": "Momentum",
      "mfi": "Money Flow Index",
      "ema": "EMA",
      "sma": "SMA",
      "bollingerBands": "Bollinger Bands",
      "atr": "ATR",
      "vwap": "VWAP",
      "volumeMa": "Volume MA",
      "volumeProfile": "Volume Profile",
      "pivots": "Pivot Points",
      "superTrend": "SuperTrend",
      "ichimoku": "Ichimoku Cloud",
      "parabolicSar": "Parabolic SAR",
      "divergences": "Divergences",
      "marketStructure": "Market Structure"
    }
  }
}
```

---

## Phase 7: Success Criteria & Metrics

### 7.1 Performance Targets

| Metric | Current | Target | Measurement |
|--------|---------|--------|-------------|
| Update Latency | 1000ms | 100-500ms (mode-dependent) | Time from price update to indicator update |
| Cache Hit Rate | Unknown | >80% | % of calculations served from cache |
| Memory Usage | <1MB | <100MB | Chrome Task Manager |
| CPU Usage | Variable | <5% (balanced), <15% (realtime) | Chrome Task Manager |
| Calculation Time | Unknown | <50ms (worker), <100ms (inline) | Performance.now() |

### 7.2 User Experience Targets

- **Real-time Feel:** Indicators visually update with price changes
- **No Lag:** No noticeable delay between price and indicator updates
- **Smooth UI:** No frame drops or stuttering
- **Battery Friendly:** <5% battery drain per hour (balanced mode)
- **Configurable:** Users can tune performance to their needs

### 7.3 Quality Gates

Before each rollout phase:

1. ✅ All unit tests passing
2. ✅ All E2E tests passing
3. ✅ Performance benchmarks within targets
4. ✅ No memory leaks detected (24h stress test)
5. ✅ Error rate <0.1%
6. ✅ User feedback score >4.5/5
7. ✅ Documentation complete

---

## Summary & Next Steps

### Implementation Priority

1. **Week 1: Core Settings & Service Updates**
   - Implement new settings schema
   - Update technicalsService with indicator filtering
   - Add cache configuration functions
   - Update worker to accept filter parameter

2. **Week 2: UI Components & Integration**
   - Create TechnicalsPerformanceSettings component
   - Create IndicatorToggles component
   - Update TechnicalsPanel throttling
   - Integrate into Settings modal

3. **Week 3: Testing & Optimization**
   - Write unit tests
   - Write E2E tests
   - Performance profiling
   - Memory leak detection

4. **Week 4: Beta & Monitoring**
   - Deploy to beta users
   - Add performance monitoring
   - Collect metrics
   - Fix issues

5. **Week 5: Full Release**
   - Gradual rollout
   - Documentation
   - User education
   - Monitor success metrics

### Risk Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| Performance regression | High | Feature flags, gradual rollout, rollback plan |
| Memory leaks | High | Extensive testing, monitoring, LRU eviction |
| Data inconsistency | Critical | Validation layer, audit trail, fallbacks |
| User confusion | Medium | Clear UI, documentation, tooltips |
| Battery drain | Medium | Conservative defaults, user warnings |

### Questions to Address

1. **Should we add "Auto" mode** that dynamically adjusts based on device capabilities?
2. **Should we sync settings across devices** via cloud sync?
3. **Should we add visual indicators** of calculation status (e.g., pulse animation)?
4. **Should we expose raw calculation metrics** in dev mode for debugging?
5. **Should we add A/B testing** to compare modes?

---

## Conclusion

This plan provides a comprehensive approach to implementing real-time technical indicators while maintaining:

- ✅ **Financial platform standards** (data consistency, audit trails)
- ✅ **User control** (configurable update frequency, indicator toggles)
- ✅ **Performance optimization** (intelligent caching, worker offloading)
- ✅ **Resource efficiency** (adaptive modes, memory management)
- ✅ **Backward compatibility** (migration path, feature flags)
- ✅ **Testability** (unit tests, E2E tests, monitoring)

The implementation is broken into phases with clear success criteria, allowing for iterative development and validation at each step.
