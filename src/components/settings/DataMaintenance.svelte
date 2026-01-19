<script lang="ts">
    import { onMount } from "svelte";
    import { dataRepairService } from "../../services/dataRepairService";
    import { get } from "svelte/store";
    import { _ } from "../../locales/i18n";

    let missingAtrCount = $state(0);
    let missingMfeMaeCount = $state(0);
    let invalidSymbolCount = $state(0);

    let isScanning = $state(false);
    let isRepairing = $state(false);
    let progress = $state(0);
    let totalToRepair = $state(0);
    let statusMessage = $state("");

    function scan() {
        isScanning = true;
        try {
            missingAtrCount = dataRepairService.scanForMissingAtr();
            missingMfeMaeCount = dataRepairService.scanForMissingMfeMae();
            invalidSymbolCount = dataRepairService.scanForInvalidSymbols();

            const totalIssues =
                missingAtrCount + missingMfeMaeCount + invalidSymbolCount;

            if (totalIssues === 0) {
                statusMessage = "Alles sauber. Keine fehlenden Daten gefunden.";
            } else {
                statusMessage = `${totalIssues} Probleme gefunden.`;
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

    async function repairMfeMae() {
        if (missingMfeMaeCount === 0) return;
        isRepairing = true;
        progress = 0;
        totalToRepair = missingMfeMaeCount;
        statusMessage = "Starte MFE/MAE Reparatur...";

        await dataRepairService.repairMfeMae((curr, total, msg) => {
            progress = curr;
            statusMessage = msg;
        });

        isRepairing = false;
        scan();
    }

    async function repairSymbols() {
        if (invalidSymbolCount === 0) return;
        isRepairing = true;
        progress = 0;
        totalToRepair = invalidSymbolCount;
        statusMessage = "Starte Symbol-Bereinigung...";

        await dataRepairService.repairSymbols((curr, total, msg) => {
            progress = curr;
            statusMessage = msg;
        });

        isRepairing = false;
        scan();
    }
</script>

<div
    class="bg-[var(--bg-secondary)] p-6 rounded-lg border border-[var(--border-color)]"
>
    <div class="flex items-center justify-between mb-4">
        <h3 class="text-xl font-bold text-[var(--text-primary)]">
            Daten-Wartung & Reparatur
        </h3>
        <button
            class="px-4 py-2 bg-[var(--color-primary)] text-white rounded hover:opacity-90 transition-opacity disabled:opacity-50"
            onclick={scan}
            disabled={isScanning || isRepairing}
        >
            {isScanning ? "Scanne..." : "Alles Scannen"}
        </button>
    </div>

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
                    <div class="text-[var(--text-secondary)] italic px-4 py-2">
                        {isScanning ? "..." : missingAtrCount === 0 ? "OK" : ""}
                    </div>
                {/if}
            </div>
        </div>

        <!-- MFE/MAE Row -->
        <div
            class="flex items-center justify-between p-4 bg-[var(--bg-primary)] rounded border border-[var(--border-color)]"
        >
            <div>
                <h4 class="font-medium text-[var(--text-primary)]">
                    Exekutions-Metriken (MFE/MAE)
                </h4>
                <p class="text-sm text-[var(--text-secondary)]">
                    Berechnet maximalen Gewinn (MFE) und Verlust (MAE) während
                    des Trades.
                </p>
            </div>
            <div class="flex gap-2">
                {#if missingMfeMaeCount > 0 && !isRepairing}
                    <button
                        class="px-4 py-2 bg-[var(--color-warning)] text-white rounded hover:opacity-90 transition-opacity"
                        onclick={repairMfeMae}
                    >
                        Reparieren ({missingMfeMaeCount})
                    </button>
                {:else}
                    <div class="text-[var(--text-secondary)] italic px-4 py-2">
                        {isScanning
                            ? "..."
                            : missingMfeMaeCount === 0
                              ? "OK"
                              : ""}
                    </div>
                {/if}
            </div>
        </div>

        <!-- Symbol Normalization Row -->
        <div
            class="flex items-center justify-between p-4 bg-[var(--bg-primary)] rounded border border-[var(--border-color)]"
        >
            <div>
                <h4 class="font-medium text-[var(--text-primary)]">
                    Symbole bereinigen
                </h4>
                <p class="text-sm text-[var(--text-secondary)]">
                    Korrigiert falsche Formate (z.B. "btc/usdt" zu "BTCUSDT").
                </p>
            </div>
            <div class="flex gap-2">
                {#if invalidSymbolCount > 0 && !isRepairing}
                    <button
                        class="px-4 py-2 bg-[var(--color-warning)] text-white rounded hover:opacity-90 transition-opacity"
                        onclick={repairSymbols}
                    >
                        Korrigieren ({invalidSymbolCount})
                    </button>
                {:else}
                    <div class="text-[var(--text-secondary)] italic px-4 py-2">
                        {isScanning
                            ? "..."
                            : invalidSymbolCount === 0
                              ? "OK"
                              : ""}
                    </div>
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
