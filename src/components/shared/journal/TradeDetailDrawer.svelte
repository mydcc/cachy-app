<!--
  Copyright (C) 2026 MYDCT

  This program is free software: you can redistribute it and/or modify
  it under the terms of the GNU Affero General Public License as
  published by the Free Software Foundation, either version 3 of the
  License, or (at your option) any later version.

  This program is distributed in the hope that it will be useful,
  but WITHOUT ANY WARRANTY; without even the implied warranty of
  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
  GNU Affero General Public License for more details.

  You should have received a copy of the GNU Affero General Public License
  along with this program.  If not, see <https://www.gnu.org/licenses/>.
-->

<script lang="ts">
  import { _ } from "../../../locales/i18n";
  import { formatDynamicDecimal } from "../../../utils/utils";
  import { Decimal } from "decimal.js";
  import type { JournalEntry } from "../../../stores/types";
  import JournalEntryTags from "../JournalEntryTags.svelte";

  interface Props {
    trade: JournalEntry | null;
    currency?: string;
    isOpen: boolean;
    availableTags?: string[];
    onClose: () => void;
    onUpdateTrade?: (id: number | string, data: Partial<JournalEntry>) => void;
    onUploadScreenshot?: (id: number | string, file: File) => void;
  }

  let {
    trade,
    currency = "USDT",
    isOpen = false,
    availableTags = [],
    onClose,
    onUpdateTrade,
    onUploadScreenshot,
  }: Props = $props();

  let localNotes = $state("");
  let showScreenshotModal = $state(false);
  let isEditingNotes = $state(false);

  $effect(() => {
    if (trade) {
      localNotes = trade.notes || "";
    }
  });

  function handleSaveNotes() {
    if (!trade) return;
    onUpdateTrade?.(trade.id, { notes: localNotes });
    isEditingNotes = false;
  }

  function handleTagsChange(newTags: string[]) {
    if (!trade) return;
    onUpdateTrade?.(trade.id, { tags: newTags });
  }

  function handleFileInputChange(e: Event) {
    const input = e.target as HTMLInputElement;
    if (input.files && input.files[0] && trade) {
      onUploadScreenshot?.(trade.id, input.files[0]);
    }
  }

  let totalFeesVal = $derived(
    trade?.totalFees
      ? new Decimal(trade.totalFees)
      : trade?.tradingFee
      ? new Decimal(trade.tradingFee)
      : trade?.fees
      ? new Decimal(trade.fees)
      : (trade?.entryFee ? new Decimal(trade.entryFee) : new Decimal(0)).plus(
          trade?.exitFee ? new Decimal(trade.exitFee) : new Decimal(0)
        )
  );

  let entryFeeVal = $derived.by(() => {
    if (trade?.entryFee && new Decimal(trade.entryFee).gt(0)) {
      return new Decimal(trade.entryFee);
    }
    if (totalFeesVal.gt(0) && trade?.entryPrice && trade?.exitPrice && new Decimal(trade.entryPrice).gt(0) && new Decimal(trade.exitPrice).gt(0)) {
      const ep = new Decimal(trade.entryPrice);
      const xp = new Decimal(trade.exitPrice);
      return totalFeesVal.times(ep).div(ep.plus(xp));
    } else if (totalFeesVal.gt(0)) {
      return totalFeesVal.div(2);
    }
    return new Decimal(0);
  });

  let exitFeeVal = $derived.by(() => {
    if (trade?.exitFee && new Decimal(trade.exitFee).gt(0)) {
      return new Decimal(trade.exitFee);
    }
    if (totalFeesVal.gt(0)) {
      return Decimal.max(0, totalFeesVal.minus(entryFeeVal));
    }
    return new Decimal(0);
  });
  let fundingFeeVal = $derived(
    trade?.fundingFee ? new Decimal(trade.fundingFee) : new Decimal(0)
  );
  let netPnlVal = $derived(
    trade?.totalNetProfit
      ? new Decimal(trade.totalNetProfit)
      : trade?.realizedPnl
      ? new Decimal(trade.realizedPnl)
      : new Decimal(0)
  );
  let grossPnlVal = $derived(
    netPnlVal.plus(totalFeesVal).plus(fundingFeeVal)
  );

  let isLong = $derived(trade?.tradeType === "long");
  let isWon = $derived(
    trade?.status === "Won" || (trade?.status === "Closed" && netPnlVal.gte(0))
  );
  let isLost = $derived(
    trade?.status === "Lost" || (trade?.status === "Closed" && netPnlVal.lt(0))
  );

  let rrVal = $derived.by(() => {
    if (trade?.totalRR && !(trade.totalRR instanceof Decimal ? trade.totalRR.isZero() : new Decimal(trade.totalRR).isZero())) {
      return trade.totalRR instanceof Decimal ? trade.totalRR : new Decimal(trade.totalRR);
    }
    const pnl = netPnlVal;
    const risk = trade?.riskAmount ? new Decimal(trade.riskAmount) : null;
    if (pnl && risk && risk.gt(0)) {
      return pnl.div(risk);
    }
    if (trade?.entryPrice && trade?.exitPrice && trade?.stopLossPrice) {
      const entry = new Decimal(trade.entryPrice);
      const exit = new Decimal(trade.exitPrice);
      const sl = new Decimal(trade.stopLossPrice);
      const riskDist = entry.minus(sl).abs();
      if (riskDist.gt(0)) {
        const gainDist = isLong ? exit.minus(entry) : entry.minus(exit);
        return gainDist.div(riskDist);
      }
    }
    if (trade?.entryPrice && trade?.exitPrice && trade?.atrValue) {
      const entry = new Decimal(trade.entryPrice);
      const exit = new Decimal(trade.exitPrice);
      const atr = new Decimal(trade.atrValue);
      if (atr.gt(0)) {
        const gainDist = isLong ? exit.minus(entry) : entry.minus(exit);
        return gainDist.div(atr.times(1.5));
      }
    }
    return null;
  });

  function formatDuration(startStr?: string, endStr?: string, fallbackDate?: string): string {
    const start = new Date(startStr || fallbackDate || "").getTime();
    const end = new Date(endStr || fallbackDate || "").getTime();
    if (isNaN(start) || isNaN(end) || end <= start) return "—";
    const diffMs = end - start;
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays > 0) return `${diffDays}d ${diffHours % 24}h`;
    if (diffHours > 0) return `${diffHours}h ${diffMins % 60}m`;
    return `${diffMins}m`;
  }

  let slAtrVal = $derived.by(() => {
    if (!trade?.entryPrice || !trade?.stopLossPrice || !trade?.atrValue) return "—";
    const ep = new Decimal(trade.entryPrice);
    const sl = new Decimal(trade.stopLossPrice);
    const atr = new Decimal(trade.atrValue);
    if (atr.isZero() || sl.isZero()) return "—";
    const dist = ep.minus(sl).abs();
    return `${dist.div(atr).toFixed(2)}x`;
  });

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape" && isOpen) {
      if (showScreenshotModal) {
        showScreenshotModal = false;
      } else {
        onClose();
      }
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if isOpen && trade}
  <!-- Backdrop -->
  <div
    class="drawer-backdrop fixed inset-0 bg-black/50 backdrop-blur-sm z-50 transition-opacity"
    role="presentation"
    onclick={onClose}
  ></div>

  <!-- Drawer Panel -->
  <aside
    class="trade-detail-drawer fixed top-0 right-0 h-full w-full max-w-xl glass-panel text-[var(--text-primary)] border-l border-[var(--border-color)] shadow-2xl z-50 flex flex-col overflow-hidden animate-slide-left"
    role="dialog"
    aria-modal="true"
    aria-labelledby="trade-drawer-title"
  >
    <!-- Header -->
    <header class="p-4 border-b border-[var(--border-color)] flex items-center justify-between bg-[var(--bg-secondary)]">
      <div class="flex items-center gap-3">
        <div class="flex items-center gap-2">
          <h3 id="trade-drawer-title" class="text-lg font-bold">
            {trade.symbol}
          </h3>
          <span
            class="text-xs px-2 py-0.5 rounded font-bold uppercase"
            class:bg-success-paired={isLong}
            class:bg-danger-paired={!isLong}
          >
            {isLong ? $_("journal.labels.long") : $_("journal.labels.short")}
          </span>
          {#if trade.isPaper}
            <span class="text-[10px] px-1.5 py-0.5 rounded font-bold bg-[var(--bg-tertiary)] text-[var(--text-secondary)] border border-[var(--border-color)]">
              SIM
            </span>
          {/if}
        </div>
        <span class="text-xs text-[var(--text-secondary)]">
          {new Date(trade.date).toLocaleString()}
        </span>
      </div>

      <div class="flex items-center gap-2">
        <select
          value={trade.status}
          onchange={(e) => onUpdateTrade?.(trade.id, { status: (e.target as HTMLSelectElement).value })}
          class="text-xs px-2.5 py-1 rounded-full font-bold border border-[var(--border-color)] bg-[var(--bg-primary)] text-[var(--text-primary)] cursor-pointer hover:border-[var(--accent-color)] transition-colors"
          class:text-[var(--success-color)]={isWon}
          class:text-[var(--danger-color)]={isLost}
          aria-label={$_("journal.table.status")}
        >
          <option value="Open">{$_("journal.filterOpen")}</option>
          <option value="Won">{$_("journal.filterWon")}</option>
          <option value="Lost">{$_("journal.filterLost")}</option>
          <option value="Closed">Closed</option>
        </select>
        <button
          class="p-1.5 rounded-lg hover:bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
          onclick={onClose}
          aria-label={$_("journal.drawer.close")}
        >
          ✕
        </button>
      </div>
    </header>

    <!-- Content -->
    <div class="flex-1 overflow-y-auto p-5 space-y-6">
      <!-- PnL Summary Banner -->
      <div class="p-4 rounded-xl border border-[var(--border-color)] bg-[var(--bg-primary)] grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
        <div>
          <span class="text-[11px] text-[var(--text-secondary)] font-medium block">
            {$_("journal.drawer.netPnL")}
          </span>
          <span
            class="text-base font-bold font-mono"
            class:text-[var(--success-color)]={netPnlVal.gte(0)}
            class:text-[var(--danger-color)]={netPnlVal.lt(0)}
          >
            {netPnlVal.gte(0) ? "+" : ""}{formatDynamicDecimal(netPnlVal, 2)} {currency}
          </span>
        </div>
        <div>
          <span class="text-[11px] text-[var(--text-secondary)] font-medium block">
            {$_("journal.table.rr")}
          </span>
          <span
            class="text-base font-bold font-mono"
            class:text-[var(--success-color)]={rrVal?.gt(2)}
            class:text-[var(--warning-color)]={rrVal && rrVal.gt(1) && rrVal.lte(2)}
            class:text-[var(--danger-color)]={rrVal?.lt(0)}
          >
            {rrVal ? `${formatDynamicDecimal(rrVal, 2)}R` : "—"}
          </span>
        </div>
        <div>
          <span class="text-[11px] text-[var(--text-secondary)] font-medium block">
            {$_("journal.drawer.totalFees")}
          </span>
          <span class="text-base font-bold font-mono text-[var(--warning-color)]">
            -{formatDynamicDecimal(totalFeesVal, 2)} {currency}
          </span>
        </div>
        <div>
          <span class="text-[11px] text-[var(--text-secondary)] font-medium block">
            {$_("journal.drawer.grossPnL")}
          </span>
          <span class="text-base font-bold font-mono text-[var(--text-secondary)]">
            {grossPnlVal.gte(0) ? "+" : ""}{formatDynamicDecimal(grossPnlVal, 2)} {currency}
          </span>
        </div>
      </div>

      <!-- Execution Parameters -->
      <section class="space-y-2">
        <h4 class="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider">
          {$_("journal.table.entry")} & {$_("journal.table.exit")}
        </h4>
        <div class="grid grid-cols-2 sm:grid-cols-3 gap-3 p-3 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-color)] text-xs">
          <div>
            <span class="text-[var(--text-secondary)] block">{$_("journal.table.entry")}</span>
            <span class="font-mono font-bold">{formatDynamicDecimal(trade.entryPrice, 4)} {currency}</span>
          </div>
          <div>
            <span class="text-[var(--text-secondary)] block">{$_("journal.table.exit")}</span>
            <span class="font-mono font-bold">{trade.exitPrice ? `${formatDynamicDecimal(trade.exitPrice, 4)} ${currency}` : "—"}</span>
          </div>
          <div>
            <span class="text-[var(--text-secondary)] block">{$_("journal.table.sl")}</span>
            <span class="font-mono font-bold text-[var(--danger-color)]">{formatDynamicDecimal(trade.stopLossPrice, 4)} {currency}</span>
          </div>
          <div>
            <span class="text-[var(--text-secondary)] block">{$_("journal.table.size")}</span>
            <span class="font-mono font-bold">{trade.positionSize ? formatDynamicDecimal(trade.positionSize, 4) : "—"}</span>
          </div>
          <div>
            <span class="text-[var(--text-secondary)] block">{$_("dashboard.generalInputs.leverage")}</span>
            <span class="font-mono font-bold">{trade.leverage ? `${trade.leverage}x` : "—"}</span>
          </div>
          {#if trade.atrValue}
            <div>
              <span class="text-[var(--text-secondary)] block">{$_("journal.table.atr")}</span>
              <span class="font-mono font-bold">{formatDynamicDecimal(trade.atrValue, 4)}</span>
            </div>
          {/if}
        </div>
      </section>

      <!-- Advanced Analytics & Metrics (slAtr, atr, mae, mfe, efficiency, duration, risk) -->
      <section class="space-y-2">
        <h4 class="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider">
          {$_("journal.deepDive.title")} & Analytics
        </h4>
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-color)] text-xs">
          <div>
            <span class="text-[var(--text-secondary)] block">{$_("journal.table.slAtr")}</span>
            <span class="font-mono font-bold">{slAtrVal}</span>
          </div>
          <div>
            <span class="text-[var(--text-secondary)] block">{$_("journal.table.atr")}</span>
            <span class="font-mono font-bold">{trade.atrValue ? formatDynamicDecimal(trade.atrValue, 4) : "—"}</span>
          </div>
          <div>
            <span class="text-[var(--text-secondary)] block">{$_("journal.table.mae")}</span>
            <span class="font-mono font-bold text-[var(--danger-color)]">{trade.mae ? formatDynamicDecimal(trade.mae, 2) : "—"}</span>
          </div>
          <div>
            <span class="text-[var(--text-secondary)] block">{$_("journal.table.mfe")}</span>
            <span class="font-mono font-bold text-[var(--success-color)]">{trade.mfe ? formatDynamicDecimal(trade.mfe, 2) : "—"}</span>
          </div>
          <div>
            <span class="text-[var(--text-secondary)] block">{$_("journal.table.efficiency")}</span>
            <span class="font-mono font-bold">{trade.efficiency ? `${new Decimal(trade.efficiency).times(100).toFixed(0)}%` : "—"}</span>
          </div>
          <div>
            <span class="text-[var(--text-secondary)] block">{$_("journal.table.duration")}</span>
            <span class="font-mono font-bold">{formatDuration(trade.entryDate, trade.exitDate, trade.date)}</span>
          </div>
          <div>
            <span class="text-[var(--text-secondary)] block">Risk Amount</span>
            <span class="font-mono font-bold">{trade.riskAmount ? `${formatDynamicDecimal(trade.riskAmount, 2)} ${currency}` : "—"}</span>
          </div>
          <div>
            <span class="text-[var(--text-secondary)] block">Max Profit</span>
            <span class="font-mono font-bold">{trade.maxPotentialProfit ? `${formatDynamicDecimal(trade.maxPotentialProfit, 2)} ${currency}` : "—"}</span>
          </div>
        </div>
      </section>

      <!-- Granular Fee Breakdown -->
      <section class="space-y-2">
        <h4 class="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider flex items-center justify-between">
          <span>{$_("journal.drawer.feeBreakdown")}</span>
          <span class="text-[10px] font-normal text-[var(--text-secondary)]">Maker / Taker Rates</span>
        </h4>
        <div class="p-4 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-color)] space-y-2.5 text-xs">
          <div class="flex items-center justify-between">
            <span class="flex items-center gap-2">
              <span>{$_("journal.drawer.entryFee")}</span>
              <span class="text-[9px] px-1.5 py-0.2 rounded font-bold uppercase bg-[var(--bg-tertiary)] border border-[var(--border-color)]">
                {trade.entryFeeType === "maker" || (!trade.entryFeeType && trade.feeMode?.startsWith("maker")) ? $_("journal.table.maker") : $_("journal.table.taker")}
              </span>
            </span>
            <span class="font-mono font-bold text-[var(--warning-color)]">
              {#if entryFeeVal.gt(0)}
                -{formatDynamicDecimal(entryFeeVal, 4)} {currency}
              {:else}
                —
              {/if}
            </span>
          </div>

          <div class="flex items-center justify-between">
            <span class="flex items-center gap-2">
              <span>{$_("journal.drawer.exitFee")}</span>
              <span class="text-[9px] px-1.5 py-0.2 rounded font-bold uppercase bg-[var(--bg-tertiary)] border border-[var(--border-color)]">
                {trade.exitFeeType === "maker" || (!trade.exitFeeType && trade.feeMode?.endsWith("maker")) ? $_("journal.table.maker") : $_("journal.table.taker")}
              </span>
            </span>
            <span class="font-mono font-bold text-[var(--warning-color)]">
              {#if exitFeeVal.gt(0)}
                -{formatDynamicDecimal(exitFeeVal, 4)} {currency}
              {:else}
                —
              {/if}
            </span>
          </div>

          {#if fundingFeeVal.abs().gt(0)}
            <div class="flex items-center justify-between">
              <span>{$_("journal.drawer.fundingFee")}</span>
              <span class="font-mono font-bold" class:text-[var(--danger-color)]={fundingFeeVal.gt(0)} class:text-[var(--success-color)]={fundingFeeVal.lt(0)}>
                {fundingFeeVal.gt(0) ? "-" : "+"}{formatDynamicDecimal(fundingFeeVal.abs(), 4)} {currency}
              </span>
            </div>
          {/if}

          <div class="pt-2 border-t border-[var(--border-color)] flex items-center justify-between font-bold">
            <span>{$_("journal.drawer.totalFees")}</span>
            <span class="font-mono text-[var(--warning-color)]">
              -{formatDynamicDecimal(totalFeesVal, 4)} {currency}
            </span>
          </div>
        </div>
      </section>

      <!-- Take Profit Targets -->
      {#if trade.targets && trade.targets.length > 0}
        <section class="space-y-2">
          <h4 class="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider">
            {$_("journal.drawer.targets")}
          </h4>
          <div class="space-y-1.5">
            {#each trade.targets as target, idx}
              <div class="flex items-center justify-between p-2 rounded bg-[var(--bg-secondary)] border border-[var(--border-color)] text-xs">
                <span class="text-[var(--text-secondary)]">TP {idx + 1} ({target.percent}%)</span>
                <span class="font-mono font-bold text-[var(--success-color)]">{formatDynamicDecimal(target.price, 4)} {currency}</span>
              </div>
            {/each}
          </div>
        </section>
      {/if}

      <!-- Tags Section -->
      <section class="space-y-2">
        <h4 class="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider">
          {$_("journal.drawer.tags")}
        </h4>
        <div class="p-3 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-color)]">
          <JournalEntryTags
            tags={trade.tags || []}
            {availableTags}
            tradeId={Number(trade.id) || 0}
            onTagsChange={handleTagsChange}
          />
        </div>
      </section>

      <!-- Notes Section -->
      <section class="space-y-2">
        <div class="flex items-center justify-between">
          <h4 class="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider">
            {$_("journal.drawer.notes")}
          </h4>
          {#if isEditingNotes}
            <button
              class="text-xs font-bold px-2 py-1 rounded bg-[var(--accent-color)] text-[var(--bg-primary)] hover:opacity-90 transition-opacity"
              onclick={handleSaveNotes}
            >
              {$_("journal.drawer.save")}
            </button>
          {/if}
        </div>
        <textarea
          class="w-full p-3 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-color)] text-xs focus:outline-none focus:border-[var(--accent-color)] min-h-[90px] resize-y"
          placeholder={$_("journal.placeholder.notes")}
          bind:value={localNotes}
          onfocus={() => (isEditingNotes = true)}
          onblur={handleSaveNotes}
        ></textarea>
      </section>

      <!-- Screenshot Section -->
      <section class="space-y-2">
        <h4 class="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider flex items-center justify-between">
          <span>{$_("journal.drawer.screenshot")}</span>
          <label class="cursor-pointer text-xs text-[var(--accent-color)] hover:underline flex items-center gap-1">
            <span>+ {$_("journal.labels.uploadScreenshot")}</span>
            <input
              type="file"
              accept="image/*"
              class="hidden"
              onchange={handleFileInputChange}
            />
          </label>
        </h4>

        {#if trade.screenshot}
          <div class="relative group rounded-lg overflow-hidden border border-[var(--border-color)] bg-[var(--bg-secondary)] max-h-52 flex items-center justify-center">
            <button
              class="w-full h-full p-0 border-none bg-transparent cursor-zoom-in"
              onclick={() => (showScreenshotModal = true)}
              aria-label={$_("journal.labels.viewScreenshot")}
            >
              <img
                src={trade.screenshot}
                alt={$_("journal.labels.screenshotAlt")}
                class="w-full h-auto object-cover max-h-52"
              />
            </button>
          </div>
        {:else}
          <div class="p-6 rounded-lg border border-dashed border-[var(--border-color)] text-center text-xs text-[var(--text-secondary)] bg-[var(--bg-secondary)]">
            <span>Kein Screenshot hinterlegt.</span>
          </div>
        {/if}
      </section>
    </div>
  </aside>
{/if}

{#if showScreenshotModal && trade?.screenshot}
  <div
    class="fixed inset-0 bg-black/80 z-[60] flex items-center justify-center p-4"
    role="presentation"
    onclick={() => (showScreenshotModal = false)}
  >
    <div
      class="relative max-w-4xl max-h-[90vh] glass-panel rounded-xl overflow-hidden shadow-2xl border border-[var(--border-color)]"
      role="dialog"
      aria-modal="true"
      tabindex="-1"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => {
        if (e.key === "Escape") {
          showScreenshotModal = false;
        }
      }}
    >
      <button
        class="absolute top-3 right-3 z-10 w-8 h-8 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80 transition-colors"
        onclick={() => (showScreenshotModal = false)}
        aria-label={$_("journal.drawer.close")}
      >
        ✕
      </button>
      <img
        src={trade.screenshot}
        alt={$_("journal.labels.screenshotAlt")}
        class="w-full h-auto max-h-[85vh] object-contain"
      />
    </div>
  </div>
{/if}

<style>
  @keyframes slideLeft {
    from {
      transform: translateX(100%);
    }
    to {
      transform: translateX(0);
    }
  }

  .animate-slide-left {
    animation: slideLeft 0.25s ease-out;
  }
</style>
