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
  import type { HotkeyMode } from "../../../stores/settingsStore";
  import { enhancedInput } from "../../../lib/actions/inputEnhancements";

  interface Props {
    showSpinButtons: boolean | "hover";
    marketDataInterval?: number;
    autoUpdatePriceInput?: boolean;
    autoFetchBalance?: boolean;
    hotkeyMode?: HotkeyMode;
    enableGlassmorphism?: boolean;
    activeDescriptions?: Array<{ keys: string; action: string }>;
  }

  let {
    showSpinButtons = $bindable(),
    marketDataInterval = $bindable(10),
    autoUpdatePriceInput = $bindable(false),
    autoFetchBalance = $bindable(false),
    hotkeyMode = $bindable("mode1"),
    enableGlassmorphism = $bindable(true),
    activeDescriptions = [],
  }: Props = $props();
</script>

<div class="flex flex-col gap-3" role="tabpanel" id="tab-behavior">
  <!-- Spin Buttons Segmented Control -->
  <div
    class="settings-group p-4 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-color)]"
  >
    <div class="flex justify-between items-center mb-3">
      <div class="flex flex-col">
        <span class="text-sm font-bold text-[var(--text-primary)]"
          >{$_("settings.showSpinButtons")}</span
        >
        <span
          class="text-[10px] text-[var(--text-secondary)] opacity-80 uppercase tracking-tight"
          >Sichtbarkeit der Scroll-Buttons</span
        >
      </div>
    </div>

    <div
      class="segmented-control flex p-1 bg-[var(--bg-primary)] rounded-lg border border-[var(--border-color)] relative h-9"
    >
      {#each [{ value: true, label: $_("settings.spinButtonsAlways") }, { value: "hover", label: $_("settings.spinButtonsHover") }, { value: false, label: $_("settings.spinButtonsHidden") }] as opt}
        <button
          class="flex-1 text-[11px] font-medium transition-all duration-200 rounded-md z-10
                 {showSpinButtons === opt.value
            ? 'text-[var(--btn-accent-text)]'
            : 'text-[var(--text-secondary)]'}"
          onclick={() => (showSpinButtons = opt.value as any)}
        >
          {opt.label}
        </button>
      {/each}

      <!-- Sliding indicator background -->
      <div
        class="bg-[var(--accent-color)] absolute top-1 bottom-1 rounded-md transition-all duration-300 ease-out"
        style="
          width: calc(33.33% - 2.66px); 
          left: {showSpinButtons === true
          ? '4px'
          : showSpinButtons === 'hover'
            ? '33.33%'
            : '66.66%'};
          transform: translateX({showSpinButtons === true ? '0' : '0'});
        "
      ></div>
    </div>
  </div>

  <!-- Interval Setting (Compact) -->
  <div
    class="settings-group p-4 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-color)]"
  >
    <div class="flex justify-between items-center gap-4">
      <div class="flex flex-col flex-1">
        <span class="text-sm font-bold text-[var(--text-primary)]"
          >{$_("settings.intervalLabel")}</span
        >
        <span class="text-[10px] text-[var(--text-secondary)]"
          >Wartezeit zwischen Updates</span
        >
      </div>

      <div class="relative w-24">
        <input
          id="market-data-interval"
          type="number"
          min="1"
          max="600"
          bind:value={marketDataInterval}
          use:enhancedInput={{ showSpinButtons: "hover" }}
          class="w-full bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg py-1 px-2 pr-6 text-right font-mono text-sm focus:border-[var(--accent-color)] outline-none"
        />
        <span
          class="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-[var(--text-secondary)] font-mono"
          >s</span
        >
      </div>
    </div>

    {#if marketDataInterval && marketDataInterval < 5}
      <div
        class="mt-2 text-[10px] text-orange-400 bg-orange-400/5 p-2 rounded-md border border-orange-400/10"
      >
        Aggressiv: Kann zu Rate-Limits führen.
      </div>
    {/if}
  </div>

  <!-- Toggles Section -->
  <div
    class="settings-group p-3 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-color)] flex flex-col gap-1"
  >
    <!-- Auto Price Update -->
    <button
      class="flex items-center justify-between p-2 rounded-lg hover:bg-[var(--bg-tertiary)] transition-colors group text-left"
      onclick={() => (autoUpdatePriceInput = !autoUpdatePriceInput)}
    >
      <div class="flex flex-col">
        <span class="text-sm font-medium">{$_("settings.autoUpdatePrice")}</span
        >
        <span class="text-[10px] text-[var(--text-secondary)] opacity-70"
          >Overwrite price on tick</span
        >
      </div>
      <div class="toggle-container {autoUpdatePriceInput ? 'active' : ''}">
        <div class="toggle-thumb"></div>
      </div>
    </button>

    <div class="h-px bg-[var(--border-color)] mx-2 opacity-30"></div>

    <!-- Auto Balance Fetch -->
    <button
      class="flex items-center justify-between p-2 rounded-lg hover:bg-[var(--bg-tertiary)] transition-colors group text-left"
      onclick={() => (autoFetchBalance = !autoFetchBalance)}
    >
      <div class="flex flex-col">
        <span class="text-sm font-medium"
          >{$_("settings.autoFetchBalance")}</span
        >
        <span class="text-[10px] text-[var(--text-secondary)] opacity-70"
          >Fetch balance on startup</span
        >
      </div>
      <div class="toggle-container {autoFetchBalance ? 'active' : ''}">
        <div class="toggle-thumb"></div>
      </div>
    </button>

    <div class="h-px bg-[var(--border-color)] mx-2 opacity-30"></div>

    <!-- Glassmorphism -->
    <button
      class="flex items-center justify-between p-2 rounded-lg hover:bg-[var(--bg-tertiary)] transition-colors group text-left"
      onclick={() => (enableGlassmorphism = !enableGlassmorphism)}
    >
      <div class="flex flex-col">
        <span class="text-sm font-medium">Glassmorphism</span>
        <span class="text-[10px] text-[var(--text-secondary)] opacity-70"
          >Enable translucent effects</span
        >
      </div>
      <div class="toggle-container {enableGlassmorphism ? 'active' : ''}">
        <div class="toggle-thumb"></div>
      </div>
    </button>
  </div>

  <!-- Hotkey Profile (Bottom) -->
  <div
    class="settings-group p-3 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-color)]"
  >
    <div class="flex flex-col gap-2">
      <label
        for="hotkey-mode"
        class="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider"
        >Hotkey Profile</label
      >
      <select
        id="hotkey-mode"
        name="hotkeyMode"
        bind:value={hotkeyMode}
        class="bg-[var(--bg-primary)] border border-[var(--border-color)] p-2 rounded-lg text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-color)]"
      >
        <option value="custom">Custom (Configurable)</option>
        <option value="mode2">Safety Mode (Alt + Key)</option>
        <option value="mode1">Direct Mode (Fast)</option>
        <option value="mode3">Hybrid Mode</option>
      </select>
    </div>

    {#if hotkeyMode !== "custom" && activeDescriptions.length > 0}
      <div
        class="mt-3 bg-[var(--bg-primary)]/50 rounded-lg p-3 border border-[var(--border-color)]"
      >
        <div
          class="text-[10px] font-bold text-[var(--accent-color)] uppercase mb-2"
        >
          Active Hotkeys ({activeDescriptions.length})
        </div>
        <div
          class="grid grid-cols-2 gap-x-3 gap-y-1 max-h-[120px] overflow-y-auto custom-scrollbar pr-1"
        >
          {#each activeDescriptions as desc}
            <div class="flex justify-between items-center text-[10px]">
              <span class="font-mono text-[var(--accent-color)] opacity-90"
                >{desc.keys}</span
              >
              <span class="text-[var(--text-secondary)] truncate ml-2"
                >{desc.action}</span
              >
            </div>
          {/each}
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
  .segmented-control {
    position: relative;
    user-select: none;
  }

  /* Compact Toggle Styles */
  .toggle-container {
    width: 32px;
    height: 18px;
    background-color: var(--bg-tertiary);
    border-radius: 20px;
    position: relative;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    border: 1px solid var(--border-color);
    flex-shrink: 0;
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
    top: 1px;
    left: 1px;
    transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
  }

  .active .toggle-thumb {
    transform: translateX(14px);
  }

  .settings-group {
    transition: transform 0.2s ease;
  }

  .settings-group:hover {
    border-color: rgba(var(--accent-rgb), 0.3);
  }

  .custom-scrollbar::-webkit-scrollbar {
    width: 3px;
  }
  .custom-scrollbar::-webkit-scrollbar-thumb {
    background: var(--border-color);
    border-radius: 10px;
  }
</style>
