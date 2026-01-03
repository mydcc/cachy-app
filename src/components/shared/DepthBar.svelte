<script lang="ts">
    import { formatDynamicDecimal } from "../../utils/utils";
    import { Decimal } from "decimal.js";

    export let bids: [string, string][] = [];
    export let asks: [string, string][] = [];
    
    // Calculate total volume for the top 5 levels
    $: bidVol = bids.reduce((acc, [_, qty]) => acc.plus(new Decimal(qty)), new Decimal(0));
    $: askVol = asks.reduce((acc, [_, qty]) => acc.plus(new Decimal(qty)), new Decimal(0));
    
    $: totalVol = bidVol.plus(askVol);
    
    // Percentages
    $: bidPercent = totalVol.gt(0) ? bidVol.div(totalVol).times(100).toNumber() : 50;
    $: askPercent = totalVol.gt(0) ? askVol.div(totalVol).times(100).toNumber() : 50;
</script>

<div class="flex flex-col gap-1 w-full mt-2">
    <!-- Visual Bar -->
    <div class="flex w-full h-1.5 rounded-full overflow-hidden bg-[var(--bg-tertiary)]">
        <div class="bg-[var(--success-color)] transition-all duration-300" style="width: {bidPercent}%"></div>
        <div class="bg-[var(--danger-color)] transition-all duration-300" style="width: {askPercent}%"></div>
    </div>
    
    <!-- Text Labels -->
    <div class="flex justify-between text-[10px] text-[var(--text-secondary)]">
        <span class="text-[var(--success-color)]">{formatDynamicDecimal(bidVol, 0)} Bids</span>
        <span class="text-[var(--danger-color)]">{formatDynamicDecimal(askVol, 0)} Asks</span>
    </div>
</div>
