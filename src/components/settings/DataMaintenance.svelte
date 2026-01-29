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
                statusMessage = $_("settings.data.statusClean");
            } else {
                statusMessage = $_("settings.data.statusIssues", { values: { count: totalIssues } });
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
        statusMessage = $_("settings.data.repairingAtr");

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
        statusMessage = $_("settings.data.repairingMfeMae");

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
        statusMessage = $_("settings.data.repairingSymbols");

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
            {$_("settings.data.title")}
        </h3>
        <button
            class="px-4 py-2 bg-[var(--color-primary)] text-white rounded hover:opacity-90 transition-opacity disabled:opacity-50"
            onclick={scan}
            disabled={isScanning || isRepairing}
        >
            {isScanning ? $_("settings.data.scanning") : $_("settings.data.scanAll")}
        </button>
    </div>

    <div class="space-y-4">
        <div
            class="flex items-center justify-between p-4 bg-[var(--bg-primary)] rounded border border-[var(--border-color)]"
        >
            <div>
                <h4 class="font-medium text-[var(--text-primary)]">
                    {$_("settings.data.atrTitle")}
                </h4>
                <p class="text-sm text-[var(--text-secondary)]">
                    {$_("settings.data.atrDesc")}
                </p>
            </div>
            <div class="flex gap-2">
                {#if missingAtrCount > 0 && !isRepairing}
                    <button
                        class="px-4 py-2 bg-[var(--color-warning)] text-white rounded hover:opacity-90 transition-opacity"
                        onclick={repair}
                    >
                        {$_("settings.data.repair")} ({missingAtrCount})
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
                    {$_("settings.data.mfeMaeTitle")}
                </h4>
                <p class="text-sm text-[var(--text-secondary)]">
                    {$_("settings.data.mfeMaeDesc")}
                </p>
            </div>
            <div class="flex gap-2">
                {#if missingMfeMaeCount > 0 && !isRepairing}
                    <button
                        class="px-4 py-2 bg-[var(--color-warning)] text-white rounded hover:opacity-90 transition-opacity"
                        onclick={repairMfeMae}
                    >
                        {$_("settings.data.repair")} ({missingMfeMaeCount})
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
                    {$_("settings.data.symbolsTitle")}
                </h4>
                <p class="text-sm text-[var(--text-secondary)]">
                    {$_("settings.data.symbolsDesc")}
                </p>
            </div>
            <div class="flex gap-2">
                {#if invalidSymbolCount > 0 && !isRepairing}
                    <button
                        class="px-4 py-2 bg-[var(--color-warning)] text-white rounded hover:opacity-90 transition-opacity"
                        onclick={repairSymbols}
                    >
                        {$_("settings.data.correct")} ({invalidSymbolCount})
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
