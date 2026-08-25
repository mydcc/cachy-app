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
    import { _ } from "../../../locales/i18n";
    import { settingsState } from "../../../stores/settings.svelte";
    import Toggle from "../../shared/Toggle.svelte";

    const priceScaleModes = [
        { value: "linear", labelKey: "settings.chart.scaleLinear" },
        { value: "log", labelKey: "settings.chart.scaleLog" },
    ] as const;

    const crosshairModes = [
        { value: "normal", labelKey: "settings.chart.crosshairNormal" },
        { value: "magnet", labelKey: "settings.chart.crosshairMagnet" },
        { value: "hidden", labelKey: "settings.chart.crosshairHidden" },
    ] as const;

    const crosshairStyles = [
        { value: "solid", labelKey: "settings.chart.styleSolid" },
        { value: "dashed", labelKey: "settings.chart.styleDashed" },
        { value: "dotted", labelKey: "settings.chart.styleDotted" },
    ] as const;
</script>

<div class="flex flex-col gap-6">
    <!-- Price Scale -->
    <section class="settings-section animate-fade-in">
        <div class="flex justify-between items-center mb-4">
            <h3 class="section-title mb-0">
                {$_("settings.chart.scaleSection") || "Skalierung"}
            </h3>
            <button
                type="button"
                class="text-xs text-[var(--accent-color)] hover:underline"
                onclick={() => settingsState.resetChartSettings()}
            >
                {$_("settings.chart.reset") || "Zurücksetzen"}
            </button>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div class="field-group">
                <label for="chart-scale-mode">
                    {$_("settings.chart.scaleMode") || "Preisskala"}
                </label>
                <select
                    id="chart-scale-mode"
                    bind:value={settingsState.chartPriceScaleMode}
                    class="input-field w-full cursor-pointer transition-all hover:border-[var(--accent-color)]"
                >
                    {#each priceScaleModes as mode (mode.value)}
                        <option value={mode.value}>
                            {$_(mode.labelKey) || mode.value}
                        </option>
                    {/each}
                </select>
            </div>

            <div class="field-group">
                <label for="chart-decimals-mode">
                    {$_("settings.chart.decimalsMode") || "Dezimalstellen"}
                </label>
                <select
                    id="chart-decimals-mode"
                    bind:value={settingsState.chartDecimalsMode}
                    class="input-field w-full cursor-pointer transition-all hover:border-[var(--accent-color)]"
                >
                    <option value="auto">
                        {$_("settings.chart.decimalsAuto") || "Auto (Börse)"}
                    </option>
                    <option value="fixed">
                        {$_("settings.chart.decimalsFixed") || "Fest"}
                    </option>
                </select>
            </div>
        </div>

        <p class="text-[10px] text-[var(--text-secondary)] mb-4">
            {$_("settings.chart.scaleHint")
                || "Logarithmisch bewertet Preisabstände prozentual gleich - empfohlen für große Kursbereiche."}
        </p>

        {#if settingsState.chartDecimalsMode === "fixed"}
            <div class="field-group mb-4">
                <label for="chart-fixed-decimals">
                    {$_("settings.chart.fixedDecimals") || "Feste Dezimalstellen"}
                    <span class="text-[var(--accent-color)] font-mono ml-auto"
                        >{settingsState.chartFixedDecimals}</span
                    >
                </label>
                <input
                    id="chart-fixed-decimals"
                    type="range"
                    min="0"
                    max="8"
                    step="1"
                    bind:value={settingsState.chartFixedDecimals}
                    class="w-full accent-[var(--accent-color)] cursor-pointer"
                />
            </div>
        {/if}

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <label class="toggle-card h-full">
                <div class="flex flex-col">
                    <span class="text-sm font-medium"
                        >{$_("settings.chart.autoScale") || "Auto-Skalierung"}</span
                    >
                    <span
                        class="text-[10px] text-[var(--text-secondary)]"
                        >{$_("settings.chart.autoScaleDesc")
                            || "Y-Achse passt sich automatisch dem Kurs an"}</span
                    >
                </div>
                <Toggle bind:checked={settingsState.chartAutoScale} />
            </label>

            <label class="toggle-card h-full">
                <div class="flex flex-col">
                    <span class="text-sm font-medium"
                        >{$_("settings.chart.invertScale")}</span
                    >
                    <span
                        class="text-[10px] text-[var(--text-secondary)]"
                        >{$_("settings.chart.invertScaleDesc")
                            || "Preisachse umkehren (0 oben)"}</span
                    >
                </div>
                <Toggle bind:checked={settingsState.chartInvertScale} />
            </label>
        </div>
    </section>

    <!-- Display -->
    <section class="settings-section animate-fade-in">
        <h3 class="section-title">
            {$_("settings.chart.displaySection") || "Darstellung"}
        </h3>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <label class="toggle-card h-full">
                <div class="flex flex-col">
                    <span class="text-sm font-medium"
                        >{$_("settings.chart.showGrid") || "Gitterlinien"}</span
                    >
                    <span
                        class="text-[10px] text-[var(--text-secondary)]"
                        >{$_("settings.chart.showGridDesc")
                            || "Hilfslinien im Chart-Hintergrund"}</span
                    >
                </div>
                <Toggle bind:checked={settingsState.chartShowGrid} />
            </label>

            <label class="toggle-card h-full">
                <div class="flex flex-col">
                    <span class="text-sm font-medium"
                        >{$_("settings.chart.candleBorders")}</span
                    >
                    <span
                        class="text-[10px] text-[var(--text-secondary)]"
                        >{$_("settings.chart.candleBordersDesc")
                            || "Rahmenlinie um jeden Kerzenkörper"}</span
                    >
                </div>
                <Toggle bind:checked={settingsState.chartCandleBorders} />
            </label>

            <label class="toggle-card h-full">
                <div class="flex flex-col">
                    <span class="text-sm font-medium"
                        >{$_("settings.chart.lastValueVisible")
                            || "Aktuelle-Preis-Label"}</span
                    >
                    <span
                        class="text-[10px] text-[var(--text-secondary)]"
                        >{$_("settings.chart.lastValueDesc")
                            || "Letzter Kurs an der Preisachse"}</span
                    >
                </div>
                <Toggle bind:checked={settingsState.chartLastValueVisible} />
            </label>

            <label class="toggle-card h-full">
                <div class="flex flex-col">
                    <span class="text-sm font-medium"
                        >{$_("settings.chart.watermark")}</span
                    >
                    <span
                        class="text-[10px] text-[var(--text-secondary)]"
                        >{$_("settings.chart.watermarkDesc")
                            || "Symbol-Name im Chart-Hintergrund"}</span
                    >
                </div>
                <Toggle bind:checked={settingsState.chartWatermark} />
            </label>
        </div>
    </section>

    <!-- Crosshair -->
    <section class="settings-section animate-fade-in">
        <h3 class="section-title">
            {$_("settings.chart.crosshairSection") || "Fadenkreuz"}
        </h3>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div class="field-group">
                <label for="chart-crosshair-mode">
                    {$_("settings.chart.crosshairMode") || "Modus"}
                </label>
                <select
                    id="chart-crosshair-mode"
                    bind:value={settingsState.chartCrosshairMode}
                    class="input-field w-full cursor-pointer transition-all hover:border-[var(--accent-color)]"
                >
                    {#each crosshairModes as mode (mode.value)}
                        <option value={mode.value}>
                            {$_(mode.labelKey) || mode.value}
                        </option>
                    {/each}
                </select>
            </div>

            <div class="field-group">
                <label for="chart-crosshair-style">
                    {$_("settings.chart.crosshairStyle") || "Linienstil"}
                </label>
                <select
                    id="chart-crosshair-style"
                    bind:value={settingsState.chartCrosshairStyle}
                    class="input-field w-full cursor-pointer transition-all hover:border-[var(--accent-color)]"
                >
                    {#each crosshairStyles as style (style.value)}
                        <option value={style.value}>
                            {$_(style.labelKey) || style.value}
                        </option>
                    {/each}
                </select>
            </div>
        </div>
    </section>

    <!-- Time Scale -->
    <section class="settings-section animate-fade-in">
        <h3 class="section-title">
            {$_("settings.chart.timeSection") || "Zeitachse & Countdown"}
        </h3>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <label class="toggle-card h-full">
                <div class="flex flex-col">
                    <span class="text-sm font-medium"
                        >{$_("settings.chart.secondsVisible")}</span
                    >
                    <span
                        class="text-[10px] text-[var(--text-secondary)]"
                        >{$_("settings.chart.secondsVisibleDesc")
                            || "Sekunden in den Zeitstempeln der Zeitachse"}</span
                    >
                </div>
                <Toggle bind:checked={settingsState.chartSecondsVisible} />
            </label>

            <label class="toggle-card h-full">
                <div class="flex flex-col">
                    <span class="text-sm font-medium"
                        >{$_("settings.chart.fixEdges")
                            || "Ränder fixieren"}</span
                    >
                    <span
                        class="text-[10px] text-[var(--text-secondary)]"
                        >{$_("settings.chart.fixEdgesDesc")
                            || "Chart kann nicht über linken/rechten Rand hinaus gescrollt werden"}</span
                    >
                </div>
                <Toggle bind:checked={settingsState.chartFixEdges} />
            </label>

            <label class="toggle-card h-full">
                <div class="flex flex-col">
                    <span class="text-sm font-medium"
                        >{$_("settings.chart.countdownEnabled")
                            || "Countdown zur Kerzenschließung"}</span
                    >
                    <span
                        class="text-[10px] text-[var(--text-secondary)]"
                        >{$_("settings.chart.countdownDesc")
                            || "Verbleibende Zeit bis die aktuelle Kerze schließt"}</span
                    >
                </div>
                <Toggle bind:checked={settingsState.chartCountdownEnabled} />
            </label>
        </div>
    </section>
</div>
