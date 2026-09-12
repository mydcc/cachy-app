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
    import { _ } from "../../../locales/i18n";
    import type { TranslationKey } from "../../../locales/schema";
    import { settingsState } from "../../../stores/settings.svelte";
    import { uiState } from "../../../stores/ui.svelte";
    import { locale, setLocale } from "../../../locales/i18n";
    import Toggle from "../../shared/Toggle.svelte";
    import Tooltip from "../../shared/Tooltip.svelte";

    let { themes } = $props<{
        themes: Array<{ value: string; label: string }>;
    }>();

    // Font Options
    const fonts = [
        { value: "Inter", label: "Inter" },
        { value: "IBM Plex Sans", label: "IBM Plex Sans" },
        { value: "JetBrains Mono", label: "JetBrains Mono" },
        { value: "Roboto Mono", label: "Roboto Mono" },
        { value: "Source Sans 3", label: "Source Sans 3" },
        { value: "Manrope", label: "Manrope" },
        { value: "Nunito Sans", label: "Nunito Sans" },
        { value: "Red Hat Display", label: "Red Hat Display" },
        { value: "Schibsted Grotesk", label: "Schibsted Grotesk" },
        { value: "Space Grotesk", label: "Space Grotesk" },
    ];

    // Static label map, duplicated in VisualsBackground (which uses the
    // "theme"/"custom" subset). Svelte script scope does not cross component
    // boundaries, so sharing would mean prop-drilling a constant.
    const colorModeLabels: Record<string, string> = {
        theme: "settings.appearance.modeTheme",
        interactive: "settings.appearance.modeInteractive",
        custom: "settings.appearance.modeCustom",
        classic: "settings.appearance.modeClassic",
    };
</script>

<section class="settings-section animate-fade-in">
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <!-- Language -->
        <div class="field-group">
            <label for="lang-select"
                >{$_("settings.language")}</label
            >
            <select
                id="lang-select"
                value={$locale}
                onchange={(e) => setLocale(e.currentTarget.value)}
                class="input-field w-full"
            >
                <option value="en">{$_("languages.en")}</option>
                <option value="de">{$_("languages.de")}</option>
            </select>
        </div>

        <!-- Theme -->
        <div class="field-group">
            <label for="theme-select">{$_("settings.theme")}</label>
            <select
                id="theme-select"
                value={uiState.currentTheme}
                onchange={(e) =>
                    uiState.setTheme(e.currentTarget.value)}
                class="input-field w-full"
            >
                {#each themes as theme}
                    <option value={theme.value}
                        >{theme.label}</option
                    >
                {/each}
            </select>
        </div>

        <!-- Font -->
        <div class="field-group">
            <label for="font-select"
                >{$_("settings.fontFamily")}</label
            >
            <select
                id="font-select"
                bind:value={settingsState.fontFamily}
                class="input-field w-full"
            >
                {#each fonts as font}
                    <option value={font.value}
                        >{font.label}</option
                    >
                {/each}
            </select>
        </div>
    </div>

    <!-- Tooltips -->
    <div class="mt-4 pt-4 border-t border-[var(--border-color)]">
        <label class="toggle-card">
            <div class="flex flex-col">
                <span class="text-sm font-medium">
                    {$_("settings.showTooltips")}
                </span>
                <span class="text-xs text-[var(--text-secondary)]">
                    {$_("settings.showTooltipsDesc")}
                </span>
            </div>
            <Toggle bind:checked={settingsState.showTooltips} />
        </label>
    </div>

    <!-- Glassmorphism -->
    <div class="mt-4 pt-4 border-t border-[var(--border-color)]">
        <div class="toggle-card flex-col items-start gap-4">
            <div class="flex justify-between items-center w-full">
                <div class="flex flex-col">
                    <span class="text-sm font-medium">
                        {$_("settings.enableGlassmorphism")}
                    </span>
                    <span class="text-xs text-[var(--text-secondary)]">
                        {$_("settings.glassmorphismDesc")}
                    </span>
                </div>
                <Toggle
                    bind:checked={settingsState.enableGlassmorphism}
                />
            </div>

            {#if settingsState.enableGlassmorphism}
                <div
                    class="w-full grid grid-cols-1 md:grid-cols-3 gap-4 pt-3 border-t border-[var(--border-color)] animate-fade-in"
                >
                    <div class="field-group">
                        <label
                            for="glass-blur"
                            class="text-[10px] uppercase font-bold text-[var(--text-secondary)]"
                        >
                            {$_("settings.profile.glass.blur")}: {settingsState.glassBlur}px
                        </label>
                        <input
                            id="glass-blur"
                            type="range"
                            bind:value={settingsState.glassBlur}
                            min="0"
                            max="120"
                            class="w-full h-1 bg-[var(--border-color)] rounded-lg appearance-none cursor-pointer"
                        />
                    </div>
                    <div class="field-group">
                        <label
                            for="glass-opacity"
                            class="text-[10px] uppercase font-bold text-[var(--text-secondary)]"
                        >
                            {$_("settings.profile.glass.opacity")}: {Math.round(
                                settingsState.glassOpacity * 100,
                            )}%
                        </label>
                        <input
                            id="glass-opacity"
                            type="range"
                            bind:value={settingsState.glassOpacity}
                            min="0"
                            max="1"
                            step="0.05"
                            class="w-full h-1 bg-[var(--border-color)] rounded-lg appearance-none cursor-pointer"
                        />
                    </div>
                    <div class="field-group">
                        <label
                            for="glass-saturate"
                            class="text-[10px] uppercase font-bold text-[var(--text-secondary)]"
                        >
                            {$_("settings.profile.glass.saturate")}: {settingsState.glassSaturate}%
                        </label>
                        <input
                            id="glass-saturate"
                            type="range"
                            bind:value={settingsState.glassSaturate}
                            min="50"
                            max="300"
                            step="10"
                            class="w-full h-1 bg-[var(--border-color)] rounded-lg appearance-none cursor-pointer"
                        />
                    </div>
                </div>
            {/if}
        </div>
    </div>

    <!-- Burning Borders -->
    <div class="mt-4 pt-4 border-t border-[var(--border-color)]">
        <div class="toggle-card flex-col items-start gap-4">
            <div class="flex justify-between items-center w-full">
                <div class="flex flex-col">
                    <span class="text-sm font-medium">
                        {$_("settings.visuals.burningBorders")}
                    </span>
                    <span class="text-xs text-[var(--text-secondary)]">
                        {$_(
                            "settings.visuals.burningBordersDesc",
                        )}
                    </span>
                </div>
                <Toggle
                    bind:checked={settingsState.enableBurningBorders}
                />
            </div>

            {#if settingsState.enableBurningBorders}
                <div class="w-full flex flex-col gap-3.5 pt-3 border-t border-[var(--border-color)] animate-fade-in">
                    <!-- Style & Intensity in 2 Columns -->
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div class="field-group">
                            <span
                                class="text-xs font-semibold text-[var(--text-secondary)] mb-1 block"
                            >
                                {$_("settings.visuals.effectStyle")}
                            </span>
                            <div class="grid grid-cols-2 gap-2">
                                <button
                                    type="button"
                                    class="h-8 px-3 text-xs capitalize rounded border transition-colors flex items-center justify-center {settingsState.borderEffect ===
                                    'fire'
                                        ? 'bg-[var(--accent-color)] text-[var(--btn-accent-text)] border-[var(--accent-color)] font-semibold'
                                        : 'bg-[var(--bg-tertiary)] border-[var(--border-color)] text-[var(--text-secondary)] hover:border-[var(--text-secondary)]'}"
                                    onclick={() =>
                                        (settingsState.borderEffect =
                                            "fire")}
                                >
                                    {$_("settings.visuals.fire")}
                                </button>
                                <button
                                    type="button"
                                    class="h-8 px-3 text-xs capitalize rounded border transition-colors flex items-center justify-center {settingsState.borderEffect ===
                                    'glow'
                                        ? 'bg-[var(--accent-color)] text-[var(--btn-accent-text)] border-[var(--accent-color)] font-semibold'
                                        : 'bg-[var(--bg-tertiary)] border-[var(--border-color)] text-[var(--text-secondary)] hover:border-[var(--text-secondary)]'}"
                                    onclick={() =>
                                        (settingsState.borderEffect =
                                            "glow")}
                                >
                                    {$_("settings.visuals.glow")}
                                </button>
                            </div>
                        </div>

                        <div class="field-group">
                            <span
                                class="text-xs font-semibold text-[var(--text-secondary)] mb-1 block"
                            >
                                {$_("settings.visuals.intensity")}
                            </span>
                            <div class="grid grid-cols-3 gap-2">
                                {#each ["low", "medium", "high"] as const as intensity}
                                    <button
                                        type="button"
                                        class="h-8 px-2 text-xs capitalize rounded border transition-colors flex items-center justify-center {settingsState.burningBordersIntensity ===
                                        intensity
                                            ? 'bg-[var(--accent-color)] text-[var(--btn-accent-text)] border-[var(--accent-color)] font-semibold'
                                            : 'bg-[var(--bg-tertiary)] border-[var(--border-color)] text-[var(--text-secondary)] hover:border-[var(--text-secondary)]'}"
                                        onclick={() =>
                                            (settingsState.burningBordersIntensity =
                                                intensity)}
                                    >
                                        {$_(
                                            `settings.profile.background.intensity${intensity.charAt(0).toUpperCase() + intensity.slice(1)}` as TranslationKey,
                                        ) || intensity}
                                    </button>
                                {/each}
                            </div>
                        </div>
                    </div>

                    <!-- Color Mode -->
                    <div class="field-group">
                        <span
                            class="text-xs font-semibold text-[var(--text-secondary)] mb-1 block"
                        >
                            {$_("settings.visuals.colorMode")}
                        </span>
                        <div class="flex flex-wrap items-center gap-2">
                            <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 flex-1">
                                {#each ["theme", "interactive", "custom", "classic"] as const as mode}
                                    <button
                                        type="button"
                                        class="h-8 px-2 text-xs capitalize rounded border transition-colors flex items-center justify-center {settingsState.borderEffectColorMode ===
                                        mode
                                            ? 'bg-[var(--accent-color)] text-[var(--btn-accent-text)] border-[var(--accent-color)] font-semibold'
                                            : 'bg-[var(--bg-tertiary)] border-[var(--border-color)] text-[var(--text-secondary)] hover:border-[var(--text-secondary)]'}"
                                        onclick={() =>
                                            (settingsState.borderEffectColorMode =
                                                mode)}
                                    >
                                        {$_(
                                            colorModeLabels[
                                                mode
                                            ] as TranslationKey,
                                        ) || mode}
                                    </button>
                                {/each}
                            </div>

                            {#if settingsState.borderEffectColorMode === "custom"}
                                <div class="flex items-center gap-2 pl-2 border-l border-[var(--border-color)] animate-fade-in">
                                    <input
                                        type="color"
                                        class="w-8 h-8 rounded border border-[var(--border-color)] bg-transparent cursor-pointer"
                                        bind:value={
                                            settingsState.borderEffectCustomColor
                                        }
                                    />
                                    <span
                                        class="text-xs font-mono text-[var(--text-secondary)]"
                                    >
                                        {settingsState.borderEffectCustomColor}
                                    </span>
                                </div>
                            {/if}
                        </div>
                    </div>

                    <!-- Targets Grid in 3 Columns -->
                    <div class="field-group">
                        <span
                            class="text-xs font-semibold text-[var(--text-secondary)] mb-1 block"
                        >
                            {$_("settings.appearance.burnTargets" as TranslationKey)}
                        </span>
                        <div
                            class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 p-2.5 rounded-lg bg-[var(--bg-primary)]/40 border border-[var(--border-color)]/60"
                        >
                            <label
                                class="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded hover:bg-[var(--bg-tertiary)]/50 cursor-pointer group transition-colors"
                            >
                                <span
                                    class="text-xs text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] transition-colors truncate"
                                >
                                    {$_(
                                        "settings.appearance.burnMarketOverview" as TranslationKey,
                                    )}
                                </span>
                                <Toggle
                                    bind:checked={
                                        settingsState.burnMarketOverviewTiles
                                    }
                                />
                            </label>
                            <label
                                class="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded hover:bg-[var(--bg-tertiary)]/50 cursor-pointer group transition-colors"
                            >
                                <span
                                    class="text-xs text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] transition-colors truncate"
                                >
                                    {$_(
                                        "settings.appearance.burnFlashCards" as TranslationKey,
                                    )}
                                </span>
                                <Toggle
                                    bind:checked={
                                        settingsState.burnFlashCards
                                    }
                                />
                            </label>
                            <label
                                class="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded hover:bg-[var(--bg-tertiary)]/50 cursor-pointer group transition-colors"
                            >
                                <span
                                    class="text-xs text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] transition-colors truncate"
                                >
                                    {$_(
                                        "settings.appearance.burnCharts" as TranslationKey,
                                    )}
                                </span>
                                <Toggle
                                    bind:checked={
                                        settingsState.burnCharts
                                    }
                                />
                            </label>
                            <label
                                class="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded hover:bg-[var(--bg-tertiary)]/50 cursor-pointer group transition-colors"
                            >
                                <span
                                    class="text-xs text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] transition-colors truncate"
                                >
                                    {$_(
                                        "settings.appearance.burnModals" as TranslationKey,
                                    )}
                                </span>
                                <Toggle
                                    bind:checked={settingsState.burnModals}
                                />
                            </label>
                            <label
                                class="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded hover:bg-[var(--bg-tertiary)]/50 cursor-pointer group transition-colors"
                            >
                                <span
                                    class="text-xs text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] transition-colors truncate"
                                >
                                    {$_(
                                        "settings.appearance.burnChannels" as TranslationKey,
                                    )}
                                </span>
                                <Toggle
                                    bind:checked={
                                        settingsState.burnChannels
                                    }
                                />
                            </label>
                            <label
                                class="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded hover:bg-[var(--bg-tertiary)]/50 cursor-pointer group transition-colors"
                            >
                                <span
                                    class="text-xs text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] transition-colors truncate"
                                >
                                    {$_(
                                        "settings.appearance.burnJournal" as TranslationKey,
                                    )}
                                </span>
                                <Toggle
                                    bind:checked={settingsState.burnJournal}
                                />
                            </label>
                        </div>
                    </div>
                </div>
            {/if}
        </div>
    </div>

    <!-- Sentiment Topline (Three.js WebGL) -->
    <div class="mt-4 pt-4 border-t border-[var(--border-color)]">
        <div class="toggle-card flex-col items-start gap-4">
            <div class="flex justify-between items-center w-full">
                <div class="flex flex-col">
                    <span class="text-sm font-medium">
                        {$_(
                            "settings.appearance.ambientTopline" as TranslationKey,
                        )}
                    </span>
                    <span class="text-xs text-[var(--text-secondary)]">
                        {$_(
                            "settings.appearance.ambientToplineDesc" as TranslationKey,
                        )}
                    </span>
                </div>
                <Toggle
                    bind:checked={settingsState.enableAmbientTopline}
                />
            </div>

            {#if settingsState.enableAmbientTopline}
                <div
                    class="w-full flex flex-col gap-3.5 pt-3 border-t border-[var(--border-color)] animate-fade-in"
                >
                    <!-- Data Mode Selector -->
                    <div class="field-group">
                        <span
                            class="text-xs font-semibold text-[var(--text-secondary)] mb-1 block"
                        >
                            {$_(
                                "settings.appearance.ambientToplineMode" as TranslationKey,
                            )}
                        </span>
                        <div class="grid grid-cols-3 gap-2">
                            <Tooltip
                                text={$_(
                                    "settings.appearance.ambientToplineModeSymbolTooltip" as TranslationKey,
                                )}
                                underline={false}
                            >
                                <button
                                    type="button"
                                    class="w-full h-8 px-2 text-xs rounded border transition-colors flex items-center justify-center {settingsState.ambientToplineMode ===
                                    'symbol_orderflow'
                                        ? 'bg-[var(--accent-color)] text-[var(--btn-accent-text)] border-[var(--accent-color)] font-semibold'
                                        : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] border-[var(--border-color)] hover:border-[var(--text-secondary)]'}"
                                    onclick={() =>
                                        (settingsState.ambientToplineMode =
                                            'symbol_orderflow')}
                                >
                                    {$_(
                                        "settings.appearance.ambientToplineModeSymbol" as TranslationKey,
                                    )}
                                </button>
                            </Tooltip>
                            <Tooltip
                                text={$_(
                                    "settings.appearance.ambientToplineModeMarketTooltip" as TranslationKey,
                                )}
                                underline={false}
                            >
                                <button
                                    type="button"
                                    class="w-full h-8 px-2 text-xs rounded border transition-colors flex items-center justify-center {settingsState.ambientToplineMode ===
                                    'market_momentum'
                                        ? 'bg-[var(--accent-color)] text-[var(--btn-accent-text)] border-[var(--accent-color)] font-semibold'
                                        : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] border-[var(--border-color)] hover:border-[var(--text-secondary)]'}"
                                    onclick={() =>
                                        (settingsState.ambientToplineMode =
                                            'market_momentum')}
                                    >
                                    {$_(
                                        "settings.appearance.ambientToplineModeMarket" as TranslationKey,
                                    )}
                                </button>
                            </Tooltip>
                            <Tooltip
                                text={$_(
                                    "settings.appearance.ambientToplineModeRiskTooltip" as TranslationKey,
                                )}
                                underline={false}
                            >
                                <button
                                    type="button"
                                    class="w-full h-8 px-2 text-xs rounded border transition-colors flex items-center justify-center {settingsState.ambientToplineMode ===
                                    'risk_health'
                                        ? 'bg-[var(--accent-color)] text-[var(--btn-accent-text)] border-[var(--accent-color)] font-semibold'
                                        : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] border-[var(--border-color)] hover:border-[var(--text-secondary)]'}"
                                    onclick={() =>
                                        (settingsState.ambientToplineMode =
                                            'risk_health')}
                                    >
                                    {$_(
                                        "settings.appearance.ambientToplineModeRisk" as TranslationKey,
                                    )}
                                </button>
                            </Tooltip>
                        </div>
                    </div>

                    <!-- Intensity Selector -->
                    <div class="field-group">
                        <span
                            class="text-xs font-semibold text-[var(--text-secondary)] mb-1 block"
                        >
                            {$_(
                                "settings.appearance.ambientToplineIntensity" as TranslationKey,
                            )}
                        </span>
                        <div class="grid grid-cols-3 gap-2">
                            <button
                                type="button"
                                class="h-8 px-2 text-xs rounded border transition-colors flex items-center justify-center {settingsState.ambientToplineIntensity ===
                                'subtle'
                                    ? 'bg-[var(--accent-color)] text-[var(--btn-accent-text)] border-[var(--accent-color)] font-semibold'
                                    : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] border-[var(--border-color)] hover:border-[var(--text-secondary)]'}"
                                onclick={() =>
                                    (settingsState.ambientToplineIntensity =
                                        'subtle')}
                            >
                                {$_(
                                    "settings.appearance.ambientToplineIntensitySubtle" as TranslationKey,
                                )}
                            </button>
                            <button
                                type="button"
                                class="h-8 px-2 text-xs rounded border transition-colors flex items-center justify-center {settingsState.ambientToplineIntensity ===
                                'standard'
                                    ? 'bg-[var(--accent-color)] text-[var(--btn-accent-text)] border-[var(--accent-color)] font-semibold'
                                    : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] border-[var(--border-color)] hover:border-[var(--text-secondary)]'}"
                                onclick={() =>
                                    (settingsState.ambientToplineIntensity =
                                        'standard')}
                            >
                                {$_(
                                    "settings.appearance.ambientToplineIntensityStandard" as TranslationKey,
                                )}
                            </button>
                            <button
                                type="button"
                                class="h-8 px-2 text-xs rounded border transition-colors flex items-center justify-center {settingsState.ambientToplineIntensity ===
                                'vibrant'
                                    ? 'bg-[var(--accent-color)] text-[var(--btn-accent-text)] border-[var(--accent-color)] font-semibold'
                                    : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] border-[var(--border-color)] hover:border-[var(--text-secondary)]'}"
                                onclick={() =>
                                    (settingsState.ambientToplineIntensity =
                                        'vibrant')}
                            >
                                {$_(
                                    "settings.appearance.ambientToplineIntensityVibrant" as TranslationKey,
                                )}
                            </button>
                        </div>
                    </div>

                    <!-- Trade Bursts Toggle -->
                    <div
                        class="flex justify-between items-center pt-2 border-t border-[var(--border-color)]/60"
                    >
                        <div class="flex flex-col">
                            <span class="text-xs font-medium">
                                {$_(
                                    "settings.appearance.ambientToplineBursts" as TranslationKey,
                                )}
                            </span>
                            <span
                                class="text-[11px] text-[var(--text-secondary)]"
                            >
                                {$_(
                                    "settings.appearance.ambientToplineBurstsDesc" as TranslationKey,
                                )}
                            </span>
                        </div>
                        <Toggle
                            bind:checked={settingsState.ambientToplineBursts}
                        />
                    </div>
                </div>
            {/if}
        </div>
    </div>
</section>

<style>
    .field-group {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }
    .field-group label {
        font-size: var(--text-xs);
        font-weight: var(--font-semibold);
        color: var(--text-secondary);
        display: flex;
        align-items: center;
        gap: 0.5rem;
    }
    .input-field {
        background-color: var(--bg-secondary);
        /* border is supplied by the global .input-field rule (--input-border-color) */
        border-radius: var(--radius-lg);
        padding: var(--space-2) var(--space-3);
        font-size: var(--text-sm);
        color: var(--text-primary);
        outline: none;
    }
    .toggle-card {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: var(--space-4);
        background: var(--bg-secondary);
        border: 1px solid var(--border-color);
        border-radius: var(--radius-xl);
        cursor: pointer;
    }
</style>
