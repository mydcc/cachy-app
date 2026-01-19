<script lang="ts">
    import { onMount } from "svelte";
    import { dataRepairService } from "../../services/dataRepairService";
    import { get } from "svelte/store";
    import { _ } from "../../locales/i18n";

    let missingAtrCount = $state(0);
    let isScanning = $state(false);
    let isRepairing = $state(false);
    let progress = $state(0);
    let totalToRepair = $state(0);
    let statusMessage = $state("");

    function scan() {
        isScanning = true;
        try {
            missingAtrCount = dataRepairService.scanForMissingAtr();
            if (missingAtrCount === 0) {
                statusMessage = "Keine fehlenden Daten gefunden (ATR).";
            } else {
                statusMessage = `${missingAtrCount} Trades ohne ATR gefunden.`;
            }
        } finally {
            isScanning = false;
        }
    }

    async function repair() {
        if (missingAtrCount === 0) return;

        isRepairing = true;
        progress = 0;
        totalToRepair = missingAtrCount;
        statusMessage = "Starte Reparatur...";

        await dataRepairService.repairMissingAtr((curr, total, msg) => {
            progress = curr;
            statusMessage = msg;
        });

        isRepairing = false;
        // Re-scan to confirm
        scan();
    }
</script>

<div
    class="bg-[var(--bg-secondary)] p-6 rounded-lg border border-[var(--border-color)]"
>
    <h3 class="text-xl font-bold mb-4 text-[var(--text-primary)]">
        Daten-Wartung & Reparatur
    </h3>

    <div class="space-y-4">
        <div
            class="flex items-center justify-between p-4 bg-[var(--bg-primary)] rounded border border-[var(--border-color)]"
        >
            <div>
                <h4 class="font-medium text-[var(--text-primary)]">
                    Volatilitäts-Matrix (ATR)
                </h4>
                <p class="text-sm text-[var(--text-secondary)]">
                    Prüft auf Trades ohne ATR-Wert und lädt diesen automatisch
                    nach. Notwendig für die "Markt"-Ansicht im Journal Deep
                    Dive.
                </p>
            </div>
            <div class="flex gap-2">
                {#if missingAtrCount > 0 && !isRepairing}
                    <button
                        class="px-4 py-2 bg-[var(--color-warning)] text-white rounded hover:opacity-90 transition-opacity"
                        onclick={repair}
                    >
                        Reparieren ({missingAtrCount})
                    </button>
                {:else}
                    <button
                        class="px-4 py-2 bg-[var(--color-primary)] text-white rounded hover:opacity-90 transition-opacity disabled:opacity-50"
                        onclick={scan}
                        disabled={isScanning || isRepairing}
                    >
                        {isScanning ? "Scanne..." : "Scannen"}
                    </button>
                {/if}
            </div>
        </div>

        {#if isRepairing}
            <div class="w-full bg-[var(--bg-tertiary)] rounded-full h-2.5 mt-2">
                <div
                    class="bg-[var(--color-success)] h-2.5 rounded-full transition-all duration-300"
                    style="width: {(progress / totalToRepair) * 100}%"
                ></div>
            </div>
        {/if}

        {#if statusMessage}
            <div class="text-sm text-[var(--text-secondary)] mt-2">
                {statusMessage}
            </div>
        {/if}
    </div>
</div>
