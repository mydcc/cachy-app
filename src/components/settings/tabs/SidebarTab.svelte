<script lang="ts">
    import { _ } from "../../../locales/i18n";
    import type { SidePanelLayout } from "../../../stores/settingsStore";

    export let showSidebars: boolean;
    export let showTechnicals: boolean;
    export let showIndicatorParams: boolean;
    export let hideUnfilledOrders: boolean;
    export let positionViewMode: "detailed" | "focus";
    export let enableSidePanel: boolean;
    export let sidePanelMode: "chat" | "notes" | "ai";
    export let sidePanelLayout: SidePanelLayout;
</script>

<div class="flex flex-col gap-4" role="tabpanel" id="tab-sidebar">
    <label
        class="flex items-center justify-between p-2 rounded hover:bg-[var(--bg-tertiary)] cursor-pointer border border-[var(--border-color)]"
    >
        <span class="text-sm font-medium">{$_("settings.showSidebars")}</span>
        <input
            id="show-sidebars"
            name="showSidebars"
            type="checkbox"
            bind:checked={showSidebars}
            class="accent-[var(--accent-color)] h-4 w-4 rounded"
        />
    </label>
    <label
        class="flex items-center justify-between p-2 rounded hover:bg-[var(--bg-tertiary)] cursor-pointer border border-[var(--border-color)]"
    >
        <span class="text-sm font-medium"
            >{$_("settings.showTechnicals") || "Show Technicals Panel"}</span
        >
        <input
            id="show-technicals"
            name="showTechnicals"
            type="checkbox"
            bind:checked={showTechnicals}
            class="accent-[var(--accent-color)] h-4 w-4 rounded"
        />
    </label>
    <label
        class="flex items-center justify-between p-2 rounded hover:bg-[var(--bg-tertiary)] cursor-pointer border border-[var(--border-color)]"
    >
        <div class="flex flex-col">
            <span class="text-sm font-medium"
                >{$_("settings.showIndicatorParams")}</span
            >
            <span class="text-[10px] text-[var(--text-secondary)]"
                >Show indicator parameters in Technicals Panel</span
            >
        </div>
        <input
            id="show-indicator-params"
            name="showIndicatorParams"
            type="checkbox"
            bind:checked={showIndicatorParams}
            class="accent-[var(--accent-color)] h-4 w-4 rounded"
        />
    </label>
    <label
        class="flex items-center justify-between p-2 rounded hover:bg-[var(--bg-tertiary)] cursor-pointer border border-[var(--border-color)]"
    >
        <div class="flex flex-col">
            <span class="text-sm font-medium"
                >{$_("settings.enableSidePanel")}</span
            >
            <span class="text-xs text-[var(--text-secondary)]"
                >{$_("settings.sidePanelDesc")}</span
            >
        </div>
        <input
            id="enable-side-panel"
            name="enableSidePanel"
            type="checkbox"
            bind:checked={enableSidePanel}
            class="accent-[var(--accent-color)] h-4 w-4 rounded"
        />
    </label>
    <div
        class="flex flex-col gap-3 ml-4 border-l-2 border-[var(--border-color)] pl-4 transition-opacity duration-200 {enableSidePanel
            ? 'opacity-100'
            : 'opacity-50 pointer-events-none'}"
    >
        <div class="flex flex-col gap-1">
            <span class="text-sm font-medium"
                >{$_("settings.sidePanelMode")}</span
            >
            <div class="flex gap-2">
                <label
                    class="flex items-center gap-2 cursor-pointer p-2 rounded hover:bg-[var(--bg-tertiary)] flex-1 border border-[var(--border-color)]"
                >
                    <input
                        id="sp-mode-notes"
                        name="sidePanelMode"
                        type="radio"
                        bind:group={sidePanelMode}
                        value="notes"
                        class="accent-[var(--accent-color)]"
                    />
                    <span class="text-sm">{$_("settings.modeNotes")}</span>
                </label>
                <label
                    class="flex items-center gap-2 cursor-pointer p-2 rounded hover:bg-[var(--bg-tertiary)] flex-1 border border-[var(--border-color)]"
                >
                    <input
                        id="sp-mode-chat"
                        name="sidePanelMode"
                        type="radio"
                        bind:group={sidePanelMode}
                        value="chat"
                        class="accent-[var(--accent-color)]"
                    />
                    <span class="text-sm">{$_("settings.modeChat")}</span>
                </label>
                <label
                    class="flex items-center gap-2 cursor-pointer p-2 rounded hover:bg-[var(--bg-tertiary)] flex-1 border border-[var(--border-color)]"
                >
                    <input
                        id="sp-mode-ai"
                        name="sidePanelMode"
                        type="radio"
                        bind:group={sidePanelMode}
                        value="ai"
                        class="accent-[var(--accent-color)]"
                    />
                    <span class="text-sm">AI Chat</span>
                </label>
            </div>
        </div>
        <div class="flex flex-col gap-1">
            <span class="text-sm font-medium"
                >{$_("settings.sidePanelLayout")}</span
            >
            <div class="flex flex-col gap-2">
                <label
                    class="flex items-center gap-2 cursor-pointer p-2 rounded hover:bg-[var(--bg-tertiary)] border border-[var(--border-color)]"
                >
                    <input
                        id="sp-layout-standard"
                        name="sidePanelLayout"
                        type="radio"
                        bind:group={sidePanelLayout}
                        value="standard"
                        class="accent-[var(--accent-color)]"
                    />
                    <div class="flex flex-col">
                        <span class="text-sm"
                            >{$_("settings.layoutStandard")}</span
                        >
                        <span class="text-[10px] text-[var(--text-secondary)]"
                            >{$_("settings.layoutStandardDesc")}</span
                        >
                    </div>
                </label>
                <label
                    class="flex items-center gap-2 cursor-pointer p-2 rounded hover:bg-[var(--bg-tertiary)] border border-[var(--border-color)]"
                >
                    <input
                        id="sp-layout-transparent"
                        name="sidePanelLayout"
                        type="radio"
                        bind:group={sidePanelLayout}
                        value="transparent"
                        class="accent-[var(--accent-color)]"
                    />
                    <div class="flex flex-col">
                        <span class="text-sm"
                            >{$_("settings.layoutTransparent")}</span
                        >
                        <span class="text-[10px] text-[var(--text-secondary)]"
                            >{$_("settings.layoutTransparentDesc")}</span
                        >
                    </div>
                </label>
                <label
                    class="flex items-center gap-2 cursor-pointer p-2 rounded hover:bg-[var(--bg-tertiary)] border border-[var(--border-color)]"
                >
                    <input
                        id="sp-layout-floating"
                        name="sidePanelLayout"
                        type="radio"
                        bind:group={sidePanelLayout}
                        value="floating"
                        class="accent-[var(--accent-color)]"
                    />
                    <div class="flex flex-col">
                        <span class="text-sm"
                            >{$_("settings.layoutFloating")}</span
                        >
                        <span class="text-[10px] text-[var(--text-secondary)]"
                            >{$_("settings.layoutFloatingDesc")}</span
                        >
                    </div>
                </label>
            </div>
        </div>
    </div>
    <label
        class="flex items-center justify-between p-2 rounded hover:bg-[var(--bg-tertiary)] cursor-pointer border border-[var(--border-color)]"
    >
        <span class="text-sm font-medium"
            >{$_("settings.hideUnfilledOrders")}</span
        >
        <input
            id="hide-unfilled"
            name="hideUnfilledOrders"
            type="checkbox"
            bind:checked={hideUnfilledOrders}
            class="accent-[var(--accent-color)] h-4 w-4 rounded"
        />
    </label>
    <div class="flex flex-col gap-1">
        <label for="pos-view-mode" class="text-sm font-medium"
            >Position View Mode</label
        >
        <select
            id="pos-view-mode"
            name="positionViewMode"
            bind:value={positionViewMode}
            class="input-field p-2 rounded border border-[var(--border-color)] bg-[var(--bg-secondary)]"
        >
            <option value="detailed">Detailed (Default)</option>
            <option value="focus">Focus (Compact)</option>
        </select>
    </div>
</div>
