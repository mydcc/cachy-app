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
</script>

<div class="profile-tab flex flex-col gap-6" role="tabpanel" id="tab-profile">
    <!-- Appearance & Identity Section -->
    <section class="settings-section">
        <h3 class="section-title">
            {$_("settings.profile.appearanceTitle") || "Appearance & Identity"}
        </h3>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <!-- Language -->
            <div class="field-group">
                <label for="settings-language">{$_("settings.language")}</label>
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
                <label for="settings-theme">{$_("settings.theme")}</label>
                <select
                    id="settings-theme"
                    value={uiState.currentTheme}
                    onchange={(e) => uiState.setTheme(e.currentTarget.value)}
                    class="select-field"
                >
                    {#each themes as theme, index}
                        <option
                            value={theme.value}
                            disabled={!settingsState.isPro && index >= 5}
                        >
                            {theme.label}
                            {!settingsState.isPro && index >= 5 ? "(Pro)" : ""}
                        </option>
                    {/each}
                </select>
            </div>

            <!-- Font -->
            <div class="field-group">
                <label for="settings-font">{$_("settings.fontFamily")}</label>
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

            <!-- Glassmorphism Toggle -->
            <div class="field-group justify-between flex-row items-center pt-4">
                <div class="flex flex-col">
                    <span class="text-sm font-medium"
                        >{$_("settings.enableGlassmorphism") ||
                            "Glassmorphism"}</span
                    >
                    <span class="text-[10px] text-[var(--text-secondary)]"
                        >{$_("settings.glassmorphismDesc") ||
                            "Enable translucent UI effects"}</span
                    >
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
        </div>

        {#if $locale === "de"}
            <label class="flex items-center gap-2 cursor-pointer mt-4 group">
                <input
                    type="checkbox"
                    bind:checked={settingsState.forceEnglishTechnicalTerms}
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

    <!-- Control & Interaction Section -->
    <section
        class="settings-section border-t border-[var(--border-color)] pt-6"
    >
        <h3 class="section-title">
            {$_("settings.profile.controlTitle") || "Control & Interaction"}
        </h3>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <!-- Fee Preference -->
            <div class="field-group">
                <div class="field-label">{$_("settings.feePreference")}</div>
                <div class="segmented-control">
                    {#each ["maker", "taker"] as fee}
                        <button
                            class="segmented-btn {settingsState.feePreference ===
                            fee
                                ? 'active'
                                : ''}"
                            onclick={() =>
                                (settingsState.feePreference = fee as any)}
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
                <p class="text-[10px] text-[var(--text-secondary)] mt-2">
                    {$_("settings.feePreferenceDesc")}
                </p>
            </div>

            <!-- Spin Buttons Visibility -->
            <div class="field-group">
                <div class="field-label">{$_("settings.showSpinButtons")}</div>
                <div class="segmented-control three-way">
                    {#each [{ v: true, l: $_("settings.spinButtonsAlways") || "Always" }, { v: "hover", l: $_("settings.spinButtonsHover") || "Hover" }, { v: false, l: $_("settings.spinButtonsHidden") || "None" }] as opt}
                        <button
                            class="segmented-btn {settingsState.showSpinButtons ===
                            opt.v
                                ? 'active'
                                : ''}"
                            onclick={() =>
                                (settingsState.showSpinButtons = opt.v as any)}
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
                {$_("settings.profile.hotkeysTitle") || "Keyboard Shortcuts"}
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
                            {$_("settings.profile.customize") || "Customize"}
                        </button>
                    </div>

                    <div
                        class="max-h-64 overflow-y-auto grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-0.5 text-xs text-[var(--text-secondary)]"
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

    .hotkey-settings-wrapper {
        max-height: 400px;
        overflow: hidden;
        display: flex;
        flex-direction: column;
    }
</style>
