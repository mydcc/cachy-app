<!--
  Calculation Settings Panel
  Allows users to configure performance profiles and granular calculation settings
-->

<script lang="ts">
    import { settingsState } from "../../stores/settings.svelte";

    type PresetType = "light" | "balanced" | "pro";

    let selectedPreset = $state<PresetType | null>(null);

    const presets: Record<
        PresetType,
        {
            label: string;
            description: string;
            marketAnalysisInterval: number;
            pauseAnalysisOnBlur: boolean;
            analyzeAllFavorites: boolean;
            marketCacheSize: number;
            enableNewsAnalysis: boolean;
            analysisTimeframes: string[];
        }
    > = {
        light: {
            label: "💡 Light",
            description: "Minimal CPU/Memory, slower updates",
            marketAnalysisInterval: 300, // 5 minutes
            pauseAnalysisOnBlur: true,
            analyzeAllFavorites: false,
            marketCacheSize: 10,
            enableNewsAnalysis: false,
            analysisTimeframes: ["1h", "4h"],
        },
        balanced: {
            label: "⚖️ Balanced",
            description: "Good performance & responsiveness",
            marketAnalysisInterval: 60, // 1 minute
            pauseAnalysisOnBlur: true,
            analyzeAllFavorites: false,
            marketCacheSize: 20,
            enableNewsAnalysis: true,
            analysisTimeframes: ["15m", "1h", "4h"],
        },
        pro: {
            label: "⚡ Pro",
            description: "Maximum responsiveness, higher CPU",
            marketAnalysisInterval: 10, // 10 seconds
            pauseAnalysisOnBlur: false,
            analyzeAllFavorites: true,
            marketCacheSize: 50,
            enableNewsAnalysis: true,
            analysisTimeframes: ["5m", "15m", "1h", "4h"],
        },
    };

    function applyPreset(preset: PresetType) {
        selectedPreset = preset;
        const config = presets[preset];

        settingsState.marketAnalysisInterval = config.marketAnalysisInterval;
        settingsState.pauseAnalysisOnBlur = config.pauseAnalysisOnBlur;
        settingsState.analyzeAllFavorites = config.analyzeAllFavorites;
        settingsState.marketCacheSize = config.marketCacheSize;
        settingsState.enableNewsAnalysis = config.enableNewsAnalysis;
        settingsState.analysisTimeframes = config.analysisTimeframes;
    }

    function formatIntervalLabel(seconds: number): string {
        if (seconds < 60) return `${seconds}s`;
        if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
        return `${Math.round(seconds / 3600)}h`;
    }

    // Detect current preset based on settings
    $effect(() => {
        const current = settingsState.marketAnalysisInterval;
        const analyzeAll = settingsState.analyzeAllFavorites;
        const cacheSize = settingsState.marketCacheSize;

        if (current === 300 && !analyzeAll && cacheSize === 10) {
            selectedPreset = "light";
        } else if (current === 60 && !analyzeAll && cacheSize === 20) {
            selectedPreset = "balanced";
        } else if (current === 10 && analyzeAll && cacheSize === 50) {
            selectedPreset = "pro";
        } else {
            selectedPreset = null;
        }
    });
</script>

<div class="calculation-settings">
    <!-- Presets Section -->
    <section class="presets-section">
        <h3>Performance Profiles</h3>
        <p class="description">
            Quick-select presets to balance performance and responsiveness
        </p>

        <div class="preset-buttons">
            {#each Object.entries(presets) as [key, preset] (key)}
                <button
                    class="preset-btn {selectedPreset === key ? 'active' : ''}"
                    onclick={() => applyPreset(key as PresetType)}
                    title={preset.description}
                >
                    <div class="preset-label">{preset.label}</div>
                    <div class="preset-desc">{preset.description}</div>
                    <div class="preset-specs">
                        Interval: {formatIntervalLabel(
                            preset.marketAnalysisInterval,
                        )} • Cache: {preset.marketCacheSize} •
                        {preset.analysisTimeframes.join(", ")}
                    </div>
                </button>
            {/each}
        </div>
    </section>

    <!-- Divider -->
    <hr class="divider" />

    <!-- Advanced Settings -->
    <section class="advanced-settings">
        <h3>Advanced Settings</h3>

        <!-- Market Analysis Interval -->
        <div class="setting-group">
            <label for="marketAnalysisInterval">
                <span class="label-text">Analysis Interval</span>
                <span class="current-value"
                    >{formatIntervalLabel(
                        settingsState.marketAnalysisInterval,
                    )}s</span
                >
            </label>
            <div class="slider-container">
                <input
                    id="marketAnalysisInterval"
                    type="range"
                    min="10"
                    max="600"
                    step="10"
                    bind:value={settingsState.marketAnalysisInterval}
                    class="slider"
                />
                <div class="slider-labels">
                    <span>10s (Aggressive)</span>
                    <span>300s (5min)</span>
                    <span>600s (10min)</span>
                </div>
            </div>
            <p class="help-text">
                How often to recalculate technicals. Lower = more CPU but
                fresher data.
            </p>
        </div>

        <!-- Analyze All Favorites -->
        <div class="setting-group">
            <label class="checkbox-label">
                <input
                    type="checkbox"
                    bind:checked={settingsState.analyzeAllFavorites}
                    class="checkbox"
                />
                <span class="label-text">Analyze All Favorites</span>
                <span
                    class="badge {settingsState.analyzeAllFavorites
                        ? 'active'
                        : ''}"
                >
                    {settingsState.analyzeAllFavorites
                        ? "All Favorites"
                        : "Top 4 Only"}
                </span>
            </label>
            <p class="help-text">
                If disabled, only top 4 favorites are analyzed each cycle (saves
                CPU).
                {#if settingsState.analyzeAllFavorites}
                    <span class="warning">⚠️ Enabled: Higher CPU usage</span>
                {/if}
            </p>
        </div>

        <!-- Pause on Blur -->
        <div class="setting-group">
            <label class="checkbox-label">
                <input
                    type="checkbox"
                    bind:checked={settingsState.pauseAnalysisOnBlur}
                    class="checkbox"
                />
                <span class="label-text">Pause Analysis When Inactive</span>
                <span class="badge active">Smart Throttle</span>
            </label>
            <p class="help-text">
                When browser is not focused, doubles the analysis interval
                (saves energy).
            </p>
        </div>

        <!-- Market Cache Size -->
        <div class="setting-group">
            <label for="marketCacheSize">
                <span class="label-text">Market Cache Size</span>
                <span class="current-value"
                    >{settingsState.marketCacheSize} symbols</span
                >
            </label>
            <div class="slider-container">
                <input
                    id="marketCacheSize"
                    type="range"
                    min="5"
                    max="100"
                    step="5"
                    bind:value={settingsState.marketCacheSize}
                    class="slider"
                />
                <div class="slider-labels">
                    <span>5 (minimal)</span>
                    <span>20 (balanced)</span>
                    <span>100 (max)</span>
                </div>
            </div>
            <p class="help-text">
                Max symbols kept in memory. Higher values use more RAM but
                improve responsiveness.
            </p>
        </div>

        <!-- Timeframes Selection -->
        <div class="setting-group">
            <div class="label-row">
                <span class="label-text">Analysis Timeframes</span>
                <span class="current-value"
                    >{settingsState.analysisTimeframes.length} selected</span
                >
            </div>
            <div class="timeframe-grid">
                {#each ["5m", "15m", "1h", "4h", "1d"] as tf (tf)}
                    {@const isSelected =
                        settingsState.analysisTimeframes.includes(tf)}
                    <button
                        class="timeframe-btn {isSelected ? 'selected' : ''}"
                        onclick={() => {
                            if (isSelected) {
                                // Don't allow removing last timeframe
                                if (
                                    settingsState.analysisTimeframes.length > 1
                                ) {
                                    settingsState.analysisTimeframes =
                                        settingsState.analysisTimeframes.filter(
                                            (t) => t !== tf,
                                        );
                                }
                            } else {
                                settingsState.analysisTimeframes = [
                                    ...settingsState.analysisTimeframes,
                                    tf,
                                ];
                            }
                        }}
                    >
                        {tf}
                    </button>
                {/each}
            </div>
            <p class="help-text">
                More timeframes = more API calls and CPU usage.
                {#if settingsState.analysisTimeframes.length >= 4}
                    <span class="warning"
                        >⚠️ {settingsState.analysisTimeframes.length} timeframes:
                        Higher load</span
                    >
                {/if}
            </p>
        </div>

        <!-- Enable News Analysis -->
        <div class="setting-group">
            <label class="checkbox-label">
                <input
                    type="checkbox"
                    bind:checked={settingsState.enableNewsAnalysis}
                    class="checkbox"
                />
                <span class="label-text">Enable News Analysis</span>
                <span
                    class="badge {settingsState.enableNewsAnalysis
                        ? 'active'
                        : ''}"
                >
                    {settingsState.enableNewsAnalysis ? "On" : "Off"}
                </span>
            </label>
            <p class="help-text">
                Fetch latest news and sentiment for analyzed symbols (uses API
                quota).
            </p>
        </div>
    </section>

    <!-- Debug Info -->
    <section class="debug-info">
        <h3>Current Configuration</h3>
        <div class="info-grid">
            <div class="info-item">
                <span class="label">Profile:</span>
                <span class="value"
                    >{selectedPreset
                        ? presets[selectedPreset].label
                        : "🔧 Custom"}</span
                >
            </div>
            <div class="info-item">
                <span class="label">Interval:</span>
                <span class="value"
                    >{formatIntervalLabel(
                        settingsState.marketAnalysisInterval,
                    )}</span
                >
            </div>
            <div class="info-item">
                <span class="label">Symbols/Cycle:</span>
                <span class="value"
                    >{settingsState.analyzeAllFavorites ? "All" : "Top 4"}</span
                >
            </div>
            <div class="info-item">
                <span class="label">Cache Limit:</span>
                <span class="value"
                    >{settingsState.marketCacheSize} symbols</span
                >
            </div>
            <div class="info-item">
                <span class="label">News:</span>
                <span class="value"
                    >{settingsState.enableNewsAnalysis
                        ? "Enabled"
                        : "Disabled"}</span
                >
            </div>
            <div class="info-item">
                <span class="label">Smart Pause:</span>
                <span class="value"
                    >{settingsState.pauseAnalysisOnBlur ? "On" : "Off"}</span
                >
            </div>
        </div>
    </section>
</div>

<style>
    .calculation-settings {
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

    .description {
        font-size: 0.9rem;
        color: var(--text-secondary);
        margin: 0;
    }

    /* Presets */
    .preset-buttons {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 1rem;
    }

    .preset-btn {
        padding: 1rem;
        border: 2px solid var(--border-color);
        border-radius: 0.75rem;
        background: var(--bg-secondary);
        cursor: pointer;
        transition: all 0.2s;
        text-align: left;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }

    .preset-btn:hover {
        border-color: var(--primary-color);
        background: var(--bg-hover);
    }

    .preset-btn.active {
        border-color: var(--primary-color);
        background: var(--primary-color, rgba(76, 175, 80, 0.1));
        box-shadow: 0 0 0 3px var(--primary-color, rgba(76, 175, 80, 0.2));
    }

    .preset-label {
        font-weight: 600;
        font-size: 1rem;
    }

    .preset-desc {
        font-size: 0.85rem;
        color: var(--text-secondary);
    }

    .preset-specs {
        font-size: 0.75rem;
        color: var(--text-tertiary);
        margin-top: 0.25rem;
    }

    /* Divider */
    .divider {
        border: none;
        border-top: 1px solid var(--border-color);
        margin: 0;
    }

    /* Advanced Settings */
    .setting-group {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }

    label {
        font-weight: 500;
        color: var(--text-primary);
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.5rem;
    }

    .label-text {
        flex: 1;
    }

    .current-value {
        font-weight: 600;
        color: var(--primary-color);
        font-size: 0.9rem;
    }

    .checkbox-label {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        cursor: pointer;
    }

    .checkbox {
        width: 18px;
        height: 18px;
        cursor: pointer;
        accent-color: var(--primary-color);
    }

    .badge {
        display: inline-flex;
        padding: 0.25rem 0.75rem;
        border-radius: 0.5rem;
        font-size: 0.75rem;
        font-weight: 600;
        background: var(--bg-tertiary);
        color: var(--text-secondary);
        white-space: nowrap;
    }

    .badge.active {
        background: var(--primary-color, rgba(76, 175, 80, 0.2));
        color: var(--primary-color);
    }

    .slider-container {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }

    .slider {
        width: 100%;
        height: 6px;
        cursor: pointer;
    }

    .slider-labels {
        display: flex;
        justify-content: space-between;
        font-size: 0.75rem;
        color: var(--text-tertiary);
    }

    .help-text {
        font-size: 0.85rem;
        color: var(--text-secondary);
        margin: 0;
    }

    .warning {
        display: block;
        color: #ff9800;
        font-weight: 500;
        margin-top: 0.25rem;
    }

    /* Debug Info */
    .debug-info {
        padding: 1rem;
        background: var(--bg-tertiary);
        border-radius: 0.75rem;
        border: 1px solid var(--border-color);
    }

    .info-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
        gap: 1rem;
    }

    .info-item {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
    }

    .info-item .label {
        font-size: 0.8rem;
        color: var(--text-secondary);
        font-weight: 500;
        justify-content: flex-start;
    }

    .info-item .value {
        font-weight: 600;
        color: var(--primary-color);
        font-size: 0.95rem;
    }

    .label-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.5rem;
        font-weight: 500;
        color: var(--text-primary);
    }

    /* Timeframe Grid */
    .timeframe-grid {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
    }

    .timeframe-btn {
        padding: 0.5rem 1rem;
        border: 2px solid var(--border-color);
        border-radius: 0.5rem;
        background: var(--bg-secondary);
        color: var(--text-primary);
        font-weight: 600;
        font-size: 0.9rem;
        cursor: pointer;
        transition: all 0.2s;
    }

    .timeframe-btn:hover {
        border-color: var(--primary-color);
        background: var(--bg-hover);
    }

    .timeframe-btn.selected {
        border-color: var(--primary-color);
        background: var(--primary-color);
        color: white;
    }
</style>
