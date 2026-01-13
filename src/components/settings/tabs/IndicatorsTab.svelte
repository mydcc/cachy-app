<script lang="ts">
  // Indicators configuration tab
  import { _ } from "../../../locales/i18n";
  import Toggle from "../../shared/Toggle.svelte";
  import { enhancedInput } from "../../../lib/actions/inputEnhancements";
  import type { IndicatorSettings } from "../../../stores/indicatorStore";

  export let precision: number;
  export let historyLimit: number;
  export let favoriteTimeframesInput: string;
  export let handleTimeframeInput: (e: Event) => void;
  export let handleTimeframeBlur: () => void;
  export let syncRsiTimeframe: boolean;
  export let isPro: boolean;
  export let rsiSettings: IndicatorSettings["rsi"];
  export let macdSettings: IndicatorSettings["macd"];
  export let emaSettings: IndicatorSettings["ema"];
  export let stochSettings: IndicatorSettings["stochastic"];
  export let cciSettings: IndicatorSettings["cci"];
  export let adxSettings: IndicatorSettings["adx"];
  export let aoSettings: IndicatorSettings["ao"];
  export let momentumSettings: IndicatorSettings["momentum"];
  export let pivotSettings: IndicatorSettings["pivots"];
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
          bind:value={precision}
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
          bind:value={historyLimit}
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
      <input
        id="favorite-timeframes"
        type="text"
        value={favoriteTimeframesInput}
        on:input={handleTimeframeInput}
        on:blur={handleTimeframeBlur}
        placeholder="e.g., 1h, 4h, 1d, 1w"
        class="input-field rounded flex-1 ml-4"
      />
    </div>

    <div class="flex items-center justify-between">
      <span class="text-sm"
        >{$_("settings.indicators.syncRsiTimeframe") ||
          "Sync RSI Timeframe"}</span
      >
      <Toggle bind:checked={syncRsiTimeframe} />
    </div>
  </div>

  <!-- Indicator Settings Grid -->
  <div>
    <h3 class="text-sm font-bold text-[var(--text-primary)] mb-3">
      {$_("settings.indicators.title") || "Indicator Settings"}
    </h3>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <!-- Left Column -->
      <div class="flex flex-col gap-4">
        <!-- RSI Settings -->
        <div
          class="p-3 border border-[var(--border-color)] rounded bg-[var(--bg-tertiary)] flex flex-col gap-3 relative overflow-hidden"
        >
          <div
            class="flex justify-between items-center border-b border-[var(--border-color)] pb-2 mb-1"
          >
            <h4
              class="text-xs font-bold uppercase text-[var(--text-secondary)]"
            >
              RSI
            </h4>
            {#if !isPro}
              <span
                class="text-[9px] font-bold bg-[var(--accent-color)] text-[var(--btn-accent-text)] px-1.5 py-0.5 rounded"
                >PRO</span
              >
            {/if}
          </div>

          <div class="grid grid-cols-2 gap-x-4 gap-y-2 mt-1">
            <div class="flex items-center justify-between">
              <label for="rsi-length" class="text-xs">Length</label>
              <input
                id="rsi-length"
                type="number"
                bind:value={rsiSettings.length}
                min="2"
                max="100"
                class="input-field rounded settings-number-input text-xs"
                disabled={!isPro}
                use:enhancedInput={{ min: 2, max: 100 }}
              />
            </div>
            <div class="flex items-center justify-between">
              <label for="rsi-source" class="text-xs">Source</label>
              <select
                id="rsi-source"
                bind:value={rsiSettings.source}
                class="input-field p-1 rounded text-xs bg-[var(--bg-secondary)]"
                disabled={!isPro}
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
              <Toggle bind:checked={rsiSettings.showSignal} disabled={!isPro} />
            </div>

            {#if rsiSettings.showSignal}
              <div class="grid grid-cols-2 gap-x-4 gap-y-2">
                <div class="flex items-center justify-between">
                  <label for="rsi-signal-type" class="text-xs">Type</label>
                  <select
                    id="rsi-signal-type"
                    bind:value={rsiSettings.signalType}
                    class="input-field p-1 rounded text-xs bg-[var(--bg-secondary)]"
                    disabled={!isPro}
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
                    bind:value={rsiSettings.signalLength}
                    min="2"
                    max="100"
                    class="input-field rounded settings-number-input text-xs"
                    disabled={!isPro}
                    use:enhancedInput={{
                      min: 2,
                      max: 100,
                    }}
                  />
                </div>
              </div>
            {/if}
          </div>

          {#if !isPro}
            <div
              class="absolute inset-0 bg-black/20 backdrop-blur-[1px] rounded z-10"
            />
          {/if}
        </div>

        <!-- MACD Settings -->
        <div
          class="p-3 border border-[var(--border-color)] rounded bg-[var(--bg-tertiary)] flex flex-col gap-3 relative overflow-hidden"
        >
          <div
            class="flex justify-between items-center border-b border-[var(--border-color)] pb-2 mb-1"
          >
            <h4
              class="text-xs font-bold uppercase text-[var(--text-secondary)]"
            >
              MACD
            </h4>
            {#if !isPro}
              <span
                class="text-[9px] font-bold bg-[var(--accent-color)] text-[var(--btn-accent-text)] px-1.5 py-0.5 rounded"
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
                bind:value={macdSettings.fastLength}
                min="2"
                max="100"
                class="input-field rounded settings-number-input text-xs"
                disabled={!isPro}
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
                bind:value={macdSettings.slowLength}
                min="2"
                max="100"
                class="input-field rounded settings-number-input text-xs"
                disabled={!isPro}
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
                bind:value={macdSettings.signalLength}
                min="2"
                max="100"
                class="input-field rounded settings-number-input text-xs"
                disabled={!isPro}
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
                bind:value={macdSettings.source}
                class="input-field p-1 rounded text-xs bg-[var(--bg-secondary)]"
                disabled={!isPro}
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
                class="text-[10px] text-[var(--text-secondary)]">Osc MA</label
              >
              <select
                id="macd-osc-type"
                bind:value={macdSettings.oscillatorMaType}
                class="input-field p-1 rounded text-xs bg-[var(--bg-secondary)]"
                disabled={!isPro}
              >
                <option value="ema">EMA</option>
                <option value="sma">SMA</option>
              </select>
            </div>
            <div class="flex items-center justify-between">
              <label
                for="macd-sig-type"
                class="text-[10px] text-[var(--text-secondary)]">Sig MA</label
              >
              <select
                id="macd-sig-type"
                bind:value={macdSettings.signalMaType}
                class="input-field p-1 rounded text-xs bg-[var(--bg-secondary)]"
                disabled={!isPro}
              >
                <option value="ema">EMA</option>
                <option value="sma">SMA</option>
              </select>
            </div>
          </div>

          {#if !isPro}
            <div
              class="absolute inset-0 bg-black/20 backdrop-blur-[1px] rounded z-10"
            />
          {/if}
        </div>

        <!-- EMA Settings -->
        <div
          class="p-3 border border-[var(--border-color)] rounded bg-[var(--bg-tertiary)] flex flex-col gap-3 relative overflow-hidden"
        >
          <div
            class="flex justify-between items-center border-b border-[var(--border-color)] pb-2 mb-1"
          >
            <h4
              class="text-xs font-bold uppercase text-[var(--text-secondary)]"
            >
              EMA 1
            </h4>
            {#if !isPro}
              <span
                class="text-[9px] font-bold bg-[var(--accent-color)] text-[var(--btn-accent-text)] px-1.5 py-0.5 rounded"
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
                bind:value={emaSettings.ema1.length}
                min="2"
                max="500"
                class="input-field rounded settings-number-input text-xs"
                disabled={!isPro}
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
                bind:value={emaSettings.ema1.offset}
                min="-100"
                max="100"
                class="input-field rounded settings-number-input text-xs"
                disabled={!isPro}
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
                class="text-[10px] text-[var(--text-secondary)]"
                >Smoothing</label
              >
              <select
                id="ema1-smth-type"
                bind:value={emaSettings.ema1.smoothingType}
                class="input-field p-1 rounded text-xs bg-[var(--bg-secondary)]"
                disabled={!isPro}
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
                class="text-[10px] text-[var(--text-secondary)]">Smth Len</label
              >
              <input
                id="ema1-smth-len"
                type="number"
                bind:value={emaSettings.ema1.smoothingLength}
                min="1"
                max="100"
                class="input-field rounded settings-number-input text-xs"
                disabled={!isPro || emaSettings.ema1.smoothingType === "none"}
                use:enhancedInput={{
                  min: 1,
                  max: 100,
                }}
              />
            </div>
          </div>

          {#if !isPro}
            <div
              class="absolute inset-0 bg-black/20 backdrop-blur-[1px] rounded z-10"
            />
          {/if}
        </div>

        <!-- EMA 2 -->
        <div
          class="p-3 border border-[var(--border-color)] rounded bg-[var(--bg-tertiary)] flex flex-col gap-3 relative overflow-hidden"
        >
          <div
            class="flex justify-between items-center border-b border-[var(--border-color)] pb-2 mb-1"
          >
            <h4
              class="text-xs font-bold uppercase text-[var(--text-secondary)]"
            >
              EMA 2
            </h4>
            {#if !isPro}
              <span
                class="text-[9px] font-bold bg-[var(--accent-color)] text-[var(--btn-accent-text)] px-1.5 py-0.5 rounded"
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
                bind:value={emaSettings.ema2.length}
                min="2"
                max="500"
                class="input-field rounded settings-number-input text-xs"
                disabled={!isPro}
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
                bind:value={emaSettings.ema2.offset}
                min="-100"
                max="100"
                class="input-field rounded settings-number-input text-xs"
                disabled={!isPro}
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
                class="text-[10px] text-[var(--text-secondary)]"
                >Smoothing</label
              >
              <select
                id="ema2-smth-type"
                bind:value={emaSettings.ema2.smoothingType}
                class="input-field p-1 rounded text-xs bg-[var(--bg-secondary)]"
                disabled={!isPro}
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
                class="text-[10px] text-[var(--text-secondary)]">Smth Len</label
              >
              <input
                id="ema2-smth-len"
                type="number"
                bind:value={emaSettings.ema2.smoothingLength}
                min="1"
                max="100"
                class="input-field rounded settings-number-input text-xs"
                disabled={!isPro || emaSettings.ema2.smoothingType === "none"}
                use:enhancedInput={{
                  min: 1,
                  max: 100,
                }}
              />
            </div>
          </div>

          {#if !isPro}
            <div
              class="absolute inset-0 bg-black/20 backdrop-blur-[1px] rounded z-10"
            />
          {/if}
        </div>

        <!-- EMA 3 -->
        <div
          class="p-3 border border-[var(--border-color)] rounded bg-[var(--bg-tertiary)] flex flex-col gap-3 relative overflow-hidden"
        >
          <div
            class="flex justify-between items-center border-b border-[var(--border-color)] pb-2 mb-1"
          >
            <h4
              class="text-xs font-bold uppercase text-[var(--text-secondary)]"
            >
              EMA 3
            </h4>
            {#if !isPro}
              <span
                class="text-[9px] font-bold bg-[var(--accent-color)] text-[var(--btn-accent-text)] px-1.5 py-0.5 rounded"
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
                bind:value={emaSettings.ema3.length}
                min="2"
                max="500"
                class="input-field rounded settings-number-input text-xs"
                disabled={!isPro}
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
                bind:value={emaSettings.ema3.offset}
                min="-100"
                max="100"
                class="input-field rounded settings-number-input text-xs"
                disabled={!isPro}
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
                class="text-[10px] text-[var(--text-secondary)]"
                >Smoothing</label
              >
              <select
                id="ema3-smth-type"
                bind:value={emaSettings.ema3.smoothingType}
                class="input-field p-1 rounded text-xs bg-[var(--bg-secondary)]"
                disabled={!isPro}
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
                class="text-[10px] text-[var(--text-secondary)]">Smth Len</label
              >
              <input
                id="ema3-smth-len"
                type="number"
                bind:value={emaSettings.ema3.smoothingLength}
                min="1"
                max="100"
                class="input-field rounded settings-number-input text-xs"
                disabled={!isPro || emaSettings.ema3.smoothingType === "none"}
                use:enhancedInput={{
                  min: 1,
                  max: 100,
                }}
              />
            </div>
          </div>

          {#if !isPro}
            <div
              class="absolute inset-0 bg-black/20 backdrop-blur-[1px] rounded z-10"
            />
          {/if}
        </div>

        <!-- Source selection for all EMAs -->
        <div
          class="p-3 border border-[var(--border-color)] rounded bg-[var(--bg-tertiary)] flex items-center justify-between"
        >
          <label for="ema-source" class="text-xs">Common Source</label>
          <select
            id="ema-source"
            bind:value={emaSettings.source}
            class="input-field p-1 rounded text-xs bg-[var(--bg-secondary)]"
            disabled={!isPro}
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
      <div class="flex flex-col gap-4">
        <!-- Stochastic Settings -->
        <div
          class="p-3 border border-[var(--border-color)] rounded bg-[var(--bg-tertiary)] flex flex-col gap-3 relative overflow-hidden"
        >
          <div
            class="flex justify-between items-center border-b border-[var(--border-color)] pb-2 mb-1"
          >
            <h4
              class="text-xs font-bold uppercase text-[var(--text-secondary)]"
            >
              Stochastic
            </h4>
            {#if !isPro}
              <span
                class="text-[9px] font-bold bg-[var(--accent-color)] text-[var(--btn-accent-text)] px-1.5 py-0.5 rounded"
                >PRO</span
              >
            {/if}
          </div>

          <div class="grid grid-cols-3 gap-2 mt-1">
            <div class="flex flex-col gap-1 items-center">
              <label
                for="stoch-k"
                class="text-[10px] text-[var(--text-secondary)]">%K Len</label
              >
              <input
                id="stoch-k"
                type="number"
                bind:value={stochSettings.kPeriod}
                min="2"
                max="100"
                class="input-field rounded settings-number-input text-xs mx-auto"
                disabled={!isPro}
                use:enhancedInput={{
                  min: 2,
                  max: 100,
                }}
              />
            </div>
            <div class="flex flex-col gap-1 items-center">
              <label
                for="stoch-k-smooth"
                class="text-[10px] text-[var(--text-secondary)]">%K Smth</label
              >
              <input
                id="stoch-k-smooth"
                type="number"
                bind:value={stochSettings.kSmoothing}
                min="1"
                max="50"
                class="input-field rounded settings-number-input text-xs mx-auto"
                disabled={!isPro}
                use:enhancedInput={{
                  min: 1,
                  max: 50,
                }}
              />
            </div>
            <div class="flex flex-col gap-1 items-center">
              <label
                for="stoch-d-smooth"
                class="text-[10px] text-[var(--text-secondary)]">%D Smth</label
              >
              <input
                id="stoch-d-smooth"
                type="number"
                bind:value={stochSettings.dPeriod}
                min="2"
                max="100"
                class="input-field rounded settings-number-input text-xs mx-auto"
                disabled={!isPro}
                use:enhancedInput={{
                  min: 2,
                  max: 100,
                }}
              />
            </div>
          </div>

          {#if !isPro}
            <div
              class="absolute inset-0 bg-black/20 backdrop-blur-[1px] rounded z-10"
            />
          {/if}
        </div>

        <!-- CCI Settings -->
        <div
          class="p-3 border border-[var(--border-color)] rounded bg-[var(--bg-tertiary)] flex flex-col gap-3 relative overflow-hidden"
        >
          <div
            class="flex justify-between items-center border-b border-[var(--border-color)] pb-2 mb-1"
          >
            <h4
              class="text-xs font-bold uppercase text-[var(--text-secondary)]"
            >
              CCI
            </h4>
            {#if !isPro}
              <span
                class="text-[9px] font-bold bg-[var(--accent-color)] text-[var(--btn-accent-text)] px-1.5 py-0.5 rounded"
                >PRO</span
              >
            {/if}
          </div>

          <div class="grid grid-cols-2 gap-x-4 gap-y-2 mt-1">
            <div class="flex items-center justify-between">
              <label for="cci-length" class="text-xs">Length</label>
              <input
                id="cci-length"
                type="number"
                bind:value={cciSettings.length}
                min="2"
                max="100"
                class="input-field rounded settings-number-input text-xs"
                disabled={!isPro}
                use:enhancedInput={{
                  min: 2,
                  max: 100,
                }}
              />
            </div>
            <div class="flex items-center justify-between">
              <label for="cci-source" class="text-xs">Source</label>
              <select
                id="cci-source"
                bind:value={cciSettings.source}
                class="input-field p-1 rounded text-xs bg-[var(--bg-secondary)]"
                disabled={!isPro}
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
                for="cci-smooth-type"
                class="text-[10px] text-[var(--text-secondary)]"
                >Smth Type</label
              >
              <select
                id="cci-smooth-type"
                bind:value={cciSettings.smoothingType}
                class="input-field p-1 rounded text-xs bg-[var(--bg-secondary)]"
                disabled={!isPro}
              >
                <option value="sma">SMA</option>
                <option value="ema">EMA</option>
              </select>
            </div>
            <div class="flex items-center justify-between">
              <label
                for="cci-smooth-len"
                class="text-[10px] text-[var(--text-secondary)]">Smth Len</label
              >
              <input
                id="cci-smooth-len"
                type="number"
                bind:value={cciSettings.smoothingLength}
                min="1"
                max="100"
                class="input-field rounded settings-number-input text-xs"
                disabled={!isPro}
                use:enhancedInput={{
                  min: 1,
                  max: 100,
                }}
              />
            </div>
          </div>

          {#if !isPro}
            <div
              class="absolute inset-0 bg-black/20 backdrop-blur-[1px] rounded z-10"
            />
          {/if}
        </div>

        <!-- ADX Settings -->
        <div
          class="p-3 border border-[var(--border-color)] rounded bg-[var(--bg-tertiary)] flex flex-col gap-3 relative overflow-hidden"
        >
          <div
            class="flex justify-between items-center border-b border-[var(--border-color)] pb-2 mb-1"
          >
            <h4
              class="text-xs font-bold uppercase text-[var(--text-secondary)]"
            >
              ADX
            </h4>
            {#if !isPro}
              <span
                class="text-[9px] font-bold bg-[var(--accent-color)] text-[var(--btn-accent-text)] px-1.5 py-0.5 rounded"
                >PRO</span
              >
            {/if}
          </div>

          <div class="grid grid-cols-2 gap-x-4 gap-y-2 mt-1">
            <div class="flex items-center justify-between">
              <label for="adx-smooth" class="text-xs">Smoothing</label>
              <input
                id="adx-smooth"
                type="number"
                bind:value={adxSettings.adxSmoothing}
                min="2"
                max="100"
                class="input-field rounded settings-number-input text-xs"
                disabled={!isPro}
                use:enhancedInput={{
                  min: 2,
                  max: 100,
                }}
              />
            </div>
            <div class="flex items-center justify-between">
              <label for="adx-di" class="text-xs">DI Len</label>
              <input
                id="adx-di"
                type="number"
                bind:value={adxSettings.diLength}
                min="2"
                max="100"
                class="input-field rounded settings-number-input text-xs"
                disabled={!isPro}
                use:enhancedInput={{
                  min: 2,
                  max: 100,
                }}
              />
            </div>
          </div>

          {#if !isPro}
            <div
              class="absolute inset-0 bg-black/20 backdrop-blur-[1px] rounded z-10"
            />
          {/if}
        </div>

        <!-- Awesome Oscillator Settings -->
        <div
          class="p-3 border border-[var(--border-color)] rounded bg-[var(--bg-tertiary)] flex flex-col gap-3 relative overflow-hidden"
        >
          <div
            class="flex justify-between items-center border-b border-[var(--border-color)] pb-2 mb-1"
          >
            <h4
              class="text-xs font-bold uppercase text-[var(--text-secondary)]"
            >
              AO
            </h4>
            {#if !isPro}
              <span
                class="text-[9px] font-bold bg-[var(--accent-color)] text-[var(--btn-accent-text)] px-1.5 py-0.5 rounded"
                >PRO</span
              >
            {/if}
          </div>

          <div class="grid grid-cols-2 gap-x-4 gap-y-2 mt-1">
            <div class="flex items-center justify-between">
              <label for="ao-fast" class="text-xs">Fast Period</label>
              <input
                id="ao-fast"
                type="number"
                bind:value={aoSettings.fastLength}
                min="1"
                max="100"
                class="input-field rounded settings-number-input text-xs"
                disabled={!isPro}
                use:enhancedInput={{
                  min: 1,
                  max: 100,
                }}
              />
            </div>
            <div class="flex items-center justify-between">
              <label for="ao-slow" class="text-xs">Slow Period</label>
              <input
                id="ao-slow"
                type="number"
                bind:value={aoSettings.slowLength}
                min="2"
                max="100"
                class="input-field rounded settings-number-input text-xs"
                disabled={!isPro}
                use:enhancedInput={{
                  min: 2,
                  max: 100,
                }}
              />
            </div>
          </div>

          {#if !isPro}
            <div
              class="absolute inset-0 bg-black/20 backdrop-blur-[1px] rounded z-10"
            />
          {/if}
        </div>

        <!-- Momentum Settings -->
        <div
          class="p-3 border border-[var(--border-color)] rounded bg-[var(--bg-tertiary)] flex flex-col gap-3 relative overflow-hidden"
        >
          <div
            class="flex justify-between items-center border-b border-[var(--border-color)] pb-2 mb-1"
          >
            <h4
              class="text-xs font-bold uppercase text-[var(--text-secondary)]"
            >
              Momentum
            </h4>
            {#if !isPro}
              <span
                class="text-[9px] font-bold bg-[var(--accent-color)] text-[var(--btn-accent-text)] px-1.5 py-0.5 rounded"
                >PRO</span
              >
            {/if}
          </div>

          <div class="grid grid-cols-2 gap-x-4 gap-y-2 mt-1">
            <div class="flex items-center justify-between">
              <label for="mom-length" class="text-xs">Length</label>
              <input
                id="mom-length"
                type="number"
                bind:value={momentumSettings.length}
                min="1"
                max="100"
                class="input-field rounded settings-number-input text-xs"
                disabled={!isPro}
                use:enhancedInput={{
                  min: 1,
                  max: 100,
                }}
              />
            </div>
            <div class="flex items-center justify-between">
              <label for="mom-source" class="text-xs">Source</label>
              <select
                id="mom-source"
                bind:value={momentumSettings.source}
                class="input-field p-1 rounded text-xs bg-[var(--bg-secondary)]"
                disabled={!isPro}
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

          {#if !isPro}
            <div
              class="absolute inset-0 bg-black/20 backdrop-blur-[1px] rounded z-10"
            />
          {/if}
        </div>

        <!-- Pivots Settings -->
        <div
          class="p-3 border border-[var(--border-color)] rounded bg-[var(--bg-tertiary)] flex flex-col gap-3 relative overflow-hidden"
        >
          <div
            class="flex justify-between items-center border-b border-[var(--border-color)] pb-2 mb-1"
          >
            <h4
              class="text-xs font-bold uppercase text-[var(--text-secondary)]"
            >
              Pivots
            </h4>
            {#if !isPro}
              <span
                class="text-[9px] font-bold bg-[var(--accent-color)] text-[var(--btn-accent-text)] px-1.5 py-0.5 rounded"
                >PRO</span
              >
            {/if}
          </div>

          <div class="grid grid-cols-2 gap-x-4 gap-y-2 mt-1">
            <div class="flex items-center justify-between">
              <label for="pivot-type" class="text-xs">Type</label>
              <select
                id="pivot-type"
                bind:value={pivotSettings.type}
                class="input-field p-1 rounded text-xs bg-[var(--bg-secondary)]"
                disabled={!isPro}
              >
                <option value="classic">Classic</option>
                <option value="woodie">Woodie</option>
                <option value="camarilla">Camarilla</option>
                <option value="fibonacci">Fibonacci</option>
              </select>
            </div>
            <div class="flex items-center justify-between">
              <label for="pivot-view" class="text-xs">View</label>
              <select
                id="pivot-view"
                bind:value={pivotSettings.viewMode}
                class="input-field p-1 rounded text-xs bg-[var(--bg-secondary)]"
                disabled={!isPro}
              >
                <option value="integrated">Int</option>
                <option value="separated">Sep</option>
                <option value="abstract">Gauge</option>
              </select>
            </div>
          </div>

          {#if !isPro}
            <div
              class="absolute inset-0 bg-black/20 backdrop-blur-[1px] rounded z-10"
            />
          {/if}
        </div>
      </div>
    </div>
  </div>
</div>
