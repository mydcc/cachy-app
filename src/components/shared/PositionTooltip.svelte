<script lang="ts">
  import { formatDynamicDecimal } from "../../utils/utils";
  import { Decimal } from "decimal.js";

  interface Props {
    position: any;
  }

  let { position }: Props = $props();
  // Expected structure:
  // symbol, side, leverage, size, entryPrice, unrealizedPnl, margin, marginMode, liquidationPrice, markPrice

  function getRoi(pos: any) {
    if (!pos.margin || new Decimal(pos.margin).isZero()) return 0;
    const pnl = new Decimal(pos.unrealizedPnl || 0);
    const margin = new Decimal(pos.margin);
    return pnl.div(margin).mul(100).toNumber();
  }
</script>

<div
  class="bg-[var(--bg-tertiary)] border border-[var(--border-color)] shadow-xl rounded-lg p-3 text-xs text-[var(--text-primary)] w-[320px] max-w-[90vw] pointer-events-none z-[9999]"
>
  <!-- Header -->
  <div
    class="flex justify-between items-center mb-2 border-b border-[var(--border-color)] pb-1"
  >
    <span class="font-bold text-sm flex items-center gap-1">
      {position.symbol}
      <span
        class="text-[10px] font-normal text-[var(--text-secondary)] bg-[var(--bg-primary)] px-1 rounded border border-[var(--border-color)]"
      >
        {position.side.toUpperCase()}
        {position.leverage}x
      </span>
    </span>
    <span class="font-mono text-[var(--text-secondary)] uppercase"
      >{position.marginMode}</span
    >
  </div>

  <div class="grid grid-cols-2 gap-x-4 gap-y-1">
    <!-- Main Stats -->
    <div class="flex justify-between">
      <span class="text-[var(--text-secondary)]">Size:</span>
      <span>{formatDynamicDecimal(position.size)}</span>
    </div>
    <div class="flex justify-between">
      <span class="text-[var(--text-secondary)]">Value:</span>
      <span
        >{formatDynamicDecimal(
          new Decimal(position.size).mul(
            position.markPrice || position.entryPrice
          )
        )}</span
      >
    </div>

    <div class="flex justify-between">
      <span class="text-[var(--text-secondary)]">Entry:</span>
      <span>{formatDynamicDecimal(position.entryPrice)}</span>
    </div>
    <div class="flex justify-between">
      <span class="text-[var(--text-secondary)]">Mark:</span>
      <span>{formatDynamicDecimal(position.markPrice)}</span>
    </div>

    <div class="col-span-2 border-t border-[var(--border-color)] my-1"></div>

    <!-- PnL & Margin -->
    <div class="flex justify-between">
      <span class="text-[var(--text-secondary)]">PnL:</span>
      <span
        class:text-[var(--success-color)]={position.unrealizedPnl > 0}
        class:text-[var(--danger-color)]={position.unrealizedPnl < 0}
      >
        {formatDynamicDecimal(position.unrealizedPnl)} USDT
      </span>
    </div>
    <div class="flex justify-between">
      <span class="text-[var(--text-secondary)]">ROE:</span>
      <span
        class:text-[var(--success-color)]={position.unrealizedPnl > 0}
        class:text-[var(--danger-color)]={position.unrealizedPnl < 0}
      >
        {formatDynamicDecimal(getRoi(position))}%
      </span>
    </div>

    <div class="flex justify-between">
      <span class="text-[var(--text-secondary)]">Margin:</span>
      <span>{formatDynamicDecimal(position.margin)}</span>
    </div>
    <div class="flex justify-between">
      <span class="text-[var(--text-secondary)]">Liq. Price:</span>
      {#if position.liquidationPrice && new Decimal(position.liquidationPrice).gt(0)}
        <span class="text-[var(--warning-color)]"
          >{formatDynamicDecimal(position.liquidationPrice)}</span
        >
      {:else}
        <span>-</span>
      {/if}
    </div>
  </div>
</div>
