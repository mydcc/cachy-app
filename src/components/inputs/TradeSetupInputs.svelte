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
  import { icons } from "../../lib/constants";
  import { debounce } from "../../utils/utils";
  import { createEventDispatcher } from "svelte";
  import { numberInput } from "../../utils/inputUtils";
  import { enhancedInput } from "../../lib/actions/inputEnhancements";
  import { _ } from "../../locales/i18n";
  import { trackCustomEvent } from "../../services/trackingService";
  import { onboardingService } from "../../services/onboardingService";
  import { normalizeSymbol } from "../../utils/symbolUtils";
  import { tradeState } from "../../stores/trade.svelte";
  import { settingsState } from "../../stores/settings.svelte";
  import { uiState } from "../../stores/ui.svelte";
  import { modalState } from "../../stores/modal.svelte";
  import { marketState } from "../../stores/market.svelte";
  import { app } from "../../services/app";

  const dispatch = createEventDispatcher();

  interface Props {
    symbol: string;
    entryPrice: number | null;
    useAtrSl: boolean;
    atrValue: number | null;
    atrMultiplier: number | null;
    stopLossPrice: number | null;
    atrMode: "manual" | "auto";
    atrTimeframe: string;
    atrFormulaDisplay: string;
    showAtrFormulaDisplay: boolean;
    isPriceFetching: boolean;
    isAtrFetching: boolean;
    symbolSuggestions: string[];
    showSymbolSuggestions: boolean;
  }

  let {
    symbol = $bindable(),
    entryPrice = $bindable(),
    useAtrSl = $bindable(),
    atrValue = $bindable(),
    atrMultiplier = $bindable(),
    stopLossPrice = $bindable(),
    atrMode = $bindable(),
    atrTimeframe = $bindable(),
    atrFormulaDisplay,
    showAtrFormulaDisplay,
    isPriceFetching,
    isAtrFetching,
    symbolSuggestions = [],
    showSymbolSuggestions,
  }: Props = $props();

  // Local state for input to prevent immediate store updates
  let localSymbol = $state(symbol || "");
  let isSymbolFocused = $state(false);
  let selectedSuggestionIndex = $state(-1);

  const format = (val: number | null) =>
    val === null || val === undefined ? "" : String(val);

  // Local state for numeric inputs (Buffer to prevent "vanishing decimal" bug)
  let localEntryPrice = $state(format(entryPrice));
  let isEntryPriceFocused = $state(false);

  let localStopLossPrice = $state(format(stopLossPrice));
  let isStopLossPriceFocused = $state(false);

  let localAtrValue = $state(format(atrValue));
  let isAtrValueFocused = $state(false);

  let localAtrMultiplier = $state(format(atrMultiplier));
  let isAtrMultiplierFocused = $state(false);

  let priceDeviation = $derived.by(() => {
    // Safety check: ensure symbol is valid before calculating deviation
    // Use marketState for reactivity
    const normSymbol = normalizeSymbol(localSymbol, settingsState.apiProvider);
    const currentPrice = marketState.data[normSymbol]?.lastPrice;

    if (!localSymbol || !entryPrice || !currentPrice) return 0;
    const market = currentPrice.toNumber();
    if (market <= 0) return 0;
    const dev = Math.abs((entryPrice - market) / market) * 100;
    return dev > 1000 ? 0 : dev; // Ignore extreme values during sync
  });

  // Sync local state when prop changes (e.g. from Preset or internal selection)
  // CRITICAL: Only sync if user is NOT typing/focused to prevent mobile keyboard issues.
  // FIX: Allow clearing input (localSymbol === "") while focused without snapping back.
  $effect(() => {
    // Only update local from props if:
    // 1. User is NOT focused
    // 2. OR user is focused, but prop changed AND it's not just a result of clearing
    if (!isSymbolFocused && symbol !== localSymbol) {
      localSymbol = symbol || "";
    }
  });

  // Sync Numeric Inputs from Props to Local (One-way sync when NOT focused)
  $effect(() => {
    if (!isEntryPriceFocused && format(entryPrice) !== localEntryPrice) {
      localEntryPrice = format(entryPrice);
    }
  });

  $effect(() => {
    if (
      !isStopLossPriceFocused &&
      format(stopLossPrice) !== localStopLossPrice
    ) {
      localStopLossPrice = format(stopLossPrice);
    }
  });

  $effect(() => {
    if (!isAtrValueFocused && format(atrValue) !== localAtrValue) {
      localAtrValue = format(atrValue);
    }
  });

  $effect(() => {
    if (
      !isAtrMultiplierFocused &&
      format(atrMultiplier) !== localAtrMultiplier
    ) {
      localAtrMultiplier = format(atrMultiplier);
    }
  });

  function toggleAtrSl() {
    trackCustomEvent("ATR", "Toggle", useAtrSl ? "On" : "Off");
    dispatch("toggleAtrInputs", useAtrSl);
  }

  function handleFetchPriceClick() {
    trackCustomEvent("Price", "Fetch", symbol);
    // Force ATR SL to be active when fetching price manually
    tradeState.update((s) => ({ ...s, useAtrSl: true, atrMode: "auto" }));
    // Use unified fetch
    app.fetchAllAnalysisData(symbol, false);
  }

  const handleSymbolInput = debounce(() => {
    // 1. Update Global Store (this triggers reactivity in app.ts / +page.svelte)
    // Only update if it's different to avoid redundant triggers
    if (symbol !== localSymbol) {
      tradeState.update((s) => ({ ...s, symbol: localSymbol }));
    }

    app.updateSymbolSuggestions(localSymbol);
    selectedSuggestionIndex = -1;

    // Automatically fetch price and ATR when user stops typing a valid symbol
    if (localSymbol && localSymbol.length >= 3) {
      // Unified Fetch
      app.fetchAllAnalysisData(localSymbol, true);
    }
  }, 500);

  // Cleanup pending debounce on unmount
  $effect(() => {
    return () => {
      handleSymbolInput.cancel();
    };
  });

  function selectSuggestion(s: string) {
    trackCustomEvent("Symbol", "SelectSuggestion", s);
    dispatch("selectSymbolSuggestion", s);
    // When selecting suggestion, we want immediate update
    localSymbol = s;
    tradeState.update((s) => ({ ...s, symbol: localSymbol }));
    app.fetchAllAnalysisData(localSymbol, true);
  }

  function handleKeyDownSymbol(event: KeyboardEvent) {
    if (
      !showSymbolSuggestions ||
      !symbolSuggestions ||
      symbolSuggestions.length === 0
    )
      return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      selectedSuggestionIndex =
        (selectedSuggestionIndex + 1) % symbolSuggestions.length;
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      selectedSuggestionIndex =
        (selectedSuggestionIndex - 1 + symbolSuggestions.length) %
        symbolSuggestions.length;
    } else if (event.key === "Enter") {
      if (selectedSuggestionIndex >= 0) {
        event.preventDefault();
        selectSuggestion(symbolSuggestions[selectedSuggestionIndex]);
      }
    } else if (event.key === "Escape") {
      app.updateSymbolSuggestions("");
    }
  }

  function handleKeyDownSuggestion(event: KeyboardEvent, s: string) {
    if (event.key === "Enter") {
      selectSuggestion(s);
    }
  }

  function handleClickOutside(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (!target.closest(".symbol-input-container")) {
      app.updateSymbolSuggestions(""); // Clear suggestions
    }
  }

  // Helper to parse input safely
  function parseInputVal(val: string): number | null {
    if (val === "") return null;
    const parsed = parseFloat(val);
    return isNaN(parsed) ? null : parsed;
  }

  function handleEntryPriceInput(e: Event) {
    const target = e.target as HTMLInputElement;
    const value = target.value;
    localEntryPrice = value; // Update buffer
    const num = parseInputVal(value);
    if (entryPrice !== num) {
      tradeState.update((s) => ({ ...s, entryPrice: num }));
    }
  }

  function handleAtrValueInput(e: Event) {
    const target = e.target as HTMLInputElement;
    const value = target.value;
    localAtrValue = value;
    const num = parseInputVal(value);
    if (atrValue !== num) {
      tradeState.update((s) => ({ ...s, atrValue: num }));
    }
  }

  function handleAtrMultiplierInput(e: Event) {
    const target = e.target as HTMLInputElement;
    const value = target.value;
    localAtrMultiplier = value;
    const num = parseInputVal(value);
    if (atrMultiplier !== num) {
      tradeState.update((s) => ({ ...s, atrMultiplier: num }));
    }
  }

  function handleStopLossPriceInput(e: Event) {
    const target = e.target as HTMLInputElement;
    const value = target.value;
    localStopLossPrice = value;
    const num = parseInputVal(value);
    if (stopLossPrice !== num) {
      tradeState.update((s) => ({ ...s, stopLossPrice: num }));
    }
  }

  function toggleAutoUpdatePrice() {
    settingsState.autoUpdatePriceInput = !settingsState.autoUpdatePriceInput;
  }

  function handleAtrTimeframeChange(e: Event) {
    const val = (e.target as HTMLSelectElement).value;
    dispatch("setAtrTimeframe", val);
    trackCustomEvent("ATR", "ChangeTimeframe", val);
  }

  // Determine dynamic step based on price magnitude
  let priceStep = $derived(
    entryPrice && entryPrice > 1000
      ? 0.5
      : entryPrice && entryPrice > 100
        ? 0.1
        : 0.01,
  );

  // Copy to clipboard with smiley feedback
  let showSmiley = $state(false);
  let smileyX = $state(0);
  let smileyY = $state(0);
  let smileyTimer: ReturnType<typeof setTimeout> | undefined;

  import { portal } from "../../lib/actions/portal";

  // Cleanup timer on unmount
  $effect(() => {
    return () => {
      if (smileyTimer) clearTimeout(smileyTimer);
    };
  });

  async function copyStopLossToClipboard(
    value: string,
    event: MouseEvent | KeyboardEvent,
  ) {
    try {
      await navigator.clipboard.writeText(value);
      // Show smiley at mouse/keyboard position
      const x = event instanceof MouseEvent ? event.clientX : smileyX || 0;
      const y = event instanceof MouseEvent ? event.clientY : smileyY || 0;
      smileyX = x;
      smileyY = y;
      showSmiley = true;

      if (smileyTimer) clearTimeout(smileyTimer);
      smileyTimer = setTimeout(() => {
        showSmiley = false;
        smileyTimer = undefined;
      }, 1000);
    } catch (err) {
      uiState.showError("Failed to copy to clipboard");
    }
  }
</script>

<svelte:window onclick={handleClickOutside} />

<div>
  <h2 class="section-header">{$_("dashboard.tradeSetupInputs.header")}</h2>
  <div class="flex gap-4 mb-4">
    <div class="relative flex-grow symbol-input-container isolate">
      <input
        id="symbol-input"
        name="symbol"
        type="text"
        bind:value={localSymbol}
        oninput={() => {
          handleSymbolInput();
          onboardingService.trackFirstInput();
        }}
        onkeydown={handleKeyDownSymbol}
        onfocus={() => (isSymbolFocused = true)}
        onblur={() => (isSymbolFocused = false)}
        class="input-field w-full px-4 py-2 rounded-md pr-16 relative z-30 touch-manipulation"
        placeholder={$_("dashboard.tradeSetupInputs.symbolPlaceholder")}
        autocomplete="off"
        inputmode="text"
      />
      <div
        class="absolute top-1/2 right-2 -translate-y-1/2 flex items-center gap-1 z-40"
      >
        <button
          type="button"
          class="symbol-picker-btn p-1 rounded hover:bg-[var(--bg-tertiary)] transition-colors text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          onclick={() =>
            modalState.show(
              $_("dashboard.tradeSetupInputs.selectSymbol"),
              "",
              "symbolPicker",
            )}
          title={$_("dashboard.tradeSetupInputs.selectSymbol")}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            fill="currentColor"
            viewBox="0 0 16 16"
          >
            <path
              d="M2.5 12a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 0 1H3a.5.5 0 0 1-.5-.5zm0-4a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 0 1H3a.5.5 0 0 1-.5-.5zm0-4a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 0 1H3a.5.5 0 0 1-.5-.5z"
            />
          </svg>
        </button>
        <button
          type="button"
          class="price-fetch-btn p-1 {isPriceFetching ? 'animate-spin' : ''}"
          title={$_("dashboard.tradeSetupInputs.fetchPriceTitle")}
          aria-label={$_("dashboard.tradeSetupInputs.fetchPriceAriaLabel")}
          onclick={handleFetchPriceClick}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            fill="currentColor"
            viewBox="0 0 16 16"
            ><path
              d="M8.5 5.5a.5.5 0 0 0-1 0v3.354l-1.46-1.47a.5.5 0 0 0-.708.708l2.146 2.147a.5.5 0 0 0 .708 0l2.146-2.147a.5.5 0 0 0-.708-.708L8.5 8.854V5.5z"
            /><path
              d="M8 16a8 8 0 1 0 0-16 8 8 0 0 0 0 16zm7-8a7 7 0 1 1-14 0 7 7 0 0 1 14 0z"
            /></svg
          >
        </button>
      </div>
      {#if showSymbolSuggestions}
        <div
          class="absolute top-full left-0 w-full rounded-md shadow-lg mt-1 overflow-hidden border border-[var(--border-color)] z-20 bg-[var(--bg-secondary)]"
        >
          {#each symbolSuggestions as s, i}
            <div
              class="suggestion-item p-2 cursor-pointer transition-colors {i ===
              selectedSuggestionIndex
                ? 'bg-[var(--accent-color)] text-white'
                : 'hover:bg-[var(--bg-tertiary)]'}"
              onclick={() => selectSuggestion(s)}
              onkeydown={(e) => handleKeyDownSuggestion(e, s)}
              onmouseenter={() => (selectedSuggestionIndex = i)}
              role="button"
              tabindex="0"
            >
              {s}
            </div>
          {/each}
        </div>
      {/if}
    </div>
    <div class="flex-grow relative">
      <input
        id="entry-price-input"
        name="entryPrice"
        type="text"
        use:numberInput={{ maxDecimalPlaces: 4 }}
        use:enhancedInput={{
          step: priceStep,
          min: 0,
          rightOffset: "40px",
          showSpinButtons: false,
        }}
        bind:value={localEntryPrice}
        onfocus={() => (isEntryPriceFocused = true)}
        onblur={() => (isEntryPriceFocused = false)}
        oninput={(e) => {
          handleEntryPriceInput(e);
          onboardingService.trackFirstInput();
        }}
        class="input-field w-full px-4 py-2 rounded-md transition-all {priceDeviation >
        10
          ? 'border-orange-500 shadow-[0_0_5px_rgba(249,115,22,0.3)]'
          : ''}"
        placeholder={$_("dashboard.tradeSetupInputs.entryPricePlaceholder")}
      />
      {#if priceDeviation > 1}
        <div
          class="absolute -top-6 left-0 text-[10px] text-orange-500 font-bold animate-pulse"
        >
          ⚠️ {$_("dashboard.tradeSetupInputs.priceDeviation")}: {priceDeviation.toFixed(
            1,
          )}%
        </div>
      {/if}

      <!-- Auto Update Price Toggle -->
      <button
        class="absolute top-2 right-2 rounded-full transition-colors duration-300 z-30"
        style="width: 0.382rem; height: 0.382rem; background-color: {settingsState.autoUpdatePriceInput
          ? 'var(--success-color)'
          : 'var(--danger-color)'};"
        title={settingsState.autoUpdatePriceInput
          ? $_("dashboard.tradeSetupInputs.autoUpdateOn")
          : $_("dashboard.tradeSetupInputs.autoUpdateOff")}
        onclick={toggleAutoUpdatePrice}
        aria-label="Toggle Auto Update Price"
      ></button>
    </div>
  </div>

  <div
    class="p-2 rounded-lg mb-4"
    style="background-color: var(--bg-tertiary);"
  >
    <div
      class="flex items-center mb-2 {useAtrSl
        ? 'justify-between'
        : 'justify-end'}"
    >
      {#if useAtrSl}
        <div class="atr-mode-switcher">
          <button
            class="btn-switcher {atrMode === 'manual' ? 'active' : ''}"
            onclick={() => dispatch("setAtrMode", "manual")}
          >
            {$_("dashboard.tradeSetupInputs.atrModeManual")}
          </button>
          <button
            class="btn-switcher {atrMode === 'auto' ? 'active' : ''}"
            onclick={() => dispatch("setAtrMode", "auto")}
          >
            {$_("dashboard.tradeSetupInputs.atrModeAuto")}
          </button>
        </div>
      {/if}
      <label class="flex items-center cursor-pointer">
        <span class="mr-2 text-sm"
          >{$_("dashboard.tradeSetupInputs.atrStopLossLabel")}</span
        >
        <input
          id="use-atr-sl-checkbox"
          name="useAtrSl"
          type="checkbox"
          bind:checked={useAtrSl}
          onchange={toggleAtrSl}
          class="sr-only peer"
          role="switch"
          aria-checked={useAtrSl}
        />
        <div
          class="atr-toggle-track relative w-11 h-6 peer-focus:outline-none rounded-full peer after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:border after:rounded-full after:h-5 after:w-5"
        ></div>
      </label>
    </div>
    {#if !useAtrSl}
      <div class="relative">
        <input
          id="stop-loss-price-input"
          name="stopLossPrice"
          type="text"
          use:numberInput={{ maxDecimalPlaces: 4 }}
          use:enhancedInput={{
            step: priceStep,
            min: 0,
          }}
          bind:value={localStopLossPrice}
          onfocus={() => (isStopLossPriceFocused = true)}
          onblur={() => (isStopLossPriceFocused = false)}
          oninput={handleStopLossPriceInput}
          class="input-field w-full px-4 py-2 rounded-md"
          placeholder={$_(
            "dashboard.tradeSetupInputs.manualStopLossPlaceholder",
          )}
        />
      </div>
    {:else}
      {#if atrMode === "manual"}
        <div class="grid grid-cols-2 gap-2 mt-2">
          <div class="relative">
            <input
              id="atr-value-input"
              name="atrValue"
              type="text"
              use:numberInput={{ maxDecimalPlaces: 4 }}
              use:enhancedInput={{
                step: 0.1,
                min: 0,
                showSpinButtons: "hover",
              }}
              bind:value={localAtrValue}
              onfocus={() => (isAtrValueFocused = true)}
              onblur={() => (isAtrValueFocused = false)}
              oninput={handleAtrValueInput}
              class="input-field w-full px-4 py-2 rounded-md"
              placeholder={$_("dashboard.tradeSetupInputs.atrValuePlaceholder")}
            />
          </div>
          <div class="relative">
            <input
              id="atr-multiplier-input"
              name="atrMultiplier"
              type="text"
              use:numberInput={{ maxDecimalPlaces: 4 }}
              use:enhancedInput={{
                step: 0.1,
                min: 0.1,
                showSpinButtons: "hover",
              }}
              bind:value={localAtrMultiplier}
              onfocus={() => (isAtrMultiplierFocused = true)}
              onblur={() => (isAtrMultiplierFocused = false)}
              oninput={handleAtrMultiplierInput}
              class="input-field w-full px-4 py-2 rounded-md"
              placeholder={$_(
                "dashboard.tradeSetupInputs.multiplierPlaceholder",
              )}
            />
          </div>
        </div>
      {:else}
        <div class="grid grid-cols-3 gap-2 mt-2 items-end">
          <div>
            <label for="atr-timeframe" class="input-label !mb-1 text-xs"
              >{$_("dashboard.tradeSetupInputs.atrTimeframeLabel")}</label
            >
            <!-- Dynamic Dropdown based on Favorites -->
            <div class="relative">
              <select
                id="atr-timeframe"
                name="atrTimeframe"
                value={atrTimeframe}
                onchange={handleAtrTimeframeChange}
                class="input-field w-full px-2 py-2 rounded-md appearance-none bg-[var(--bg-secondary)] border border-[var(--border-color)] text-sm cursor-pointer"
              >
                {#each (settingsState.favoriteTimeframes?.length ?? 0) > 0 ? settingsState.favoriteTimeframes : ["5m", "15m", "1h", "4h"] as tf}
                  <option value={tf}>{tf}</option>
                {/each}
              </select>
              <!-- Arrow Icon -->
              <div
                class="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-[var(--text-secondary)]"
              >
                <svg
                  class="fill-current h-4 w-4"
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  ><path
                    d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"
                  /></svg
                >
              </div>
            </div>
          </div>
          <div>
            <label for="atr-value-input-auto" class="input-label !mb-1 text-xs"
              >{$_("dashboard.tradeSetupInputs.atrLabel")}</label
            >
            <div class="relative">
              <input
                id="atr-value-input-auto"
                name="atrValueAuto"
                type="text"
                use:numberInput={{ maxDecimalPlaces: 4 }}
                use:enhancedInput={{
                  step: 0.1,
                  min: 0,
                  rightOffset: "40px",
                  showSpinButtons: false,
                }}
                bind:value={localAtrValue}
                onfocus={() => (isAtrValueFocused = true)}
                onblur={() => (isAtrValueFocused = false)}
                oninput={handleAtrValueInput}
                class="input-field w-full px-4 py-2 rounded-md pr-10"
                placeholder="ATR"
              />
              <button
                type="button"
                class="price-fetch-btn absolute top-1/2 right-2 -translate-y-1/2 {isAtrFetching
                  ? 'animate-spin'
                  : ''}"
                onclick={() => {
                  trackCustomEvent("ATR", "Fetch", symbol);
                  dispatch("fetchAtr");
                }}
                title={$_("dashboard.tradeSetupInputs.fetchAtrValue")}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  fill="currentColor"
                  viewBox="0 0 16 16"
                  ><path
                    d="M8.5 5.5a.5.5 0 0 0-1 0v3.354l-1.46-1.47a.5.5 0 0 0-.708.708l2.146 2.147a.5.5 0 0 0 .708 0l2.146-2.147a.5.5 0 0 0-.708-.708L8.5 8.854V5.5z"
                  /><path
                    d="M8 16a8 8 0 1 0 0-16 8 8 0 0 0 0 16zm7-8a7 7 0 1 1-14 0 7 7 0 0 1 14 0z"
                  /></svg
                >
              </button>
            </div>
          </div>
          <div>
            <label
              for="atr-multiplier-input-auto"
              class="input-label !mb-1 text-xs"
              >{$_("dashboard.tradeSetupInputs.atrMultiplierLabel")}</label
            >
            <div class="relative">
              <input
                id="atr-multiplier-input-auto"
                name="atrMultiplierAuto"
                type="text"
                use:numberInput={{ maxDecimalPlaces: 4 }}
                use:enhancedInput={{
                  step: 0.1,
                  min: 0.1,
                }}
                bind:value={localAtrMultiplier}
                onfocus={() => (isAtrMultiplierFocused = true)}
                onblur={() => (isAtrMultiplierFocused = false)}
                oninput={handleAtrMultiplierInput}
                class="input-field w-full px-4 py-2 rounded-md"
                placeholder="1.2"
              />
            </div>
          </div>
        </div>
      {/if}

      {#if showAtrFormulaDisplay}
        {@const lastEq = atrFormulaDisplay.lastIndexOf("=")}
        {@const formula = atrFormulaDisplay.substring(0, lastEq + 1)}
        {@const result = atrFormulaDisplay.substring(lastEq + 1)}
        <div
          class="text-center text-xs mt-2"
          style="color: var(--text-primary);"
        >
          <span>{formula}</span>
          <span
            role="button"
            tabindex="0"
            style="color: var(--danger-color); cursor: pointer;"
            onclick={(e) => copyStopLossToClipboard(result.trim(), e)}
            onkeydown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                copyStopLossToClipboard(result.trim(), e);
              }
            }}
            title="In Zwischenablage kopieren">{result}</span
          >
        </div>
      {/if}
    {/if}
  </div>
</div>

<!-- Smiley Feedback -->
{#if showSmiley}
  <div
    use:portal
    class="smiley-feedback"
    style="left: {smileyX + 10}px; top: {smileyY - 10}px;"
  >
    🙂
  </div>
{/if}

<style>
  .input-field:focus {
    box-shadow:
      0 4px 6px -1px rgba(0, 0, 0, 0.3),
      0 2px 4px -1px rgba(0, 0, 0, 0.06);
    border-color: var(--accent-color);
    z-index: 10;
  }

  .smiley-feedback {
    position: fixed;
    font-size: 1.5rem;
    pointer-events: none;
    z-index: var(--z-feedback);
    animation: fadeOut 1s ease-out forwards;
  }

  @keyframes fadeOut {
    0% {
      opacity: 1;
      transform: translateY(0);
    }
    100% {
      opacity: 0;
      transform: translateY(-10px);
    }
  }
</style>
