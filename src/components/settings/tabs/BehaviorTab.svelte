<script lang="ts">
  import { _ } from "../../../locales/i18n";
  import type { HotkeyMode } from "../../../stores/settingsStore";
  import { enhancedInput } from "../../../lib/actions/inputEnhancements";

  export let showSpinButtons: boolean | "hover";
  export let marketDataInterval: number;
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
      <span class="text-xs text-[var(--text-secondary)] mb-2"
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

  <div
    class="flex flex-col gap-1 p-3 border border-[var(--border-color)] rounded bg-[var(--bg-secondary)]"
  >
    <div class="flex justify-between items-center mb-1">
      <label
        for="market-data-interval"
        class="text-sm font-bold text-[var(--accent-color)]"
        >{$_("settings.intervalLabel")}</label
      >
      <span
        class="text-xs font-mono px-2 py-0.5 rounded bg-[var(--bg-tertiary)] text-[var(--text-secondary)]"
      >
        {marketDataInterval}s
      </span>
    </div>

    <div class="flex flex-col gap-2">
      <div class="relative flex items-center">
        <input
          id="market-data-interval"
          type="number"
          min="1"
          max="600"
          bind:value={marketDataInterval}
          use:enhancedInput={{ showSpinButtons: "hover" }}
          class="input-field w-full p-2 pr-10 rounded border border-[var(--border-color)] bg-[var(--bg-primary)] text-right font-mono"
        />
        <span
          class="absolute right-3 text-xs text-[var(--text-secondary)] pointer-events-none"
          >s</span
        >
      </div>

      {#if marketDataInterval < 5}
        <div
          class="flex items-center gap-2 p-2 rounded bg-orange-500/10 border border-orange-500/20 text-orange-500 text-[10px] leading-tight"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="w-4 h-4 shrink-0"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            ><path
              d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"
            /><path d="M12 9v4" /><path d="M12 17h.01" /></svg
          >
          <span
            ><strong>Aggressiv:</strong> Sehr niedrige Intervalle können die Systemlast
            erhöhen und zu Rate-Limits führen.</span
          >
        </div>
      {:else if marketDataInterval > 60}
        <div
          class="flex items-center gap-2 p-2 rounded bg-blue-500/10 border border-blue-500/20 text-blue-400 text-[10px] leading-tight"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="w-4 h-4 shrink-0"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            ><circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path
              d="M12 8h.01"
            /></svg
          >
          <span
            ><strong>Konservativ:</strong> Ideal für Swing-Trading und maximale Stabilität.</span
          >
        </div>
      {/if}

      <p class="text-[10px] text-[var(--text-secondary)] italic">
        Einstellbereich: 1 Sekunde bis 10 Minuten (600s).
      </p>
    </div>
  </div>
  <label
    class="flex items-center justify-between p-2 rounded hover:bg-[var(--bg-tertiary)] cursor-pointer"
  >
    <div class="flex flex-col">
      <span class="text-sm font-medium">{$_("settings.autoUpdatePrice")}</span>
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
      <span class="text-sm font-medium">{$_("settings.autoFetchBalance")}</span>
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
    <label for="hotkey-mode" class="text-sm font-medium">Hotkey Profile</label>
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
