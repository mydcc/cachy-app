<script lang="ts">
  import { tradeStore } from "../../stores/tradeStore";
  import { settingsStore } from "../../stores/settingsStore";
  import {
    journalStore,
    performanceMetrics,
    qualityMetrics,
  } from "../../stores/journalStore";
  import { uiStore } from "../../stores/uiStore";
  import { app } from "../../services/app";
  import { imgbbService } from "../../services/imgbbService";
  import { calculator } from "../../lib/calculator";
  import { _ } from "../../locales/i18n";
  import { icons } from "../../lib/constants";
  import { browser } from "$app/environment";
  import { getComputedColor } from "../../utils/colors";
  import { formatDynamicDecimal } from "../../utils/utils";
  import ModalFrame from "./ModalFrame.svelte";
  import DashboardNav from "./DashboardNav.svelte";
  import { Decimal } from "decimal.js";
  import { onMount, onDestroy } from "svelte";

  // Journal Sub-Components
  import JournalFilters from "./journal/JournalFilters.svelte";
  import JournalStatistics from "./journal/JournalStatistics.svelte";
  import JournalTable from "./journal/JournalTable.svelte";
  import JournalCharts from "./journal/JournalCharts.svelte";
  import JournalDeepDive from "./journal/JournalDeepDive.svelte";

  // --- State for Dashboard ---
  let activePreset = $state("performance");
  let showUnlockOverlay = $state(false);
  let unlockOverlayMessage = $state("");

  // --- Cheat Code Logic ---
  const CODE_UNLOCK = "VIPENTE2026";
  const CODE_LOCK = "VIPDEEPDIVE";
  const CODE_SPACE = "VIPSPACE2026";
  const CODE_BONUS = "BONUS"; // Kept compatible with previous visible values if needed, but VIP implies consistency. Let's use clean constants.
  const CODE_STREAK = "STREAK";

  const MAX_CODE_LENGTH = Math.max(
    CODE_UNLOCK.length,
    CODE_LOCK.length,
    CODE_SPACE.length,
    CODE_BONUS.length,
    CODE_STREAK.length,
  );

  let inputBuffer: string[] = [];

  function handleKeydown(event: KeyboardEvent) {
    // Ignore if user is typing in an input field
    const target = event.target as HTMLElement;
    if (
      target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.isContentEditable
    )
      return;

    const key = event.key.toUpperCase();
    if (key.length === 1) {
      inputBuffer.push(key);
      if (inputBuffer.length > MAX_CODE_LENGTH) {
        inputBuffer.shift();
      }

      const bufferStr = inputBuffer.join("");

      // VIPENTE2026: Pro Active + VIP Theme Active => Unlock Charts
      if (bufferStr.endsWith(CODE_UNLOCK)) {
        if ($settingsStore.isPro && $uiStore.currentTheme === "VIP") {
          unlockDeepDive();
        }
      }
      // VIPDEEPDIVE: Lock Charts (Always works if matched)
      else if (bufferStr.endsWith(CODE_LOCK)) {
        lockDeepDive();
      }
      // VIPSPACE2026: Pro Active + VIP Theme Active => Space Dialog + Link
      else if (bufferStr.endsWith(CODE_SPACE)) {
        if ($settingsStore.isPro && $uiStore.currentTheme === "VIP") {
          activateVipSpace();
        }
      }
      // Placeholders
      else if (bufferStr.endsWith(CODE_BONUS)) {
        inputBuffer = [];
      } else if (bufferStr.endsWith(CODE_STREAK)) {
        inputBuffer = [];
      }
    }
  }

  function unlockDeepDive() {
    if ($settingsStore.isDeepDiveUnlocked) return;
    $settingsStore.isDeepDiveUnlocked = true;
    unlockOverlayMessage = $_("journal.messages.unlocked");
    showUnlockOverlay = true;
    inputBuffer = []; // Reset buffer
    setTimeout(() => {
      showUnlockOverlay = false;
    }, 2000);
  }

  function lockDeepDive() {
    if (!$settingsStore.isDeepDiveUnlocked) return;
    $settingsStore.isDeepDiveUnlocked = false;
    unlockOverlayMessage = $_("journal.messages.deactivated");
    showUnlockOverlay = true;
    inputBuffer = []; // Reset buffer
    setTimeout(() => {
      showUnlockOverlay = false;
    }, 2000);
  }

  function activateVipSpace() {
    unlockOverlayMessage = $_("journal.messages.vipSpaceUnlocked");
    showUnlockOverlay = true;
    inputBuffer = [];
    setTimeout(() => {
      showUnlockOverlay = false;
      if (browser) {
        window.open("https://metaverse.bitunix.cyou", "_blank");
      }
    }, 2000);
  }

  onMount(() => {
    if (browser) {
      window.addEventListener("keydown", handleKeydown);
    }
  });

  onDestroy(() => {
    if (browser) {
      window.removeEventListener("keydown", handleKeydown);
    }
  });

  // Theme Color Management
  let themeColors = $state({
    success: "#10b981",
    danger: "#ef4444",
    warning: "#f59e0b",
    accent: "#3b82f6",
    textSecondary: "#64748b",
  });

  function updateThemeColors() {
    if (!browser) return;
    setTimeout(() => {
      themeColors = {
        success: getComputedColor("--success-color") || "#10b981",
        danger: getComputedColor("--danger-color") || "#ef4444",
        warning: getComputedColor("--warning-color") || "#f59e0b",
        accent: getComputedColor("--accent-color") || "#3b82f6",
        textSecondary: getComputedColor("--text-secondary") || "#64748b",
      };
    }, 0);
  }

  let lastTheme = $state("");

  $effect(() => {
    // Synchronize theme colors ONLY when the theme name changes
    const currentTheme = $uiStore.currentTheme;
    if (currentTheme !== lastTheme) {
      lastTheme = currentTheme;
      updateThemeColors();
    }
  });

  // --- Table State ---
  let currentPage = $state(1);
  let itemsPerPage = $state(10);
  let sortField: keyof import("../../stores/types").JournalEntry | "duration" =
    $state("date");
  let sortDirection: "asc" | "desc" = $state("desc");
  let filterDateStart = $state("");
  let filterDateEnd = $state("");
  let groupBySymbol = $state(false);
  let showColumnSettings = $state(false);

  // Column Visibility State
  let columnVisibility: Record<string, boolean> = $state({
    date: true,
    symbol: true,
    type: true,
    entry: true,
    exit: true,
    sl: true,
    size: true,
    pnl: true,
    funding: true,
    rr: true,
    mae: true,
    mfe: true,
    efficiency: true,
    duration: true,
    status: true,
    screenshot: true,
    tags: true,
    notes: true,
    action: true,
  });

  function sortTrades(trades: any[], field: string, direction: "asc" | "desc") {
    return [...trades].sort((a, b) => {
      let valA = a[field];
      let valB = b[field];

      if (field === "duration") {
        const startA = new Date(a.entryDate || a.date).getTime();
        const endA = new Date(a.exitDate || a.date).getTime();
        valA = isNaN(startA) || isNaN(endA) ? 0 : Math.max(0, endA - startA);

        const startB = new Date(b.entryDate || b.date).getTime();
        const endB = new Date(b.exitDate || b.date).getTime();
        valB = isNaN(startB) || isNaN(endB) ? 0 : Math.max(0, endB - startB);
      }

      if (valA instanceof Decimal) valA = valA.toNumber();
      if (valB instanceof Decimal) valB = valB.toNumber();

      if (valA === undefined || valA === null)
        valA = field === "symbol" || field === "status" ? "" : -Infinity;
      if (valB === undefined || valB === null)
        valB = field === "symbol" || field === "status" ? "" : -Infinity;

      if (
        (field === "date" || field === "exitDate") &&
        typeof valA === "string"
      ) {
        valA = new Date(valA).getTime();
        valB = new Date(valB).getTime();
      }

      if (typeof valA === "string" && typeof valB === "string") {
        return direction === "asc"
          ? valA.localeCompare(valB)
          : valB.localeCompare(valA);
      }

      if (valA < valB) return direction === "asc" ? -1 : 1;
      if (valA > valB) return direction === "asc" ? 1 : -1;
      return 0;
    });
  }

  // Extract tradeStore values to local reactive variables
  let journalSearchQuery = $derived($tradeStore.journalSearchQuery);
  let journalFilterStatus = $derived($tradeStore.journalFilterStatus);

  let processedTrades = $derived(
    $journalStore.filter((trade) => {
      const query = journalSearchQuery.toLowerCase();
      const matchesSearch =
        trade.symbol.toLowerCase().includes(query) ||
        (trade.notes && trade.notes.toLowerCase().includes(query)) ||
        (trade.tags && trade.tags.some((t) => t.toLowerCase().includes(query)));

      const matchesStatus =
        journalFilterStatus === "all" || trade.status === journalFilterStatus;

      let matchesDate = true;
      const tradeDate = new Date(trade.date);
      if (filterDateStart)
        matchesDate = matchesDate && tradeDate >= new Date(filterDateStart);
      if (filterDateEnd) {
        const endDate = new Date(filterDateEnd);
        endDate.setHours(23, 59, 59, 999);
        matchesDate = matchesDate && tradeDate <= endDate;
      }

      return matchesSearch && matchesStatus && matchesDate;
    }),
  );

  // Pivot Mode Logic
  let groupedTrades = $derived(
    groupBySymbol
      ? Object.entries(
          calculator.calculateSymbolPerformance(processedTrades),
        ).map(([symbol, data]) => ({
          id: `group-${symbol}`,
          symbol,
          isGroup: true,
          ...data,
          // Add default fields for sorting compatibility
          date: new Date().toISOString(),
          tradeType: "group",
          entryPrice: new Decimal(0),
          totalNetProfit: data.totalProfitLoss,
          totalRR: new Decimal(0),
          status: "Group",
          trades: processedTrades.filter((t) => t.symbol === symbol),
        }))
      : [],
  );

  let displayTrades = $derived(groupBySymbol ? groupedTrades : processedTrades);
  let sortedTrades = $derived(
    sortTrades(displayTrades, sortField, sortDirection),
  );

  function handleSort(field: any) {
    if (sortField === field) {
      sortDirection = sortDirection === "asc" ? "desc" : "asc";
    } else {
      sortField = field;
      sortDirection = "desc";
    }
  }

  function handleImportCsv(event: Event) {
    if (browser) {
      const file = (event.target as HTMLInputElement).files?.[0];
      if (file) {
        app.importFromCSV(file);
      }
    }
  }

  function confirmDeleteTrade(tradeId: number) {
    if (confirm($_("journal.confirmDelete"))) {
      app.deleteTrade(tradeId);
    }
  }

  function resetPagination(..._args: any[]) {
    currentPage = 1;
  }

  $effect(() => {
    // Reset pagination when filters or sort change
    resetPagination(
      journalSearchQuery,
      journalFilterStatus,
      filterDateStart,
      filterDateEnd,
      groupBySymbol,
      sortField,
      sortDirection,
      itemsPerPage,
    );
  });

  function handleDateFilterChange(data: { date: string }) {
    const dateStr = data.date;
    filterDateStart = dateStr;
    filterDateEnd = dateStr;
  }

  // Reactive Stats for Filtered Trades
  let filteredPerformance = $derived(
    calculator.calculatePerformanceStats(processedTrades) || {
      totalTrades: 0,
      winRate: 0,
      profitFactor: new Decimal(0),
      maxDrawdown: new Decimal(0),
      avgRMultiple: new Decimal(0),
    },
  );
  let filteredJournal = $derived(
    calculator.calculateJournalStats(processedTrades),
  );

  // Combine for JournalStatistics expected format
  let performanceData = $derived({
    ...filteredPerformance,
    totalPnl: filteredJournal.totalNetProfit?.toNumber() || 0,
  });
  let qualityData = $derived({
    avgR: filteredPerformance.avgRMultiple?.toNumber() || 0,
  });

  async function handleScreenshotUpload(id: number, file: File) {
    try {
      uiStore.update((s) => ({
        ...s,
        isLoading: true,
        loadingMessage: $_("journal.messages.uploading"),
      }));
      const url = await imgbbService.uploadToImgbb(file);
      // Update trade in store
      const trade = $journalStore.find((t) => t.id === id);
      if (trade) {
        app.updateTrade(id, { screenshot: url });
        uiStore.showFeedback("save");
      }
    } catch (e: any) {
      uiStore.update((s) => ({
        ...s,
        errorMessage: e.message || $_("journal.messages.uploadFailed"),
        showErrorMessage: true,
      }));
    } finally {
      uiStore.update((s) => ({ ...s, isLoading: false }));
    }
  }
</script>

<ModalFrame
  isOpen={$uiStore.showJournalModal}
  title={$_("journal.title")}
  on:close={() => uiStore.toggleJournalModal(false)}
  extraClasses="modal-size-journal"
>
  <!-- @migration-task: migrate this slot by hand, `header-extra` is an invalid identifier -->
  <div slot="header-extra">
    {#if $settingsStore.isPro}
      <JournalStatistics
        {performanceData}
        {qualityData}
        isPro={$settingsStore.isPro}
        minimal={true}
      />
    {/if}
  </div>
  <!-- Dashboard Section -->
  {#if $settingsStore.isPro && $settingsStore.isDeepDiveUnlocked}
    <DashboardNav {activePreset} onselect={(id) => (activePreset = id)} />
  {/if}

  {#if $settingsStore.isPro && $settingsStore.isDeepDiveUnlocked}
    <!-- JournalCharts Component - All Chart Presets -->
    <JournalCharts
      {activePreset}
      isPro={$settingsStore.isPro}
      isDeepDiveUnlocked={$settingsStore.isDeepDiveUnlocked}
      {themeColors}
    />
  {/if}

  <!-- Journal Filters Component - MOVED ABOVE TABLE -->
  <JournalFilters
    bind:searchQuery={$tradeStore.journalSearchQuery}
    bind:filterStatus={$tradeStore.journalFilterStatus}
    bind:filterDateStart
    bind:filterDateEnd
    bind:groupBySymbol
    totalTrades={$journalStore.length}
    filteredCount={processedTrades.length}
    ontoggleSettings={() => (showColumnSettings = !showColumnSettings)}
  />

  <!-- Column Settings Popup -->
  {#if showColumnSettings}
    <div class="relative">
      <div
        class="absolute top-0 right-0 z-50 column-settings-popup bg-[var(--card-bg)] border border-[var(--border-color)] rounded-lg shadow-2xl p-4 animate-in fade-in slide-in-from-top-2"
      >
        <div class="flex justify-between items-center mb-3">
          <h4 class="text-sm font-bold">
            {$_("journal.labels.tableSettings")}
          </h4>
          <button
            class="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            onclick={() => (showColumnSettings = false)}
            >{$_("common.ok")}</button
          >
        </div>
        <div class="grid grid-cols-2 gap-2">
          {#each Object.keys(columnVisibility) as col}
            <label
              class="flex items-center gap-2 cursor-pointer hover:bg-[var(--bg-secondary)] p-2 rounded transition-colors"
            >
              <input
                type="checkbox"
                bind:checked={columnVisibility[col]}
                class="w-4 h-4 rounded border-[var(--border-color)] text-[var(--accent-color)] focus:ring-[var(--accent-color)]"
              />
              <span class="text-xs truncate">{$_(`journal.table.${col}`)}</span>
            </label>
          {/each}
        </div>
      </div>
    </div>
  {/if}

  <!-- Statistics at previous position removed - now in header -->

  <div class="border border-[var(--border-color)] rounded-lg overflow-hidden">
    <JournalTable
      trades={sortedTrades}
      bind:sortField
      bind:sortDirection
      bind:currentPage
      bind:itemsPerPage
      {columnVisibility}
      {groupBySymbol}
      onSort={(field) => handleSort(field)}
      onDeleteTrade={(id) => confirmDeleteTrade(id)}
      onStatusChange={(id, status) => app.updateTradeStatus(id, status)}
      onUpdateTrade={(id, data) => app.updateTrade(id, data)}
      onPageChange={(page) => (currentPage = page)}
      onUploadScreenshot={(id, file) => handleScreenshotUpload(id, file)}
    />
  </div>

  <!-- Deep Dive Section -->
  {#if $settingsStore.isPro && $settingsStore.isDeepDiveUnlocked}
    <JournalDeepDive
      {themeColors}
      onfilterDateChange={(data) => handleDateFilterChange(data)}
    />
  {/if}

  {#if showUnlockOverlay}
    <div
      class="fixed inset-0 z-50 flex items-center justify-center pointer-events-none"
    >
      <div
        class="bg-black/80 text-white px-8 py-4 rounded-lg shadow-2xl backdrop-blur-sm transform transition-all animate-fade-in-out text-center"
      >
        <div class="text-xl font-bold text-[var(--accent-color)] mb-1">
          🦆 Deep Dive
        </div>
        <div class="text-lg">{unlockOverlayMessage}</div>
      </div>
    </div>
  {/if}

  <!-- Bottom Actions -->
  <div
    class="flex flex-wrap items-center gap-4 mt-8 pt-4 border-t border-[var(--border-color)]"
  >
    {#if $settingsStore.isPro}
      {#if $uiStore.syncProgress}
        <div
          class="flex items-center gap-3 px-4 py-2 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-color)] shadow-sm"
          title="Synchronizing History..."
        >
          <span class="font-mono text-xs text-[var(--text-primary)] font-bold">
            {$uiStore.syncProgress.current} / {$uiStore.syncProgress.total}
          </span>
          <div
            class="w-24 sm:w-32 h-2.5 bg-[var(--bg-tertiary)] rounded-full overflow-hidden"
          >
            <div
              class="h-full bg-[var(--accent-color)] transition-all duration-500 ease-out"
              style="width: {($uiStore.syncProgress.current /
                Math.max($uiStore.syncProgress.total, 1)) *
                100}%"
            ></div>
          </div>
        </div>
      {:else}
        <button
          id="sync-bitunix-btn"
          class="font-bold py-2 px-4 rounded-lg flex items-center gap-2 bg-[var(--btn-primary-bg)] hover:bg-[var(--btn-primary-hover-bg)] text-[var(--btn-primary-text)] disabled:opacity-50 disabled:cursor-not-allowed"
          title={$_("journal.syncBitunix")}
          onclick={app.syncBitunixHistory}
          disabled={$uiStore.isPriceFetching || $uiStore.isLoading}
        >
          {#if $uiStore.isPriceFetching}
            <div
              class="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full"
            ></div>
          {:else}
            {@html icons.refresh}
          {/if}
          <span class="hidden sm:inline">
            {$uiStore.isPriceFetching
              ? $_("journal.messages.syncing")
              : $_("journal.syncBitunix")}
          </span>
        </button>
      {/if}
    {/if}
    <button
      id="export-csv-btn"
      class="font-bold py-2 px-4 rounded-lg flex items-center gap-2 bg-[var(--btn-success-bg)] hover:bg-[var(--btn-success-hover-bg)] text-[var(--btn-success-text)]"
      title={$_("journal.exportCsvTitle")}
      onclick={app.exportToCSV}
    >
      {@html icons.export}<span class="hidden sm:inline"
        >{$_("journal.export")}</span
      ></button
    >
    <input
      type="file"
      id="import-csv-input"
      name="importCsv"
      accept=".csv"
      class="hidden"
      onchange={handleImportCsv}
    />
    <button
      id="import-csv-btn"
      class="font-bold py-2 px-4 rounded-lg flex items-center gap-2 bg-[var(--btn-accent-bg)] hover:bg-[var(--btn-accent-hover-bg)] text-[var(--btn-accent-text)]"
      title={$_("journal.importCsvTitle")}
      onclick={() => document.getElementById("import-csv-input")?.click()}
    >
      {@html icons.import}<span class="hidden sm:inline"
        >{$_("journal.import")}</span
      ></button
    >

    <button
      id="clear-journal-btn"
      class="font-bold py-2 px-4 rounded-lg flex items-center gap-2 bg-[var(--btn-danger-bg)] hover:bg-[var(--btn-danger-hover-bg)] text-[var(--btn-danger-text)]"
      title={$_("journal.clearJournalTitle")}
      onclick={() => {
        if (browser) app.clearJournal();
      }}
    >
      {@html icons.delete}<span class="hidden sm:inline"
        >{$_("journal.clearAll")}</span
      ></button
    >
    <button
      id="show-journal-readme-btn"
      class="font-bold p-2.5 rounded-lg bg-[var(--btn-default-bg)] hover:bg-[var(--btn-default-hover-bg)] text-[var(--btn-default-text)]"
      title={$_("journal.showJournalInstructionsTitle")}
      aria-label={$_("journal.showJournalInstructionsAriaLabel")}
      onclick={() => app.uiManager.showReadme("journal")}
    >
      {@html icons.book}</button
    >
  </div>
</ModalFrame>

<style>
  /* All component-specific styles have been moved to sub-components */
</style>
