<script lang="ts">
    import { _ } from "../../../locales/i18n";
    import type { HotkeyMode } from "../../../stores/settingsStore";

    export let showSpinButtons: boolean | "hover";
    export let marketDataInterval: "1s" | "1m" | "10m";
    export let autoUpdatePriceInput: boolean;
    export let autoFetchBalance: boolean;
    export let hotkeyMode: HotkeyMode;
    export let activeDescriptions: Array<{ keys: string; action: string }>;
</script>

<div class="flex flex-col gap-4" role="tabpanel" id="tab-behavior">
    <!-- Spin Buttons Global Toggle -->
    <div
        class="flex flex-col gap-2 p-3 border border-[var(--border-color)] rounded bg-[var(--bg-secondary)] mb-2"
    >
        <div class="flex flex-col">
            <span class="text-sm font-bold text-[var(--accent-color)]"
                >{$_("settings.showSpinButtons")}</span
            >
            <span class="text-[10px] text-[var(--text-secondary)] mb-2"
                >Globale Sichtbarkeit der Scroll-Buttons in Eingabefeldern</span
            >
        </div>
        <div class="flex gap-2">
            <label
                class="flex items-center gap-2 cursor-pointer p-2 rounded hover:bg-[var(--bg-tertiary)] flex-1 border border-[var(--border-color)] transition-colors"
                class:bg-[var(--bg-tertiary)]={showSpinButtons === true}
                class:border-[var(--accent-color)]={showSpinButtons === true}
            >
                <input
                    type="radio"
                    bind:group={showSpinButtons}
                    value={true}
                    class="accent-[var(--accent-color)]"
                />
                <span class="text-xs font-medium"
                    >{$_("settings.spinButtonsAlways")}</span
                >
            </label>
            <label
                class="flex items-center gap-2 cursor-pointer p-2 rounded hover:bg-[var(--bg-tertiary)] flex-1 border border-[var(--border-color)] transition-colors"
                class:bg-[var(--bg-tertiary)]={showSpinButtons === "hover"}
                class:border-[var(--accent-color)]={showSpinButtons === "hover"}
            >
                <input
                    type="radio"
                    bind:group={showSpinButtons}
                    value="hover"
                    class="accent-[var(--accent-color)]"
                />
                <span class="text-xs font-medium"
                    >{$_("settings.spinButtonsHover")}</span
                >
            </label>
            <label
                class="flex items-center gap-2 cursor-pointer p-2 rounded hover:bg-[var(--bg-tertiary)] flex-1 border border-[var(--border-color)] transition-colors"
                class:bg-[var(--bg-tertiary)]={showSpinButtons === false}
                class:border-[var(--accent-color)]={showSpinButtons === false}
            >
                <input
                    type="radio"
                    bind:group={showSpinButtons}
                    value={false}
                    class="accent-[var(--accent-color)]"
                />
                <span class="text-xs font-medium"
                    >{$_("settings.spinButtonsHidden")}</span
                >
            </label>
        </div>
    </div>

    <div class="flex flex-col gap-1">
        <label for="market-data-interval" class="text-sm font-medium"
            >{$_("settings.intervalLabel")}</label
        >
        <select
            id="market-data-interval"
            name="marketDataInterval"
            bind:value={marketDataInterval}
            class="input-field p-2 rounded border border-[var(--border-color)] bg-[var(--bg-secondary)]"
        >
            <option value="1s">{$_("settings.interval1s")}</option>
            <option value="1m">{$_("settings.interval1m")}</option>
            <option value="10m">{$_("settings.interval10m")}</option>
        </select>
    </div>
    <label
        class="flex items-center justify-between p-2 rounded hover:bg-[var(--bg-tertiary)] cursor-pointer"
    >
        <div class="flex flex-col">
            <span class="text-sm font-medium"
                >{$_("settings.autoUpdatePrice")}</span
            >
            <span class="text-xs text-[var(--text-secondary)]"
                >Overwrite entry price on every update tick</span
            >
        </div>
        <input
            id="auto-update-price"
            name="autoUpdatePrice"
            type="checkbox"
            bind:checked={autoUpdatePriceInput}
            class="accent-[var(--accent-color)] h-4 w-4 rounded"
        />
    </label>
    <label
        class="flex items-center justify-between p-2 rounded hover:bg-[var(--bg-tertiary)] cursor-pointer"
    >
        <div class="flex flex-col">
            <span class="text-sm font-medium"
                >{$_("settings.autoFetchBalance")}</span
            >
            <span class="text-xs text-[var(--text-secondary)]"
                >Fetch wallet balance on startup</span
            >
        </div>
        <input
            id="auto-fetch-balance"
            name="autoFetchBalance"
            type="checkbox"
            bind:checked={autoFetchBalance}
            class="accent-[var(--accent-color)] h-4 w-4 rounded"
        />
    </label>
    <div class="flex flex-col gap-2 pt-2 border-t border-[var(--border-color)]">
        <label for="hotkey-mode" class="text-sm font-medium"
            >Hotkey Profile</label
        >
        <select
            id="hotkey-mode"
            name="hotkeyMode"
            bind:value={hotkeyMode}
            class="input-field p-2 rounded border border-[var(--border-color)] bg-[var(--bg-secondary)]"
        >
            <option value="custom">Custom (Fully Configurable)</option>
            <option value="mode2">Safety Mode (Alt + Key)</option>
            <option value="mode1">Direct Mode (Fast)</option>
            <option value="mode3">Hybrid Mode</option>
        </select>
        {#if hotkeyMode !== "custom"}
            <div
                class="bg-[var(--bg-tertiary)] p-3 rounded text-xs text-[var(--text-secondary)] mt-1"
            >
                <div class="font-bold mb-2 text-[var(--text-primary)]">
                    Active Hotkeys ({activeDescriptions.length}):
                </div>
                <div
                    class="grid grid-cols-2 gap-x-4 gap-y-1 max-h-[200px] overflow-y-auto custom-scrollbar pr-2"
                >
                    {#each activeDescriptions as desc}
                        <div class="flex justify-between gap-4">
                            <span
                                class="font-mono text-[var(--accent-color)] whitespace-nowrap"
                                >{desc.keys}</span
                            >
                            <span class="truncate">{desc.action}</span>
                        </div>
                    {/each}
                </div>
            </div>
        {:else}
            <div
                class="bg-[var(--bg-tertiary)] p-3 rounded text-xs text-[var(--text-secondary)] mt-1"
            >
                <p>Configure your custom hotkeys in the "Hotkeys" tab.</p>
            </div>
        {/if}
    </div>
</div>
