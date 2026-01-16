<script lang="ts">
  import { _ } from "../../../locales/i18n";
  import type { SidePanelLayout } from "../../../stores/settingsStore";

  interface Props {
    showSidebars: boolean;
    showTechnicals: boolean;
    showIndicatorParams: boolean;
    hideUnfilledOrders: boolean;
    positionViewMode: "detailed" | "focus";
    enableSidePanel: boolean;
    sidePanelMode: "chat" | "notes" | "ai";
    sidePanelLayout: SidePanelLayout;
    chatStyle: "minimal" | "bubble" | "terminal";
  }

  let {
    showSidebars = $bindable(),
    showTechnicals = $bindable(),
    showIndicatorParams = $bindable(),
    hideUnfilledOrders = $bindable(),
    positionViewMode = $bindable(),
    enableSidePanel = $bindable(),
    sidePanelMode = $bindable(),
    sidePanelLayout = $bindable(),
    chatStyle = $bindable(),
  }: Props = $props();
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
      <span class="text-xs text-[var(--text-secondary)]"
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
      <span class="text-sm font-medium">{$_("settings.enableSidePanel")}</span>
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
      <span class="text-sm font-medium">{$_("settings.sidePanelMode")}</span>
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
      <span class="text-sm font-medium">{$_("settings.sidePanelLayout")}</span>
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
            <span class="text-sm">{$_("settings.layoutStandard")}</span>
            <span class="text-xs text-[var(--text-secondary)]"
              >{$_("settings.layoutStandardDesc")}</span
            >
          </div>
        </label>
        <label
          class="flex items-center gap-2 cursor-pointer p-2 rounded hover:bg-[var(--bg-tertiary)] border border-[var(--border-color)]"
        >
          <input
            id="sp-layout-console"
            name="sidePanelLayout"
            type="radio"
            bind:group={sidePanelLayout}
            value="console"
            class="accent-[var(--accent-color)]"
          />
          <div class="flex flex-col">
            <span class="text-sm">Console / Terminal</span>
            <span class="text-xs text-[var(--text-secondary)]"
              >Full-width panel anchored at the bottom</span
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
            <span class="text-sm">{$_("settings.layoutFloating")}</span>
            <span class="text-xs text-[var(--text-secondary)]"
              >{$_("settings.layoutFloatingDesc")}</span
            >
          </div>
        </label>
      </div>
    </div>

    <!-- Chat Style Selector -->
    <div
      class="flex flex-col gap-1 mt-2 pt-2 border-t border-[var(--border-color)]"
    >
      <span class="text-sm font-medium">Chat Design Theme</span>
      <div class="grid grid-cols-3 gap-2">
        <label
          class="flex flex-col items-center gap-2 cursor-pointer p-2 rounded hover:bg-[var(--bg-tertiary)] border border-[var(--border-color)] text-center transition-all bg-[var(--bg-primary)]"
          class:ring-2={chatStyle === "minimal"}
          class:ring-[var(--accent-color)]={chatStyle === "minimal"}
        >
          <input
            type="radio"
            bind:group={chatStyle}
            value="minimal"
            class="sr-only"
          />
          <div
            class="w-full h-8 bg-[var(--bg-secondary)] rounded flex items-center justify-center border border-[var(--border-color)]"
          >
            <div class="w-1/2 h-1 bg-[var(--text-tertiary)] rounded-full"></div>
          </div>
          <span class="text-xs font-medium">Minimal</span>
        </label>

        <label
          class="flex flex-col items-center gap-2 cursor-pointer p-2 rounded hover:bg-[var(--bg-tertiary)] border border-[var(--border-color)] text-center transition-all bg-[var(--bg-primary)]"
          class:ring-2={chatStyle === "bubble"}
          class:ring-[var(--accent-color)]={chatStyle === "bubble"}
        >
          <input
            type="radio"
            bind:group={chatStyle}
            value="bubble"
            class="sr-only"
          />
          <div
            class="w-full h-8 bg-[var(--bg-secondary)] rounded flex items-center justify-center relative overflow-hidden border border-[var(--border-color)]"
          >
            <div
              class="absolute right-1 top-2 w-4 h-3 bg-[var(--accent-color)] opacity-80 rounded-l-lg rounded-tr-sm"
            ></div>
            <div
              class="absolute left-1 bottom-2 w-4 h-3 bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-r-lg rounded-tl-sm"
            ></div>
          </div>
          <span class="text-xs font-medium">Bubbles</span>
        </label>

        <label
          class="flex flex-col items-center gap-2 cursor-pointer p-2 rounded hover:bg-[var(--bg-tertiary)] border border-[var(--border-color)] text-center transition-all bg-[var(--bg-primary)]"
          class:ring-2={chatStyle === "terminal"}
          class:ring-[var(--accent-color)]={chatStyle === "terminal"}
        >
          <input
            type="radio"
            bind:group={chatStyle}
            value="terminal"
            class="sr-only"
          />
          <div
            class="w-full h-8 bg-black rounded flex items-center justify-center border border-green-900 font-mono text-[8px] text-green-500"
          >
            >_
          </div>
          <span class="text-xs font-medium">Terminal</span>
        </label>
      </div>
    </div>
  </div>
  <label
    class="flex items-center justify-between p-2 rounded hover:bg-[var(--bg-tertiary)] cursor-pointer border border-[var(--border-color)]"
  >
    <span class="text-sm font-medium">{$_("settings.hideUnfilledOrders")}</span>
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
