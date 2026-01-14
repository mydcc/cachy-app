<script lang="ts">
  import { formatDynamicDecimal } from "../../utils/utils";
  import { _ } from "../../locales/i18n";
  import AccountTooltip from "./AccountTooltip.svelte";


  
  interface Props {
    available?: number;
    margin?: number;
    pnl?: number;
    currency?: string;
    // Extended props
    frozen?: number;
    transfer?: number;
    bonus?: number;
    positionMode?: string;
    crossUnrealizedPNL?: number;
    isolationUnrealizedPNL?: number;
  }

  let {
    available = 0,
    margin = 0,
    pnl = 0,
    currency = "USDT",
    frozen = 0,
    transfer = 0,
    bonus = 0,
    positionMode = "",
    crossUnrealizedPNL = 0,
    isolationUnrealizedPNL = 0
  }: Props = $props();
</script>

<div
  class="p-3 bg-[var(--bg-tertiary)] border-b border-[var(--border-primary)] flex flex-col gap-2 relative"
>
  <div
    class="flex justify-between items-center group cursor-help relative"
    role="tooltip"
  >
    <div class="flex items-center gap-1">
      <span
        class="text-xs text-[var(--text-secondary)] border-b border-dashed border-[var(--text-secondary)]"
        >{$_("dashboard.account.balance")}</span
      >
    </div>
    <span class="text-sm font-bold text-[var(--text-primary)]"
      >{formatDynamicDecimal(available, 2)} {currency}</span
    >

    <div class="absolute z-[100] left-0 top-full pt-2 hidden group-hover:block">
      <AccountTooltip
        account={{
          available,
          margin,
          marginCoin: currency,
          frozen,
          transfer,
          bonus,
          positionMode,
          crossUnrealizedPNL,
          isolationUnrealizedPNL,
          totalUnrealizedPnL: pnl,
        }}
      />
    </div>
  </div>

  <div class="flex justify-between items-center">
    <span class="text-xs text-[var(--text-secondary)]"
      >{$_("dashboard.account.margin")}</span
    >
    <span class="text-sm font-bold text-[var(--text-primary)]"
      >{formatDynamicDecimal(margin, 2)} {currency}</span
    >
  </div>

  <div
    class="flex justify-between items-center pt-1 border-t border-[var(--border-primary)] border-dashed"
  >
    <span class="text-xs text-[var(--text-secondary)]"
      >{$_("dashboard.account.pnl")}</span
    >
    <span
      class="text-sm font-bold"
      class:text-[var(--success-color)]={pnl > 0}
      class:text-[var(--danger-color)]={pnl < 0}
    >
      {pnl > 0 ? "+" : ""}{formatDynamicDecimal(pnl, 2)}
      {currency}
    </span>
  </div>
</div>
