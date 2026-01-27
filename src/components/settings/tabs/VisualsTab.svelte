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

    const activeSubTab = $derived(uiState.settingsVisualsSubTab);

    function toggleGyro() {
        const isEnabled = settingsState.galaxySettings.enableGyroscope;

        if (!isEnabled) {
            // Check for iOS permission requirement
            if (
                typeof DeviceOrientationEvent !== "undefined" &&
                typeof (DeviceOrientationEvent as any).requestPermission === "function"
            ) {
                (DeviceOrientationEvent as any).requestPermission()
                    .then((response: string) => {
                        if (response === "granted") {
                            settingsState.galaxySettings.enableGyroscope = true;
                        } else {
                            alert(
                                "Permission denied. Gyroscope control requires access to device sensors.",
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
            label: $_("settings.profile.subtabs.appearance") || "Look & Feel",
        },
        { id: "layout", label: $_("settings.visuals.layoutTitle") || "Layout" },
        {
            id: "background",
            label: $_("settings.visuals.backgroundTitle") || "Background",
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
                    ? 'bg-[var(--accent-color)] text-white'
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
                                <label for="chat-font-size">Chat Size</label>
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
                                        >px</span
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
                                Blur: {settingsState.glassBlur}px
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
                                Opacity: {Math.round(
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
                                Saturate: {settingsState.glassSaturate}%
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
                            <span
                                class="text-[10px] text-[var(--text-secondary)]"
                                >Chat / Notes sidebar</span
                            >
                        </div>
                        <Toggle bind:checked={settingsState.enableSidePanel} />
                    </label>
                </div>

                {#if settingsState.enableSidePanel}
                    <div class="field-group mt-4">
                        <span
                            class="text-xs font-semibold text-[var(--text-secondary)] mb-2 block"
                            >Side Panel Mode</span
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
        {/if}

        <!-- Background Section -->
        {#if activeSubTab === "background"}
            <section class="settings-section animate-fade-in">
                <!-- Type Selector -->
                <div class="flex gap-2 mb-4 flex-wrap">
                    {#each [
                        { v: "none", l: "None" },
                        { v: "image", l: "Image / Video" },
                        { v: "animation", l: "Live Animation" },
                        { v: "threejs", l: "Galaxy (3D)" }
                    ] as type}
                        <button
                            class="px-3 py-2 text-xs rounded border transition-colors {settingsState.backgroundType === type.v || (type.v === 'image' && settingsState.backgroundType === 'video')
                                ? 'bg-[var(--accent-color)] text-white border-[var(--accent-color)]'
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

                {#if settingsState.backgroundType === "threejs"}
                    <div class="p-4 bg-[var(--bg-secondary)] rounded-lg mb-4 space-y-4">
                        <div class="grid grid-cols-2 gap-4">
                            <div class="field-group">
                                <label for="galaxy-count">Particles: {settingsState.galaxySettings.particleCount}</label>
                                <input
                                    id="galaxy-count"
                                    type="range"
                                    bind:value={settingsState.galaxySettings.particleCount}
                                    min="10"
                                    max="50000"
                                    step="10"
                                    class="range-input"
                                />
                            </div>
                            <div class="field-group">
                                <label for="galaxy-size">Size: {settingsState.galaxySettings.particleSize.toFixed(2)}</label>
                                <input
                                    id="galaxy-size"
                                    type="range"
                                    bind:value={settingsState.galaxySettings.particleSize}
                                    min="0.01"
                                    max="2.0"
                                    step="0.01"
                                    class="range-input"
                                />
                            </div>
                        </div>

                        <div class="grid grid-cols-2 gap-4">
                            <div class="field-group">
                                <label for="galaxy-radius">Radius: {settingsState.galaxySettings.radius.toFixed(1)}</label>
                                <input
                                    id="galaxy-radius"
                                    type="range"
                                    bind:value={settingsState.galaxySettings.radius}
                                    min="0.1"
                                    max="20"
                                    step="0.1"
                                    class="range-input"
                                />
                            </div>
                            <div class="field-group">
                                <label for="galaxy-branches">Branches: {settingsState.galaxySettings.branches}</label>
                                <input
                                    id="galaxy-branches"
                                    type="range"
                                    bind:value={settingsState.galaxySettings.branches}
                                    min="2"
                                    max="10"
                                    step="1"
                                    class="range-input"
                                />
                            </div>
                        </div>

                        <div class="grid grid-cols-2 gap-4">
                            <div class="field-group">
                                <label for="galaxy-spin">Spin Speed: {settingsState.galaxySettings.spin.toFixed(2)}</label>
                                <input
                                    id="galaxy-spin"
                                    type="range"
                                    bind:value={settingsState.galaxySettings.spin}
                                    min="0"
                                    max="5"
                                    step="0.01"
                                    class="range-input"
                                />
                            </div>
                            <div class="field-group">
                                <label for="galaxy-randomness">Randomness: {settingsState.galaxySettings.randomness.toFixed(2)}</label>
                                <input
                                    id="galaxy-randomness"
                                    type="range"
                                    bind:value={settingsState.galaxySettings.randomness}
                                    min="0"
                                    max="2"
                                    step="0.01"
                                    class="range-input"
                                />
                            </div>
                        </div>

                         <div class="grid grid-cols-2 gap-4">
                            <div class="field-group">
                                <label for="galaxy-randomness-power">Spread: {settingsState.galaxySettings.randomnessPower.toFixed(2)}</label>
                                <input
                                    id="galaxy-randomness-power"
                                    type="range"
                                    bind:value={settingsState.galaxySettings.randomnessPower}
                                    min="1"
                                    max="10"
                                    step="0.01"
                                    class="range-input"
                                />
                            </div>
                             <div class="field-group">
                                <label for="galaxy-concentration">Concentration: {settingsState.galaxySettings.concentrationPower.toFixed(1)}</label>
                                <input
                                    id="galaxy-concentration"
                                    type="range"
                                    bind:value={settingsState.galaxySettings.concentrationPower}
                                    min="0.1"
                                    max="10"
                                    step="0.1"
                                    class="range-input"
                                />
                            </div>
                        </div>

                         <!-- Camera & Rotation -->
                         <div class="grid grid-cols-1 gap-4 border-t border-[var(--border-color)] pt-4 mt-2">
                            <span class="text-xs font-semibold text-[var(--text-secondary)]">Camera Position</span>
                            <div class="grid grid-cols-3 gap-2">
                                 <div class="field-group">
                                    <label for="cam-x">X: {settingsState.galaxySettings.camPos.x.toFixed(1)}</label>
                                    <input id="cam-x" type="range" min="-15" max="15" step="0.1" bind:value={settingsState.galaxySettings.camPos.x} class="range-input" />
                                </div>
                                <div class="field-group">
                                    <label for="cam-y">Y: {settingsState.galaxySettings.camPos.y.toFixed(1)}</label>
                                    <input id="cam-y" type="range" min="-15" max="15" step="0.1" bind:value={settingsState.galaxySettings.camPos.y} class="range-input" />
                                </div>
                                <div class="field-group">
                                    <label for="cam-z">Z: {settingsState.galaxySettings.camPos.z.toFixed(1)}</label>
                                    <input id="cam-z" type="range" min="-15" max="15" step="0.1" bind:value={settingsState.galaxySettings.camPos.z} class="range-input" />
                                </div>
                            </div>

                            <span class="text-xs font-semibold text-[var(--text-secondary)]">Rotation</span>
                            <div class="grid grid-cols-3 gap-2">
                                 <div class="field-group">
                                    <label for="rot-x">X: {settingsState.galaxySettings.galaxyRot.x.toFixed(1)}°</label>
                                    <input id="rot-x" type="range" min="0" max="360" step="0.1" bind:value={settingsState.galaxySettings.galaxyRot.x} class="range-input" />
                                </div>
                                <div class="field-group">
                                    <label for="rot-y">Y: {settingsState.galaxySettings.galaxyRot.y.toFixed(1)}°</label>
                                    <input id="rot-y" type="range" min="0" max="360" step="0.1" bind:value={settingsState.galaxySettings.galaxyRot.y} class="range-input" />
                                </div>
                                <div class="field-group">
                                    <label for="rot-z">Z: {settingsState.galaxySettings.galaxyRot.z.toFixed(1)}°</label>
                                    <input id="rot-z" type="range" min="0" max="360" step="0.1" bind:value={settingsState.galaxySettings.galaxyRot.z} class="range-input" />
                                </div>
                            </div>
                        </div>

                        <!-- Gyroscope Control -->
                        <div class="flex justify-between items-center p-3 bg-[var(--bg-tertiary)] rounded-lg border border-[var(--border-color)] mt-4">
                            <div class="flex flex-col">
                                <span class="text-sm font-medium">Gyroscope Control</span>
                                <span class="text-[10px] text-[var(--text-secondary)]">Control camera with device motion (Mobile)</span>
                            </div>
                            <button
                                class="w-12 h-6 rounded-full relative transition-colors {settingsState.galaxySettings.enableGyroscope ? 'bg-[var(--accent-color)]' : 'bg-[var(--border-color)]'}"
                                onclick={toggleGyro}
                            >
                                <span class="absolute top-1 left-1 bg-white w-4 h-4 rounded-full transition-transform {settingsState.galaxySettings.enableGyroscope ? 'translate-x-6' : 'translate-x-0'}"></span>
                            </button>
                        </div>
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
