<!--
  Copyright (C) 2026 MYDCT
-->

<script lang="ts">
    import { _ } from "../../../locales/i18n";
    import { settingsState } from "../../../stores/settings.svelte";
    import { uiState } from "../../../stores/ui.svelte";
    import { locale, setLocale } from "../../../locales/i18n";
    import HotkeySettings from "../HotkeySettings.svelte";

    interface Props {
        themes: Array<{ value: string; label: string }>;
    }

    let { themes }: Props = $props();

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

    // Hotkey Descriptions for Preset Modes
    const MODE1_DESCRIPTIONS: Record<string, string> = {
        "1": "Favorite 1",
        "2": "Favorite 2",
        "3": "Favorite 3",
        "4": "Favorite 4",
        T: "Next TP",
        Plus: "Add TP",
        Minus: "Remove TP",
        E: "Entry Price",
        O: "Stop Loss",
        L: "Set Long",
        S: "Set Short",
        J: "Journal",
        P: "Fetch Price",
        B: "Toggle Sidebars",
        K: "Toggle Technicals",
        ",": "Settings",
        R: "Reset",
        F: "Symbol Picker",
    };

    const MODE2_DESCRIPTIONS: Record<string, string> = {
        "Alt+1": "Favorite 1",
        "Alt+2": "Favorite 2",
        "Alt+3": "Favorite 3",
        "Alt+4": "Favorite 4",
        "Alt+T": "Next TP",
        "Alt+Plus": "Add TP",
        "Alt+Minus": "Remove TP",
        "Alt+E": "Entry Price",
        "Alt+O": "Stop Loss",
        "Alt+L": "Set Long",
        "Alt+S": "Set Short",
        "Alt+J": "Journal",
        "Alt+P": "Fetch Price",
        "Alt+B": "Toggle Sidebars",
        "Alt+K": "Toggle Technicals",
        "Alt+,": "Settings",
        "Alt+R": "Reset",
        "Alt+F": "Symbol Picker",
    };

    const MODE3_DESCRIPTIONS: Record<string, string> = {
        "1": "Favorite 1",
        "2": "Favorite 2",
        "3": "Favorite 3",
        "4": "Favorite 4",
        T: "Next TP",
        "Shift+T": "Prev TP",
        Plus: "Add TP",
        Minus: "Remove TP",
        E: "Entry Price",
        O: "Stop Loss",
        L: "Set Long",
        S: "Set Short",
        J: "Journal",
        P: "Fetch Price",
        B: "Toggle Sidebars",
        K: "Toggle Technicals",
        ",": "Settings",
        R: "Reset",
        F: "Symbol Picker",
    };

    let activeSubTab = $derived(uiState.settingsProfileTab);

    function setSubTab(tab: typeof uiState.settingsProfileTab) {
        uiState.settingsProfileTab = tab;
    }
</script>

<div class="profile-tab flex flex-col gap-6" role="tabpanel" id="tab-profile">
    <!-- Sub-Tab Navigation -->
    <div class="subtab-nav">
        <button
            class:active={activeSubTab === "general"}
            onclick={() => setSubTab("general")}
        >
            {$_("settings.profile.subtabs.general") || "Allgemein"}
        </button>
        <button
            class:active={activeSubTab === "appearance"}
            onclick={() => setSubTab("appearance")}
        >
            {$_("settings.profile.subtabs.appearance") || "Darstellung"}
        </button>
        <button
            class:active={activeSubTab === "controls"}
            onclick={() => setSubTab("controls")}
        >
            {$_("settings.profile.subtabs.controls") || "Steuerung"}
        </button>
    </div>

    <!-- Sub-Tab Content -->
    <div class="subtab-content">
        {#if activeSubTab === "general"}
            <!-- Allgemein Tab -->
            <section class="settings-section">
                <h3 class="section-title">
                    {$_("settings.profile.generalTitle") ||
                        "Allgemeine Einstellungen"}
                </h3>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <!-- Language -->
                    <div class="field-group">
                        <label for="settings-language"
                            >{$_("settings.language")}</label
                        >
                        <select
                            id="settings-language"
                            value={$locale}
                            onchange={(e) => setLocale(e.currentTarget.value)}
                            class="select-field"
                        >
                            <option value="en">English</option>
                            <option value="de">Deutsch</option>
                        </select>
                    </div>

                    <!-- Theme -->
                    <div class="field-group">
                        <label for="settings-theme"
                            >{$_("settings.theme")}</label
                        >
                        <select
                            id="settings-theme"
                            value={uiState.currentTheme}
                            onchange={(e) =>
                                uiState.setTheme(e.currentTarget.value)}
                            class="select-field"
                        >
                            {#each themes as theme}
                                <option value={theme.value}>
                                    {theme.label}
                                </option>
                            {/each}
                        </select>
                    </div>

                    <!-- Font -->
                    <div class="field-group">
                        <label for="settings-font"
                            >{$_("settings.fontFamily")}</label
                        >
                        <select
                            id="settings-font"
                            bind:value={settingsState.fontFamily}
                            class="select-field"
                        >
                            {#each fonts as font}
                                <option value={font.value}>{font.label}</option>
                            {/each}
                        </select>
                    </div>
                </div>

                {#if $locale === "de"}
                    <label
                        class="flex items-center gap-2 cursor-pointer mt-4 group"
                    >
                        <input
                            type="checkbox"
                            bind:checked={
                                settingsState.forceEnglishTechnicalTerms
                            }
                            class="form-checkbox h-4 w-4 text-[var(--accent-color)] rounded border-[var(--border-color)] bg-[var(--bg-secondary)]"
                        />
                        <span
                            class="text-sm text-[var(--text-primary)] group-hover:text-[var(--accent-color)] transition-colors"
                        >
                            {$_("settings.forceEnglishTechnicalTerms")}
                        </span>
                    </label>
                {/if}
            </section>
        {:else if activeSubTab === "appearance"}
            <!-- Darstellung Tab -->
            <section class="settings-section">
                <h3 class="section-title">
                    {$_("settings.profile.appearanceTitle") || "Darstellung"}
                </h3>

                <!-- Glassmorphism Toggle -->
                <div
                    class="field-group justify-between flex-row items-center mb-4"
                >
                    <div class="flex flex-col">
                        <span class="text-sm font-medium">
                            {$_("settings.enableGlassmorphism") ||
                                "Glassmorphism"}
                        </span>
                        <span class="text-[10px] text-[var(--text-secondary)]">
                            {$_("settings.glassmorphismDesc") ||
                                "Enable translucent UI effects"}
                        </span>
                    </div>
                    <button
                        class="toggle-container {settingsState.enableGlassmorphism
                            ? 'active'
                            : ''}"
                        onclick={() =>
                            (settingsState.enableGlassmorphism =
                                !settingsState.enableGlassmorphism)}
                        aria-label={$_("settings.enableGlassmorphism") ||
                            "Toggle Glassmorphism"}
                    >
                        <div class="toggle-thumb"></div>
                    </button>
                </div>

                {#if settingsState.enableGlassmorphism}
                    <div
                        class="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4 animate-in fade-in slide-in-from-top-2"
                    >
                        <!-- Glass Blur -->
                        <div class="field-group">
                            <label
                                class="text-[10px] uppercase font-bold text-[var(--text-secondary)]"
                            >
                                {$_("settings.profile.glass.blur") ||
                                    "Glass Blur"}: {settingsState.glassBlur}px
                                <input
                                    type="range"
                                    bind:value={settingsState.glassBlur}
                                    min="0"
                                    max="120"
                                    step="1"
                                    class="w-full"
                                />
                            </label>
                        </div>
                        <!-- Glass Saturate -->
                        <div class="field-group">
                            <label
                                class="text-[10px] uppercase font-bold text-[var(--text-secondary)]"
                            >
                                {$_("settings.profile.glass.saturate") ||
                                    "Saturation"}: {settingsState.glassSaturate}%
                                <input
                                    type="range"
                                    bind:value={settingsState.glassSaturate}
                                    min="50"
                                    max="300"
                                    step="10"
                                    class="w-full"
                                />
                            </label>
                        </div>
                        <!-- Glass Opacity -->
                        <div class="field-group">
                            <label
                                class="text-[10px] uppercase font-bold text-[var(--text-secondary)]"
                            >
                                {$_("settings.profile.glass.opacity") ||
                                    "Opacity"}: {Math.round(
                                    settingsState.glassOpacity * 100,
                                )}%
                                <input
                                    type="range"
                                    bind:value={settingsState.glassOpacity}
                                    min="0"
                                    max="1"
                                    step="0.05"
                                    class="w-full"
                                />
                            </label>
                        </div>
                    </div>
                {/if}
                <div class="border-t border-[var(--border-color)] pt-4 mt-4">
                    <h4
                        class="text-sm font-semibold text-[var(--text-primary)] mb-4"
                    >
                        {$_("settings.profile.background.title") ||
                            "Hintergrund"}
                    </h4>

                    <!-- Background Type Selector -->
                    <div class="field-group mb-4">
                        <span
                            class="text-xs font-semibold text-[var(--text-secondary)] mb-2 block"
                            >{$_("settings.profile.background.type") ||
                                "Hintergrund Typ"}</span
                        >
                        <div
                            id="bg-type-selector"
                            class="grid grid-cols-3 gap-2"
                        >
                            {#each [{ v: "none", l: $_("settings.profile.background.typeNone") || "Kein" }, { v: "image", l: $_("settings.profile.background.typeMedia") || "Img / Vid" }, { v: "animation", l: $_("settings.profile.background.typeAnimation") || "Animation" }] as opt}
                                <button
                                    class="px-3 py-2 text-xs rounded border transition-all {(opt.v ===
                                        'image' &&
                                        (settingsState.backgroundType ===
                                            'image' ||
                                            settingsState.backgroundType ===
                                                'video')) ||
                                    opt.v === settingsState.backgroundType
                                        ? 'bg-[var(--accent-color)] text-[var(--btn-accent-text)] border-[var(--accent-color)]'
                                        : 'bg-[var(--bg-secondary)] text-[var(--text-primary)] border-[var(--border-color)] hover:border-[var(--accent-color)]'}"
                                    onclick={() => {
                                        if (opt.v === "image") {
                                            // Auto-detect based on URL if possible, otherwise default image
                                            const isVid =
                                                settingsState.backgroundUrl
                                                    ?.toLowerCase()
                                                    .endsWith(".mp4");
                                            settingsState.backgroundType = isVid
                                                ? "video"
                                                : "image";
                                        } else {
                                            settingsState.backgroundType =
                                                opt.v as any;
                                        }
                                    }}
                                >
                                    {opt.l}
                                </button>
                            {/each}
                        </div>
                    </div>

                    <!-- URL Input for Image/Video -->
                    {#if settingsState.backgroundType === "image" || settingsState.backgroundType === "video"}
                        <div class="field-group mb-4">
                            <label
                                for="bg-url-input"
                                class="text-xs font-semibold text-[var(--text-secondary)] mb-2"
                                >{$_("settings.profile.background.url") ||
                                    "URL"}</label
                            >
                            <input
                                id="bg-url-input"
                                type="text"
                                value={settingsState.backgroundUrl}
                                oninput={(e) => {
                                    const val = e.currentTarget.value;
                                    settingsState.backgroundUrl = val;
                                    // Auto-switch between image and video type
                                    if (
                                        settingsState.backgroundType ===
                                            "image" ||
                                        settingsState.backgroundType === "video"
                                    ) {
                                        const isVid =
                                            val
                                                .toLowerCase()
                                                .endsWith(".mp4") ||
                                            val
                                                .toLowerCase()
                                                .includes("youtube.com") ||
                                            val
                                                .toLowerCase()
                                                .includes("vimeo.com");
                                        settingsState.backgroundType = isVid
                                            ? "video"
                                            : "image";
                                    }
                                }}
                                placeholder={$_(
                                    "settings.profile.background.urlPlaceholder",
                                ) || "https://example.com/background.jpg"}
                                class="w-full px-3 py-2 text-sm rounded border border-[var(--border-color)] bg-[var(--bg-secondary)] text-[var(--text-primary)] focus:border-[var(--accent-color)] outline-none"
                            />
                            <p
                                class="text-[10px] text-[var(--text-secondary)] mt-1"
                            >
                                {$_("settings.profile.background.urlHelper") ||
                                    "Unterstützte: .jpg, .png, .mp4"}
                            </p>
                        </div>
                    {/if}

                    <!-- Animation Preset Selector -->
                    {#if settingsState.backgroundType === "animation"}
                        <div class="field-group mb-4">
                            <label
                                for="bg-preset-select"
                                class="text-xs font-semibold text-[var(--text-secondary)] mb-2"
                                >{$_(
                                    "settings.profile.background.presetLabel",
                                ) || "Animation"}</label
                            >
                            <select
                                id="bg-preset-select"
                                bind:value={
                                    settingsState.backgroundAnimationPreset
                                }
                                class="w-full px-3 py-2 text-sm rounded border border-[var(--border-color)] bg-[var(--bg-secondary)] text-[var(--text-primary)] focus:border-[var(--accent-color)] outline-none"
                            >
                                <option value="none"
                                    >{$_(
                                        "settings.profile.background.presetNone",
                                    ) || "Keine"}</option
                                >
                                <option value="gradient"
                                    >{$_(
                                        "settings.profile.background.presetGradient",
                                    ) || "Gradient Flow"}</option
                                >
                                <option value="particles"
                                    >{$_(
                                        "settings.profile.background.presetParticles",
                                    ) || "Partikel"}</option
                                >
                                <option value="breathing"
                                    >{$_(
                                        "settings.profile.background.presetBreathing",
                                    ) || "Breathing"}</option
                                >
                                <option value="waves"
                                    >{$_(
                                        "settings.profile.background.presetWaves",
                                    ) || "Wellen"}</option
                                >
                                <option value="aurora"
                                    >{$_(
                                        "settings.profile.background.presetAurora",
                                    ) || "Aurora"}</option
                                >
                            </select>
                        </div>

                        <!-- Animation Intensity -->
                        <div class="field-group mb-4">
                            <span
                                class="text-xs font-semibold text-[var(--text-secondary)] mb-2 block"
                                >{$_("settings.profile.background.intensity") ||
                                    "Intensität"}</span
                            >
                            <div id="bg-intensity-selector" class="flex gap-2">
                                {#each [{ v: "low", l: $_("settings.profile.background.intensityLow") || "Niedrig" }, { v: "medium", l: $_("settings.profile.background.intensityMedium") || "Mittel" }, { v: "high", l: $_("settings.profile.background.intensityHigh") || "Hoch" }] as opt}
                                    <button
                                        class="flex-1 px-3 py-2 text-xs rounded border transition-all {settingsState.backgroundAnimationIntensity ===
                                        opt.v
                                            ? 'bg-[var(--accent-color)] text-[var(--btn-accent-text)] border-[var(--accent-color)]'
                                            : 'bg-[var(--bg-secondary)] text-[var(--text-primary)] border-[var(--border-color)] hover:border-[var(--accent-color)]'}"
                                        onclick={() =>
                                            (settingsState.backgroundAnimationIntensity =
                                                opt.v as any)}
                                    >
                                        {opt.l}
                                    </button>
                                {/each}
                            </div>
                        </div>
                    {/if}

                    <!-- Video Playback Speed -->
                    {#if settingsState.backgroundType === "video"}
                        <div class="field-group mb-4">
                            <label
                                for="bg-video-speed"
                                class="text-xs font-semibold text-[var(--text-secondary)] mb-2"
                            >
                                {$_("settings.profile.background.videoSpeed") ||
                                    "Geschwindigkeit"}: {settingsState.videoPlaybackSpeed.toFixed(
                                    1,
                                )}x
                            </label>
                            <input
                                id="bg-video-speed"
                                type="range"
                                bind:value={settingsState.videoPlaybackSpeed}
                                min="0.1"
                                max="2"
                                step="0.1"
                                class="w-full"
                            />
                            <div
                                class="flex justify-between text-[10px] text-[var(--text-secondary)] mt-1"
                            >
                                <span>0.1x</span>
                                <span>2.0x</span>
                            </div>
                        </div>
                    {/if}

                    <!-- Opacity Slider -->
                    {#if settingsState.backgroundType !== "none"}
                        <div class="field-group mb-4">
                            <label
                                for="bg-opacity-slider"
                                class="text-xs font-semibold text-[var(--text-secondary)] mb-2"
                            >
                                {$_("settings.profile.background.opacity") ||
                                    "Deckkraft"}: {Math.round(
                                    settingsState.backgroundOpacity * 100,
                                )}%
                            </label>
                            <input
                                id="bg-opacity-slider"
                                type="range"
                                bind:value={settingsState.backgroundOpacity}
                                min="0"
                                max="1"
                                step="0.05"
                                class="w-full"
                            />
                            <div
                                class="flex justify-between text-[10px] text-[var(--text-secondary)] mt-1"
                            >
                                <span>0%</span>
                                <span>100%</span>
                            </div>
                        </div>

                        <!-- Blur Slider -->
                        <div class="field-group mb-4">
                            <label
                                for="bg-blur-slider"
                                class="text-xs font-semibold text-[var(--text-secondary)] mb-2"
                            >
                                {$_("settings.profile.background.blur") ||
                                    "Unschärfe"}: {settingsState.backgroundBlur}px
                            </label>
                            <input
                                id="bg-blur-slider"
                                type="range"
                                bind:value={settingsState.backgroundBlur}
                                min="0"
                                max="120"
                                step="1"
                                class="w-full"
                            />
                            <div
                                class="flex justify-between text-[10px] text-[var(--text-secondary)] mt-1"
                            >
                                <span>0px</span>
                                <span>120px</span>
                            </div>
                        </div>
                    {/if}
                </div>
            </section>
        {:else if activeSubTab === "controls"}
            <!-- Steuerung Tab -->

            <section class="settings-section">
                <h3 class="section-title">
                    {$_("settings.profile.controlTitle") ||
                        "Steuerung & Interaktion"}
                </h3>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <!-- Fee Preference (Pro Only) -->
                    {#if settingsState.isPro}
                        <div class="field-group">
                            <div class="field-label">
                                {$_("settings.feePreference")}
                            </div>
                            <div class="segmented-control">
                                {#each ["maker", "taker"] as fee}
                                    <button
                                        class="segmented-btn {settingsState.feePreference ===
                                        fee
                                            ? 'active'
                                            : ''}"
                                        onclick={() =>
                                            (settingsState.feePreference =
                                                fee as any)}
                                    >
                                        {fee.toUpperCase()}
                                    </button>
                                {/each}
                                <div
                                    class="segmented-bg"
                                    style="transform: translateX({settingsState.feePreference ===
                                    'maker'
                                        ? '0%'
                                        : '100%'})"
                                ></div>
                            </div>
                            <p
                                class="text-[10px] text-[var(--text-secondary)] mt-2"
                            >
                                {$_("settings.feePreferenceDesc")}
                            </p>
                        </div>
                    {/if}

                    <!-- Spin Buttons Visibility -->
                    <div class="field-group">
                        <div class="field-label">
                            {$_("settings.showSpinButtons")}
                        </div>
                        <div class="segmented-control three-way">
                            {#each [{ v: true, l: $_("settings.spinButtonsAlways") || "Always" }, { v: "hover", l: $_("settings.spinButtonsHover") || "Hover" }, { v: false, l: $_("settings.spinButtonsHidden") || "None" }] as opt}
                                <button
                                    class="segmented-btn {settingsState.showSpinButtons ===
                                    opt.v
                                        ? 'active'
                                        : ''}"
                                    onclick={() =>
                                        (settingsState.showSpinButtons =
                                            opt.v as any)}
                                >
                                    {opt.l}
                                </button>
                            {/each}
                            <div
                                class="segmented-bg"
                                style="width: 33.33%; transform: translateX({settingsState.showSpinButtons ===
                                true
                                    ? '0%'
                                    : settingsState.showSpinButtons === 'hover'
                                      ? '100%'
                                      : '200%'})"
                            ></div>
                        </div>
                    </div>
                </div>
            </section>

            <!-- Hotkeys Section -->
            <section
                class="settings-section border-t border-[var(--border-color)] pt-6"
            >
                <div class="flex justify-between items-center mb-4">
                    <h3 class="section-title mb-0">
                        {$_("settings.profile.hotkeysTitle") ||
                            "Keyboard Shortcuts"}
                    </h3>

                    <select
                        bind:value={settingsState.hotkeyMode}
                        class="select-field text-xs w-auto min-w-[150px]"
                    >
                        <option value="mode2">Safety Mode (Alt + Key)</option>
                        <option value="mode1">Direct Mode (Fast)</option>
                        <option value="mode3">Hybrid Mode</option>
                        <option value="custom">Custom Configuration</option>
                    </select>
                </div>

                <div
                    class="hotkey-content {settingsState.hotkeyMode === 'custom'
                        ? 'custom-active'
                        : ''}"
                >
                    {#if settingsState.hotkeyMode !== "custom"}
                        <div
                            class="hotkey-preview p-4 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-color)]"
                        >
                            <div class="flex justify-between items-center mb-3">
                                <p class="text-xs text-[var(--text-secondary)]">
                                    {$_("settings.profile.activeHotkeys") ||
                                        "Active Hotkeys"}
                                </p>
                                <button
                                    class="text-xs text-[var(--accent)] hover:underline"
                                    onclick={() =>
                                        (settingsState.hotkeyMode = "custom")}
                                >
                                    {$_("settings.profile.customize") ||
                                        "Customize"}
                                </button>
                            </div>

                            <div
                                class="hotkey-list-scroll grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-0.5 text-xs text-[var(--text-secondary)]"
                            >
                                {#each Object.entries(settingsState.hotkeyMode === "mode1" ? MODE1_DESCRIPTIONS : settingsState.hotkeyMode === "mode2" ? MODE2_DESCRIPTIONS : MODE3_DESCRIPTIONS) as [key, label]}
                                    <div class="flex justify-between py-1">
                                        <span>{label}</span>
                                        <span
                                            class="font-mono text-[var(--text-primary)]"
                                            >{key}</span
                                        >
                                    </div>
                                {/each}
                            </div>
                        </div>
                    {:else}
                        <div
                            class="hotkey-settings-wrapper p-4 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-color)]"
                        >
                            <HotkeySettings />
                        </div>
                    {/if}
                </div>
            </section>
        {/if}
    </div>
</div>

<style>
    .profile-tab {
        padding: 0.5rem;
    }

    .section-title {
        font-size: 0.875rem;
        font-weight: 700;
        color: var(--text-primary);
        margin-bottom: 1.25rem;
        text-transform: uppercase;
        letter-spacing: 0.05em;
    }

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

    .select-field {
        appearance: none;
        background-color: var(--bg-secondary);
        border: 1px solid var(--border-color);
        border-radius: 0.5rem;
        padding: 0.5rem 0.75rem;
        font-size: 0.875rem;
        color: var(--text-primary);
        outline: none;
        transition: all 0.2s ease;
    }

    .select-field:focus {
        border-color: var(--accent-color);
        box-shadow: 0 0 0 2px rgba(var(--accent-rgb), 0.1);
    }

    /* Segmented Control */
    .segmented-control {
        display: flex;
        background: var(--bg-secondary);
        border: 1px solid var(--border-color);
        padding: 2px;
        border-radius: 0.5rem;
        position: relative;
        overflow: hidden;
    }

    .segmented-btn {
        flex: 1;
        z-index: 1;
        padding: 0.4rem;
        font-size: 0.75rem;
        font-weight: 600;
        color: var(--text-secondary);
        border: none;
        background: transparent;
        cursor: pointer;
        transition: color 0.3s ease;
    }

    .segmented-btn.active {
        color: var(--btn-accent-text);
    }

    .segmented-bg {
        position: absolute;
        top: 2px;
        bottom: 2px;
        left: 2px;
        width: calc(50% - 2px);
        background: var(--accent-color);
        border-radius: 0.4rem;
        transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    }

    /* Toggle Styles */
    .toggle-container {
        width: 36px;
        height: 20px;
        background-color: var(--bg-tertiary);
        border-radius: 20px;
        position: relative;
        transition: all 0.3s ease;
        border: 1px solid var(--border-color);
        cursor: pointer;
    }

    .toggle-container.active {
        background-color: var(--accent-color);
        border-color: var(--accent-color);
    }

    .toggle-thumb {
        width: 14px;
        height: 14px;
        background-color: white;
        border-radius: 50%;
        position: absolute;
        top: 2px;
        left: 2px;
        transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    }

    .active .toggle-thumb {
        transform: translateX(16px);
    }

    .hotkey-settings-wrapper,
    .hotkey-preview {
        max-height: 480px;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        padding-right: 4px;
    }

    .hotkey-list-scroll {
        flex: 1;
    }

    .hotkey-settings-wrapper::-webkit-scrollbar,
    .hotkey-preview::-webkit-scrollbar {
        width: 4px;
    }

    .hotkey-settings-wrapper::-webkit-scrollbar-thumb,
    .hotkey-preview::-webkit-scrollbar-thumb {
        background: var(--border-color);
        border-radius: 2px;
    }

    /* Subtab Navigation */
    .subtab-nav {
        display: flex;
        gap: 0.5rem;
        margin-bottom: 1.5rem;
        border-bottom: 1px solid var(--border-color);
        padding-bottom: 0.5rem;
    }

    .subtab-nav button {
        padding: 0.5rem 1rem;
        font-size: 0.875rem;
        font-weight: 600;
        color: var(--text-secondary);
        background: transparent;
        border: none;
        border-bottom: 2px solid transparent;
        cursor: pointer;
        transition: all 0.2s ease;
    }

    .subtab-nav button.active {
        color: var(--accent-color);
        border-bottom-color: var(--accent-color);
    }

    .subtab-nav button:hover:not(.active) {
        color: var(--text-primary);
    }

    .subtab-content {
        padding: 0.5rem 0;
    }
</style>
