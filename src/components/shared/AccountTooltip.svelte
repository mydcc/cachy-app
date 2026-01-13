<script lang="ts">
  import { formatDynamicDecimal } from "../../utils/utils";

  export let account: any;

  $: equity =
    (account.available || 0) +
    (account.margin || 0) +
    (account.frozen || 0) +
    (account.totalUnrealizedPnL || 0);

  // Prevent division by zero
  $: marginLevel = equity > 0 ? ((account.margin || 0) / equity) * 100 : 0;

  function getHealthColor(level: number) {
    if (level < 50) return "var(--success-color)";
    if (level < 80) return "var(--warning-color)";
    return "var(--danger-color)";
  }

  $: healthColor = getHealthColor(marginLevel);
  $: barWidth = Math.min(Math.max(marginLevel, 0), 100);
</script>

<div
  class="bg-[var(--bg-tertiary)] border border-[var(--border-color)] shadow-xl rounded-lg p-3 text-xs text-[var(--text-primary)] w-[260px] pointer-events-auto z-50"
>
  <!-- Header: Equity -->
  <div class="flex flex-col mb-2 border-b border-[var(--border-color)] pb-2">
    <div class="flex justify-between items-center mb-1">
      <span class="font-bold text-sm">Total Equity</span>
      <span class="font-bold text-sm"
        >{formatDynamicDecimal(equity, 2)} {account.marginCoin || "USDT"}</span
      >
    </div>

    <!-- Health Bar -->
    <div
      class="w-full h-1.5 bg-[var(--bg-primary)] rounded-full overflow-hidden mt-1 relative group"
    >
      <div
        class="h-full transition-all duration-300 rounded-full"
        style="width: {barWidth}%; background-color: {healthColor};"
      />
    </div>
    <div
      class="flex justify-between mt-1 text-[10px] text-[var(--text-secondary)]"
    >
      <span>Margin Level</span>
      <span style="color: {healthColor}">{marginLevel.toFixed(1)}%</span>
    </div>
  </div>

  <!-- Details Grid -->
  <div class="grid grid-cols-1 gap-1">
    <div class="flex justify-between">
      <span class="text-[var(--text-secondary)]">Wallet Balance:</span>
      <span
        >{formatDynamicDecimal(
          (account.available || 0) +
            (account.margin || 0) +
            (account.frozen || 0),
          2
        )}</span
      >
    </div>

    <div
      class="pl-2 border-l-2 border-[var(--border-primary)] ml-1 flex flex-col gap-0.5 my-1"
    >
      <div class="flex justify-between">
        <span class="text-[var(--text-secondary)] text-[10px]"
          >Transferable:</span
        >
        <span class="text-[10px]">{formatDynamicDecimal(account.transfer)}</span
        >
      </div>
      <div class="flex justify-between">
        <span class="text-[var(--text-secondary)] text-[10px]">Bonus:</span>
        <span class="text-[10px]">{formatDynamicDecimal(account.bonus)}</span>
      </div>
      <div class="flex justify-between">
        <span class="text-[var(--text-secondary)] text-[10px]">Frozen:</span>
        <span class="text-[10px]">{formatDynamicDecimal(account.frozen)}</span>
      </div>
    </div>

    <div
      class="flex justify-between pt-1 border-t border-[var(--border-color)]"
    >
      <span class="text-[var(--text-secondary)]">Mode:</span>
      <span class="capitalize">{account.positionMode || "-"}</span>
    </div>

    <div class="flex justify-between">
      <span class="text-[var(--text-secondary)]">Cross PnL:</span>
      <span
        class:text-[var(--success-color)]={account.crossUnrealizedPNL > 0}
        class:text-[var(--danger-color)]={account.crossUnrealizedPNL < 0}
      >
        {formatDynamicDecimal(account.crossUnrealizedPNL)}
      </span>
    </div>
    {#if account.isolationUnrealizedPNL !== 0}
      <div class="flex justify-between">
        <span class="text-[var(--text-secondary)]">Iso PnL:</span>
        <span
          class:text-[var(--success-color)]={account.isolationUnrealizedPNL > 0}
          class:text-[var(--danger-color)]={account.isolationUnrealizedPNL < 0}
        >
          {formatDynamicDecimal(account.isolationUnrealizedPNL)}
        </span>
      </div>
    {/if}
  </div>
</div>
