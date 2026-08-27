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
  import { settingsState } from "../../stores/settings.svelte";
  import { formatDynamicDecimal } from "../../utils/utils";
  import { Decimal } from "decimal.js";
  import { _ } from "../../locales/i18n";
  import type { OMSPosition } from "../../services/omsTypes";
  import { tpSlState } from "../../stores/tpsl.svelte";

  interface Props {
    positions?: OMSPosition[];
    loading?: boolean;
    error?: string;
    // Svelte 5 event props
    onclose?: (pos: OMSPosition) => void;
    ontpSl?: (pos: OMSPosition) => void;
    /** FEAT-0068 — opens the add/withdraw-margin dialog. */
    onadjustMargin?: (pos: OMSPosition) => void;
  }

  let {
    positions = [],
    loading = false,
    error = "",
    onclose,
    ontpSl,
    onadjustMargin,
  }: Props = $props();

  /*
   * FEAT-0068: only an isolated position has margin of its own to move — a
   * cross position draws on the account balance, and the exchange refuses an
   * adjustment on one.
   *
   * The prefix test is deliberate: Bitunix says ISOLATION, the mapper
   * lowercases whatever the venue sent, and `OMSPosition.marginMode` is
   * typed "cross" | "isolated" — three spellings that would otherwise have
   * to be kept in step.
   */
  function canAdjustMargin(pos: OMSPosition): boolean {
    return Boolean(onadjustMargin) && (pos.marginMode ?? "").toLowerCase().startsWith("isolat");
  }

  // PnL Logic
  function getPnlDisplay(pos: OMSPosition, mode: "value" | "percent" | "bar") {
    const val = pos.unrealizedPnl || new Decimal(0);
    if (mode === "percent" || mode === "bar") {
      if (!pos.margin || pos.margin.isZero()) return "ROI: N/A";
      const roi = val.div(pos.margin).mul(100);
      return `${roi.toFixed(2)}%`;
    }
    return `${val.gt(0) ? "+" : ""}${formatDynamicDecimal(val)}`;
  }

  function togglePnlMode() {
    const nextMode =
      settingsState.pnlViewMode === "value"
        ? "percent"
        : settingsState.pnlViewMode === "percent"
          ? "bar"
          : "value";
    settingsState.pnlViewMode = nextMode;
  }

  /*
   * FEAT-0256: the confirmation moved into `ClosePositionModal`, which asks
   * the same question and also answers *how much*. A `confirm()` here as well
   * would make the trader agree twice to one action, and the browser dialog
   * cannot show the quantity, the remainder or the PnL the close would book.
   *
   * `positionsList.confirmClose` is deliberately left in the locale files:
   * FEAT-0024's confirmation policy is the thing that decides which actions
   * are confirmed and how, and it will want that string.
   */
  function handleClose(pos: OMSPosition) {
    onclose?.(pos);
  }

  function getRoi(pos: OMSPosition) {
    if (!pos.margin || pos.margin.isZero()) return 0;
    const pnl = pos.unrealizedPnl || new Decimal(0);
    const margin = pos.margin;
    return pnl.div(margin).mul(100).toNumber();
  }

  // View Modes
  let viewMode = $derived(settingsState.positionViewMode || "detailed");
  let pnlMode = $derived(settingsState.pnlViewMode || "value");

  // Safe access to positions
  let safePositions = $derived(Array.isArray(positions) ? positions : []);
</script>

<div class="relative p-2 overflow-y-auto max-h-[500px] scrollbar-thin">
  {#if loading && safePositions.length === 0}
    <div class="flex justify-center p-4">
      <div
        class="animate-spin rounded-full h-5 w-5 border-b-2 border-[var(--accent-color)]"
      ></div>
    </div>
  {:else if error}
    <div class="text-xs text-[var(--danger-color)] p-2 text-center">
      {error}
    </div>
  {:else if safePositions.length === 0}
    <div class="text-xs text-[var(--text-secondary)] text-center p-4">
      {$_("positionsList.noOpenPositions")}
    </div>
  {:else}
    <div class="flex flex-col gap-2">
      {#each safePositions as pos}
        <!-- Card Container -->
        <div
          class="bg-[var(--bg-primary)] rounded-lg border border-[var(--border-color)] hover:border-[var(--accent-color)] transition-colors relative overflow-hidden group"
        >
          {#if viewMode === "detailed"}
            <!-- MODE 1: DETAILED / COMPACT UNIFIED -->
            <div class="p-2 grid grid-cols-1 gap-1">
              <!-- Header: Symbol + Side/Lev + MarginMode | PnL -->
              <div
                class="flex justify-between items-center pb-1 border-b border-[var(--border-color)] border-opacity-30"
              >
                <div class="flex items-center gap-1.5">
                  <span class="font-bold text-sm text-[var(--text-primary)]"
                    >{pos.symbol}</span
                  >
                  <span
                    class="text-[9px] px-1 py-0.5 rounded font-bold uppercase tracking-wider"
                    class:bg-green-900={pos.side.toLowerCase() === "long"}
                    class:text-green-300={pos.side.toLowerCase() === "long"}
                    class:bg-red-900={pos.side.toLowerCase() === "short"}
                    class:text-red-300={pos.side.toLowerCase() === "short"}
                  >
                    {pos.leverage}x
                  </span>
                  {#if pos.marginMode}
                    <span
                      class="text-[9px] px-1 py-0.5 rounded font-bold uppercase tracking-wider bg-[var(--bg-secondary)] text-[var(--text-secondary)] border border-[var(--border-color)]"
                    >
                      {pos.marginMode}
                    </span>
                  {/if}
                </div>

                <!-- PnL Toggle -->
                <div
                  class="cursor-pointer select-none relative"
                  onclick={togglePnlMode}
                  role="button"
                  tabindex="0"
                  title={$_("positionsList.pnlToggleHint")}
                  onkeydown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      togglePnlMode();
                    }
                  }}
                >
                  {#if pnlMode === "bar"}
                    <!-- Bar Representation -->
                    <div
                      class="h-5 w-20 bg-[var(--bg-secondary)] rounded relative overflow-hidden flex items-center justify-center border border-[var(--border-color)]"
                    >
                      <div
                        class="absolute inset-y-0 left-0 transition-all duration-300 opacity-30"
                        style="width: {Math.min(
                          Math.abs(Number(getRoi(pos))),
                          100,
                        )}%; background-color: {pos.unrealizedPnl.gt(0)
                          ? 'var(--success-color)'
                          : 'var(--danger-color)'}"
                      ></div>
                      <span
                        class="text-[10px] font-bold z-10 relative"
                        class:text-[var(--success-color)]={pos.unrealizedPnl.gt(0)}
                        class:text-[var(--danger-color)]={pos.unrealizedPnl.lt(0)}
                      >
                        {getPnlDisplay(pos, "percent")}
                      </span>
                    </div>
                  {:else}
                    <span
                      class="font-bold text-sm"
                      class:text-[var(--success-color)]={pos.unrealizedPnl.gt(0)}
                      class:text-[var(--danger-color)]={pos.unrealizedPnl.lt(0)}
                    >
                      {getPnlDisplay(pos, pnlMode)}
                    </span>
                  {/if}
                </div>
              </div>

              <!-- Row 1: Size & Notional Value | Entry -> Mark -->
              <div class="grid grid-cols-2 gap-2 text-xs py-1">
                <div class="flex flex-col">
                  <span class="text-[var(--text-secondary)] text-[10px]"
                    >{$_("positionsList.size")}</span
                  >
                  <span class="font-mono">
                    {formatDynamicDecimal(pos.amount)}
                    <!-- Quote-equivalent size. Base quantity alone does not
                         answer "how much am I actually risking" at a glance,
                         which is the question this panel exists for. Mark
                         price when there is one; entry otherwise, matching
                         how the account summary derives its total. -->
                    <span class="text-[10px] text-[var(--text-tertiary)]"
                      >≈ {formatDynamicDecimal(
                        pos.amount.mul(pos.markPrice || pos.entryPrice),
                      )}</span
                    >
                  </span>
                </div>
                <div class="flex flex-col items-end">
                  <span class="text-[var(--text-secondary)] text-[10px]"
                    >{$_("dashboard.orderHistory.details.entry")} → {$_("dashboard.orderHistory.details.mark")}</span
                  >
                  <div class="flex items-center gap-1 text-[10px] font-mono">
                    <span class="text-[var(--text-primary)]"
                      >{formatDynamicDecimal(pos.entryPrice)}</span
                    >
                    <span class="text-[var(--text-tertiary)]">→</span>
                    <span class="text-[var(--text-primary)]"
                      >{pos.markPrice ? formatDynamicDecimal(pos.markPrice) : "?"}</span
                    >
                  </div>
                </div>
              </div>

              <!-- Row 2: Margin | Liquidation Price -->
              <div class="grid grid-cols-2 gap-2 text-[10px] py-1 border-t border-[var(--border-color)] border-opacity-30">
                <div class="flex justify-between items-center pr-2 border-r border-[var(--border-color)] border-opacity-30">
                  <span class="text-[var(--text-secondary)]">{$_("positionsList.margin")}:</span>
                  <span class="font-mono text-[var(--text-primary)]">{formatDynamicDecimal(pos.margin)}</span>
                </div>
                <div class="flex justify-between items-center pl-1">
                  <span class="text-[var(--text-secondary)]">{$_("dashboard.orderHistory.liq")}:</span>
                  {#if pos.liquidationPrice && pos.liquidationPrice.gt(0)}
                    <span class="font-mono text-[var(--warning-color)] font-medium">
                      {formatDynamicDecimal(pos.liquidationPrice)}
                    </span>
                  {:else}
                    <span class="font-mono text-[var(--text-tertiary)]">-</span>
                  {/if}
                </div>
              </div>

              <!-- Row 3: Margin Rate & Realized PnL (if available) -->
              {#if pos.marginRate || (pos.realizedPnl !== undefined && pos.realizedPnl !== null)}
                <div class="grid grid-cols-2 gap-2 text-[10px] py-1 border-t border-[var(--border-color)] border-opacity-30">
                  {#if pos.marginRate}
                    <div class="flex justify-between items-center pr-2 border-r border-[var(--border-color)] border-opacity-30">
                      <span class="text-[var(--text-secondary)]">{$_("positionsList.marginRate")}:</span>
                      <span class="font-mono text-[var(--text-secondary)]">{formatDynamicDecimal(pos.marginRate.mul(100))}%</span>
                    </div>
                  {:else}
                    <div></div>
                  {/if}
                  {#if pos.realizedPnl !== undefined && pos.realizedPnl !== null}
                    <div class="flex justify-between items-center pl-1">
                      <span class="text-[var(--text-secondary)]">{$_("positionsList.realizedPnl")}:</span>
                      <span
                        class="font-mono"
                        class:text-[var(--success-color)]={pos.realizedPnl.gt(0)}
                        class:text-[var(--danger-color)]={pos.realizedPnl.lt(0)}
                        class:text-[var(--text-secondary)]={pos.realizedPnl.isZero()}
                      >
                        {pos.realizedPnl.gt(0) ? "+" : ""}{formatDynamicDecimal(pos.realizedPnl)}
                      </span>
                    </div>
                  {:else}
                    <div></div>
                  {/if}
                </div>
              {/if}

              <!-- Active TP/SL, from the shared plan cache. Absent when the
                   position has none, and equally absent before the first
                   fetch resolves: there is nothing to show in either case,
                   so neither gets a row. -->
              {#if tpSlState.hasPlansFor(pos.symbol)}
                {@const plans = tpSlState.plansFor(pos.symbol)}
                <div
                  class="flex justify-between items-center text-[10px] py-1 border-t border-[var(--border-color)] border-opacity-30"
                >
                  <span class="text-[var(--text-tertiary)]"
                    >{$_("positionsList.tpslActive")}</span
                  >
                  <span class="flex gap-2 font-mono">
                    {#if plans.profit}
                      <span class="text-[var(--success-color)]"
                        >TP {formatDynamicDecimal(
                          new Decimal(plans.profit.triggerPrice || 0),
                        )}</span
                      >
                    {/if}
                    {#if plans.loss}
                      <span class="text-[var(--danger-color)]"
                        >SL {formatDynamicDecimal(
                          new Decimal(plans.loss.triggerPrice || 0),
                        )}</span
                      >
                    {/if}
                  </span>
                </div>
              {/if}

              <!-- Footer: Buttons -->
              <div class="flex gap-2 pt-1">
                <button
                  class="flex-1 py-1 text-[10px] bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] text-[var(--text-secondary)] rounded border border-[var(--border-color)] transition-colors"
                  onclick={() => ontpSl?.(pos)}
                >
                  {$_("positionsList.tpsl")}
                </button>
                {#if canAdjustMargin(pos)}
                  <button
                    class="flex-1 py-1 text-[10px] bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] text-[var(--text-secondary)] rounded border border-[var(--border-color)] transition-colors"
                    data-track-id="btn-adjust-margin"
                    onclick={() => onadjustMargin?.(pos)}
                  >
                    {$_("positionsList.adjustMargin")}
                  </button>
                {/if}
                <button
                  class="flex-1 py-1 text-[10px] bg-[var(--danger-color)] bg-opacity-10 hover:bg-opacity-20 text-[var(--danger-color)] rounded border border-[var(--danger-color)] border-opacity-30 transition-colors font-bold"
                  onclick={() => handleClose(pos)}
                >
                  {$_("positionsList.close")}
                </button>
              </div>
            </div>
          {:else}
            <!-- MODE 2: FOCUS / PANIC -->
            <div class="p-2 flex items-center justify-between h-12">
              <!-- PnL (Dominant) -->
              <div
                class="flex-1 cursor-pointer"
                onclick={togglePnlMode}
                role="button"
                tabindex="0"
                title={$_("positionsList.pnlToggleHint")}
                onkeydown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    togglePnlMode();
                  }
                }}
              >
                <span
                  class="font-bold text-lg leading-none"
                  class:text-[var(--success-color)]={pos.unrealizedPnl.gt(0)}
                  class:text-[var(--danger-color)]={pos.unrealizedPnl.lt(0)}
                >
                  {getPnlDisplay(pos, pnlMode)}
                </span>
              </div>

              <!-- Symbol -->
              <div class="flex flex-col items-center px-2">
                <span class="font-bold text-xs">{pos.symbol}</span>
                <span class="text-[9px] opacity-60"
                  >{pos.side.toUpperCase()}</span
                >
              </div>

              <!-- Close Button (X) -->
              <button
                class="w-8 h-8 flex items-center justify-center bg-[var(--danger-color)] text-white rounded hover:bg-opacity-80 transition-colors shadow-sm"
                onclick={() => handleClose(pos)}
                title={$_("positionsList.close")}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  class="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>
