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
  import { uiState } from "../../stores/ui.svelte";
  import Button from "./Button.svelte";
  import { _ } from "../../locales/i18n";
  import type { OMSPosition } from "../../services/omsTypes";

  interface Props {
    positions?: OMSPosition[];
    loading?: boolean;
    error?: string;
    // Svelte 5 event props
    onclose?: (pos: OMSPosition) => void;
    ontpSl?: (pos: OMSPosition) => void;
  }

  let {
    positions = [],
    loading = false,
    error = "",
    onclose,
    ontpSl,
  }: Props = $props();

  // Removed local tooltip state

  function handleMouseEnter(event: MouseEvent, pos: any) {
    const coords = getTooltipPosition(event);
    uiState.showTooltip("position", pos, coords.x, coords.y);
  }

  function handleMouseLeave() {
    uiState.hideTooltip();
  }

  function getTooltipPosition(event: MouseEvent) {
    const tooltipWidth = 320;
    const tooltipHeight = 250;
    const padding = 10;
    let x = event.clientX + padding;
    let y = event.clientY + padding;

    if (x + tooltipWidth > window.innerWidth)
      x = event.clientX - tooltipWidth - padding;
    if (y + tooltipHeight > window.innerHeight)
      y = event.clientY - tooltipHeight - padding;

    return { x: Math.max(padding, x), y: Math.max(padding, y) };
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

  function handleClose(pos: OMSPosition) {
    if (confirm($_("positionsList.confirmClose", { symbol: pos.symbol }))) {
      onclose?.(pos);
    }
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
              <!-- Header: Symbol | PnL -->
              <div
                class="flex justify-between items-center pb-1 border-b border-[var(--border-color)] border-opacity-30"
              >
                <div
                  class="flex items-center gap-2 cursor-help"
                  role="group"
                  aria-label="Position Details"
                  onmouseenter={(e) => handleMouseEnter(e, pos)}
                  onmouseleave={handleMouseLeave}
                >
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
                </div>

                <!-- PnL Toggle -->
                <div
                  class="cursor-pointer select-none relative"
                  onclick={togglePnlMode}
                  role="button"
                  tabindex="0"
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

              <!-- Middle: Size @ Entry -> Mark -->
              <div class="flex justify-between items-center text-xs py-1">
                <div class="flex flex-col">
                  <span class="text-[var(--text-secondary)] text-[10px]"
                    >{$_("positionsList.size")}</span
                  >
                  <span class="font-mono">{formatDynamicDecimal(pos.amount)}</span>
                </div>
                <div
                  class="flex items-center gap-1 text-[var(--text-tertiary)] text-[10px]"
                >
                  <span class="font-mono text-[var(--text-primary)]"
                    >{formatDynamicDecimal(pos.entryPrice)}</span
                  >
                  <span>→</span>
                  <span class="font-mono text-[var(--text-primary)]"
                    >{pos.markPrice ? formatDynamicDecimal(pos.markPrice) : "?"}</span
                  >
                </div>
              </div>

              <!-- Footer: Buttons -->
              <div class="flex gap-2 pt-1">
                <button
                  class="flex-1 py-1 text-[10px] bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] text-[var(--text-secondary)] rounded border border-[var(--border-color)] transition-colors"
                  onclick={() => ontpSl?.(pos)}
                >
                  {$_("positionsList.tpsl")}
                </button>
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
              <div
                class="flex flex-col items-center px-2 cursor-help"
                role="group"
                aria-label="Symbol Details"
                onmouseenter={(e) => handleMouseEnter(e, pos)}
                onmouseleave={handleMouseLeave}
              >
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

<!-- Global Tooltip handled in +layout.svelte -->
