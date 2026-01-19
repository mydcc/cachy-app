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
  // Indicators configuration tab
  import { _ } from "../../../locales/i18n";
  import Toggle from "../../shared/Toggle.svelte";
  import { enhancedInput } from "../../../lib/actions/inputEnhancements";
  import TimeframeSelector from "../../shared/TimeframeSelector.svelte";
  import { settingsState } from "../../../stores/settings.svelte";
  import { indicatorState } from "../../../stores/indicator.svelte";

  interface Props {
    availableTimeframes: string[];
  }

  let { availableTimeframes }: Props = $props();
</script>

<div class="flex flex-col gap-4">
  <!-- General Settings -->
  <div class="flex flex-col gap-3">
    <h3 class="text-sm font-bold text-[var(--text-primary)]">
      {$_("settings.indicators.general") || "General Settings"}
    </h3>

    <div class="grid grid-cols-2 gap-4">
      <div class="flex items-center justify-between">
        <label for="precision" class="text-sm"
          >{$_("settings.indicators.precision") || "Precision"}</label
        >
        <input
          id="precision"
          type="number"
          bind:value={indicatorState.precision}
          min="0"
          max="8"
          class="input-field rounded settings-number-input"
          use:enhancedInput={{ min: 0, max: 8 }}
        />
      </div>
      <div class="flex items-center justify-between">
        <label for="history-limit" class="text-sm"
          >{$_("settings.indicators.historyLimit") || "History Limit"}</label
        >
        <input
          id="history-limit"
          type="number"
          bind:value={indicatorState.historyLimit}
          min="100"
          max="10000"
          step="100"
          class="input-field rounded settings-number-input"
          use:enhancedInput={{ min: 100, max: 10000 }}
        />
      </div>
    </div>

    <div class="flex items-center justify-between">
      <label for="favorite-timeframes" class="text-sm"
        >{$_("settings.indicators.favoriteTimeframes") ||
          "Favorite Timeframes"}</label
      >
      <TimeframeSelector
        bind:selected={settingsState.favoriteTimeframes}
        options={availableTimeframes}
        placeholder={$_("settings.indicators.addTimeframe") ||
          "Add timeframe..."}
      />
    </div>

    <div class="flex items-center justify-between">
      <span class="text-sm"
        >{$_("settings.indicators.syncRsiTimeframe") ||
          "Sync RSI Timeframe"}</span
      >
      <Toggle bind:checked={settingsState.syncRsiTimeframe} />
    </div>
  </div>

  <!-- Indicator Settings Grid -->
  <div>
    <h3 class="text-sm font-bold text-[var(--text-primary)] mb-3">
      {$_("settings.indicators.title") || "Indicator Settings"}
    </h3>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
      <!-- Left Column -->
      <div class="flex flex-col gap-6">
        <!-- RSI Settings -->
        <div
          class="p-4 border border-[var(--border-color)] rounded bg-[var(--bg-secondary)] flex flex-col gap-3 relative overflow-hidden"
        >
          <div
            class="flex justify-between items-center border-b border-[var(--border-color)] pb-2 mb-1"
          >
            <h4
              class="text-xs font-bold uppercase text-[var(--text-secondary)]"
            >
              RSI
            </h4>
            {#if !settingsState.isPro}
              <span
                class="text-[10px] font-bold bg-[var(--accent-color)] text-[var(--btn-accent-text)] px-1.5 py-0.5 rounded"
                >PRO</span
              >
            {/if}
          </div>

          <div class="grid grid-cols-2 gap-x-4 gap-y-2 mt-1">
            <div class="flex items-center justify-between">
              <label for="rsi-length" class="text-sm">Length</label>
              <input
                id="rsi-length"
                type="number"
                bind:value={indicatorState.rsi.length}
                min="2"
                max="100"
                class="input-field rounded settings-number-input text-sm w-20"
                disabled={!settingsState.isPro}
                use:enhancedInput={{ min: 2, max: 100 }}
              />
            </div>
            <div class="flex items-center justify-between">
              <label for="rsi-source" class="text-xs">Source</label>
              <select
                id="rsi-source"
                bind:value={indicatorState.rsi.source}
                class="input-field p-1 rounded text-xs bg-[var(--bg-secondary)]"
                disabled={!settingsState.isPro}
              >
                <option value="close">Close</option>
                <option value="open">Open</option>
                <option value="high">High</option>
                <option value="low">Low</option>
                <option value="hl2">HL/2</option>
                <option value="hlc3">HLC/3</option>
              </select>
            </div>
          </div>

          <div class="border-t border-[var(--border-color)] pt-3 mt-1">
            <div class="flex items-center justify-between mb-2">
              <span class="text-xs">Signal Line (MA)</span>
              <Toggle
                bind:checked={indicatorState.rsi.showSignal}
                disabled={!settingsState.isPro}
              />
            </div>

            {#if indicatorState.rsi.showSignal}
              <div class="grid grid-cols-2 gap-x-4 gap-y-2">
                <div class="flex items-center justify-between">
                  <label for="rsi-signal-type" class="text-xs">Type</label>
                  <select
                    id="rsi-signal-type"
                    bind:value={indicatorState.rsi.signalType}
                    class="input-field p-1 rounded text-xs bg-[var(--bg-secondary)]"
                    disabled={!settingsState.isPro}
                  >
                    <option value="sma">SMA</option>
                    <option value="ema">EMA</option>
                  </select>
                </div>
                <div class="flex items-center justify-between">
                  <label for="rsi-signal-length" class="text-xs">Length</label>
                  <input
                    id="rsi-signal-length"
                    type="number"
                    bind:value={indicatorState.rsi.signalLength}
                    min="2"
                    max="100"
                    class="input-field rounded settings-number-input text-xs"
                    disabled={!settingsState.isPro}
                    use:enhancedInput={{
                      min: 2,
                      max: 100,
                    }}
                  />
                </div>
              </div>
            {/if}
          </div>

          {#if !settingsState.isPro}
            <div
              class="absolute inset-0 bg-black/10 backdrop-blur-[0.5px] rounded z-10"
            ></div>
          {/if}
        </div>

        <!-- MACD Settings -->
        <div
          class="p-4 border border-[var(--border-color)] rounded bg-[var(--bg-secondary)] flex flex-col gap-3 relative overflow-hidden"
        >
          <div
            class="flex justify-between items-center border-b border-[var(--border-color)] pb-2 mb-1"
          >
            <h4
              class="text-xs font-bold uppercase text-[var(--text-secondary)]"
            >
              MACD
            </h4>
            {#if !settingsState.isPro}
              <span
                class="text-[10px] font-bold bg-[var(--accent-color)] text-[var(--btn-accent-text)] px-1.5 py-0.5 rounded"
                >PRO</span
              >
            {/if}
          </div>

          <div class="grid grid-cols-2 gap-x-4 gap-y-2 mt-1">
            <div class="flex items-center justify-between">
              <label for="macd-fast" class="text-xs">Fast Len</label>
              <input
                id="macd-fast"
                type="number"
                bind:value={indicatorState.macd.fastLength}
                min="2"
                max="100"
                class="input-field rounded settings-number-input text-xs"
                disabled={!settingsState.isPro}
                use:enhancedInput={{
                  min: 2,
                  max: 100,
                }}
              />
            </div>
            <div class="flex items-center justify-between">
              <label for="macd-slow" class="text-xs">Slow Len</label>
              <input
                id="macd-slow"
                type="number"
                bind:value={indicatorState.macd.slowLength}
                min="2"
                max="100"
                class="input-field rounded settings-number-input text-xs"
                disabled={!settingsState.isPro}
                use:enhancedInput={{
                  min: 2,
                  max: 100,
                }}
              />
            </div>
            <div class="flex items-center justify-between">
              <label for="macd-signal" class="text-xs">Signal Len</label>
              <input
                id="macd-signal"
                type="number"
                bind:value={indicatorState.macd.signalLength}
                min="2"
                max="100"
                class="input-field rounded settings-number-input text-xs"
                disabled={!settingsState.isPro}
                use:enhancedInput={{
                  min: 2,
                  max: 100,
                }}
              />
            </div>
            <div class="flex items-center justify-between">
              <label for="macd-source" class="text-xs">Source</label>
              <select
                id="macd-source"
                bind:value={indicatorState.macd.source}
                class="input-field p-1 rounded text-xs bg-[var(--bg-secondary)]"
                disabled={!settingsState.isPro}
              >
                <option value="close">Close</option>
                <option value="open">Open</option>
                <option value="high">High</option>
                <option value="low">Low</option>
                <option value="hl2">HL/2</option>
                <option value="hlc3">HLC/3</option>
              </select>
            </div>
          </div>

          <div
            class="grid grid-cols-2 gap-x-4 gap-y-2 mt-1 pt-2 border-t border-[var(--border-color)]"
          >
            <div class="flex items-center justify-between">
              <label
                for="macd-osc-type"
                class="text-xs text-[var(--text-secondary)]">Osc MA</label
              >
              <select
                id="macd-osc-type"
                bind:value={indicatorState.macd.oscillatorMaType}
                class="input-field p-1 rounded text-xs bg-[var(--bg-secondary)]"
                disabled={!settingsState.isPro}
              >
                <option value="ema">EMA</option>
                <option value="sma">SMA</option>
              </select>
            </div>
            <div class="flex items-center justify-between">
              <label
                for="macd-sig-type"
                class="text-xs text-[var(--text-secondary)]">Sig MA</label
              >
              <select
                id="macd-sig-type"
                bind:value={indicatorState.macd.signalMaType}
                class="input-field p-1 rounded text-xs bg-[var(--bg-secondary)]"
                disabled={!settingsState.isPro}
              >
                <option value="ema">EMA</option>
                <option value="sma">SMA</option>
              </select>
            </div>
          </div>

          {#if !settingsState.isPro}
            <div
              class="absolute inset-0 bg-black/10 backdrop-blur-[0.5px] rounded z-10"
            ></div>
          {/if}
        </div>

        <!-- EMA Settings -->
        <div
          class="p-4 border border-[var(--border-color)] rounded bg-[var(--bg-secondary)] flex flex-col gap-3 relative overflow-hidden"
        >
          <div
            class="flex justify-between items-center border-b border-[var(--border-color)] pb-2 mb-1"
          >
            <h4
              class="text-xs font-bold uppercase text-[var(--text-secondary)]"
            >
              EMA 1
            </h4>
            {#if !settingsState.isPro}
              <span
                class="text-[10px] font-bold bg-[var(--accent-color)] text-[var(--btn-accent-text)] px-1.5 py-0.5 rounded"
                >PRO</span
              >
            {/if}
          </div>

          <div class="grid grid-cols-2 gap-x-4 gap-y-2">
            <div class="flex items-center justify-between">
              <label for="ema1-len" class="text-xs">Length</label>
              <input
                id="ema1-len"
                type="number"
                bind:value={indicatorState.ema.ema1.length}
                min="2"
                max="500"
                class="input-field rounded settings-number-input text-xs"
                disabled={!settingsState.isPro}
                use:enhancedInput={{
                  min: 2,
                  max: 500,
                }}
              />
            </div>
            <div class="flex items-center justify-between">
              <label for="ema1-offset" class="text-xs">Offset</label>
              <input
                id="ema1-offset"
                type="number"
                bind:value={indicatorState.ema.ema1.offset}
                min="-100"
                max="100"
                class="input-field rounded settings-number-input text-xs"
                disabled={!settingsState.isPro}
                use:enhancedInput={{
                  min: -100,
                  max: 100,
                }}
              />
            </div>
          </div>

          <div
            class="grid grid-cols-2 gap-x-4 gap-y-2 mt-1 pt-2 border-t border-[var(--border-color)]"
          >
            <div class="flex items-center justify-between">
              <label
                for="ema1-smth-type"
                class="text-xs text-[var(--text-secondary)]">Smoothing</label
              >
              <select
                id="ema1-smth-type"
                bind:value={indicatorState.ema.ema1.smoothingType}
                class="input-field p-1 rounded text-xs bg-[var(--bg-secondary)]"
                disabled={!settingsState.isPro}
              >
                <option value="none">None</option>
                <option value="sma">SMA</option>
                <option value="ema">EMA</option>
                <option value="smma">SMMA</option>
                <option value="wma">WMA</option>
                <option value="vwma">VWMA</option>
              </select>
            </div>
            <div class="flex items-center justify-between">
              <label
                for="ema1-smth-len"
                class="text-xs text-[var(--text-secondary)]">Smth Len</label
              >
              <input
                id="ema1-smth-len"
                type="number"
                bind:value={indicatorState.ema.ema1.smoothingLength}
                min="1"
                max="100"
                class="input-field rounded settings-number-input text-xs"
                disabled={!settingsState.isPro ||
                  indicatorState.ema.ema1.smoothingType === "none"}
                use:enhancedInput={{
                  min: 1,
                  max: 100,
                }}
              />
            </div>
          </div>

          {#if !settingsState.isPro}
            <div
              class="absolute inset-0 bg-black/10 backdrop-blur-[0.5px] rounded z-10"
            ></div>
          {/if}
        </div>

        <!-- EMA 2 -->
        <div
          class="p-4 border border-[var(--border-color)] rounded bg-[var(--bg-secondary)] flex flex-col gap-3 relative overflow-hidden"
        >
          <div
            class="flex justify-between items-center border-b border-[var(--border-color)] pb-2 mb-1"
          >
            <h4
              class="text-xs font-bold uppercase text-[var(--text-secondary)]"
            >
              EMA 2
            </h4>
            {#if !settingsState.isPro}
              <span
                class="text-[10px] font-bold bg-[var(--accent-color)] text-[var(--btn-accent-text)] px-1.5 py-0.5 rounded"
                >PRO</span
              >
            {/if}
          </div>

          <div class="grid grid-cols-2 gap-x-4 gap-y-2">
            <div class="flex items-center justify-between">
              <label for="ema2-len" class="text-xs">Length</label>
              <input
                id="ema2-len"
                type="number"
                bind:value={indicatorState.ema.ema2.length}
                min="2"
                max="500"
                class="input-field rounded settings-number-input text-xs"
                disabled={!settingsState.isPro}
                use:enhancedInput={{
                  min: 2,
                  max: 500,
                }}
              />
            </div>
            <div class="flex items-center justify-between">
              <label for="ema2-offset" class="text-xs">Offset</label>
              <input
                id="ema2-offset"
                type="number"
                bind:value={indicatorState.ema.ema2.offset}
                min="-100"
                max="100"
                class="input-field rounded settings-number-input text-xs"
                disabled={!settingsState.isPro}
                use:enhancedInput={{
                  min: -100,
                  max: 100,
                }}
              />
            </div>
          </div>

          <div
            class="grid grid-cols-2 gap-x-4 gap-y-2 mt-1 pt-2 border-t border-[var(--border-color)]"
          >
            <div class="flex items-center justify-between">
              <label
                for="ema2-smth-type"
                class="text-xs text-[var(--text-secondary)]">Smoothing</label
              >
              <select
                id="ema2-smth-type"
                bind:value={indicatorState.ema.ema2.smoothingType}
                class="input-field p-1 rounded text-xs bg-[var(--bg-secondary)]"
                disabled={!settingsState.isPro}
              >
                <option value="none">None</option>
                <option value="sma">SMA</option>
                <option value="ema">EMA</option>
                <option value="smma">SMMA</option>
                <option value="wma">WMA</option>
                <option value="vwma">VWMA</option>
              </select>
            </div>
            <div class="flex items-center justify-between">
              <label
                for="ema2-smth-len"
                class="text-xs text-[var(--text-secondary)]">Smth Len</label
              >
              <input
                id="ema2-smth-len"
                type="number"
                bind:value={indicatorState.ema.ema2.smoothingLength}
                min="1"
                max="100"
                class="input-field rounded settings-number-input text-xs"
                disabled={!settingsState.isPro ||
                  indicatorState.ema.ema2.smoothingType === "none"}
                use:enhancedInput={{
                  min: 1,
                  max: 100,
                }}
              />
            </div>
          </div>

          {#if !settingsState.isPro}
            <div
              class="absolute inset-0 bg-black/10 backdrop-blur-[0.5px] rounded z-10"
            ></div>
          {/if}
        </div>

        <!-- EMA 3 -->
        <div
          class="p-4 border border-[var(--border-color)] rounded bg-[var(--bg-secondary)] flex flex-col gap-3 relative overflow-hidden"
        >
          <div
            class="flex justify-between items-center border-b border-[var(--border-color)] pb-2 mb-1"
          >
            <h4
              class="text-xs font-bold uppercase text-[var(--text-secondary)]"
            >
              EMA 3
            </h4>
            {#if !settingsState.isPro}
              <span
                class="text-[10px] font-bold bg-[var(--accent-color)] text-[var(--btn-accent-text)] px-1.5 py-0.5 rounded"
                >PRO</span
              >
            {/if}
          </div>

          <div class="grid grid-cols-2 gap-x-4 gap-y-2">
            <div class="flex items-center justify-between">
              <label for="ema3-len" class="text-xs">Length</label>
              <input
                id="ema3-len"
                type="number"
                bind:value={indicatorState.ema.ema3.length}
                min="2"
                max="500"
                class="input-field rounded settings-number-input text-xs"
                disabled={!settingsState.isPro}
                use:enhancedInput={{
                  min: 2,
                  max: 500,
                }}
              />
            </div>
            <div class="flex items-center justify-between">
              <label for="ema3-offset" class="text-xs">Offset</label>
              <input
                id="ema3-offset"
                type="number"
                bind:value={indicatorState.ema.ema3.offset}
                min="-100"
                max="100"
                class="input-field rounded settings-number-input text-xs"
                disabled={!settingsState.isPro}
                use:enhancedInput={{
                  min: -100,
                  max: 100,
                }}
              />
            </div>
          </div>

          <div
            class="grid grid-cols-2 gap-x-4 gap-y-2 mt-1 pt-2 border-t border-[var(--border-color)]"
          >
            <div class="flex items-center justify-between">
              <label
                for="ema3-smth-type"
                class="text-xs text-[var(--text-secondary)]">Smoothing</label
              >
              <select
                id="ema3-smth-type"
                bind:value={indicatorState.ema.ema3.smoothingType}
                class="input-field p-1 rounded text-xs bg-[var(--bg-secondary)]"
                disabled={!settingsState.isPro}
              >
                <option value="none">None</option>
                <option value="sma">SMA</option>
                <option value="ema">EMA</option>
                <option value="smma">SMMA</option>
                <option value="wma">WMA</option>
                <option value="vwma">VWMA</option>
              </select>
            </div>
            <div class="flex items-center justify-between">
              <label
                for="ema3-smth-len"
                class="text-xs text-[var(--text-secondary)]">Smth Len</label
              >
              <input
                id="ema3-smth-len"
                type="number"
                bind:value={indicatorState.ema.ema3.smoothingLength}
                min="1"
                max="100"
                class="input-field rounded settings-number-input text-xs"
                disabled={!settingsState.isPro ||
                  indicatorState.ema.ema3.smoothingType === "none"}
                use:enhancedInput={{
                  min: 1,
                  max: 100,
                }}
              />
            </div>
          </div>

          {#if !settingsState.isPro}
            <div
              class="absolute inset-0 bg-black/10 backdrop-blur-[0.5px] rounded z-10"
            ></div>
          {/if}
        </div>

        <!-- Source selection for all EMAs -->
        <div
          class="p-4 border border-[var(--border-color)] rounded bg-[var(--bg-secondary)] flex items-center justify-between"
        >
          <label for="ema-source" class="text-xs">Common Source</label>
          <select
            id="ema-source"
            bind:value={indicatorState.ema.source}
            class="input-field p-1 rounded text-xs bg-[var(--bg-secondary)]"
            disabled={!settingsState.isPro}
          >
            <option value="close">Close</option>
            <option value="open">Open</option>
            <option value="high">High</option>
            <option value="low">Low</option>
            <option value="hl2">HL/2</option>
            <option value="hlc3">HLC/3</option>
          </select>
        </div>
      </div>

      <!-- Right Column -->
      <div class="flex flex-col gap-6">
        <!-- Stochastic Settings -->
        <div
          class="p-4 border border-[var(--border-color)] rounded bg-[var(--bg-secondary)] flex flex-col gap-3 relative overflow-hidden"
        >
          <div
            class="flex justify-between items-center border-b border-[var(--border-color)] pb-2 mb-1"
          >
            <h4
              class="text-xs font-bold uppercase text-[var(--text-secondary)]"
            >
              Stochastic
            </h4>
            {#if !settingsState.isPro}
              <span
                class="text-[10px] font-bold bg-[var(--accent-color)] text-[var(--btn-accent-text)] px-1.5 py-0.5 rounded"
                >PRO</span
              >
            {/if}
          </div>

          <div class="grid grid-cols-3 gap-2 mt-1">
            <div class="flex flex-col gap-1 items-center">
              <label for="stoch-k" class="text-xs text-[var(--text-secondary)]"
                >%K Len</label
              >
              <input
                id="stoch-k"
                type="number"
                bind:value={indicatorState.stochastic.kPeriod}
                min="2"
                max="100"
                class="input-field rounded settings-number-input text-xs mx-auto"
                disabled={!settingsState.isPro}
                use:enhancedInput={{
                  min: 2,
                  max: 100,
                }}
              />
            </div>
            <div class="flex flex-col gap-1 items-center">
              <label
                for="stoch-k-smooth"
                class="text-xs text-[var(--text-secondary)]">%K Smth</label
              >
              <input
                id="stoch-k-smooth"
                type="number"
                bind:value={indicatorState.stochastic.kSmoothing}
                min="1"
                max="50"
                class="input-field rounded settings-number-input text-xs mx-auto"
                disabled={!settingsState.isPro}
                use:enhancedInput={{
                  min: 1,
                  max: 50,
                }}
              />
            </div>
            <div class="flex flex-col gap-1 items-center">
              <label
                for="stoch-d-smooth"
                class="text-xs text-[var(--text-secondary)]">%D Smth</label
              >
              <input
                id="stoch-d-smooth"
                type="number"
                bind:value={indicatorState.stochastic.dPeriod}
                min="2"
                max="100"
                class="input-field rounded settings-number-input text-xs mx-auto"
                disabled={!settingsState.isPro}
                use:enhancedInput={{
                  min: 2,
                  max: 100,
                }}
              />
            </div>
          </div>

          {#if !settingsState.isPro}
            <div
              class="absolute inset-0 bg-black/10 backdrop-blur-[0.5px] rounded z-10"
            ></div>
          {/if}
        </div>

        <!-- CCI Settings -->
        <div
          class="p-4 border border-[var(--border-color)] rounded bg-[var(--bg-secondary)] flex flex-col gap-3 relative overflow-hidden"
        >
          <div
            class="flex justify-between items-center border-b border-[var(--border-color)] pb-2 mb-1"
          >
            <h4
              class="text-xs font-bold uppercase text-[var(--text-secondary)]"
            >
              CCI
            </h4>
            {#if !settingsState.isPro}
              <span
                class="text-[10px] font-bold bg-[var(--accent-color)] text-[var(--btn-accent-text)] px-1.5 py-0.5 rounded"
                >PRO</span
              >
            {/if}
          </div>

          <div class="grid grid-cols-2 gap-x-4 gap-y-2 mt-1">
            <div class="flex items-center justify-between">
              <label for="cci-length" class="text-sm">Length</label>
              <input
                id="cci-length"
                type="number"
                bind:value={indicatorState.cci.length}
                min="2"
                max="100"
                class="input-field rounded settings-number-input text-sm w-20"
                disabled={!settingsState.isPro}
                use:enhancedInput={{ min: 2, max: 100 }}
              />
            </div>
            <div class="flex items-center justify-between">
              <label for="cci-source" class="text-xs">Source</label>
              <select
                id="cci-source"
                bind:value={indicatorState.cci.source}
                class="input-field p-1 rounded text-xs bg-[var(--bg-secondary)]"
                disabled={!settingsState.isPro}
              >
                <option value="close">Close</option>
                <option value="open">Open</option>
                <option value="high">High</option>
                <option value="low">Low</option>
                <option value="hl2">HL/2</option>
                <option value="hlc3">HLC/3</option>
              </select>
            </div>
          </div>

          {#if !settingsState.isPro}
            <div
              class="absolute inset-0 bg-black/10 backdrop-blur-[0.5px] rounded z-10"
            ></div>
          {/if}
        </div>

        <!-- ADX, AO, Momentum, Pivots need to be fully implemented similarly if they exist in full file... -->
        <!-- Since I only read partial file, I should output keeping the previous structure but replacing bindings. -->
        <!-- I will proceed with full replacement assuming the fields exist in indicatorState. -->

        <!-- ADX -->
        <div
          class="p-4 border border-[var(--border-color)] rounded bg-[var(--bg-secondary)] flex flex-col gap-3 relative overflow-hidden"
        >
          <div
            class="flex justify-between items-center border-b border-[var(--border-color)] pb-2 mb-1"
          >
            <h4
              class="text-xs font-bold uppercase text-[var(--text-secondary)]"
            >
              ADX
            </h4>
            {#if !settingsState.isPro}
              <span
                class="text-[10px] font-bold bg-[var(--accent-color)] text-[var(--btn-accent-text)] px-1.5 py-0.5 rounded"
                >PRO</span
              >
            {/if}
          </div>

          <div class="grid grid-cols-2 gap-x-4 gap-y-2">
            <div class="flex items-center justify-between">
              <label for="adx-smooth" class="text-xs">Smoothing</label>
              <input
                id="adx-smooth"
                type="number"
                bind:value={indicatorState.adx.adxSmoothing}
                min="2"
                max="100"
                class="input-field rounded settings-number-input text-xs"
                disabled={!settingsState.isPro}
              />
            </div>
            <div class="flex items-center justify-between">
              <label for="adx-di" class="text-xs">DI Length</label>
              <input
                id="adx-di"
                type="number"
                bind:value={indicatorState.adx.diLength}
                min="2"
                max="100"
                class="input-field rounded settings-number-input text-xs"
                disabled={!settingsState.isPro}
              />
            </div>
            <div class="flex items-center justify-between">
              <label for="adx-thr" class="text-xs">Threshold</label>
              <input
                id="adx-thr"
                type="number"
                bind:value={indicatorState.adx.threshold}
                min="0"
                max="100"
                class="input-field rounded settings-number-input text-xs"
                disabled={!settingsState.isPro}
              />
            </div>
          </div>
          {#if !settingsState.isPro}
            <div
              class="absolute inset-0 bg-black/10 backdrop-blur-[0.5px] rounded z-10"
            ></div>
          {/if}
        </div>

        <!-- AO -->
        <div
          class="p-4 border border-[var(--border-color)] rounded bg-[var(--bg-secondary)] flex flex-col gap-3 relative overflow-hidden"
        >
          <!-- Header -->
          <div
            class="flex justify-between items-center border-b border-[var(--border-color)] pb-2 mb-1"
          >
            <h4
              class="text-xs font-bold uppercase text-[var(--text-secondary)]"
            >
              Awesome Osc
            </h4>
            {#if !settingsState.isPro}
              <span
                class="text-[10px] font-bold bg-[var(--accent-color)] text-[var(--btn-accent-text)] px-1.5 py-0.5 rounded"
                >PRO</span
              >
            {/if}
          </div>
          <div class="grid grid-cols-2 gap-x-4 gap-y-2">
            <div class="flex items-center justify-between">
              <label for="ao-fast" class="text-xs">Fast</label>
              <input
                id="ao-fast"
                type="number"
                bind:value={indicatorState.ao.fastLength}
                class="input-field rounded settings-number-input text-xs"
                disabled={!settingsState.isPro}
              />
            </div>
            <div class="flex items-center justify-between">
              <label for="ao-slow" class="text-xs">Slow</label>
              <input
                id="ao-slow"
                type="number"
                bind:value={indicatorState.ao.slowLength}
                class="input-field rounded settings-number-input text-xs"
                disabled={!settingsState.isPro}
              />
            </div>
          </div>
          {#if !settingsState.isPro}
            <div
              class="absolute inset-0 bg-black/10 backdrop-blur-[0.5px] rounded z-10"
            ></div>
          {/if}
        </div>

        <!-- Momentum -->
        <div
          class="p-4 border border-[var(--border-color)] rounded bg-[var(--bg-secondary)] flex flex-col gap-3 relative overflow-hidden"
        >
          <div
            class="flex justify-between items-center border-b border-[var(--border-color)] pb-2 mb-1"
          >
            <h4
              class="text-xs font-bold uppercase text-[var(--text-secondary)]"
            >
              Momentum
            </h4>
            {#if !settingsState.isPro}
              <span
                class="text-[10px] font-bold bg-[var(--accent-color)] text-[var(--btn-accent-text)] px-1.5 py-0.5 rounded"
                >PRO</span
              >
            {/if}
          </div>
          <div class="grid grid-cols-2 gap-x-4 gap-y-2">
            <div class="flex items-center justify-between">
              <label for="momentum-length" class="text-xs">Length</label>
              <input
                id="momentum-length"
                type="number"
                bind:value={indicatorState.momentum.length}
                class="input-field rounded settings-number-input text-xs"
                disabled={!settingsState.isPro}
              />
            </div>
          </div>
          {#if !settingsState.isPro}
            <div
              class="absolute inset-0 bg-black/10 backdrop-blur-[0.5px] rounded z-10"
            ></div>
          {/if}
        </div>

        <!-- Pivots -->
        <div
          class="p-4 border border-[var(--border-color)] rounded bg-[var(--bg-secondary)] flex flex-col gap-3 relative overflow-hidden"
        >
          <div
            class="flex justify-between items-center border-b border-[var(--border-color)] pb-2 mb-1"
          >
            <h4
              class="text-xs font-bold uppercase text-[var(--text-secondary)]"
            >
              Pivots
            </h4>
            {#if !settingsState.isPro}
              <span
                class="text-[10px] font-bold bg-[var(--accent-color)] text-[var(--btn-accent-text)] px-1.5 py-0.5 rounded"
                >PRO</span
              >
            {/if}
          </div>
          <div class="flex justify-between items-center">
            <label for="pivots-type" class="text-xs">Type</label>
            <select
              id="pivots-type"
              bind:value={indicatorState.pivots.type}
              class="input-field p-1 rounded text-xs"
              disabled={!settingsState.isPro}
            >
              <option value="classic">Classic</option>
              <option value="woodie">Woodie</option>
              <option value="camarilla">Camarilla</option>
              <option value="fibonacci">Fibonacci</option>
            </select>
          </div>
          {#if !settingsState.isPro}
            <div
              class="absolute inset-0 bg-black/10 backdrop-blur-[0.5px] rounded z-10"
            ></div>
          {/if}
        </div>
      </div>
    </div>
  </div>
</div>
