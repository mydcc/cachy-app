<script lang="ts">
  import { _ } from "svelte-i18n";
  import type { TechnicalsData } from "../../services/technicalsTypes";
  import { TechnicalsPresenter } from "../../utils/technicalsPresenter";
  import { indicatorState } from "../../stores/indicator.svelte";

  interface Props {
    data?: TechnicalsData | null; // Optional to support usage without explicit data (legacy/internal fetch)
    isVisible?: boolean;
    fluidWidth?: boolean;
  }

  let { data = null, isVisible = true, fluidWidth = false }: Props = $props();

  // Helper to translate action
  function translateAction(action: string) {
    if (!action) return "";
    const key = action.toLowerCase();
    return $_(`trade.actions.${key}` as any) || action;
  }

  function translateContext(ctx: string) {
    if (!ctx) return "";
    return $_(`settings.technicals.context.${ctx.toLowerCase()}` as any) || ctx;
  }
</script>

{#if data}
  <div class="technicals-panel flex flex-col gap-2 w-full text-[var(--text-primary)]">
    <!-- Summary Section -->
    {#if indicatorState.panelSections.summary}
      <div class="flex items-center justify-between bg-[var(--bg-secondary)] rounded-lg p-2 border border-[var(--border-color)]">
        <div class="flex flex-col">
          <span class="text-[10px] uppercase text-[var(--text-secondary)] font-bold">
            {$_("settings.technicals.summary")}
          </span>
          <span class="text-sm font-bold {TechnicalsPresenter.getActionColor(data.summary.action)}">
            {translateAction(data.summary.action)}
          </span>
        </div>
        <div class="flex gap-2 text-xs">
            <div class="flex flex-col items-center">
                <span class="text-[var(--success-color)] font-bold">{data.summary.buy}</span>
                <span class="text-[9px] text-[var(--text-secondary)]">BUY</span>
            </div>
            <div class="flex flex-col items-center">
                <span class="text-[var(--text-secondary)] font-bold">{data.summary.neutral}</span>
                <span class="text-[9px] text-[var(--text-secondary)]">NEUT</span>
            </div>
            <div class="flex flex-col items-center">
                <span class="text-[var(--danger-color)] font-bold">{data.summary.sell}</span>
                <span class="text-[9px] text-[var(--text-secondary)]">SELL</span>
            </div>
        </div>
      </div>
    {/if}

    <!-- Scrollable Content -->
    <div class="flex flex-col gap-2 overflow-y-auto max-h-[400px] custom-scrollbar pr-1">

      <!-- Oscillators -->
      {#if indicatorState.panelSections.oscillators && data.oscillators.length > 0}
        <div class="flex flex-col gap-1">
          <div class="text-[10px] uppercase text-[var(--text-secondary)] px-1 font-bold bg-[var(--bg-tertiary)] py-1 rounded">
            {$_("settings.technicals.oscillators") || "Oscillators"}
          </div>
          <div class="grid grid-cols-1 gap-y-0.5">
            {#each data.oscillators as osc}
              <div class="flex justify-between text-xs py-1 px-1 border-b border-[var(--border-color)] last:border-0 hover:bg-[var(--bg-tertiary)] rounded transition-colors">
                <div class="flex gap-2">
                    <span class="font-medium">{osc.name}</span>
                    {#if osc.extra}
                        <span class="text-[var(--text-secondary)] text-[10px]">({osc.extra})</span>
                    {/if}
                </div>
                <div class="flex gap-2">
                  <span class="font-mono">{TechnicalsPresenter.formatVal(osc.value, indicatorState.precision)}</span>
                  <span class="font-bold w-8 text-right {TechnicalsPresenter.getActionColor(osc.action)}">
                    {translateAction(osc.action)}
                  </span>
                </div>
              </div>
            {/each}
          </div>
        </div>
      {/if}

      <!-- Moving Averages -->
      {#if indicatorState.panelSections.movingAverages && data.movingAverages.length > 0}
        <div class="flex flex-col gap-1 mt-1">
          <div class="text-[10px] uppercase text-[var(--text-secondary)] px-1 font-bold bg-[var(--bg-tertiary)] py-1 rounded">
             {$_("settings.technicals.movingAverages") || "Moving Averages"}
          </div>
          <div class="grid grid-cols-1 gap-y-0.5">
            {#each data.movingAverages as ma}
              <div class="flex justify-between text-xs py-1 px-1 border-b border-[var(--border-color)] last:border-0 hover:bg-[var(--bg-tertiary)] rounded transition-colors">
                 <div class="flex gap-1">
                    <span class="font-medium">{ma.name}</span>
                    <span class="text-[var(--text-secondary)] text-[10px]">({ma.params})</span>
                 </div>
                <div class="flex gap-2">
                  <span class="font-mono">{TechnicalsPresenter.formatVal(ma.value, indicatorState.precision)}</span>
                  <span class="font-bold w-8 text-right {TechnicalsPresenter.getActionColor(ma.action)}">
                    {translateAction(ma.action)}
                  </span>
                </div>
              </div>
            {/each}
          </div>
        </div>
      {/if}

      <!-- Volatility -->
      {#if data.volatility && (data.volatility.atr || data.volatility.bb)}
           <div class="flex flex-col gap-1 mt-1">
              <div class="text-[10px] uppercase text-[var(--text-secondary)] px-1 font-bold bg-[var(--bg-tertiary)] py-1 rounded">
                Volatility
              </div>
              <!-- ATR -->
              {#if data.volatility.atr}
                <div class="flex justify-between text-xs py-1 px-1 border-b border-[var(--border-color)]">
                    <span>ATR</span>
                    <span class="font-mono">{TechnicalsPresenter.formatVal(data.volatility.atr, indicatorState.precision)}</span>
                </div>
              {/if}
               <!-- BB -->
              {#if data.volatility.bb}
                <div class="flex flex-col text-xs py-1 px-1 border-b border-[var(--border-color)]">
                    <div class="flex justify-between">
                        <span>BB Upper</span>
                        <span class="font-mono">{TechnicalsPresenter.formatVal(data.volatility.bb.upper, indicatorState.precision)}</span>
                    </div>
                    <div class="flex justify-between">
                        <span>BB Lower</span>
                        <span class="font-mono">{TechnicalsPresenter.formatVal(data.volatility.bb.lower, indicatorState.precision)}</span>
                    </div>
                    <div class="flex justify-between text-[10px] text-[var(--text-secondary)]">
                        <span>Width %</span>
                        <span class="font-mono">{(data.volatility.bb.percentP * 100).toFixed(2)}%</span>
                    </div>
                </div>
              {/if}
           </div>
      {/if}

      <!-- Pivots -->
      {#if indicatorState.panelSections.pivots && data.pivots}
        <div class="flex flex-col gap-1 mt-1">
          <div class="text-[10px] uppercase text-[var(--text-secondary)] px-1 font-bold bg-[var(--bg-tertiary)] py-1 rounded">
            {$_("settings.technicals.pivotsTitle") || "Pivot Points"}
          </div>
          <div class="grid grid-cols-1 gap-y-0.5">
            {#each TechnicalsPresenter.getPivotsArray(data.pivots) as pivot}
              <div class="flex justify-between text-xs py-0.5 px-1 border-b border-[var(--border-color)] last:border-0 hover:bg-[var(--bg-tertiary)] rounded transition-colors">
                <span class="font-bold {pivot.color}">{pivot.label}</span>
                <span class="font-mono">{TechnicalsPresenter.formatVal(pivot.val, indicatorState.precision)}</span>
              </div>
            {/each}
          </div>
        </div>
      {/if}

      <!-- Advanced / Other -->
      {#if data.advanced}
        <div class="flex flex-col gap-1 mt-1">
          <div class="text-[10px] uppercase text-[var(--text-secondary)] px-1 font-bold bg-[var(--bg-tertiary)] py-1 rounded">
            {$_("settings.technicals.advancedTitle") || "Advanced"}
          </div>

          <!-- VWAP -->
          {#if data.advanced.vwap}
            <div class="flex justify-between text-xs py-1 px-1 border-b border-[var(--border-color)]">
              <span>{$_("settings.technicals.vwap")}</span>
              <span class="font-mono">{TechnicalsPresenter.formatVal(data.advanced.vwap, indicatorState.precision)}</span>
            </div>
          {/if}

          <!-- MFI -->
          {#if data.advanced.mfi}
            <div class="flex justify-between text-xs py-1 px-1 border-b border-[var(--border-color)]">
              <span>{$_("settings.technicals.mfi")}</span>
              <div class="flex gap-2">
                <span class="font-mono">{TechnicalsPresenter.formatVal(data.advanced.mfi.value, indicatorState.precision)}</span>
                <span class="font-bold {TechnicalsPresenter.getActionColor(data.advanced.mfi.action)}">
                  {translateContext(TechnicalsPresenter.getOscillatorContext("MFI", data.advanced.mfi.value, data.advanced.mfi.action))}
                </span>
              </div>
            </div>
          {/if}

          <!-- SuperTrend -->
          {#if data.advanced.superTrend}
            <div class="flex justify-between text-xs py-1 px-1 border-b border-[var(--border-color)]">
              <span>{$_("settings.technicals.superTrend.title")}</span>
              <div class="flex gap-2">
                <span class="font-mono">{TechnicalsPresenter.formatVal(data.advanced.superTrend.value, indicatorState.precision)}</span>
                <span class="font-bold {TechnicalsPresenter.getSuperTrendColor(data.advanced.superTrend.trend)}">
                  {translateAction(data.advanced.superTrend.trend.toUpperCase() === "BULL" ? "Buy" : "Sell")}
                </span>
              </div>
            </div>
          {/if}

          <!-- Choppiness -->
          {#if data.advanced.choppiness}
            <div class="flex justify-between text-xs py-1 px-1 border-b border-[var(--border-color)]">
              <span>Choppiness</span>
              <div class="flex gap-2">
                <span class="font-mono">{TechnicalsPresenter.formatVal(data.advanced.choppiness.value, 1)}</span>
                <span class="font-bold {data.advanced.choppiness.state === 'Trend' ? 'text-[var(--accent-color)]' : 'text-[var(--text-secondary)]'}">
                    {data.advanced.choppiness.state}
                </span>
              </div>
            </div>
          {/if}

          <!-- ADX -->
          {#if data.advanced.adx}
            <div class="flex flex-col text-xs py-1 px-1 border-b border-[var(--border-color)]">
                <div class="flex justify-between">
                     <span>ADX ({data.advanced.adx.trend})</span>
                     <span class="font-mono">{TechnicalsPresenter.formatVal(data.advanced.adx.value, 1)}</span>
                </div>
                 <div class="flex justify-between text-[10px] text-[var(--text-secondary)]">
                     <span>DI+ / DI-</span>
                     <span class="font-mono">
                         {TechnicalsPresenter.formatVal(data.advanced.adx.pdi, 1)} / {TechnicalsPresenter.formatVal(data.advanced.adx.mdi, 1)}
                     </span>
                </div>
            </div>
          {/if}

           <!-- Parabolic SAR -->
          {#if data.advanced.parabolicSar}
            <div class="flex justify-between text-xs py-1 px-1 border-b border-[var(--border-color)]">
              <span>Parabolic SAR</span>
              <span class="font-mono">{TechnicalsPresenter.formatVal(data.advanced.parabolicSar, indicatorState.precision)}</span>
            </div>
          {/if}

          <!-- ATR Trailing Stop -->
          {#if data.advanced.atrTrailingStop}
            <div class="flex flex-col text-xs py-1 px-1 border-b border-[var(--border-color)]">
              <div class="flex justify-between">
                <span>{$_("settings.technicals.atrStop.title")}</span>
                <span class="font-mono text-[var(--danger-color)]">{TechnicalsPresenter.formatVal(data.advanced.atrTrailingStop.sell, indicatorState.precision)}</span>
              </div>
              <div class="flex justify-between">
                <span>{$_("settings.technicals.atrStop.title").replace("(L)", "(S)")}</span>
                <span class="font-mono text-[var(--success-color)]">{TechnicalsPresenter.formatVal(data.advanced.atrTrailingStop.buy, indicatorState.precision)}</span>
              </div>
            </div>
          {/if}

          <!-- OBV -->
          {#if data.advanced.obv}
            <div class="flex justify-between text-xs py-1 px-1 border-b border-[var(--border-color)]">
              <span>{$_("settings.technicals.obv")}</span>
              <span class="font-mono">{TechnicalsPresenter.formatVal(data.advanced.obv, 0)}</span>
            </div>
          {/if}

           <!-- Volume MA -->
          {#if data.advanced.volumeMa}
            <div class="flex justify-between text-xs py-1 px-1 border-b border-[var(--border-color)]">
              <span>Volume MA</span>
              <span class="font-mono">{TechnicalsPresenter.formatVal(data.advanced.volumeMa, 0)}</span>
            </div>
          {/if}

          <!-- Ichimoku -->
          {#if data.advanced.ichimoku}
            <div class="flex justify-between text-xs py-1 px-1 border-b border-[var(--border-color)]">
              <span>{$_("settings.technicals.ichimoku")}</span>
              <span class="font-bold {TechnicalsPresenter.getActionColor(data.advanced.ichimoku.action)}">
                {translateAction(data.advanced.ichimoku.action)}
              </span>
            </div>
          {/if}
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .technicals-panel {
    max-width: 100%;
  }
  .custom-scrollbar::-webkit-scrollbar {
    width: 4px;
  }
  .custom-scrollbar::-webkit-scrollbar-thumb {
    background: var(--border-color);
    border-radius: 2px;
  }
  .custom-scrollbar::-webkit-scrollbar-track {
    background: transparent;
  }
</style>
