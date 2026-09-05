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
  import { themes, themeIcons, icons } from "../lib/constants";
  import { APP_VERSION } from "../lib/version";
  import { app } from "../services/app";
  import { tradeState } from "../stores/trade.svelte";
  import { resultsState } from "../stores/results.svelte";
  import { presetState } from "../stores/preset.svelte";
  import { settingsState } from "../stores/settings.svelte"; // Import settings state
  import { uiState } from "../stores/ui.svelte"; // Import uiState
  import { windowManager } from "../lib/windows/WindowManager.svelte";
  import { favoritesState } from "../stores/favorites.svelte";
  import { onMount } from "svelte";
  import { _, locale } from "../locales/i18n"; // Import locale
  import { formatDynamicDecimal } from "../utils/utils";
  import { trackClick } from "../lib/actions";
  import type { TranslationKey } from "../locales/schema";

  import SummaryResults from "../components/results/SummaryResults.svelte";
  import PlaceOrderPanel from "../components/results/PlaceOrderPanel.svelte";
  import LanguageSwitcher from "../components/shared/LanguageSwitcher.svelte";
  import Tooltip from "../components/shared/Tooltip.svelte";
  import CachyIcon from "../components/shared/CachyIcon.svelte";
  import MarketOverview from "../components/shared/MarketOverview.svelte";
  import PositionsSidebar from "../components/shared/PositionsSidebar.svelte";
  import TechnicalsPanel from "../components/shared/TechnicalsPanel.svelte"; // Import TechnicalsPanel
  import ConnectionStatus from "../components/shared/ConnectionStatus.svelte"; // Import ConnectionStatus
  import LeftControlPanel from "../components/shared/LeftControlPanel.svelte";
  import FloatingIframeButton from "../components/shared/FloatingIframeButton.svelte";
  import NewsSentimentPanel from "../components/shared/NewsSentimentPanel.svelte";
  import PowerToggle from "../components/shared/PowerToggle.svelte";
  import QuizButton from "../components/shared/QuizButton.svelte";
  import FlashCard from "../components/shared/FlashCard.svelte";
  import OnboardingSpotlight from "../components/shared/OnboardingSpotlight.svelte";
  import { handleGlobalKeydown } from "../services/hotkeyService";
  import { effectsState } from "../stores/effects.svelte";

  let changelogContent = $state("");
  let guideContent = $state("");
  let privacyContent = $state("");
  let whitepaperContent = $state("");

  // Initialisierung der App-Logik, sobald die Komponente gemountet ist
  onMount(() => {
    app.init();
    effectsState.triggerDuckEvent({ type: "daily_login" });

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

  // Helper to lazy-load markdown content on demand
  async function fetchInstructionHtml(
    type: "changelog" | "guide" | "privacy" | "whitepaper",
  ) {
    const { loadInstruction } = await import("../services/markdownLoader");
    const content = await loadInstruction(type);
    return content.html;
  }

  // Load modal contents when opened
  $effect(() => {
    if (windowManager.isOpen("changelog") && changelogContent === "") {
      fetchInstructionHtml("changelog").then((html) => {
        changelogContent = html;
      });
    }
  });

  $effect(() => {
    if (windowManager.isOpen("guide") && guideContent === "") {
      fetchInstructionHtml("guide").then((html) => {
        guideContent = html;
      });
    }
  });

  $effect(() => {
    if (windowManager.isOpen("privacy") && privacyContent === "") {
      fetchInstructionHtml("privacy").then((html) => {
        privacyContent = html;
      });
    }
  });

  $effect(() => {
    if (windowManager.isOpen("whitepaper") && whitepaperContent === "") {
      fetchInstructionHtml("whitepaper").then((html) => {
        whitepaperContent = html;
      });
    }
  });

  // Reset content when locale changes to force refetch
  $effect(() => {
    void $locale;
    guideContent = "";
    changelogContent = "";
    privacyContent = "";
    whitepaperContent = "";
  });

  function handleTradeSetupError(e: CustomEvent<string>) {
    uiState.showError(e.detail);
  }

  function handleTargetsChange(
    event: CustomEvent<
      Array<{
        price: string | null;
        percent: string | null;
        isLocked: boolean;
      }>
    >,
  ) {
    tradeState.targets = event.detail;
  }


  function handleThemeSwitch(direction: "forward" | "backward" = "forward") {
    const currentIndex = themes.indexOf(uiState.currentTheme);
    const limit = themes.length;
    let nextIndex;

    if (direction === "forward") {
      nextIndex = (currentIndex + 1) % limit;
    } else {
      nextIndex = (currentIndex - 1 + limit) % limit;
    }

    uiState.setTheme(themes[nextIndex]);
  }

  // Diese reaktive Variable formatiert den Theme-Namen benutzerfreundlich.
  // z.B. 'solarized-light' wird zu 'Solarized Light'
  let themeTitle = $derived(
    uiState.currentTheme
      .split("-")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" "),
  );

  let currentThemeIcon = $derived(
    themeIcons[uiState.currentTheme as keyof typeof themeIcons],
  );

  function handlePresetLoad(event: Event) {
    const selectedPreset = (event.target as HTMLSelectElement).value;
    app.loadPreset(selectedPreset);
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event && event.key && event.key.toLowerCase() === "escape") {
      event.preventDefault();
      if (windowManager.isOpen("journal")) uiState.toggleJournalModal(false);
      if (windowManager.isOpen("guide")) uiState.toggleGuideModal(false);
      if (windowManager.isOpen("privacy")) uiState.togglePrivacyModal(false);
      if (windowManager.isOpen("whitepaper"))
        uiState.toggleWhitepaperModal(false);
      if (windowManager.isOpen("changelog"))
        uiState.toggleChangelogModal(false);
      // Academy is its own window type now (FEAT-0045), with a real fixed
      // "academy" id, closed directly rather than through a uiState
      // wrapper. Market Dashboard and TpSlEdit stay `modal`-type windows,
      // which close on Escape via WindowManager's own closeOnBlur handling
      // (FEAT-0044) instead of a branch here.
      if (windowManager.isOpen("academy")) windowManager.close("academy");
      return;
    }

    handleGlobalKeydown(event);
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

  let isTechnicalsDocked = $derived(
    !settingsState.showMarketOverview && settingsState.showTechnicals,
  );
  let sidebarWidthClass = $derived(
    isTechnicalsDocked
      ? settingsState.showIndicatorParams
        ? "w-[22rem]"
        : "w-72"
      : "w-56",
  );

  const MAX_FAVORITE_TILES = 4;

  let displayedFavorites = $derived(
    favoritesState.items
      .filter(
        (fav) => fav.toUpperCase() !== (tradeState.symbol || "").toUpperCase(),
      )
      .slice(0, MAX_FAVORITE_TILES),
  );

  // --- Panel tilt feedback on Pro mode switch (footer PowerToggle) ---
  let isProPanelTilt = $state(false);
  let lastKnownIsPro = settingsState.entitlement.isPro;

  $effect(() => {
    const isPro = settingsState.entitlement.isPro;
    if (isPro !== lastKnownIsPro) {
      lastKnownIsPro = isPro;
      if (!isProPanelTilt) {
        isProPanelTilt = true;
      }
    }
  });

  function handleTiltAnimationEnd(event: AnimationEvent) {
    // animationend bubbles, so only react to the panel's own sweep
    // animation -- child animations (fade-in etc.) must not clear it.
    if (
      event.target === event.currentTarget &&
      event.animationName === "panel-gloss-sweep"
    ) {
      isProPanelTilt = false;
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<LeftControlPanel />

<!-- Global Layout Wrapper -->
<div
  class="flex flex-col items-center xl:items-start justify-center gap-0 md:gap-6 px-0 py-4 md:px-4 md:py-8 min-h-screen w-full box-border"
  class:xl:grid={settingsState.showSidebars}
  class:xl:grid-cols-[1fr_auto_1fr]={settingsState.showSidebars}
  class:xl:flex={!settingsState.showSidebars}
>
  {#if settingsState.showSidebars}
    <!-- Left Sidebar: Positions Table & Sentiment (Sticky) -->
    <div class="hidden xl:flex justify-self-end self-stretch">
      <div class="sticky top-8 flex flex-col gap-3 w-96 shrink-0 z-40 h-fit">
        {#if settingsState.showMarketSentiment}
          <NewsSentimentPanel symbol={tradeState.symbol} variant="sidebar" />
        {/if}
        {#if settingsState.effectiveShowSidebarActivity}
          <PositionsSidebar />
        {/if}
      </div>
    </div>
  {/if}

  <main
    class="w-full max-w-3xl xl:min-w-3xl calculator-wrapper glass-panel rounded-2xl shadow-2xl p-4 sm:p-8 fade-in relative shrink-0 overflow-hidden"
    class:xl:col-start-2={settingsState.showSidebars}
    class:panel-tilt={isProPanelTilt}
    onanimationend={handleTiltAnimationEnd}
  >
    <div id="market-overview-widget">
      <ConnectionStatus />
    </div>
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
          id="journal-toggle-btn"
          class="text-sm md:hidden bg-[var(--btn-accent-bg)] hover:bg-[var(--btn-accent-hover-bg)] text-[var(--btn-accent-text)] font-bold py-2 px-4 rounded-lg"
          title={$_("app.journalButtonTitle")}
          onclick={() => uiState.toggleJournalModal(true)}
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
            bind:value={presetState.selectedPreset}
          >
            <option value="">{$_("dashboard.presetLoad")}</option>
            {#each presetState.availablePresets as presetName}
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
            disabled={!presetState.selectedPreset}
            onclick={() => app.deletePreset(presetState.selectedPreset)}
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
            onclick={() => tradeState.resetInputs(true)}
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
          onclick={() => uiState.toggleJournalModal(true)}
          use:trackClick={{
            category: "Navigation",
            action: "Click",
            name: "ViewJournalDesktop",
          }}>{$_("app.journalButton")}</button
        >
      </div>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
      <div id="trade-setup-card">
        <GeneralInputs
          bind:tradeType={tradeState.tradeType}
          bind:leverage={tradeState.leverage}
        />

        <PortfolioInputs
          bind:accountSize={tradeState.accountSize}
          bind:riskPercentage={tradeState.riskPercentage}
          bind:riskAmount={tradeState.riskAmount}
          isRiskAmountLocked={tradeState.isRiskAmountLocked}
          isPositionSizeLocked={tradeState.isPositionSizeLocked}
          on:toggleRiskAmountLock={() => app.toggleRiskAmountLock()}
        />

        <PlaceOrderPanel />
      </div>

      <div>
        <TradeSetupInputs
          bind:symbol={tradeState.symbol}
          bind:entryPrice={tradeState.entryPrice}
          bind:useAtrSl={tradeState.useAtrSl}
          bind:atrValue={tradeState.atrValue}
          bind:atrMultiplier={tradeState.atrMultiplier}
          bind:stopLossPrice={tradeState.stopLossPrice}
          bind:atrMode={tradeState.atrMode}
          bind:atrTimeframe={tradeState.atrTimeframe}
          on:showError={handleTradeSetupError}
          on:fetchPrice={() => app.handleFetchPrice()}
          on:toggleAtrInputs={(e) => {
            tradeState.useAtrSl = e.detail;
          }}
          on:selectSymbolSuggestion={(e) => app.selectSymbolSuggestion(e.detail)}
          on:setAtrMode={(e) => app.setAtrMode(e.detail)}
          on:setAtrTimeframe={(e) => app.setAtrTimeframe(e.detail)}
          on:fetchAtr={() => app.fetchAtr()}
          atrFormulaDisplay={resultsState.atrFormulaText}
          showAtrFormulaDisplay={resultsState.showAtrFormulaDisplay}
          isPriceFetching={uiState.isPriceFetching}
          isAtrFetching={uiState.isAtrFetching}
          symbolSuggestions={uiState.symbolSuggestions}
          showSymbolSuggestions={uiState.showSymbolSuggestions}
        />

        <div id="tp-targets-card">
          <TakeProfitTargets
            bind:targets={tradeState.targets}
            on:change={handleTargetsChange}
            calculatedTpDetails={resultsState.calculatedTpDetails}
          />
        </div>

        <TagInputs tags={tradeState.tags} />
      </div>
    </div>

    {#if uiState.showErrorMessage}
      <div
        id="error-message"
        class="text-center text-sm font-medium mt-4 md:col-span-2"
        style:color="var(--danger-color)"
      >
        {$_(uiState.errorMessage as TranslationKey)}
      </div>
    {/if}

    <section id="results" class="mt-6 grid grid-cols-1 md:grid-cols-2 gap-x-8">
      <div>
        <SummaryResults
          isPositionSizeLocked={tradeState.isPositionSizeLocked}
          showCopyFeedback={uiState.showCopyFeedback}
          positionSize={resultsState.positionSize}
          netLoss={resultsState.netLoss}
          requiredMargin={resultsState.requiredMargin}
          entryFee={resultsState.entryFee}
          liquidationPrice={resultsState.liquidationPrice}
          breakEvenPrice={resultsState.breakEvenPrice}
          isMarginExceeded={resultsState.isMarginExceeded}
          on:toggleLock={() => app.togglePositionSizeLock()}
          on:copy={() => uiState.showFeedback("copy")}
        />
        {#if resultsState.showTotalMetricsGroup}
          <div id="total-metrics-group" class="result-group">
            <h2 class="section-header">
              {$_("dashboard.totalTradeMetrics")}
            </h2>
            <div class="result-item">
              <span class="result-label">
                <Tooltip text={$_("dashboard.riskPerTradeCurrencyTooltip")}>
                  <span>{$_("dashboard.riskPerTradeCurrency")}</span>
                </Tooltip>
              </span>
              <span
                id="riskAmountCurrency"
                class="result-value"
                style:color="var(--danger-color)"
                >{resultsState.riskAmountCurrency}</span
              >
            </div>
            <div class="result-item">
              <span class="result-label">
                <Tooltip text={$_("dashboard.totalFeesTooltip")}>
                  <span>{$_("dashboard.totalFees")}</span>
                </Tooltip>
              </span>
              <span id="totalFees" class="result-value"
                >{resultsState.totalFees}</span
              >
            </div>
            <div class="result-item">
              <span class="result-label">
                <Tooltip text={$_("dashboard.maxPotentialProfitTooltip")}>
                  <span>{$_("dashboard.maxPotentialProfit")}</span>
                </Tooltip>
              </span>
              <span
                id="maxPotentialProfit"
                class="result-value"
                style:color="var(--success-color)"
                >{resultsState.maxPotentialProfit}</span
              >
            </div>
            <div class="result-item">
              <span class="result-label">
                <Tooltip text={$_("dashboard.weightedRRTooltip")}>
                  <span>{$_("dashboard.weightedRR")}</span>
                </Tooltip>
              </span>
              <span id="totalRR" class="result-value"
                >{resultsState.totalRR}</span
              >
            </div>
            <div class="result-item">
              <span class="result-label">
                <Tooltip text={$_("dashboard.totalNetProfitTooltip")}>
                  <span>{$_("dashboard.totalNetProfit")}</span>
                </Tooltip>
              </span>
              <span
                id="totalNetProfit"
                class="result-value"
                style:color="var(--success-color)"
                >{resultsState.totalNetProfit}</span
              >
            </div>
            <div class="result-item">
              <span class="result-label">
                <Tooltip text={$_("dashboard.soldPositionTooltip")}>
                  <span>{$_("dashboard.soldPosition")}</span>
                </Tooltip>
              </span>
              <span id="totalPercentSold" class="result-value"
                >{resultsState.totalPercentSold}</span
              >
            </div>
          </div>
        {/if}
      </div>
      <div id="tp-results-container">
        {#each resultsState.calculatedTpDetails as tpDetail}
          <div class="result-group">
            <h2 class="section-header">
              {$_("dashboard.takeProfit")}
              {tpDetail.index + 1} ({tpDetail.percentSold.toFixed(0)}%)
            </h2>
            <div class="result-item">
              <span class="result-label">
                <Tooltip text={$_("dashboard.riskRewardRatioTooltip")}>
                  <span>{$_("dashboard.riskRewardRatio")}</span>
                </Tooltip>
              </span>
              <span
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
              <span class="result-label">
                <Tooltip text={$_("dashboard.netProfitTooltip")}>
                  <span>{$_("dashboard.netProfit")}</span>
                </Tooltip>
              </span>
              <span class="result-value" style:color="var(--success-color)"
                >+{formatDynamicDecimal(tpDetail.netProfit, 2)}</span
              >
            </div>
            <div class="result-item">
              <span class="result-label">
                <Tooltip text={$_("dashboard.priceChangeTooltip")}>
                  <span>{$_("dashboard.priceChange")}</span>
                </Tooltip>
              </span>
              <span
                class="result-value"
                style:color={tpDetail.priceChangePercent.gt(0)
                  ? "var(--success-color)"
                  : "var(--danger-color)"}
                >{formatDynamicDecimal(tpDetail.priceChangePercent, 2)}%</span
              >
            </div>
            <div class="result-item">
              <span class="result-label">
                <Tooltip text={$_("dashboard.returnOnCapitalTooltip")}>
                  <span>{$_("dashboard.returnOnCapital")}</span>
                </Tooltip>
              </span>
              <span
                class="result-value"
                style:color={tpDetail.returnOnCapital.gt(0)
                  ? "var(--success-color)"
                  : "var(--danger-color)"}
                >{formatDynamicDecimal(tpDetail.returnOnCapital, 2)}%</span
              >
            </div>
            <div class="result-item">
              <span class="result-label">
                <Tooltip text={$_("dashboard.partialVolumeTooltip")}>
                  <span>{$_("dashboard.partialVolume")}</span>
                </Tooltip>
              </span>
              <span class="result-value"
                >{formatDynamicDecimal(tpDetail.partialVolume, 4)}</span
              >
            </div>
            <div class="result-item">
              <span class="result-label">
                <Tooltip text={$_("dashboard.exitFeeTooltip")}>
                  <span>{$_("dashboard.exitFeeLabel")}</span>
                </Tooltip>
              </span>
              <span class="result-value"
                >{formatDynamicDecimal(tpDetail.exitFee, 4)}</span
              >
            </div>
          </div>
        {/each}
      </div>
      <div class="md:col-span-2">
        <VisualBar
          entryPrice={tradeState.entryPrice}
          stopLossPrice={tradeState.stopLossPrice}
          targets={tradeState.targets}
          calculatedTpDetails={resultsState.calculatedTpDetails}
        />
      </div>
      <footer class="md:col-span-2">
        <textarea
          id="tradeNotes"
          class="input-field w-full px-3 py-2 rounded-md mb-3 text-sm"
          rows="2"
          placeholder={$_("dashboard.tradeNotesPlaceholder")}
          bind:value={tradeState.tradeNotes}
        ></textarea>
        <div class="grid grid-cols-[1fr_auto_1fr] items-center py-2 px-1 gap-2">
          <div class="flex items-center justify-start gap-2">
            <LanguageSwitcher />
          </div>
          <div class="flex items-center justify-center gap-2">
            <QuizButton />
            <FloatingIframeButton />
            <button
              class="h-9 w-9 flex-shrink-0 flex items-center justify-center rounded-lg btn-secondary-action transition-all duration-300 hover:scale-105 text-base"
              title={$_("dashboard.triggerPulse")}
              aria-label={$_("dashboard.triggerPulse")}
              onclick={(e) =>
                effectsState.triggerProjectile(e.currentTarget as HTMLElement)}
            >
              🚀
            </button>
          </div>
          <div class="flex items-center justify-end gap-2">
            <PowerToggle />
          </div>
        </div>
      </footer>
    </section>

    {#if settingsState.showSidebars}
      <!-- Mobile MarketOverview position -->
      <div class="xl:hidden mt-8 flex flex-col gap-4">
        {#if settingsState.enableNewsAnalysis && (settingsState.cryptoPanicApiKey || settingsState.newsApiKey)}
          <NewsSentimentPanel symbol={tradeState.symbol} variant="sidebar" />
        {/if}

        {#if settingsState.effectiveShowSidebarActivity}
          <!-- Add PositionsSidebar for Mobile -->
          <PositionsSidebar />
        {/if}

        {#if settingsState.showMarketOverview}
          <MarketOverview
            onToggleTechnicals={toggleTechnicals}
            {isTechnicalsVisible}
          />
        {/if}

        {#if settingsState.showTechnicals && isTechnicalsVisible}
          <TechnicalsPanel  isVisible={isTechnicalsVisible} fluidWidth={true} />
        {/if}

        {#if settingsState.showMarketOverview && displayedFavorites.length > 0}
          <div
            class="text-[var(--text-secondary)] text-xs font-bold uppercase tracking-widest px-1"
          >
            {$_("dashboard.favorites") || "Favorites"}
          </div>
          {#each displayedFavorites as fav (fav)}
            <MarketOverview customSymbol={fav} isFavoriteTile={true} />
          {/each}
        {/if}
      </div>
    {/if}
  </main>

  {#if settingsState.showSidebars}
    <!-- Right Sidebar: Market Data & Favorites (Sticky) -->
    <div class="hidden xl:flex justify-self-start self-stretch">
      <div
        class="sticky top-8 flex flex-col gap-3 shrink-0 transition-colors duration-300 z-40 h-fit {sidebarWidthClass}"
      >
        <!-- Main current symbol -->
        {#if settingsState.showMarketOverview}
          <MarketOverview
            onToggleTechnicals={toggleTechnicals}
            {isTechnicalsVisible}
          />
        {:else if isTechnicalsDocked}
          <TechnicalsPanel  isVisible={isTechnicalsVisible} fluidWidth={true} />
        {/if}

        <!-- Technicals Panel (Absolute positioned next to MarketOverview) -->
        {#if settingsState.showTechnicals && !isTechnicalsDocked}
          <div
            class="absolute top-0 left-full ml-8 transition-all duration-300 transform origin-left z-40"
            class:scale-0={!isTechnicalsVisible}
            class:scale-100={isTechnicalsVisible}
            class:opacity-0={!isTechnicalsVisible}
            class:opacity-100={isTechnicalsVisible}
          >
            <TechnicalsPanel  isVisible={isTechnicalsVisible} />
          </div>
        {/if}

        <!-- Favorites list -->
        {#if settingsState.showMarketOverview && displayedFavorites.length > 0}
          <div
            class="text-[var(--text-secondary)] text-xs font-bold uppercase tracking-widest mt-2 px-1"
          >
            {$_("dashboard.favorites") || "Favorites"}
          </div>
          {#each displayedFavorites as fav (fav)}
            <MarketOverview customSymbol={fav} isFavoriteTile={true} />
          {/each}
        {/if}
      </div>
    </div>
  {/if}
</div>

<footer
  class="relative z-10 w-full text-center py-6 px-4 text-xs md:text-sm text-[var(--text-secondary)] flex flex-wrap items-center justify-center gap-x-4 gap-y-2"
>
  <span class="opacity-80">{$_("app.version")} {APP_VERSION}</span>
  <span class="opacity-30 select-none hidden sm:inline" aria-hidden="true">•</span>
  <div class="flex items-center gap-3">
    <a
      href="https://github.com/mydcc/cachy-app"
      target="_blank"
      rel="noopener noreferrer"
      class="text-link flex items-center justify-center hover:text-[var(--accent-color)] transition-all duration-300 hover:scale-110"
      title={$_("app.github")}
      aria-label={$_("app.github")}
      use:trackClick={{
        category: "Navigation",
        action: "Click",
        name: "GitHub",
      }}
    >
      {@html icons.github}
    </a>
    <a
      href="https://deepwiki.com/mydcc/cachy-app"
      target="_blank"
      rel="noopener noreferrer"
      class="text-link flex items-center justify-center hover:text-[var(--accent-color)] transition-all duration-300 hover:scale-110"
      title={$_("app.deepwiki")}
      aria-label={$_("app.deepwiki")}
      use:trackClick={{
        category: "Navigation",
        action: "Click",
        name: "Deepwiki",
      }}
    >
      {@html icons.deepwiki}
    </a>
  </div>
  <span class="opacity-30 select-none hidden sm:inline" aria-hidden="true">•</span>
  <div class="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
    <button
      class="text-link hover:text-[var(--accent-color)] transition-colors cursor-pointer"
      onclick={() => uiState.toggleGuideModal(true)}
      use:trackClick={{
        category: "Navigation",
        action: "Click",
        name: "ShowGuide",
      }}>{$_("app.guideButton")}</button
    >
    <button
      class="text-link hover:text-[var(--accent-color)] transition-colors cursor-pointer"
      onclick={() => uiState.toggleChangelogModal(true)}
      use:trackClick={{
        category: "Navigation",
        action: "Click",
        name: "ShowChangelog",
      }}>{$_("app.changelogTitle")}</button
    >
    <button
      class="text-link hover:text-[var(--accent-color)] transition-colors cursor-pointer"
      onclick={() => uiState.togglePrivacyModal(true)}
      use:trackClick={{
        category: "Navigation",
        action: "Click",
        name: "ShowPrivacy",
      }}>{$_("app.privacyLegal")}</button
    >
    <button
      class="text-link hover:text-[var(--accent-color)] transition-colors cursor-pointer"
      onclick={() => uiState.toggleWhitepaperModal(true)}
      use:trackClick={{
        category: "Navigation",
        action: "Click",
        name: "ShowWhitepaper",
      }}>{$_("app.whitepaper")}</button
    >
  </div>
</footer>

<!-- No ModalFrames for Guide/Changelog/Academy etc. anymore - they are managed by WindowManager -->

<FlashCard />
<OnboardingSpotlight />

<style>
  /* Brief 3D tilt + accent gloss sweep on the calculator panel when the
     user switches the Pro mode via the footer PowerToggle. Pure CSS, no
     three.js needed; the sweep uses the theme accent variable so it works
     in every palette. */
  .calculator-wrapper.panel-tilt {
    animation: panel-tilt-move 0.65s cubic-bezier(0.22, 1, 0.36, 1);
    will-change: transform;
  }

  .calculator-wrapper.panel-tilt::after {
    content: "";
    position: absolute;
    inset: 0;
    border-radius: inherit;
    pointer-events: none;
    background: linear-gradient(
      115deg,
      transparent 32%,
      color-mix(in srgb, var(--accent-color), transparent 78%) 50%,
      transparent 68%
    );
    background-size: 250% 100%;
    animation: panel-gloss-sweep 0.65s ease-out forwards;
  }

  @keyframes panel-tilt-move {
    0% {
      transform: perspective(1400px) rotateX(0deg) rotateY(0deg)
        translateY(0);
    }
    30% {
      transform: perspective(1400px) rotateX(1.6deg) rotateY(-1.8deg)
        translateY(-4px);
    }
    62% {
      transform: perspective(1400px) rotateX(-0.9deg) rotateY(1deg)
        translateY(0);
    }
    100% {
      transform: perspective(1400px) rotateX(0deg) rotateY(0deg)
        translateY(0);
    }
  }

  @keyframes panel-gloss-sweep {
    from {
      background-position: 130% 0;
    }
    to {
      background-position: -40% 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .calculator-wrapper.panel-tilt,
    .calculator-wrapper.panel-tilt::after {
      animation: none;
    }
  }
</style>

