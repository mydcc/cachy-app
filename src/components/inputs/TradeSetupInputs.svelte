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
  import { debounce, formatDynamicDecimal } from "../../utils/utils";
  import { createEventDispatcher, untrack } from "svelte";
  import { numberInput } from "../../utils/inputUtils";
  import { enhancedInput } from "../../lib/actions/inputEnhancements";
  import { _ } from "../../locales/i18n";
  import { trackCustomEvent } from "../../services/trackingService";
  import { onboardingService } from "../../services/onboardingService";
  import { normalizeSymbol } from "../../utils/symbolUtils";
  import { tradeState } from "../../stores/trade.svelte";
  import { settingsState } from "../../stores/settings.svelte";
  import { uiState } from "../../stores/ui.svelte";
  import { marketState } from "../../stores/market.svelte";
  import { resultsState } from "../../stores/results.svelte";
  import { fundingRateService } from "../../services/fundingRateService.svelte";
  import { windowManager } from "../../lib/windows/WindowManager.svelte";
  import { SymbolPickerWindow } from "../../lib/windows/implementations/SymbolPickerWindow.svelte";
  import { app } from "../../services/app";
  import { Decimal } from "decimal.js";
  import Tooltip from "../shared/Tooltip.svelte";

  const dispatch = createEventDispatcher();

  interface Props {
    symbol: string;
    entryPrice: string | null;
    useAtrSl: boolean;
    atrValue: string | null;
    atrMultiplier: string | null;
    stopLossPrice: string | null;
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

  // Read-only trading-pair metadata (precision, order-size limits, leverage
  // range, status) for the active symbol — see tradeService.fetchTradingPairInfo.
  let symbolMeta = $derived(
    symbol ? marketState.symbolMeta[normalizeSymbol(symbol, "bitunix")] : undefined,
  );

  // Local state for input to prevent immediate store updates
  let localSymbol = $state(symbol || "");
  let lastPropSymbol = $state(symbol); // Track prop for external changes
  let isSymbolFocused = $state(false);
  let selectedSuggestionIndex = $state(-1);

  const format = (val: string | null) =>
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
    const normSymbol = normalizeSymbol(localSymbol, "bitunix");
    const currentPrice = marketState.data[normSymbol]?.lastPrice;

    if (!localSymbol || !entryPrice || !currentPrice) return 0;

    try {
      const entry = new Decimal(entryPrice);
      const market = currentPrice; // Already Decimal

      if (market.isZero() || entry.isNaN()) return 0;

      const dev = entry.minus(market).div(market).abs().times(100).toNumber();
      return dev > 1000 ? 0 : dev; // Ignore extreme values during sync
    } catch {
      return 0;
    }
  });

  // Calculate 24h holding cost based on 7D average funding rate and position size
  let estimatedHoldingCost24h = $derived.by(() => {
    if (!symbol) return null;
    const norm = normalizeSymbol(symbol, "bitunix");
    const history = fundingRateService.historyState[norm];
    if (!history || !history.avg7d || history.avg7d.isZero()) return null;

    try {
      // Get position size (either from resultsState or locked position)
      let posSizeDecimal: Decimal | null = null;
      if (tradeState.isPositionSizeLocked && tradeState.lockedPositionSize && tradeState.lockedPositionSize.gt(0)) {
        posSizeDecimal = tradeState.lockedPositionSize;
      } else if (resultsState.positionSize && resultsState.positionSize !== "-") {
        posSizeDecimal = new Decimal(resultsState.positionSize.replace(/,/g, ""));
      }

      if (!posSizeDecimal || posSizeDecimal.lte(0)) return null;

      const entryPriceVal = entryPrice || localEntryPrice;
      if (!entryPriceVal) return null;
      const entryDecimal = new Decimal(entryPriceVal.replace(/,/g, ""));
      if (entryDecimal.lte(0)) return null;

      const notional = posSizeDecimal.times(entryDecimal);
      const fundingInterval = marketState.data[norm]?.fundingInterval ?? 8;
      const settlementsPerDay = new Decimal(24).dividedBy(fundingInterval);
      
      // Cost = Notional * avg7d_rate * (24 / interval)
      const cost24h = notional.times(history.avg7d).times(settlementsPerDay);
      return cost24h;
    } catch {
      return null;
    }
  });

  // On symbol change, fetch funding history on demand if not cached
  $effect(() => {
    if (symbol) {
      const norm = normalizeSymbol(symbol, "bitunix");
      fundingRateService.fetchHistory(norm);
    }
  });

  // Sync local state when prop changes (e.g. from Preset or internal selection)
  // CRITICAL: Only sync if user is NOT typing/focused to prevent mobile keyboard issues.
  // FIX: Allow clearing input (localSymbol === "") while focused without snapping back.
  $effect(() => {
    const currentSymbol = symbol;
    const currentFocused = isSymbolFocused;

    untrack(() => {
      // 1. If prop changed externally (e.g. Preset), always sync even if focused
      if (currentSymbol !== lastPropSymbol) {
        // FIX: Allow clearing input (localSymbol === "") while focused without snapping back.
        if (currentFocused && localSymbol === "" && currentSymbol !== "") {
          lastPropSymbol = currentSymbol;
          return;
        }

        localSymbol = currentSymbol || "";
        lastPropSymbol = currentSymbol;
        return;
      }

      // 2. Standard sync when NOT focused
      if (!currentFocused && currentSymbol !== localSymbol) {
        // FIX: If user cleared the input, do NOT snap back to old prop value.
        // The debounce will eventually update the prop/store to empty.
        if (localSymbol === "" && currentSymbol !== "") {
          return;
        }

        localSymbol = currentSymbol || "";
      }
    });
  });

  // Sync Numeric Inputs from Props to Local (One-way sync when NOT focused)
  $effect(() => {
    const currentEntryPrice = format(entryPrice);
    const currentFocused = isEntryPriceFocused;

    untrack(() => {
      if (!currentFocused && currentEntryPrice !== localEntryPrice) {
        localEntryPrice = currentEntryPrice;
      }
    });
  });

  $effect(() => {
    const currentStopLossPrice = format(stopLossPrice);
    const currentFocused = isStopLossPriceFocused;

    untrack(() => {
      if (!currentFocused && currentStopLossPrice !== localStopLossPrice) {
        localStopLossPrice = currentStopLossPrice;
      }
    });
  });

  $effect(() => {
    const currentAtrValue = format(atrValue);
    const currentFocused = isAtrValueFocused;

    untrack(() => {
      if (!currentFocused && currentAtrValue !== localAtrValue) {
        localAtrValue = currentAtrValue;
      }
    });
  });

  $effect(() => {
    const currentAtrMultiplier = format(atrMultiplier);
    const currentFocused = isAtrMultiplierFocused;

    untrack(() => {
      if (!currentFocused && currentAtrMultiplier !== localAtrMultiplier) {
        localAtrMultiplier = currentAtrMultiplier;
      }
    });
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

  // Helper to safely treat input as string, ensuring it's valid numeric format
  function parseInputVal(val: string): string | null | undefined {
    if (val === "") return null;

    // Normalize dots and commas
    const normalized = val.replace(",", ".");

    // Strict validation:
    // 1. Must be a valid number
    // 2. Must not end with a dot (incomplete decimal)
    // 3. Must not start with a dot without a leading zero (though parseFloat handles .123, APIs might not like it)

    // Regex for complete, valid decimal number:
    // ^\d+(\.\d+)?$  -> Matches "123", "123.45"
    // Does NOT match "123.", ".45", "12.3.4"
    if (/^\d+(\.\d+)?$/.test(normalized)) {
        return normalized;
    }

    // Allow partial typing in local state (handled by bind:value), but return undefined for store update
    // This prevents "123." from being sent to store until "123.4" is typed.
    return undefined;
  }

  function handleEntryPriceInput(e: Event) {
    const target = e.target as HTMLInputElement;
    const value = target.value;
    localEntryPrice = value;

    if (settingsState.autoUpdatePriceInput) {
      settingsState.autoUpdatePriceInput = false;
    }

    const validated = parseInputVal(value);
    // Only update store if value is valid AND different
    if (validated !== undefined && entryPrice !== validated) {
      tradeState.update((s) => ({ ...s, entryPrice: validated }));
    }
  }

  function handleAtrValueInput(e: Event) {
    const target = e.target as HTMLInputElement;
    const value = target.value;
    localAtrValue = value;

    const validated = parseInputVal(value);
    if (validated !== undefined && atrValue !== validated) {
      tradeState.update((s) => ({ ...s, atrValue: validated }));
    }
  }

  function handleAtrMultiplierInput(e: Event) {
    const target = e.target as HTMLInputElement;
    const value = target.value;
    localAtrMultiplier = value;

    const validated = parseInputVal(value);
    if (validated !== undefined && atrMultiplier !== validated) {
      tradeState.update((s) => ({ ...s, atrMultiplier: validated }));
    }
  }

  function handleStopLossPriceInput(e: Event) {
    const target = e.target as HTMLInputElement;
    const value = target.value;
    localStopLossPrice = value;

    const validated = parseInputVal(value);
    if (validated !== undefined && stopLossPrice !== validated) {
      tradeState.update((s) => ({ ...s, stopLossPrice: validated }));
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

  // Determine dynamic step based on price magnitude or symbol quotePrecision
  let priceStep = $derived.by(() => {
    if (symbolMeta?.quotePrecision !== undefined) {
      return new Decimal(10).pow(-symbolMeta.quotePrecision).toNumber();
    }
    if (!entryPrice) return 0.01;
    const price = parseFloat(String(entryPrice));
    if (isNaN(price) || price === 0) return 0.01;

    // Dynamic precision for low-sat assets vs high-value assets
    if (price > 1000) return 0.5;
    if (price > 100) return 0.1;
    if (price > 1) return 0.01;
    if (price > 0.01) return 0.0001;
    if (price > 0.0001) return 0.000001;
    return 0.00000001;
  });

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
    } catch {
      uiState.showError($_("dashboard.tradeSetupInputs.copyFailed"));
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
        data-track-id="input-symbol"
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
          data-track-id="btn-symbol-picker"
          class="symbol-picker-btn p-1 rounded hover:bg-[var(--bg-tertiary)] transition-colors text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          onclick={() => windowManager.open(new SymbolPickerWindow())}
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
          data-track-id="btn-fetch-price"
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
                ? 'bg-[var(--accent-color)] text-[var(--btn-accent-text)]'
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
        data-track-id="input-entry-price"
        use:numberInput={{ maxDecimalPlaces: symbolMeta?.quotePrecision ?? 20 }}
        use:enhancedInput={{
          step: priceStep,
          min: 0,
          rightOffset: "16px",
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
          ? 'border-[var(--orange-500)] shadow-[0_0_5px_var(--orange-500)]'
          : ''}"
        placeholder={$_("dashboard.tradeSetupInputs.entryPricePlaceholder")}
      />
      {#if priceDeviation > 1}
        <div
          class="absolute -top-6 left-0 text-[10px] text-[var(--orange-500)] font-bold animate-pulse flex items-center gap-1"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path
              d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"
            />
            <path d="M12 9v4" />
            <path d="M12 17h.01" />
          </svg>
          {$_("dashboard.tradeSetupInputs.priceDeviation")}: {priceDeviation.toFixed(
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
        data-track-id="toggle-auto-price"
        title={settingsState.autoUpdatePriceInput
          ? $_("dashboard.tradeSetupInputs.autoUpdateOn")
          : $_("dashboard.tradeSetupInputs.autoUpdateOff")}
        onclick={toggleAutoUpdatePrice}
        aria-label={$_("dashboard.tradeSetupInputs.toggleAutoUpdatePrice")}
      ></button>
    </div>
  </div>

  {#if symbolMeta}
    <div
      class="flex flex-wrap items-center gap-x-3 gap-y-1 -mt-2 mb-4 text-[10px] text-[var(--text-secondary)]"
    >
      {#if symbolMeta.basePrecision !== undefined}
        <span>{$_("dashboard.symbolInfo.precision")}: {symbolMeta.basePrecision}</span>
      {/if}
      {#if symbolMeta.minTradeVolume}
        <span
          >{$_("dashboard.symbolInfo.minSize")}: {formatDynamicDecimal(
            symbolMeta.minTradeVolume,
          )}</span
        >
      {/if}
      {#if symbolMeta.minLeverage !== undefined && symbolMeta.maxLeverage !== undefined}
        <span
          >{$_("dashboard.symbolInfo.leverageRange")}: {symbolMeta.minLeverage}x–{symbolMeta.maxLeverage}x</span
        >
      {/if}
      {#if symbolMeta.symbolStatus === "CANCEL_ONLY"}
        <span class="font-semibold text-[var(--warning-color)]"
          >{$_("dashboard.symbolInfo.statusCancelOnly")}</span
        >
      {:else if symbolMeta.symbolStatus === "STOP"}
        <span class="font-semibold text-[var(--danger-color)]"
          >{$_("dashboard.symbolInfo.statusStop")}</span
        >
      {/if}
      {#if symbolMeta.isApiSupported === false}
        <span class="font-semibold text-[var(--danger-color)]"
          >{$_("dashboard.symbolInfo.apiNotSupported")}</span
        >
      {/if}
      {#if estimatedHoldingCost24h !== null}
        <span class="flex items-center gap-1">
          <span class="text-[var(--text-secondary)]">{$_("dashboard.tradeSetupInputs.holdingCost24h")}:</span>
          <span
            class="font-medium"
            class:text-[var(--danger-color)]={estimatedHoldingCost24h.gt(0)}
            class:text-[var(--success-color)]={estimatedHoldingCost24h.lt(0)}
          >
            {estimatedHoldingCost24h.gte(0) ? `+${formatDynamicDecimal(estimatedHoldingCost24h, 2)}` : formatDynamicDecimal(estimatedHoldingCost24h, 2)} USDT
          </span>
          <Tooltip text={$_("dashboard.tradeSetupInputs.holdingCost24hTooltip")} />
        </span>
      {/if}
    </div>
  {:else if estimatedHoldingCost24h !== null}
    <div
      class="flex flex-wrap items-center gap-x-3 gap-y-1 -mt-2 mb-4 text-[10px] text-[var(--text-secondary)]"
    >
      <span class="flex items-center gap-1">
        <span class="text-[var(--text-secondary)]">{$_("dashboard.tradeSetupInputs.holdingCost24h")}:</span>
        <span
          class="font-medium"
          class:text-[var(--danger-color)]={estimatedHoldingCost24h.gt(0)}
          class:text-[var(--success-color)]={estimatedHoldingCost24h.lt(0)}
        >
          {estimatedHoldingCost24h.gte(0) ? `+${formatDynamicDecimal(estimatedHoldingCost24h, 2)}` : formatDynamicDecimal(estimatedHoldingCost24h, 2)} USDT
        </span>
        <Tooltip text={$_("dashboard.tradeSetupInputs.holdingCost24hTooltip")} />
      </span>
    </div>
  {/if}

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
          data-track-id="toggle-atr-sl"
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
          data-track-id="input-stop-loss"
          use:numberInput={{ maxDecimalPlaces: symbolMeta?.quotePrecision ?? 20 }}
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
              data-track-id="input-atr-value"
              use:numberInput={{ maxDecimalPlaces: 20 }}
              use:enhancedInput={{
                step: 0.1,
                min: 0,
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
              data-track-id="input-atr-multiplier"
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
                data-track-id="select-atr-timeframe"
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
                data-track-id="input-atr-value"
                use:numberInput={{ maxDecimalPlaces: 20 }}
                use:enhancedInput={{
                  step: 0.1,
                  min: 0,
                  hasAction: true,
                }}
                bind:value={localAtrValue}
                onfocus={() => (isAtrValueFocused = true)}
                onblur={() => (isAtrValueFocused = false)}
                oninput={handleAtrValueInput}
                class="input-field w-full px-4 py-2 rounded-md"
                placeholder={$_("dashboard.tradeSetupInputs.atrLabel")}
              />
              <button
                type="button"
                data-track-id="btn-fetch-atr"
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
                data-track-id="input-atr-multiplier"
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
                placeholder={$_("dashboard.tradeSetupInputs.multiplierExample")}
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
          class="text-center text-xs mt-2 whitespace-nowrap"
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
            title={$_("dashboard.tradeSetupInputs.copyToClipboard")}
            >{result}</span
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
    role="status"
    aria-live="polite"
    class="smiley-feedback"
    style="left: {smileyX + 10}px; top: {smileyY - 10}px;"
  >
    🙂
  </div>
{/if}

<style>
  .input-field:focus {
    box-shadow: var(--shadow-card);
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
