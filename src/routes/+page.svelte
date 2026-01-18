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
  import { preventDefault } from "svelte/legacy";

  import GeneralInputs from "../components/inputs/GeneralInputs.svelte";
  import PortfolioInputs from "../components/inputs/PortfolioInputs.svelte";
  import TagInputs from "../components/inputs/TagInputs.svelte";
  import TradeSetupInputs from "../components/inputs/TradeSetupInputs.svelte";
  import TakeProfitTargets from "../components/inputs/TakeProfitTargets.svelte";
  import VisualBar from "../components/shared/VisualBar.svelte";
  import { CONSTANTS, themes, themeIcons, icons } from "../lib/constants";
  import { app } from "../services/app";
  import {
    tradeStore,
    updateTradeStore,
    resetAllInputs,
    toggleAtrInputs,
  } from "../stores/tradeStore";
  import { resultsStore } from "../stores/resultsStore";
  import { presetStore } from "../stores/presetStore";
  import { uiStore } from "../stores/uiStore";
  import { settingsStore } from "../stores/settingsStore"; // Import settings store
  import { favoritesStore } from "../stores/favoritesStore"; // Import favorites store
  import { modalManager } from "../services/modalManager";
  import { onMount, untrack } from "svelte";
  import { _, locale } from "../locales/i18n"; // Import locale
  import { get } from "svelte/store"; // Import get
  import { loadInstruction } from "../services/markdownLoader";
  import { formatDynamicDecimal } from "../utils/utils";
  import { trackClick } from "../lib/actions";
  import { trackCustomEvent } from "../services/trackingService";
  import { createBackup, restoreFromBackup } from "../services/backupService";

  import type { IndividualTpResult } from "../stores/types";
  import SummaryResults from "../components/results/SummaryResults.svelte";
  import LanguageSwitcher from "../components/shared/LanguageSwitcher.svelte";
  import Tooltip from "../components/shared/Tooltip.svelte";
  import CachyIcon from "../components/shared/CachyIcon.svelte";
  import ModalFrame from "../components/shared/ModalFrame.svelte";
  import SettingsButton from "../components/settings/SettingsButton.svelte";
  import MarketOverview from "../components/shared/MarketOverview.svelte";
  import PositionsSidebar from "../components/shared/PositionsSidebar.svelte";
  import TechnicalsPanel from "../components/shared/TechnicalsPanel.svelte"; // Import TechnicalsPanel
  import ConnectionStatus from "../components/shared/ConnectionStatus.svelte"; // Import ConnectionStatus
  import SidePanel from "../components/shared/SidePanel.svelte";
  import { handleGlobalKeydown } from "../services/hotkeyService";

  let fileInput: HTMLInputElement | undefined = $state();
  let changelogContent = $state("");
  let guideContent = $state("");
  let privacyContent = $state("");
  let whitepaperContent = $state("");

  // Initialisierung der App-Logik, sobald die Komponente gemountet ist
  onMount(() => {
    app.init();

    // Global listener for markdown anchor links
    const handleAnchorClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const anchor = target.closest("a");

      if (anchor && anchor.hash && anchor.hash.startsWith("#")) {
        // Check if the anchor is inside a markdown container
        const container = anchor.closest(".prose");
        if (container) {
          e.preventDefault();
          const targetId = decodeURIComponent(anchor.hash.slice(1));
          // Use getElementById for IDs that might start with numbers
          const targetEl = document.getElementById(targetId);

          if (targetEl && container.contains(targetEl)) {
            targetEl.scrollIntoView({ behavior: "smooth" });
            history.pushState(null, "", anchor.hash);
          }
        }
      }
    };

    document.addEventListener("click", handleAnchorClick);
    return () => {
      document.removeEventListener("click", handleAnchorClick);
    };
  });

  // Load modal contents when opened
  $effect(() => {
    if ($uiStore.showChangelogModal && changelogContent === "") {
      loadInstruction("changelog").then((content) => {
        changelogContent = content.html;
      });
    }
  });

  $effect(() => {
    if ($uiStore.showGuideModal && guideContent === "") {
      loadInstruction("guide").then((content) => {
        guideContent = content.html;
      });
    }
  });

  $effect(() => {
    if ($uiStore.showPrivacyModal && privacyContent === "") {
      loadInstruction("privacy").then((content) => {
        privacyContent = content.html;
      });
    }
  });

  $effect(() => {
    if ($uiStore.showWhitepaperModal && whitepaperContent === "") {
      loadInstruction("whitepaper").then((content) => {
        whitepaperContent = content.html;
      });
    }
  });

  // Reset content when locale changes to force refetch
  $effect(() => {
    const _loc = $locale;
    guideContent = "";
    changelogContent = "";
    privacyContent = "";
    whitepaperContent = "";
  });

  let lastCalcTime = 0;
  const CALC_THROTTLE_MS = 250;

  // Reactive effect to trigger app.calculateAndDisplay() when relevant inputs change
  // DECOUPLED to prevent "flush" loops
  $effect(() => {
    // 1. Establish dependencies (Accessing values tracks them)
    const _s = $tradeStore;

    // Core inputs
    _s.accountSize;
    _s.riskPercentage;
    _s.entryPrice;
    _s.symbol;
    _s.tradeType;
    _s.targets;
    _s.leverage;
    _s.fees;
    _s.useAtrSl;
    _s.isRiskAmountLocked;
    _s.isPositionSizeLocked;
    _s.lockedPositionSize;

    // Conditional triggers:
    // If ATR is active, stopLossPrice is a RESULT, not a TRIGGER.
    if (_s.useAtrSl) {
      _s.atrValue;
      _s.atrMultiplier;
      _s.atrMode;
      _s.atrTimeframe;
    } else {
      // If ATR is off, Stop Loss is a manual input TRIGGER.
      _s.stopLossPrice;
    }

    // 2. Throttle check
    const now = Date.now();
    if (now - lastCalcTime < CALC_THROTTLE_MS) return;

    // 3. Validation and Execution
    if (
      _s.accountSize !== undefined &&
      _s.riskPercentage !== undefined &&
      _s.entryPrice !== undefined &&
      _s.symbol !== undefined &&
      _s.tradeType !== undefined &&
      _s.targets !== undefined
    ) {
      untrack(() => {
        app.calculateAndDisplay();
        lastCalcTime = Date.now();
      });
    }
  });

  function handleTradeSetupError(e: CustomEvent<string>) {
    uiStore.showError(e.detail);
  }

  function handleTargetsChange(
    event: CustomEvent<
      Array<{
        price: number | null;
        percent: number | null;
        isLocked: boolean;
      }>
    >,
  ) {
    updateTradeStore((s) => ({ ...s, targets: event.detail }));
  }

  function handleTpRemove(event: CustomEvent<number>) {
    const index = event.detail;
    const newTargets = $tradeStore.targets.filter((_, i) => i !== index);
    updateTradeStore((s) => ({ ...s, targets: newTargets }));
    app.adjustTpPercentages(null); // Pass null to signify a removal
  }

  function handleThemeSwitch(direction: "forward" | "backward" = "forward") {
    const currentIndex = themes.indexOf($uiStore.currentTheme);
    const limit = $settingsStore.isPro ? themes.length : 5;
    let nextIndex;

    if (direction === "forward") {
      nextIndex = (currentIndex + 1) % limit;
    } else {
      nextIndex = (currentIndex - 1 + limit) % limit;
    }

    uiStore.setTheme(themes[nextIndex]);
  }

  // Diese reaktive Variable formatiert den Theme-Namen benutzerfreundlich.
  // z.B. 'solarized-light' wird zu 'Solarized Light'
  let themeTitle = $derived(
    $uiStore.currentTheme
      .split("-")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" "),
  );

  let currentThemeIcon = $derived(
    themeIcons[$uiStore.currentTheme as keyof typeof themeIcons],
  );

  function handlePresetLoad(event: Event) {
    const selectedPreset = (event.target as HTMLSelectElement).value;
    app.loadPreset(selectedPreset);
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event && event.key && event.key.toLowerCase() === "escape") {
      event.preventDefault();
      if ($uiStore.showJournalModal) uiStore.toggleJournalModal(false);
      if ($uiStore.showGuideModal) uiStore.toggleGuideModal(false);
      if ($uiStore.showPrivacyModal) uiStore.togglePrivacyModal(false);
      if ($uiStore.showWhitepaperModal) uiStore.toggleWhitepaperModal(false);
      if ($uiStore.showChangelogModal) uiStore.toggleChangelogModal(false);
      if (get(modalManager).isOpen) modalManager._handleModalConfirm(false);
      return;
    }

    handleGlobalKeydown(event);
  }

  function handleBackupClick() {
    createBackup();
    trackCustomEvent("Backup", "Click", "CreateBackup");
  }

  function handleRestoreClick() {
    if (fileInput) {
      fileInput.click();
    }
  }

  function handleFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;

      modalManager
        .show(
          $_("app.restoreConfirmTitle"),
          $_("app.restoreConfirmMessage"),
          "confirm",
        )
        .then(async (confirmed) => {
          if (confirmed) {
            let result = await restoreFromBackup(content);

            if (result.needsPassword) {
              const password = await modalManager.show(
                $_("app.passwordRequiredTitle") || "Password Required",
                $_("app.enterBackupPassword") ||
                  "Please enter the password for this backup:",
                "prompt",
              );

              if (password && typeof password === "string") {
                result = await restoreFromBackup(content, password);
              } else {
                input.value = "";
                return;
              }
            }

            if (result.success) {
              uiStore.showFeedback("save"); // Re-use save feedback for now
              setTimeout(() => {
                window.location.reload();
              }, 1000);
            } else {
              uiStore.showError(result.message);
            }
          }
          // Reset file input so the same file can be selected again
          input.value = "";
        });
    };
    reader.onerror = () => {
      uiStore.showError("app.fileReadError");
    };
    reader.readAsText(file);

    trackCustomEvent("Backup", "Click", "RestoreBackup");
  }

  let isTechnicalsVisible = $state(true);

  // Load Technicals visibility state from localStorage
  onMount(() => {
    if (typeof localStorage !== "undefined") {
      const saved = localStorage.getItem("technicals_panel_visible");
      if (saved !== null) {
        isTechnicalsVisible = JSON.parse(saved);
      }
    }
  });

  // Save to localStorage whenever it changes
  $effect(() => {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(
        "technicals_panel_visible",
        JSON.stringify(isTechnicalsVisible),
      );
    }
  });

  function toggleTechnicals() {
    isTechnicalsVisible = !isTechnicalsVisible;
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<input
  type="file"
  class="hidden"
  bind:this={fileInput}
  onchange={handleFileSelected}
  accept=".json,application/json"
/>

<SidePanel />

<!-- Global Layout Wrapper -->
<div
  class="flex flex-col xl:flex-row items-start justify-center gap-0 md:gap-6 px-0 py-4 md:px-4 md:py-8 min-h-screen w-full box-border"
>
  {#if $settingsStore.showSidebars}
    <!-- Left Sidebar: Positions Table (Sticky) -->
    <div class="hidden xl:flex flex-col gap-3 w-96 shrink-0 sticky top-8 z-40">
      <PositionsSidebar />
    </div>
  {/if}

  <main
    class="w-full max-w-3xl calculator-wrapper glass-panel rounded-2xl shadow-2xl p-4 sm:p-8 fade-in relative shrink-0"
  >
    <ConnectionStatus />
    <div
      class="flex flex-col md:flex-row md:justify-between md:items-center mb-6 gap-4"
    >
      <div class="flex justify-between items-center w-full md:w-auto">
        <div class="flex items-center gap-3 text-[var(--text-primary)]">
          <CachyIcon class="h-8 w-8" />
          <h1 class="text-2xl sm:text-3xl font-bold">
            {$_("app.title")}
          </h1>
        </div>
        <button
          id="view-journal-btn-mobile"
          class="text-sm md:hidden bg-[var(--btn-accent-bg)] hover:bg-[var(--btn-accent-hover-bg)] text-[var(--btn-accent-text)] font-bold py-2 px-4 rounded-lg"
          title={$_("app.journalButtonTitle")}
          onclick={() => uiStore.toggleJournalModal(true)}
          use:trackClick={{
            category: "Navigation",
            action: "Click",
            name: "ViewJournalMobile",
          }}>{$_("app.journalButton")}</button
        >
      </div>
      <div
        class="flex items-center flex-wrap justify-end gap-2 w-full md:w-auto"
      >
        <div class="flex items-center flex-wrap justify-end gap-2 md:order-1">
          <select
            id="preset-loader"
            class="input-field px-3 py-2 rounded-md text-sm"
            onchange={handlePresetLoad}
            bind:value={$presetStore.selectedPreset}
          >
            <option value="">{$_("dashboard.presetLoad")}</option>
            {#each $presetStore.availablePresets as presetName}
              <option value={presetName}>{presetName}</option>
            {/each}
          </select>
          <button
            id="save-preset-btn"
            class="text-sm bg-[var(--btn-default-bg)] hover:bg-[var(--btn-default-hover-bg)] text-[var(--btn-default-text)] font-bold py-2.5 px-2.5 rounded-lg"
            title={$_("dashboard.savePresetTitle")}
            aria-label={$_("dashboard.savePresetAriaLabel")}
            onclick={app.savePreset}
            use:trackClick={{
              category: "Presets",
              action: "Click",
              name: "SavePreset",
            }}>{@html icons.save}</button
          >
          <button
            id="delete-preset-btn"
            class="text-sm bg-[var(--btn-danger-bg)] hover:bg-[var(--btn-danger-hover-bg)] text-[var(--btn-danger-text)] font-bold py-2.5 px-2.5 rounded-lg disabled:cursor-not-allowed"
            title={$_("dashboard.deletePresetTitle")}
            disabled={!$presetStore.selectedPreset}
            onclick={app.deletePreset}
            use:trackClick={{
              category: "Presets",
              action: "Click",
              name: "DeletePreset",
            }}>{@html icons.delete}</button
          >
          <button
            id="reset-btn"
            class="text-sm bg-[var(--btn-default-bg)] hover:bg-[var(--btn-default-hover-bg)] text-[var(--btn-default-text)] font-bold py-2.5 px-2.5 rounded-lg flex items-center gap-2"
            title={$_("dashboard.resetButtonTitle")}
            onclick={resetAllInputs}
            use:trackClick={{
              category: "Actions",
              action: "Click",
              name: "ResetAll",
            }}>{@html icons.broom}</button
          >
          <button
            id="theme-switcher"
            class="text-sm bg-[var(--btn-default-bg)] hover:bg-[var(--btn-default-hover-bg)] text-[var(--btn-default-text)] font-bold py-2 px-2.5 rounded-lg"
            aria-label={$_("dashboard.themeSwitcherAriaLabel")}
            onclick={() => handleThemeSwitch("forward")}
            oncontextmenu={preventDefault(() => handleThemeSwitch("backward"))}
            title={themeTitle}
            use:trackClick={{
              category: "Settings",
              action: "Click",
              name: "SwitchTheme",
            }}>{@html currentThemeIcon}</button
          >
        </div>
        <button
          id="view-journal-btn-desktop"
          class="hidden md:inline-block text-sm bg-[var(--btn-accent-bg)] hover:bg-[var(--btn-accent-hover-bg)] text-[var(--btn-accent-text)] font-bold py-2 px-4 rounded-lg md:order-2"
          title={$_("app.journalButtonTitle")}
          onclick={() => uiStore.toggleJournalModal(true)}
          use:trackClick={{
            category: "Navigation",
            action: "Click",
            name: "ViewJournalDesktop",
          }}>{$_("app.journalButton")}</button
        >
      </div>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
      <div>
        <GeneralInputs
          bind:tradeType={$tradeStore.tradeType}
          bind:leverage={$tradeStore.leverage}
          bind:fees={$tradeStore.fees}
        />

        <TagInputs tags={$tradeStore.tags} />

        <PortfolioInputs
          bind:accountSize={$tradeStore.accountSize}
          bind:riskPercentage={$tradeStore.riskPercentage}
          bind:riskAmount={$tradeStore.riskAmount}
          isRiskAmountLocked={$tradeStore.isRiskAmountLocked}
          isPositionSizeLocked={$tradeStore.isPositionSizeLocked}
          on:toggleRiskAmountLock={() => app.toggleRiskAmountLock()}
        />
      </div>

      <TradeSetupInputs
        bind:symbol={$tradeStore.symbol}
        bind:entryPrice={$tradeStore.entryPrice}
        bind:useAtrSl={$tradeStore.useAtrSl}
        bind:atrValue={$tradeStore.atrValue}
        bind:atrMultiplier={$tradeStore.atrMultiplier}
        bind:stopLossPrice={$tradeStore.stopLossPrice}
        bind:atrMode={$tradeStore.atrMode}
        bind:atrTimeframe={$tradeStore.atrTimeframe}
        on:showError={handleTradeSetupError}
        on:fetchPrice={() => app.handleFetchPrice()}
        on:toggleAtrInputs={(e) => toggleAtrInputs(e.detail)}
        on:selectSymbolSuggestion={(e) => app.selectSymbolSuggestion(e.detail)}
        on:setAtrMode={(e) => app.setAtrMode(e.detail)}
        on:setAtrTimeframe={(e) => app.setAtrTimeframe(e.detail)}
        on:fetchAtr={() => app.fetchAtr()}
        atrFormulaDisplay={$resultsStore.atrFormulaText}
        showAtrFormulaDisplay={$resultsStore.showAtrFormulaDisplay}
        isPriceFetching={$uiStore.isPriceFetching}
        isAtrFetching={$uiStore.isAtrFetching}
        symbolSuggestions={$uiStore.symbolSuggestions}
        showSymbolSuggestions={$uiStore.showSymbolSuggestions}
      />
    </div>

    <TakeProfitTargets
      bind:targets={$tradeStore.targets}
      on:change={handleTargetsChange}
      on:remove={handleTpRemove}
      calculatedTpDetails={$resultsStore.calculatedTpDetails}
    />

    {#if $uiStore.showErrorMessage}
      <div
        id="error-message"
        class="text-center text-sm font-medium mt-4 md:col-span-2"
        style:color="var(--danger-color)"
      >
        {$_($uiStore.errorMessage)}
      </div>
    {/if}

    <section id="results" class="mt-6 grid grid-cols-1 md:grid-cols-2 gap-x-8">
      <div>
        <SummaryResults
          isPositionSizeLocked={$tradeStore.isPositionSizeLocked}
          showCopyFeedback={$uiStore.showCopyFeedback}
          positionSize={$resultsStore.positionSize}
          netLoss={$resultsStore.netLoss}
          requiredMargin={$resultsStore.requiredMargin}
          entryFee={$resultsStore.entryFee}
          liquidationPrice={$resultsStore.liquidationPrice}
          breakEvenPrice={$resultsStore.breakEvenPrice}
          isMarginExceeded={$resultsStore.isMarginExceeded}
          on:toggleLock={() => app.togglePositionSizeLock()}
          on:copy={() => uiStore.showFeedback("copy")}
        />
        {#if $resultsStore.showTotalMetricsGroup}
          <div id="total-metrics-group" class="result-group">
            <h2 class="section-header">
              {$_("dashboard.totalTradeMetrics")}<Tooltip
                text={$_("dashboard.totalTradeMetricsTooltip")}
              />
            </h2>
            <div class="result-item">
              <span class="result-label"
                >{$_("dashboard.riskPerTradeCurrency")}<Tooltip
                  text={$_("dashboard.riskPerTradeCurrencyTooltip")}
                /></span
              ><span
                id="riskAmountCurrency"
                class="result-value"
                style:color="var(--danger-color)"
                >{$resultsStore.riskAmountCurrency}</span
              >
            </div>
            <div class="result-item">
              <span class="result-label"
                >{$_("dashboard.totalFees")}<Tooltip
                  text={$_("dashboard.totalFeesTooltip")}
                /></span
              ><span id="totalFees" class="result-value"
                >{$resultsStore.totalFees}</span
              >
            </div>
            <div class="result-item">
              <span class="result-label"
                >{$_("dashboard.maxPotentialProfit")}<Tooltip
                  text={$_("dashboard.maxPotentialProfitTooltip")}
                /></span
              ><span
                id="maxPotentialProfit"
                class="result-value"
                style:color="var(--success-color)"
                >{$resultsStore.maxPotentialProfit}</span
              >
            </div>
            <div class="result-item">
              <span class="result-label"
                >{$_("dashboard.weightedRR")}<Tooltip
                  text={$_("dashboard.weightedRRTooltip")}
                /></span
              ><span id="totalRR" class="result-value"
                >{$resultsStore.totalRR}</span
              >
            </div>
            <div class="result-item">
              <span class="result-label"
                >{$_("dashboard.totalNetProfit")}<Tooltip
                  text={$_("dashboard.totalNetProfitTooltip")}
                /></span
              ><span
                id="totalNetProfit"
                class="result-value"
                style:color="var(--success-color)"
                >{$resultsStore.totalNetProfit}</span
              >
            </div>
            <div class="result-item">
              <span class="result-label"
                >{$_("dashboard.soldPosition")}<Tooltip
                  text={$_("dashboard.soldPositionTooltip")}
                /></span
              ><span id="totalPercentSold" class="result-value"
                >{$resultsStore.totalPercentSold}</span
              >
            </div>
          </div>
        {/if}
      </div>
      <div id="tp-results-container">
        {#each $resultsStore.calculatedTpDetails as tpDetail}
          <div class="result-group !mt-0 md:!mt-6">
            <h2 class="section-header">
              {$_("dashboard.takeProfit")}
              {tpDetail.index + 1} ({tpDetail.percentSold.toFixed(0)}%)
            </h2>
            <div class="result-item">
              <span class="result-label">{$_("dashboard.riskRewardRatio")}</span
              ><span
                class="result-value"
                style:color={tpDetail.riskRewardRatio.gte(2)
                  ? "var(--success-color)"
                  : tpDetail.riskRewardRatio.gte(1.5)
                    ? "var(--warning-color)"
                    : "var(--danger-color)"}
                >{formatDynamicDecimal(tpDetail.riskRewardRatio, 2)}</span
              >
            </div>
            <div class="result-item">
              <span class="result-label"
                >{$_("dashboard.netProfit")}<Tooltip
                  text={$_("dashboard.netProfitTooltip")}
                /></span
              ><span class="result-value" style:color="var(--success-color)"
                >+{formatDynamicDecimal(tpDetail.netProfit, 2)}</span
              >
            </div>
            <div class="result-item">
              <span class="result-label"
                >{$_("dashboard.priceChange")}<Tooltip
                  text={$_("dashboard.priceChangeTooltip")}
                /></span
              ><span
                class="result-value"
                style:color={tpDetail.priceChangePercent.gt(0)
                  ? "var(--success-color)"
                  : "var(--danger-color)"}
                >{formatDynamicDecimal(tpDetail.priceChangePercent, 2)}%</span
              >
            </div>
            <div class="result-item">
              <span class="result-label"
                >{$_("dashboard.returnOnCapital")}<Tooltip
                  text={$_("dashboard.returnOnCapitalTooltip")}
                /></span
              ><span
                class="result-value"
                style:color={tpDetail.returnOnCapital.gt(0)
                  ? "var(--success-color)"
                  : "var(--danger-color)"}
                >{formatDynamicDecimal(tpDetail.returnOnCapital, 2)}%</span
              >
            </div>
            <div class="result-item">
              <span class="result-label"
                >{$_("dashboard.partialVolume")}<Tooltip
                  text={$_("dashboard.partialVolumeTooltip")}
                /></span
              ><span class="result-value"
                >{formatDynamicDecimal(tpDetail.partialVolume, 4)}</span
              >
            </div>
            <div class="result-item">
              <span class="result-label">{$_("dashboard.exitFeeLabel")}</span
              ><span class="result-value"
                >{formatDynamicDecimal(tpDetail.exitFee, 4)}</span
              >
            </div>
          </div>
        {/each}
      </div>
      <div class="md:col-span-2">
        <VisualBar
          entryPrice={$tradeStore.entryPrice}
          stopLossPrice={$tradeStore.stopLossPrice}
          targets={$tradeStore.targets}
          calculatedTpDetails={$resultsStore.calculatedTpDetails}
        />
      </div>
      <footer class="md:col-span-2">
        <textarea
          id="tradeNotes"
          class="input-field w-full px-4 py-2 rounded-md mb-4"
          rows="2"
          placeholder={$_("dashboard.tradeNotesPlaceholder")}
          bind:value={$tradeStore.tradeNotes}
        ></textarea>
        <div class="flex items-center gap-4">
          <button
            id="save-journal-btn"
            class="w-full font-bold py-3 px-4 rounded-lg btn-primary-action"
            onclick={app.addTrade}
            disabled={$resultsStore.positionSize === "-"}
            use:trackClick={{
              category: "Journal",
              action: "Click",
              name: "SaveTrade",
            }}>{$_("dashboard.addTradeToJournal")}</button
          >
          <button
            id="show-dashboard-readme-btn"
            class="font-bold p-3 rounded-lg btn-secondary-action"
            title={$_("dashboard.showInstructionsTitle")}
            aria-label={$_("dashboard.showInstructionsAriaLabel")}
            onclick={() => app.uiManager.showReadme("dashboard")}
            use:trackClick={{
              category: "Navigation",
              action: "Click",
              name: "ShowInstructions",
            }}>{@html icons.book}</button
          >
          {#if $uiStore.showSaveFeedback}<span
              id="save-feedback"
              class="save-feedback"
              class:visible={$uiStore.showSaveFeedback}
              >{$_("dashboard.savedFeedback")}</span
            >{/if}
        </div>
        <div class="mt-4 flex justify-between items-center">
          <LanguageSwitcher />
          <SettingsButton />
          <div class="flex items-center gap-2">
            <button
              id="backup-btn"
              class="text-sm bg-[var(--btn-default-bg)] hover:bg-[var(--btn-default-hover-bg)] text-[var(--btn-default-text)] font-bold py-2.5 px-2.5 rounded-lg"
              title={$_("app.backupButtonTitle")}
              aria-label={$_("app.backupButtonAriaLabel")}
              onclick={handleBackupClick}
            >
              {@html icons.export}
            </button>
            <button
              id="restore-btn"
              class="text-sm bg-[var(--btn-default-bg)] hover:bg-[var(--btn-default-hover-bg)] text-[var(--btn-default-text)] font-bold py-2.5 px-2.5 rounded-lg"
              title={$_("app.restoreButtonTitle")}
              aria-label={$_("app.restoreButtonAriaLabel")}
              onclick={handleRestoreClick}
            >
              {@html icons.import}
            </button>
          </div>
        </div>
      </footer>
    </section>

    {#if $settingsStore.showSidebars}
      <!-- Mobile MarketOverview position -->
      <div class="xl:hidden mt-8 flex flex-col gap-4">
        <!-- Add PositionsSidebar for Mobile -->
        <PositionsSidebar />

        <MarketOverview
          onToggleTechnicals={toggleTechnicals}
          {isTechnicalsVisible}
        />

        {#if $settingsStore.showTechnicals && isTechnicalsVisible}
          <TechnicalsPanel isVisible={isTechnicalsVisible} />
        {/if}

        {#if $favoritesStore.length > 0}
          <div
            class="text-[var(--text-secondary)] text-xs font-bold uppercase tracking-widest px-1"
          >
            {$_("dashboard.favorites") || "Favorites"}
          </div>
          {#each $favoritesStore as fav (fav)}
            {#if fav.toUpperCase() !== ($tradeStore.symbol || "").toUpperCase()}
              <MarketOverview customSymbol={fav} isFavoriteTile={true} />
            {/if}
          {/each}
        {/if}
      </div>
    {/if}
  </main>

  {#if $settingsStore.showSidebars}
    <!-- Right Sidebar: Market Data & Favorites (Sticky) -->
    <div
      class="hidden xl:flex flex-col gap-3 w-56 shrink-0 sticky top-8 transition-all duration-300 z-40"
    >
      <!-- Main current symbol -->
      <MarketOverview
        onToggleTechnicals={toggleTechnicals}
        {isTechnicalsVisible}
      />

      <!-- Technicals Panel (Absolute positioned next to MarketOverview) -->
      {#if $settingsStore.showTechnicals}
        <div
          class="absolute top-0 left-full ml-8 transition-all duration-300 transform origin-left z-40"
          class:scale-0={!isTechnicalsVisible}
          class:scale-100={isTechnicalsVisible}
          class:opacity-0={!isTechnicalsVisible}
          class:opacity-100={isTechnicalsVisible}
        >
          <TechnicalsPanel isVisible={isTechnicalsVisible} />
        </div>
      {/if}

      <!-- Favorites list -->
      {#if $favoritesStore.length > 0}
        <div
          class="text-[var(--text-secondary)] text-xs font-bold uppercase tracking-widest mt-2 px-1"
        >
          {$_("dashboard.favorites") || "Favorites"}
        </div>
      {/if}
      {#each $favoritesStore as fav (fav)}
        {#if fav.toUpperCase() !== ($tradeStore.symbol || "").toUpperCase()}
          <MarketOverview customSymbol={fav} isFavoriteTile={true} />
        {/if}
      {/each}
    </div>
  {/if}
</div>

<footer
  class="relative z-10 w-full max-w-4xl mx-auto text-center py-4 text-sm text-[var(--text-secondary)] flex justify-center items-center gap-4"
>
  <span>{$_("app.version")} {import.meta.env.VITE_APP_VERSION}</span>
  <button
    class="text-link"
    onclick={() => uiStore.toggleGuideModal(true)}
    use:trackClick={{
      category: "Navigation",
      action: "Click",
      name: "ShowGuide",
    }}>{$_("app.guideButton")}</button
  >
  <button
    class="text-link"
    onclick={() => uiStore.toggleChangelogModal(true)}
    use:trackClick={{
      category: "Navigation",
      action: "Click",
      name: "ShowChangelog",
    }}>{$_("app.changelogTitle")}</button
  >
  <button
    class="text-link"
    onclick={() => uiStore.togglePrivacyModal(true)}
    use:trackClick={{
      category: "Navigation",
      action: "Click",
      name: "ShowPrivacy",
    }}>{$_("app.privacyLegal")}</button
  >
  <button
    class="text-link"
    onclick={() => uiStore.toggleWhitepaperModal(true)}
    use:trackClick={{
      category: "Navigation",
      action: "Click",
      name: "ShowWhitepaper",
    }}>{$_("app.whitepaper")}</button
  >
  <a
    href="https://github.com/mydcc/cachy-app"
    target="_blank"
    rel="noopener noreferrer"
    class="text-link flex items-center justify-center hover:text-[var(--accent-color)] transition-all duration-300 hover:scale-110"
    title="GitHub"
    use:trackClick={{
      category: "Navigation",
      action: "Click",
      name: "GitHub",
    }}
  >
    {@html icons.github}
  </a>
  <button
    class="text-link {$settingsStore.isPro ? 'text-green-500 font-bold' : ''}"
    onclick={() => ($settingsStore.isPro = !$settingsStore.isPro)}
  >
    {$settingsStore.isPro ? $_("app.proActive") : $_("app.pro")}
  </button>
</footer>

<ModalFrame
  isOpen={$uiStore.showChangelogModal}
  title={$_("app.changelogTitle")}
  on:close={() => uiStore.toggleChangelogModal(false)}
  extraClasses="modal-size-instructions"
>
  <div id="changelog-content" class="prose dark:prose-invert">
    {@html changelogContent}
  </div>
</ModalFrame>

<ModalFrame
  isOpen={$uiStore.showGuideModal}
  title={$_("app.guideTitle")}
  on:close={() => uiStore.toggleGuideModal(false)}
  extraClasses="modal-size-instructions"
>
  <div id="guide-content" class="prose dark:prose-invert">
    {@html guideContent}
  </div>
</ModalFrame>

<ModalFrame
  isOpen={$uiStore.showPrivacyModal}
  title={$_("app.privacyLegal")}
  on:close={() => uiStore.togglePrivacyModal(false)}
  extraClasses="modal-size-instructions"
>
  <div id="privacy-content" class="prose dark:prose-invert">
    {@html privacyContent}
  </div>
</ModalFrame>

<ModalFrame
  isOpen={$uiStore.showWhitepaperModal}
  title={$_("app.whitepaper")}
  on:close={() => uiStore.toggleWhitepaperModal(false)}
  extraClasses="modal-size-instructions"
>
  <div id="whitepaper-content" class="prose dark:prose-invert">
    {@html whitepaperContent}
  </div>
</ModalFrame>
