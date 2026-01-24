<script lang="ts">
    import { _ } from "../../../locales/i18n";
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
        { value: "none", label: "None" },
        { value: "gradient", label: "Gradient Flow" },
        { value: "particles", label: "Particles" },
        { value: "breathing", label: "Breathing" },
        { value: "waves", label: "Waves" },
        { value: "aurora", label: "Aurora" },
    ];

    // Layout Options
    const layoutModes = [
        { value: "standard", label: "Standard" },
        { value: "floating", label: "Floating" },
    ];
</script>

<div class="visuals-tab flex flex-col gap-8" role="tabpanel" id="tab-visuals">
    <!-- Appearance Section -->
    <section class="settings-section">
        <div class="flex items-center gap-2 mb-4">
            <div class="icon-box bg-pink-500/10 text-pink-500">
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    ><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" /></svg
                >
            </div>
            <h3 class="section-title mb-0">
                {$_("settings.visuals.appearanceTitle") || "Look & Feel"}
            </h3>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <!-- Language -->
            <div class="field-group">
                <label for="lang-select">{$_("settings.language")}</label>
                <select
                    id="lang-select"
                    value={$locale}
                    onchange={(e) => setLocale(e.currentTarget.value)}
                    class="input-field"
                >
                    <option value="en">English</option>
                    <option value="de">Deutsch</option>
                </select>
            </div>

            <!-- Theme -->
            <div class="field-group">
                <label for="theme-select">{$_("settings.theme")}</label>
                <select
                    id="theme-select"
                    value={uiState.currentTheme}
                    onchange={(e) => uiState.setTheme(e.currentTarget.value)}
                    class="input-field"
                >
                    {#each themes as theme}
                        <option value={theme.value}>{theme.label}</option>
                    {/each}
                </select>
            </div>

            <!-- Font -->
            <div class="field-group">
                <label for="font-select">{$_("settings.fontFamily")}</label>
                <select
                    id="font-select"
                    bind:value={settingsState.fontFamily}
                    class="input-field"
                >
                    {#each fonts as font}
                        <option value={font.value}>{font.label}</option>
                    {/each}
                </select>
            </div>

            <!-- Glassmorphism -->
            <label class="toggle-card self-end">
                <div class="flex flex-col">
                    <span class="text-sm font-medium"
                        >{$_("settings.enableGlassmorphism")}</span
                    >
                </div>
                <Toggle bind:checked={settingsState.enableGlassmorphism} />
            </label>
        </div>

        {#if settingsState.enableGlassmorphism}
            <div
                class="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4 p-4 bg-[var(--bg-secondary)] rounded-lg"
            >
                <div class="field-group">
                    <label
                        class="text-[10px] uppercase font-bold text-[var(--text-secondary)]"
                    >
                        Blur: {settingsState.glassBlur}px
                    </label>
                    <input
                        type="range"
                        bind:value={settingsState.glassBlur}
                        min="0"
                        max="120"
                        class="w-full h-1 bg-[var(--border-color)] rounded-lg appearance-none cursor-pointer"
                    />
                </div>
                <div class="field-group">
                    <label
                        class="text-[10px] uppercase font-bold text-[var(--text-secondary)]"
                    >
                        Opacity: {Math.round(settingsState.glassOpacity * 100)}%
                    </label>
                    <input
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
                        class="text-[10px] uppercase font-bold text-[var(--text-secondary)]"
                    >
                        Saturate: {settingsState.glassSaturate}%
                    </label>
                    <input
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
    </section>

    <!-- Layout Section -->
    <section
        class="settings-section border-t border-[var(--border-color)] pt-8"
    >
        <h3 class="section-title mb-4">
            {$_("settings.visuals.layoutTitle") || "Layout & Structure"}
        </h3>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label class="toggle-card">
                <div class="flex flex-col">
                    <span class="text-sm font-medium"
                        >{$_("settings.showSidebars")}</span
                    >
                    <span class="text-[10px] text-[var(--text-secondary)]"
                        >Show left/right panels</span
                    >
                </div>
                <Toggle bind:checked={settingsState.showSidebars} />
            </label>

            <label class="toggle-card">
                <div class="flex flex-col">
                    <span class="text-sm font-medium"
                        >{$_("settings.enableSidePanel")}</span
                    >
                    <span class="text-[10px] text-[var(--text-secondary)]"
                        >Chat / Notes sidebar</span
                    >
                </div>
                <Toggle bind:checked={settingsState.enableSidePanel} />
            </label>
        </div>

        {#if settingsState.enableSidePanel}
            <div class="field-group mt-4">
                <label
                    class="text-xs font-semibold text-[var(--text-secondary)] mb-2"
                    >Side Panel Mode</label
                >
                <div class="flex gap-2">
                    {#each layoutModes as mode}
                        <button
                            class="px-3 py-2 text-xs rounded border transition-colors {settingsState.sidePanelLayout ===
                            mode.value
                                ? 'bg-[var(--accent-color)] text-white border-[var(--accent-color)]'
                                : 'bg-[var(--bg-secondary)] border-[var(--border-color)]'}"
                            onclick={() =>
                                (settingsState.sidePanelLayout =
                                    mode.value as any)}
                        >
                            {mode.label}
                        </button>
                    {/each}
                </div>
            </div>
        {/if}
    </section>

    <!-- Background Section -->
    <section
        class="settings-section border-t border-[var(--border-color)] pt-8"
    >
        <h3 class="section-title mb-4">
            {$_("settings.visuals.backgroundTitle") || "Background"}
        </h3>

        <!-- Type Selector -->
        <div class="flex gap-2 mb-4">
            {#each [{ v: "none", l: "None" }, { v: "image", l: "Image / Video" }, { v: "animation", l: "Live Animation" }] as type}
                <button
                    class="px-3 py-2 text-xs rounded border transition-colors {settingsState.backgroundType ===
                        type.v ||
                    (type.v === 'image' &&
                        settingsState.backgroundType === 'video')
                        ? 'bg-[var(--accent-color)] text-white border-[var(--accent-color)]'
                        : 'bg-[var(--bg-secondary)] border-[var(--border-color)]'}"
                    onclick={() => {
                        if (type.v === "image")
                            settingsState.backgroundType = "image";
                        else settingsState.backgroundType = type.v as any;
                    }}
                >
                    {type.l}
                </button>
            {/each}
        </div>

        {#if settingsState.backgroundType === "image" || settingsState.backgroundType === "video"}
            <div class="field-group mb-4">
                <label for="bg-url">Image / Video URL</label>
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
                    placeholder="https://..."
                />
                <p class="text-[10px] text-[var(--text-secondary)]">
                    Supports .jpg, .png, .mp4
                </p>
            </div>
            {#if settingsState.backgroundType === "video"}
                <div class="field-group mb-4">
                    <label for="vid-speed"
                        >Playback Speed: {settingsState.videoPlaybackSpeed}x</label
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
                <label for="anim-preset">Effect</label>
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

        {#if settingsState.backgroundType !== "none"}
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div class="field-group">
                    <label for="bg-opacity"
                        >Opacity: {Math.round(
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
                        >Blur: {settingsState.backgroundBlur}px</label
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
</div>

<style>
    .icon-box {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        border-radius: 8px;
    }
    .section-title {
        font-size: 0.875rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--text-secondary);
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
    .input-field {
        background-color: var(--bg-secondary);
        border: 1px solid var(--border-color);
        border-radius: 0.5rem;
        padding: 0.5rem 0.75rem;
        font-size: 0.875rem;
        color: var(--text-primary);
        outline: none;
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
