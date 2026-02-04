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

    // Background Animation Options
    const animPresets = [
        { value: "none", label: $_("settings.profile.background.typeNone") },
        { value: "gradient", label: "Gradient Flow" },
        { value: "particles", label: "Particles" },
        { value: "breathing", label: "Breathing" },
        { value: "waves", label: "Waves" },
        { value: "aurora", label: "Aurora" },
    ];

    // Layout Options
    const layoutModes = [
        { value: "standard", label: $_("settings.visuals.layoutModes.standard") },
        { value: "floating", label: $_("settings.visuals.layoutModes.floating") },
    ];

    const colorModeLabels: Record<string, string> = {
        theme: "settings.appearance.modeTheme",
        interactive: "settings.appearance.modeInteractive",
        custom: "settings.appearance.modeCustom",
        classic: "settings.appearance.modeClassic",
    };

    const activeSubTab = $derived(uiState.settingsVisualsSubTab);

    function toggleGyro() {
        const isEnabled = settingsState.galaxySettings.enableGyroscope;

        if (!isEnabled) {
            // Check for iOS permission requirement
            if (
                typeof DeviceOrientationEvent !== "undefined" &&
                typeof (DeviceOrientationEvent as any).requestPermission ===
                    "function"
            ) {
                (DeviceOrientationEvent as any)
                    .requestPermission()
                    .then((response: string) => {
                        if (response === "granted") {
                            settingsState.galaxySettings.enableGyroscope = true;
                        } else {
                            alert(
                                $_("settings.visuals.gyroPermissionDenied"),
                            );
                        }
                    })
                    .catch((err: any) => {
                        console.error(err);
                    });
            } else {
                // Non-iOS or older devices (Android)
                settingsState.galaxySettings.enableGyroscope = true;
            }
        } else {
            settingsState.galaxySettings.enableGyroscope = false;
        }
    }

    const subTabs = [
        {
            id: "appearance",
            label: $_("settings.visuals.subtabs.appearance"),
        },
        { id: "layout", label: $_("settings.visuals.subtabs.layout") },
        {
            id: "background",
            label: $_("settings.visuals.subtabs.background"),
        },
    ];
</script>

<div class="visuals-tab h-full flex flex-col" role="tabpanel" id="tab-visuals">
    <!-- Sub-Navigation -->
    <div
        class="flex flex-wrap gap-2 border-b border-[var(--border-color)] pb-2 mb-4 shrink-0"
    >
        {#each subTabs as tab}
            <button
                class="px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors {activeSubTab ===
                tab.id
                    ? 'bg-[var(--accent-color)] text-[var(--btn-accent-text)]'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]'}"
                onclick={() => (uiState.settingsVisualsSubTab = tab.id)}
            >
                {tab.label}
            </button>
        {/each}
    </div>

    <div class="flex-1 overflow-y-auto custom-scrollbar pr-2">
        <!-- Appearance Section -->
        {#if activeSubTab === "appearance"}
            <section class="settings-section animate-fade-in">
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <!-- Language -->
                    <div class="field-group">
                        <label for="lang-select"
                            >{$_("settings.language")}</label
                        >
                        <select
                            id="lang-select"
                            value={$locale}
                            onchange={(e) => setLocale(e.currentTarget.value)}
                            class="input-field"
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
                            class="input-field"
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
                        <div class="flex gap-2">
                            <div class="flex-1">
                                <label for="font-select"
                                    >{$_("settings.fontFamily")}</label
                                >
                                <select
                                    id="font-select"
                                    bind:value={settingsState.fontFamily}
                                    class="input-field"
                                >
                                    {#each fonts as font}
                                        <option value={font.value}
                                            >{font.label}</option
                                        >
                                    {/each}
                                </select>
                            </div>
                            <div class="w-1/3">
                                <label for="chat-font-size"
                                    >{$_("settings.visuals.chatSize")}</label
                                >
                                <div class="flex items-center gap-2">
                                    <input
                                        id="chat-font-size"
                                        type="number"
                                        bind:value={settingsState.chatFontSize}
                                        min="10"
                                        max="24"
                                        class="input-field"
                                    />
                                    <span
                                        class="text-xs text-[var(--text-secondary)]"
                                        >{$_("settings.visuals.coordinates.px")}</span
                                    >
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Glassmorphism -->
                    <label class="toggle-card self-end">
                        <div class="flex flex-col">
                            <span class="text-sm font-medium"
                                >{$_("settings.enableGlassmorphism")}</span
                            >
                        </div>
                        <Toggle
                            bind:checked={settingsState.enableGlassmorphism}
                        />
                    </label>
                </div>

                {#if settingsState.enableGlassmorphism}
                    <div
                        class="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4 p-4 bg-[var(--bg-secondary)] rounded-lg"
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

                <!-- Burning Borders -->
                <div class="mt-4 pt-4 border-t border-[var(--border-color)]">
                    <label class="toggle-card mb-2">
                        <div class="flex flex-col">
                            <span class="text-sm font-medium"
                                >{$_("settings.visuals.burningBorders")}</span
                            >
                            <span
                                class="text-[10px] text-[var(--text-secondary)]"
                                >{$_(
                                    "settings.visuals.burningBordersDesc",
                                )}</span
                            >
                        </div>
                        <Toggle
                            bind:checked={settingsState.enableBurningBorders}
                        />
                    </label>

                    {#if settingsState.enableBurningBorders}
                        <div class="flex flex-col gap-4 animate-fade-in">
                            <div class="field-group mb-4">
                                <span
                                    class="text-xs font-semibold text-[var(--text-secondary)] mb-2 block"
                                >
                                    {$_("settings.visuals.effectStyle")}
                                </span>
                                <div class="flex gap-2">
                                    <button
                                        class="px-3 py-1.5 text-xs capitalize rounded border transition-colors {settingsState.borderEffect ===
                                        'fire'
                                            ? 'bg-[var(--accent-color)] text-[var(--btn-accent-text)] border-[var(--accent-color)]'
                                            : 'bg-[var(--bg-secondary)] border-[var(--border-color)]'}"
                                        onclick={() =>
                                            (settingsState.borderEffect =
                                                "fire")}
                                    >
                                        {$_("settings.visuals.fire")}
                                    </button>
                                    <button
                                        class="px-3 py-1.5 text-xs capitalize rounded border transition-colors {settingsState.borderEffect ===
                                        'glow'
                                            ? 'bg-[var(--accent-color)] text-[var(--btn-accent-text)] border-[var(--accent-color)]'
                                            : 'bg-[var(--bg-secondary)] border-[var(--border-color)]'}"
                                        onclick={() =>
                                            (settingsState.borderEffect =
                                                "glow")}
                                    >
                                        {$_("settings.visuals.glow")}
                                    </button>
                                </div>
                            </div>

                            <div class="field-group mb-4">
                                <span
                                    class="text-xs font-semibold text-[var(--text-secondary)] mb-2 block"
                                >
                                    {$_("settings.visuals.colorMode")}
                                </span>
                                <div class="flex flex-wrap gap-2">
                                    {#each ["theme", "interactive", "custom", "classic"] as mode}
                                        <button
                                            class="px-3 py-1.5 text-xs capitalize rounded border transition-colors {settingsState.borderEffectColorMode ===
                                            mode
                                                ? 'bg-[var(--accent-color)] text-[var(--btn-accent-text)] border-[var(--accent-color)]'
                                                : 'bg-[var(--bg-secondary)] border-[var(--border-color)]'}"
                                            onclick={() =>
                                                (settingsState.borderEffectColorMode =
                                                    mode as any)}
                                        >
                                            {$_(
                                                colorModeLabels[
                                                    mode
                                                ] as TranslationKey,
                                            ) || mode}
                                        </button>
                                    {/each}
                                </div>
                            </div>

                            {#if settingsState.borderEffectColorMode === "custom"}
                                <div class="field-group mb-4 animate-fade-in">
                                    <span
                                        class="text-xs font-semibold text-[var(--text-secondary)] mb-2 block"
                                    >
                                        {$_("settings.visuals.customColor")}
                                    </span>
                                    <div class="flex items-center gap-3">
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
                                </div>
                            {/if}

                            <div class="field-group">
                                <span
                                    class="text-xs font-semibold text-[var(--text-secondary)] mb-2 block"
                                >
                                    {$_("settings.visuals.intensity")}</span
                                >
                                <div class="flex gap-2">
                                    {#each ["low", "medium", "high"] as intensity}
                                        <button
                                            class="px-3 py-1.5 text-xs capitalize rounded border transition-colors {settingsState.burningBordersIntensity ===
                                            intensity
                                                ? 'bg-[var(--accent-color)] text-[var(--btn-accent-text)] border-[var(--accent-color)]'
                                                : 'bg-[var(--bg-secondary)] border-[var(--border-color)]'}"
                                            onclick={() =>
                                                (settingsState.burningBordersIntensity =
                                                    intensity as any)}
                                        >
                                            {$_(
                                                `settings.profile.background.intensity${intensity.charAt(0).toUpperCase() + intensity.slice(1)}` as TranslationKey,
                                            ) || intensity}
                                        </button>
                                    {/each}
                                </div>
                            </div>

                            <div
                                class="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 mt-2"
                            >
                                <label
                                    class="flex items-center justify-between cursor-pointer group"
                                >
                                    <span
                                        class="text-xs text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] transition-colors"
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
                                    class="flex items-center justify-between cursor-pointer group"
                                >
                                    <span
                                        class="text-xs text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] transition-colors"
                                    >
                                        {$_(
                                            "settings.appearance.burnNews" as TranslationKey,
                                        )}
                                    </span>
                                    <Toggle
                                        bind:checked={
                                            settingsState.burnNewsWindows
                                        }
                                    />
                                </label>
                                <label
                                    class="flex items-center justify-between cursor-pointer group"
                                >
                                    <span
                                        class="text-xs text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] transition-colors"
                                    >
                                        {$_(
                                            "settings.appearance.burnChannels" as TranslationKey,
                                        )}
                                    </span>
                                    <Toggle
                                        bind:checked={
                                            settingsState.burnChannelWindows
                                        }
                                    />
                                </label>
                                <label
                                    class="flex items-center justify-between cursor-pointer group"
                                >
                                    <span
                                        class="text-xs text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] transition-colors"
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
                                    class="flex items-center justify-between cursor-pointer group"
                                >
                                    <span
                                        class="text-xs text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] transition-colors"
                                    >
                                        {$_(
                                            "settings.appearance.burnJournal" as TranslationKey,
                                        )}
                                    </span>
                                    <Toggle
                                        bind:checked={settingsState.burnJournal}
                                    />
                                </label>
                                <label
                                    class="flex items-center justify-between cursor-pointer group"
                                >
                                    <span
                                        class="text-xs text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] transition-colors"
                                    >
                                        {$_(
                                            "settings.appearance.burnSettings" as TranslationKey,
                                        )}
                                    </span>
                                    <Toggle
                                        bind:checked={
                                            settingsState.burnSettings
                                        }
                                    />
                                </label>
                                <label
                                    class="flex items-center justify-between cursor-pointer group"
                                >
                                    <span
                                        class="text-xs text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] transition-colors"
                                    >
                                        {$_(
                                            "settings.appearance.burnGuide" as TranslationKey,
                                        )}
                                    </span>
                                    <Toggle
                                        bind:checked={settingsState.burnGuide}
                                    />
                                </label>
                                <label
                                    class="flex items-center justify-between cursor-pointer group"
                                >
                                    <span
                                        class="text-xs text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] transition-colors"
                                    >
                                        {$_(
                                            "settings.appearance.burnModals" as TranslationKey,
                                        )}
                                    </span>
                                    <Toggle
                                        bind:checked={settingsState.burnModals}
                                    />
                                </label>
                            </div>
                        </div>
                    {/if}
                </div>
            </section>
        {/if}

        <!-- Layout Section -->
        {#if activeSubTab === "layout"}
            <section class="settings-section animate-fade-in">
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <label class="toggle-card">
                        <div class="flex flex-col">
                            <span class="text-sm font-medium"
                                >{$_("settings.showSidebars")}</span
                            >
                            <span
                                class="text-[10px] text-[var(--text-secondary)]"
                                >{$_("settings.sidePanelDesc")}</span
                            >
                        </div>
                        <Toggle bind:checked={settingsState.showSidebars} />
                    </label>

                    <label class="toggle-card">
                        <div class="flex flex-col">
                            <span class="text-sm font-medium"
                                >{$_("settings.enableSidePanel")}</span
                            >
                            <span
                                class="text-[10px] text-[var(--text-secondary)]"
                                >{$_("settings.workspace.aiAssistant")} / {$_(
                                    "settings.workspace.privateNotes",
                                )} / {$_("settings.workspace.marketChat")}</span
                            >
                        </div>
                        <Toggle
                            checked={uiState.showAssistant}
                            onchange={(e: any) =>
                                uiState.toggleAssistant(e.detail)}
                        />
                    </label>
                </div>
            </section>
        {/if}

        <!-- Background Section -->
        {#if activeSubTab === "background"}
            <section class="settings-section animate-fade-in">
                <!-- Type Selector -->
                <div class="flex gap-2 mb-4 flex-wrap">
                    {#each [{ v: "none", l: $_("settings.profile.background.typeNone") }, { v: "image", l: $_("settings.profile.background.typeMedia") }, { v: "animation", l: $_("settings.profile.background.typeAnimation") }, { v: "threejs", l: $_("settings.visuals.bgGalaxy") }] as type}
                        <button
                            class="px-3 py-2 text-xs rounded border transition-colors {settingsState.backgroundType ===
                                type.v ||
                            (type.v === 'image' &&
                                settingsState.backgroundType === 'video')
                                ? 'bg-[var(--accent-color)] text-[var(--btn-accent-text)] border-[var(--accent-color)]'
                                : 'bg-[var(--bg-secondary)] border-[var(--border-color)]'}"
                            onclick={() => {
                                if (type.v === "image")
                                    settingsState.backgroundType = "image";
                                else
                                    settingsState.backgroundType =
                                        type.v as any;
                            }}
                        >
                            {type.l}
                        </button>
                    {/each}
                </div>

                {#if settingsState.backgroundType === "image" || settingsState.backgroundType === "video"}
                    <div class="field-group mb-4">
                        <label for="bg-url"
                            >{$_("settings.profile.background.url")}</label
                        >
                        <input
                            id="bg-url"
                            type="text"
                            bind:value={settingsState.backgroundUrl}
                            oninput={(e) => {
                                const val = e.currentTarget.value;
                                if (val.endsWith(".mp4"))
                                    settingsState.backgroundType = "video";
                                else settingsState.backgroundType = "image";
                            }}
                            class="input-field"
                            placeholder={$_(
                                "settings.connections.placeholders.url",
                            )}
                        />
                        <p class="text-[10px] text-[var(--text-secondary)]">
                            {$_("settings.profile.background.urlHelper")}
                        </p>
                    </div>
                    {#if settingsState.backgroundType === "video"}
                        <div class="field-group mb-4">
                            <label for="vid-speed"
                                >{$_("settings.visuals.playbackSpeed")}: {settingsState.videoPlaybackSpeed}x</label
                            >
                            <input
                                id="vid-speed"
                                type="range"
                                bind:value={settingsState.videoPlaybackSpeed}
                                min="0.1"
                                max="2"
                                step="0.1"
                                class="w-full h-1 bg-[var(--border-color)] rounded-lg appearance-none cursor-pointer"
                            />
                        </div>
                    {/if}
                {/if}

                {#if settingsState.backgroundType === "animation"}
                    <div class="field-group mb-4">
                        <label for="anim-preset"
                            >{$_("settings.visuals.effect")}</label
                        >
                        <select
                            id="anim-preset"
                            bind:value={settingsState.backgroundAnimationPreset}
                            class="input-field"
                        >
                            {#each animPresets as p}
                                <option value={p.value}>{p.label}</option>
                            {/each}
                        </select>
                    </div>
                {/if}

                {#if settingsState.backgroundType === "threejs"}
                    <div
                        class="p-4 bg-[var(--bg-secondary)] rounded-lg mb-4 space-y-4"
                    >
                        <div class="flex justify-between items-center mb-2">
                            <h4
                                class="text-sm font-medium text-[var(--text-secondary)] uppercase tracking-wider"
                            >
                                {$_("settings.visuals.bgGalaxy")}
                            </h4>
                            <button
                                class="px-3 py-1 text-xs bg-[var(--bg-tertiary)] hover:bg-[var(--accent-color)] hover:text-white rounded transition-colors flex items-center gap-2"
                                onclick={() =>
                                    settingsState.resetGalaxySettings()}
                            >
                                <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    width="12"
                                    height="12"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    stroke-width="2"
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    ><path
                                        d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"
                                    ></path><path d="M3 3v5h5"></path></svg
                                >
                                {$_("dashboard.resetButton")}
                            </button>
                        </div>

                        <div class="grid grid-cols-2 gap-4">
                            <div class="field-group">
                                <label for="galaxy-count"
                                    >{$_("settings.visuals.particles")}: {settingsState
                                        .galaxySettings.particleCount}</label
                                >
                                <input
                                    id="galaxy-count"
                                    type="range"
                                    bind:value={
                                        settingsState.galaxySettings
                                            .particleCount
                                    }
                                    min="10"
                                    max="50000"
                                    step="10"
                                    class="range-input"
                                />
                            </div>
                            <div class="field-group">
                                <label for="galaxy-size"
                                    >{$_("settings.visuals.size")}: {settingsState.galaxySettings.particleSize.toFixed(
                                        2,
                                    )}</label
                                >
                                <input
                                    id="galaxy-size"
                                    type="range"
                                    bind:value={
                                        settingsState.galaxySettings
                                            .particleSize
                                    }
                                    min="0.01"
                                    max="2.0"
                                    step="0.01"
                                    class="range-input"
                                />
                            </div>
                        </div>

                        <div class="grid grid-cols-2 gap-4">
                            <div class="field-group">
                                <label for="galaxy-radius"
                                    >{$_("settings.visuals.radius")}: {settingsState.galaxySettings.radius.toFixed(
                                        1,
                                    )}</label
                                >
                                <input
                                    id="galaxy-radius"
                                    type="range"
                                    bind:value={
                                        settingsState.galaxySettings.radius
                                    }
                                    min="0.1"
                                    max="20"
                                    step="0.1"
                                    class="range-input"
                                />
                            </div>
                            <div class="field-group">
                                <label for="galaxy-branches"
                                    >{$_("settings.visuals.branches")}: {settingsState
                                        .galaxySettings.branches}</label
                                >
                                <input
                                    id="galaxy-branches"
                                    type="range"
                                    bind:value={
                                        settingsState.galaxySettings.branches
                                    }
                                    min="2"
                                    max="10"
                                    step="1"
                                    class="range-input"
                                />
                            </div>
                        </div>

                        <div class="grid grid-cols-2 gap-4">
                            <div class="field-group">
                                <label for="galaxy-spin"
                                    >{$_("settings.visuals.spinSpeed")}: {settingsState.galaxySettings.spin.toFixed(
                                        2,
                                    )}</label
                                >
                                <input
                                    id="galaxy-spin"
                                    type="range"
                                    bind:value={
                                        settingsState.galaxySettings.spin
                                    }
                                    min="0"
                                    max="5"
                                    step="0.01"
                                    class="range-input"
                                />
                            </div>
                            <div class="field-group">
                                <label for="galaxy-randomness"
                                    >{$_("settings.visuals.randomness")}: {settingsState.galaxySettings.randomness.toFixed(
                                        2,
                                    )}</label
                                >
                                <input
                                    id="galaxy-randomness"
                                    type="range"
                                    bind:value={
                                        settingsState.galaxySettings.randomness
                                    }
                                    min="0"
                                    max="2"
                                    step="0.01"
                                    class="range-input"
                                />
                            </div>
                        </div>

                        <div class="grid grid-cols-2 gap-4">
                            <div class="field-group">
                                <label for="galaxy-randomness-power"
                                    >{$_("settings.visuals.spread")}: {settingsState.galaxySettings.randomnessPower.toFixed(
                                        2,
                                    )}</label
                                >
                                <input
                                    id="galaxy-randomness-power"
                                    type="range"
                                    bind:value={
                                        settingsState.galaxySettings
                                            .randomnessPower
                                    }
                                    min="1"
                                    max="10"
                                    step="0.01"
                                    class="range-input"
                                />
                            </div>
                            <div class="field-group">
                                <label for="galaxy-concentration"
                                    >{$_("settings.visuals.concentration")}: {settingsState.galaxySettings.concentrationPower.toFixed(
                                        1,
                                    )}</label
                                >
                                <input
                                    id="galaxy-concentration"
                                    type="range"
                                    bind:value={
                                        settingsState.galaxySettings
                                            .concentrationPower
                                    }
                                    min="0.1"
                                    max="10"
                                    step="0.1"
                                    class="range-input"
                                />
                            </div>
                        </div>

                        <div class="grid grid-cols-2 gap-4">
                            <div class="field-group">
                                <label for="galaxy-rotation-speed"
                                    >{$_("settings.visuals.rotationSpeed")}: {settingsState.galaxySettings.rotationSpeed.toFixed(
                                        2,
                                    )}</label
                                >
                                <input
                                    id="galaxy-rotation-speed"
                                    type="range"
                                    bind:value={
                                        settingsState.galaxySettings
                                            .rotationSpeed
                                    }
                                    min="0"
                                    max="2"
                                    step="0.01"
                                    class="range-input"
                                />
                            </div>
                        </div>

                        <!-- Camera & Rotation -->
                        <div
                            class="grid grid-cols-1 gap-4 border-t border-[var(--border-color)] pt-4 mt-2"
                        >
                            <span
                                class="text-xs font-semibold text-[var(--text-secondary)]"
                                >{$_("settings.visuals.cameraPos")}</span
                            >
                            <div class="grid grid-cols-3 gap-2">
                                <div class="field-group">
                                    <label for="cam-x"
                                        >{$_("settings.visuals.coordinates.x")}: {settingsState.galaxySettings.camPos.x.toFixed(
                                            1,
                                        )}</label
                                    >
                                    <input
                                        id="cam-x"
                                        type="range"
                                        min="-15"
                                        max="15"
                                        step="0.1"
                                        bind:value={
                                            settingsState.galaxySettings.camPos
                                                .x
                                        }
                                        class="range-input"
                                    />
                                </div>
                                <div class="field-group">
                                    <label for="cam-y"
                                        >{$_("settings.visuals.coordinates.y")}: {settingsState.galaxySettings.camPos.y.toFixed(
                                            1,
                                        )}</label
                                    >
                                    <input
                                        id="cam-y"
                                        type="range"
                                        min="-15"
                                        max="15"
                                        step="0.1"
                                        bind:value={
                                            settingsState.galaxySettings.camPos
                                                .y
                                        }
                                        class="range-input"
                                    />
                                </div>
                                <div class="field-group">
                                    <label for="cam-z"
                                        >{$_("settings.visuals.coordinates.z")}: {settingsState.galaxySettings.camPos.z.toFixed(
                                            1,
                                        )}</label
                                    >
                                    <input
                                        id="cam-z"
                                        type="range"
                                        min="-15"
                                        max="15"
                                        step="0.1"
                                        bind:value={
                                            settingsState.galaxySettings.camPos
                                                .z
                                        }
                                        class="range-input"
                                    />
                                </div>
                            </div>

                            <span
                                class="text-xs font-semibold text-[var(--text-secondary)]"
                                >{$_("settings.visuals.rotation")}</span
                            >
                            <div class="grid grid-cols-3 gap-2">
                                <div class="field-group">
                                    <label for="rot-x"
                                        >{$_("settings.visuals.coordinates.x")}: {settingsState.galaxySettings.galaxyRot.x.toFixed(
                                            1,
                                        )}{$_("settings.visuals.coordinates.deg")}</label
                                    >
                                    <input
                                        id="rot-x"
                                        type="range"
                                        min="0"
                                        max="360"
                                        step="0.1"
                                        bind:value={
                                            settingsState.galaxySettings
                                                .galaxyRot.x
                                        }
                                        class="range-input"
                                    />
                                </div>
                                <div class="field-group">
                                    <label for="rot-y"
                                        >{$_("settings.visuals.coordinates.y")}: {settingsState.galaxySettings.galaxyRot.y.toFixed(
                                            1,
                                        )}{$_("settings.visuals.coordinates.deg")}</label
                                    >
                                    <input
                                        id="rot-y"
                                        type="range"
                                        min="0"
                                        max="360"
                                        step="0.1"
                                        bind:value={
                                            settingsState.galaxySettings
                                                .galaxyRot.y
                                        }
                                        class="range-input"
                                    />
                                </div>
                                <div class="field-group">
                                    <label for="rot-z"
                                        >{$_("settings.visuals.coordinates.z")}: {settingsState.galaxySettings.galaxyRot.z.toFixed(
                                            1,
                                        )}{$_("settings.visuals.coordinates.deg")}</label
                                    >
                                    <input
                                        id="rot-z"
                                        type="range"
                                        min="0"
                                        max="360"
                                        step="0.1"
                                        bind:value={
                                            settingsState.galaxySettings
                                                .galaxyRot.z
                                        }
                                        class="range-input"
                                    />
                                </div>
                            </div>
                        </div>

                        <!-- Gyroscope Control -->
                        <div
                            class="flex justify-between items-center p-3 bg-[var(--bg-tertiary)] rounded-lg border border-[var(--border-color)] mt-4"
                        >
                            <div class="flex flex-col">
                                <span class="text-sm font-medium"
                                    >{$_("settings.visuals.gyroscope")}</span
                                >
                                <span
                                    class="text-[10px] text-[var(--text-secondary)]"
                                    >{$_(
                                        "settings.visuals.gyroscopeDesc",
                                    )}</span
                                >
                            </div>
                            <button
                                class="w-12 h-6 rounded-full relative transition-colors {settingsState
                                    .galaxySettings.enableGyroscope
                                    ? 'bg-[var(--accent-color)]'
                                    : 'bg-[var(--border-color)]'}"
                                onclick={toggleGyro}
                                aria-label={$_("settings.visuals.gyroscope")}
                            >
                                <span
                                    class="absolute top-1 left-1 bg-white w-4 h-4 rounded-full transition-transform {settingsState
                                        .galaxySettings.enableGyroscope
                                        ? 'translate-x-6'
                                        : 'translate-x-0'}"
                                ></span>
                            </button>
                        </div>
                    </div>
                {/if}

                {#if settingsState.backgroundType !== "none"}
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div class="field-group">
                            <label for="bg-opacity"
                                >{$_("settings.profile.background.opacity")}: {Math.round(
                                    settingsState.backgroundOpacity * 100,
                                )}%</label
                            >
                            <input
                                id="bg-opacity"
                                type="range"
                                bind:value={settingsState.backgroundOpacity}
                                min="0"
                                max="1"
                                step="0.05"
                                class="w-full h-1 bg-[var(--border-color)] rounded-lg appearance-none cursor-pointer"
                            />
                        </div>
                        <div class="field-group">
                            <label for="bg-blur"
                                >{$_("settings.profile.background.blur")}: {settingsState.backgroundBlur}px</label
                            >
                            <input
                                id="bg-blur"
                                type="range"
                                bind:value={settingsState.backgroundBlur}
                                min="0"
                                max="50"
                                step="1"
                                class="w-full h-1 bg-[var(--border-color)] rounded-lg appearance-none cursor-pointer"
                            />
                        </div>
                    </div>
                {/if}
            </section>
        {/if}
    </div>
</div>

<style>
    /* Removed old section titles and icon-box as they are less needed in sub-tabs or should be minimal */
    .field-group {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }
    .field-group label {
        font-size: 0.75rem;
        font-weight: 600;
        color: var(--text-secondary);
    }
    .input-field {
        background-color: var(--bg-secondary);
        border: 1px solid var(--border-color);
        border-radius: 0.5rem;
        padding: 0.5rem 0.75rem;
        font-size: 0.875rem;
        color: var(--text-primary);
        outline: none;
    }
    .range-input {
        width: 100%;
        height: 0.25rem;
        background: var(--border-color);
        border-radius: 0.5rem;
        appearance: none;
        cursor: pointer;
    }
    .range-input::-webkit-slider-thumb {
        appearance: none;
        width: 1rem;
        height: 1rem;
        background: var(--accent-color);
        border-radius: 50%;
        cursor: pointer;
    }
    .toggle-card {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 1rem;
        background: var(--bg-secondary);
        border: 1px solid var(--border-color);
        border-radius: 0.75rem;
        cursor: pointer;
    }
</style>
