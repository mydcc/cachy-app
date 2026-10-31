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

<!--
  Market structure, trend and regime cockpit (FEAT-0679 reference + FEAT-0686
  live readings). Five cards in reading order; each card leads with its job
  (takeaway) and then shows the live reading for the current symbol before
  the reference prose. Readings are measured values at taught thresholds —
  never verdicts: nothing here states the market *is* trending, ranging or
  expanding, and the interpretation stays with the reader.

  One shared timeframe drives every demo (a second channel carries the bias
  timeframe); charts hide their own pickers. Numbers are display-only f64
  (ADR-0021). Without connection the cards degrade to prose, SVG and buttons.
-->

<script lang="ts">
   import { untrack } from "svelte";
   import { _ } from "../../locales/i18n";
   import type { TranslationKey } from "../../locales/schema";
   import {
      INDICATOR_CATALOGUE,
      nameKey,
      type CatalogueEntry,
   } from "../../lib/alerts/indicatorCatalogue";
   import { computeLessonSeries, type LessonSeries } from "../../lib/academy/indicatorLessonSeries";
   import {
      isDrawableTimeframe,
      lessonKlines,
      LESSON_HISTORY_TARGET,
      readStoredLessonTimeframe,
   } from "../../lib/academy/lessonSettings";
   import {
      higherTimeframe,
      recentLevels,
   } from "../../lib/academy/structureSignals";
   import {
      computeStructureRead,
      fibLevels,
      FIB_RATIOS,
   } from "../../lib/academy/structureRead";
   import { readCssColor } from "../../lib/themeColors";
   import type {
      LessonChartLine,
      LessonChartMarker,
   } from "../../lib/academy/lessonChartAnnotations";
   import { CONSTANTS, TIMEFRAME_QUICK_PICKS } from "../../lib/constants";
   import { tradeState } from "../../stores/trade.svelte";
   import { marketState } from "../../stores/market.svelte";
   import { marketWatcher } from "../../services/marketWatcher";
   import { normalizeSymbol } from "../../utils/symbolUtils";
   import { normalizeTimeframeInput } from "../../utils/utils";
   import { safeLocalStorage } from "../../utils/storageWrapper";
   import TimeframeDropdown from "./TimeframeDropdown.svelte";
   import IndicatorLessonChart from "./IndicatorLessonChart.svelte";

   interface Props {
      /**
       * False on the public SEO route: prose and the static schematic still
       * render, but no live chart pages history or opens a market subscription
       * for the default symbol.
       */
      showLiveChart?: boolean;
      /** Switch to the indicators tab; the parent owns tab state. */
      onOpenIndicators: (id: string) => void;
   }

   let { showLiveChart = true, onOpenIndicators }: Props = $props();

   /** A locale string, or the key when absent — mirrors IndicatorLessonsView. */
   function text(key: string, values?: Record<string, string | number>): string {
      const value = values
         ? $_(key as TranslationKey, { values: values ?? {} })
         : $_(key as TranslationKey);
      return value === key || value === "" ? key : value;
   }

   function lessonName(id: string): string {
      const key = nameKey(id);
      const name = $_(key as TranslationKey);
      return name === key || name === "" ? id : name;
   }

   function entryFor(id: string): CatalogueEntry | undefined {
      return INDICATOR_CATALOGUE.find((entry) => entry.id === id);
   }

   /** Display-only decimals (ADR-0021): adaptive precision, never computed on. */
   function formatPrice(value: number): string {
      if (!Number.isFinite(value)) return "—";
      return String(Number(value.toPrecision(6))); // audit: safe — display string, never computed on
   }

   function format1(value: number): string {
      if (!Number.isFinite(value)) return "—";
      return value.toFixed(1);
   }

   /** One shared timeframe for every demo; the bias step derives its own. */
   let sharedTf = $state(readStoredLessonTimeframe());
   let biasTf = $derived(higherTimeframe(sharedTf));

   function selectSharedTimeframe(value: string): boolean {
      const canonical = normalizeTimeframeInput(value);
      if (!isDrawableTimeframe(canonical)) return false;
      sharedTf = canonical;
      safeLocalStorage.setItem(CONSTANTS.LOCAL_STORAGE_LESSON_TIMEFRAME_KEY, canonical);
      return true;
   }

   /** The app-wide selected symbol. Never a chart-window's own symbol. */
   let symbol = $derived(tradeState.symbol || "");

   /*
    * The cockpit's own subscriptions: the shared demo timeframe plus the
    * bias timeframe. Refcounted like the lesson charts', released on symbol
    * switch, timeframe switch or unmount.
    */
   $effect(() => {
      const current = symbol;
      const live = showLiveChart;
      if (!current || !live) return;
      const timeframes = [...new Set([sharedTf, biasTf])];
      const channels = timeframes.map((tf) => `kline_${tf}`);
      untrack(() => {
         // FEAT-0763: ask for the lesson depth before registering — the
         // register path pages at the user's chart depth, which may be lower
         // than the window a lesson draws. `ensureHistory` locks per
         // symbol:timeframe, so this first call wins.
         for (const tf of timeframes) {
            void marketWatcher.ensureHistory(current, tf, LESSON_HISTORY_TARGET);
         }
         for (const channel of channels) marketWatcher.register(current, channel, "chart");
      });
      return () => {
         for (const channel of channels) marketWatcher.unregister(current, channel, "chart");
      };
   });

   interface Bar {
      time: number;
      high: number;
      low: number;
      close: number;
   }

   /** Validated candle history for one timeframe, oldest first (FEAT-0763 window). */
   function readBars(tf: string): Bar[] {
      const market = marketState.data[normalizeSymbol(symbol, "bitunix")];
      void market?.klinesLastUpdated?.[tf];
      const klines = market?.klines?.[tf];
      if (!klines || klines.length === 0) return [];
      const out: Bar[] = [];
      // `lessonKlines` already guarantees finite, positive, ascending times
      // (review follow-up: the duplicate guard here was dead code).
      for (const kline of lessonKlines(klines)) {
         const time = Number(kline.time); // audit: safe — epoch-ms timestamp
         const high = Number(kline.high); // audit: safe — f64 indicator-engine input (ADR-0021)
         const low = Number(kline.low); // audit: safe — f64 indicator-engine input (ADR-0021)
         const close = Number(kline.close); // audit: safe — f64 indicator-engine input (ADR-0021)
         if (!Number.isFinite(high) || !Number.isFinite(low) || !Number.isFinite(close)) continue;
         out.push({ time, high, low, close });
      }
      return out;
   }

   function toEvalCandles(bars: readonly Bar[]): {
      open_time_ms: number;
      open: string;
      high: string;
      low: string;
      close: string;
   }[] {
      return bars.map((bar) => ({
         open_time_ms: bar.time,
         open: String(bar.close),
         high: String(bar.high),
         low: String(bar.low),
         close: String(bar.close),
      }));
   }

   /** Last finite value of a computed line, or null when indeterminate. */
   function lastValue(values: readonly (string | null)[] | undefined): number | null {
      if (!values) return null;
      for (let i = values.length - 1; i >= 0; i--) {
         const raw = values[i];
         if (raw === null || raw === undefined) continue;
         const parsed = Number(raw); // audit: safe — f64 indicator display value, never money math (ADR-0021)
         if (Number.isFinite(parsed)) return parsed;
      }
      return null;
   }

   function directionOf(current: number | null, previous: number | null): string {
      if (current === null || previous === null) return text("academy.structure.read.noData");
      if (current > previous) return text("academy.structure.read.rising");
      if (current < previous) return text("academy.structure.read.falling");
      return text("academy.structure.read.flat");
   }

   function secondLastValue(values: readonly (string | null)[] | undefined): number | null {
      if (!values) return null;
      let seen = 0;
      for (let i = values.length - 1; i >= 0; i--) {
         const raw = values[i];
         if (raw === null || raw === undefined) continue;
         const parsed = Number(raw); // audit: safe — f64 indicator display value, never money math (ADR-0021)
         if (!Number.isFinite(parsed)) continue;
         seen++;
         if (seen === 2) return parsed;
      }
      return null;
   }

   let bars = $derived(readBars(sharedTf));
   let higherBars = $derived(readBars(biasTf));
   let closes = $derived(bars.map((bar) => bar.close));
   /*
    * FEAT-0765: the mc.pine structure read replaces the fractal/close-break
    * pair — ATR-filtered swings, CHoCH/BOS with the inducement gate, sweeps.
    * Events are confirmed-bar only, so a reading never moves afterwards.
    */
   let read = $derived(computeStructureRead(bars));
   let higherRead = $derived(computeStructureRead(higherBars));
   let swings = $derived(read.swings);
   let structureEvents = $derived(read.events);
   let lastBreak = $derived(
      [...structureEvents]
         .reverse()
         .find((event) => event.kind.startsWith("BOS") || event.kind.startsWith("CHOCH")) ?? null,
   );
   let higherCloses = $derived(higherBars.map((bar) => bar.close));

   /*
    * Indicator series, computed once per data change — never in the template.
    * The `{@const}` blocks below only read these deriveds; a live tick
    * recomputes each series once here instead of once per reading plus once
    * per child chart.
    */
   function seriesFor(entryId: string, source: readonly Bar[], tf: string): LessonSeries | null {
      const entry = entryFor(entryId);
      if (!entry || source.length === 0) return null;
      return computeLessonSeries(entry, toEvalCandles(source), tf);
   }

   let emaSeries = $derived(seriesFor("ema", higherBars, biasTf));
   let adxSeries = $derived(seriesFor("adx", bars, sharedTf));
   let chopSeries = $derived(seriesFor("choppiness", bars, sharedTf));
   let bollingerSeries = $derived(seriesFor("bollinger", bars, sharedTf));
   let atrSeries = $derived(seriesFor("atr", bars, sharedTf));
   let higherSwings = $derived(higherRead.swings);

   /*
    * The mc.pine EMA trio (21/50/200), computed through the same catalogue
    * engine as every other lesson line and merged into one series override
    * for the s1 chart. The names are the PineScript's own and stay
    * language-neutral, like every indicator name in the app.
    */
   const EMA_TRIO_PERIODS = [21, 50, 200] as const;
   let emaTrioSeries = $derived.by<LessonSeries | null>(() => {
      const entry = entryFor("ema");
      if (!entry || bars.length === 0) return null;
      // Review follow-up: the trio is drawn on the shared-timeframe chart, so
      // it must be computed over that timeframe's candles — bias-TF values at
      // shared-TF timestamps would paint the wrong line.
      const candles = toEvalCandles(bars);
      const lines = EMA_TRIO_PERIODS.flatMap((period) =>
         computeLessonSeries(entry, candles, sharedTf, { period }).lines.map((line) => ({
            ...line,
            name: `EMA ${period}`,
         })),
      );
      return { lines, refused: [] };
   });
   let emaTrioReadout = $derived(
      EMA_TRIO_PERIODS.map((period) => {
         const values = emaTrioSeries?.lines.find((line) => line.name === `EMA ${period}`)?.values;
         return `${period} ${directionOf(lastValue(values), secondLastValue(values))}`;
      }).join(" · "),
   );

   /*
    * The live reading, computed once per data change and read by both the
    * sticky readout and the per-card `dl`s — the strip and the cards can
    * never disagree about the same value.
    */
   let emaNow = $derived(lastValue(emaSeries?.lines.find((line) => line.name === "value")?.values));
   let emaPrev = $derived(secondLastValue(emaSeries?.lines.find((line) => line.name === "value")?.values));
   let lastHigherClose = $derived(higherCloses.length > 0 ? higherCloses[higherCloses.length - 1] : null);
   let nearestLevels = $derived(lastHigherClose === null ? [] : recentLevels(higherSwings, lastHigherClose, 1));
   let nearestResistance = $derived(nearestLevels.find((level) => level.side === "resistance") ?? null);
   let nearestSupport = $derived(nearestLevels.find((level) => level.side === "support") ?? null);
   let adxNow = $derived(lastValue(adxSeries?.lines.find((item) => item.name === "adx")?.values));
   let chopNow = $derived(lastValue(chopSeries?.lines.find((item) => item.name === "value")?.values));
   let bwNow = $derived(lastValue(bollingerSeries?.lines.find((item) => item.name === "bandwidth")?.values));
   let atrNow = $derived(lastValue(atrSeries?.lines.find((item) => item.name === "value")?.values));

   interface Section {
      key: "s1" | "s2" | "s3" | "s4a" | "s4b";
      charts: readonly string[];
      lessons: readonly string[];
      hint: string | null;
   }

   const SECTIONS: readonly Section[] = [
      { key: "s1", charts: ["ema"], lessons: ["ema"], hint: "academy.structure.s1.chartHint" },
      { key: "s2", charts: ["ema"], lessons: [], hint: null },
      { key: "s3", charts: ["ema"], lessons: [], hint: null },
      { key: "s4a", charts: ["adx"], lessons: ["adx", "choppiness"], hint: null },
      { key: "s4b", charts: ["bollinger"], lessons: ["bollinger", "atr"], hint: null },
   ];

   function breakKindLabel(kind: string): string {
      if (kind === "BOS-up") return text("academy.structure.read.bosUp");
      if (kind === "BOS-down") return text("academy.structure.read.bosDown");
      if (kind === "CHOCH-up") return text("academy.structure.read.chochUp");
      return text("academy.structure.read.chochDown");
   }

   /**
    * A resolved colour for the canvas. The chart library cannot read
    * `var(...)`, so the theme token is resolved here at draw time; the
    * literal is only a documented fallback for SSR/tests, mirroring
    * IndicatorLessonChart.
    */
   function cssColor(name: string, fallback: string): string {
      if (typeof window === "undefined") return fallback;
      // Review follow-up: themes wire tokens to each other, and a plain
      // getPropertyValue returns the unresolved var(...) reference, which the
      // chart library cannot paint. `readCssColor` walks the chain.
      return readCssColor(name, fallback);
   }

   function markerColor(kind: string): string {
      if (kind === "BOS-up") return cssColor("--success-color", "#26a69a");
      if (kind === "BOS-down") return cssColor("--danger-color", "#ef5350");
      return cssColor("--warning-color", "#ffb300");
   }

   function markersForChart(): LessonChartMarker[] {
      const swingMarks: LessonChartMarker[] = swings.slice(-12).flatMap((swing) => {
         const timeMs = bars[swing.index]?.time;
         if (timeMs === undefined) return [];
         return [
            {
               time: Math.floor(timeMs / 1000),
               position: "aboveBar" as const,
               color: cssColor("--accent-color", "#2962ff"),
               shape: "circle" as const,
            },
         ];
      });
      const structureMarks: LessonChartMarker[] = structureEvents.flatMap(
         (event): LessonChartMarker[] => {
            const timeMs = bars[event.index]?.time;
            if (timeMs === undefined) return [];
            const time = Math.floor(timeMs / 1000);
            if (event.kind === "Sweep-up" || event.kind === "Sweep-down") {
               // The PineScript labels a liquidity sweep with an "S" where the
               // wick took the level and the close came back inside.
               return [
                  {
                     time,
                     position: event.kind === "Sweep-up" ? "aboveBar" : "belowBar",
                     color: cssColor("--warning-color", "#ffb300"),
                     shape: "circle",
                     text: "S",
                  },
               ];
            }
            const up = event.kind === "BOS-up" || event.kind === "CHOCH-up";
            return [
               {
                  time,
                  position: up ? "belowBar" : "aboveBar",
                  color: markerColor(event.kind),
                  shape: up ? "arrowUp" : "arrowDown",
               },
            ];
         },
      );
      return [...swingMarks, ...structureMarks];
   }

   /** The mc.pine Fibonacci levels on the current structure range (s3). */
   function fibLines(): LessonChartLine[] {
      // Review follow-up: the readout names the bias-timeframe levels, so the
      // ladder hangs on the bias-timeframe range too.
      return fibLevels(higherRead.range).map((level, index) => ({
         price: level.price,
         color: cssColor("--text-secondary", "#a0adc0"),
         title: String(FIB_RATIOS[index]),
         lineStyle: "dashed" as const,
      }));
   }

   /** The inducement line the next BOS has to clear (s2, dotted like Pine). */
   function inducementLines(): LessonChartLine[] {
      const idm = read.inducement;
      if (!idm) return [];
      return [
         {
            price: idm.price,
            color: cssColor("--text-secondary", "#a0adc0"),
            title: "IDM",
            lineStyle: "dotted" as const,
         },
      ];
   }
</script>

{#snippet lessonChips(section: Section)}
   {#if section.lessons.length > 0}
      <div class="flex flex-wrap gap-2">
         {#each section.lessons as id (id)}
            <button
               type="button"
               class="text-xs px-2 py-1 rounded bg-[var(--bg-secondary)] border border-[var(--border-color)] text-[var(--accent-color)]"
               aria-label={`${text("academy.structure.openLesson")}: ${lessonName(id)}`}
               data-testid="structure-open-{id}"
               onclick={() => onOpenIndicators(id)}
            >
               {lessonName(id)} →
            </button>
         {/each}
      </div>
   {/if}
{/snippet}

<div
   class="flex flex-col gap-6 h-full min-h-0 min-w-0 overflow-y-auto scroll-pt-8"
   data-testid="structure-view"
>
   <div class="flex flex-wrap items-center gap-2 text-xs text-[var(--text-secondary)]">
      <span>{text("academy.structure.read.timeframe")}</span>
      <TimeframeDropdown
         value={sharedTf}
         options={TIMEFRAME_QUICK_PICKS}
         onSelect={selectSharedTimeframe}
         label={text("academy.structure.read.timeframe")}
      />
      <span aria-hidden="true">·</span>
      <span>{text("academy.structure.read.biasTf")}: {biasTf}</span>
   </div>

   {#if showLiveChart}
      <!-- The reading the cards below explain, pinned above them: one
           scrollable line, same contract as the tab bar (BUG-0762). -->
      <div
         class="sticky top-0 z-10 flex items-center gap-4 overflow-x-auto whitespace-nowrap border-b border-[var(--border-color)] bg-[var(--bg-secondary)] px-2 py-1.5 text-[10px] uppercase tracking-wide text-[var(--text-secondary)]"
         role="group"
         aria-label={text("academy.structure.read.summaryLabel")}
         data-testid="structure-readout"
      >
         <span class="shrink-0">
            {text("dashboard.alerts.indicators.name.ema")} ({biasTf}):
            <span class="font-mono text-[var(--text-primary)]">{directionOf(emaNow, emaPrev)}</span>
         </span>
         <span class="shrink-0">
            {text("academy.structure.read.lastBreak")}:
            <span class="font-mono text-[var(--text-primary)]">
               {#if lastBreak === null}
                  {text("academy.structure.read.noBreak")}
               {:else}
                  {breakKindLabel(lastBreak.kind)} · {text("academy.structure.read.candlesAgo", { n: closes.length - 1 - lastBreak.index })}
               {/if}
            </span>
         </span>
         <span class="shrink-0">
            {text("academy.structure.read.nearestResistance")} / {text("academy.structure.read.nearestSupport")}:
            <span class="font-mono text-[var(--text-primary)]">{nearestResistance ? formatPrice(nearestResistance.price) : "—"} / {nearestSupport ? formatPrice(nearestSupport.price) : "—"}</span>
         </span>
         <span class="shrink-0">
            {text("dashboard.alerts.indicators.name.adx")} / {text("dashboard.alerts.indicators.name.choppiness")}:
            <span class="font-mono text-[var(--text-primary)]">{adxNow === null ? "—" : format1(adxNow)} / {chopNow === null ? "—" : format1(chopNow)}</span>
         </span>
         <span class="shrink-0">
            {text("dashboard.alerts.indicators.output.bandwidth")} / {text("dashboard.alerts.indicators.name.atr")}:
            <span class="font-mono text-[var(--text-primary)]">{bwNow === null ? "—" : `${format1(bwNow)} %`} / {atrNow === null ? "—" : formatPrice(atrNow)}</span>
         </span>
      </div>
   {/if}

   {#each SECTIONS as section, index (section.key)}
      {@const title = text(`academy.structure.${section.key}.title`)}
      {@const body = text(`academy.structure.${section.key}.body`)}
      <article
         class="bg-[var(--bg-tertiary)] p-4 rounded-xl border border-[var(--border-color)] flex flex-col gap-4 min-w-0 {showLiveChart
            ? '@3xl:grid @3xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] @3xl:items-start @3xl:gap-6'
            : ''}"
         data-testid="structure-{section.key}"
      >
         <div class="flex flex-col gap-4 min-w-0" data-testid="structure-prose-{section.key}">
         <h3 class="text-sm font-bold uppercase text-[var(--text-secondary)]">
            {index + 1}. {title}
         </h3>
         <p class="text-sm font-bold text-[var(--text-primary)]">{text(`academy.structure.${section.key}.takeaway`)}</p>

         {#if section.key === "s1"}
            <dl class="flex flex-col gap-1 text-sm">
               <div class="flex justify-between gap-3">
                  <dt class="text-[var(--text-secondary)]">{text("academy.structure.read.biasTf")}</dt>
                  <dd class="font-mono text-[var(--text-primary)]">{biasTf}</dd>
               </div>
               <div class="flex justify-between gap-3">
                  <dt class="text-[var(--text-secondary)]">{text("dashboard.alerts.indicators.name.ema")}</dt>
                  <dd class="font-mono text-[var(--text-primary)]">
                     {#if emaNow === null || lastHigherClose === null}
                        {text("academy.structure.read.noData")}
                     {:else}
                        {directionOf(emaNow, emaPrev)} · {lastHigherClose > emaNow ? text("academy.structure.read.emaAbove") : lastHigherClose < emaNow ? text("academy.structure.read.emaBelow") : text("academy.structure.read.flat")}
                     {/if}
                  </dd>
               </div>
               <div class="flex justify-between gap-3">
                  <dt class="text-[var(--text-secondary)]">{text("dashboard.alerts.indicators.name.ema")} 21/50/200</dt>
                  <dd class="font-mono text-[var(--text-primary)]">{emaTrioReadout}</dd>
               </div>
            </dl>
         {/if}

         {#if section.key === "s2"}
            <dl class="flex flex-col gap-1 text-sm">
               <div class="flex justify-between gap-3">
                  <dt class="text-[var(--text-secondary)]">{text("academy.structure.read.lastBreak")}</dt>
                  <dd class="font-mono text-[var(--text-primary)]">
                     {#if lastBreak === null}
                        {text("academy.structure.read.noBreak")}
                     {:else}
                        {breakKindLabel(lastBreak.kind)} · {text("academy.structure.read.candlesAgo", { n: closes.length - 1 - lastBreak.index })}
                     {/if}
                  </dd>
               </div>
            </dl>
         {/if}

         {#if section.key === "s3"}
            <dl class="flex flex-col gap-1 text-sm">
               <div class="flex justify-between gap-3">
                  <dt class="text-[var(--text-secondary)]">{text("academy.structure.read.nearestResistance")}</dt>
                  <dd class="font-mono text-[var(--text-primary)]">{nearestResistance ? formatPrice(nearestResistance.price) : text("academy.structure.read.noData")}</dd>
               </div>
               <div class="flex justify-between gap-3">
                  <dt class="text-[var(--text-secondary)]">{text("academy.structure.read.nearestSupport")}</dt>
                  <dd class="font-mono text-[var(--text-primary)]">{nearestSupport ? formatPrice(nearestSupport.price) : text("academy.structure.read.noData")}</dd>
               </div>
            </dl>
         {/if}

         {#if section.key === "s4a"}
            <dl class="flex flex-col gap-1 text-sm">
               <div class="flex justify-between gap-3">
                  <dt class="text-[var(--text-secondary)]">{text("dashboard.alerts.indicators.name.adx")}</dt>
                  <dd class="font-mono text-[var(--text-primary)]">
                     {adxNow === null ? text("academy.structure.read.noData") : `${format1(adxNow)} · ${text("academy.structure.read.adxThreshold")}`}
                  </dd>
               </div>
               <div class="flex justify-between gap-3">
                  <dt class="text-[var(--text-secondary)]">{text("dashboard.alerts.indicators.name.choppiness")}</dt>
                  <dd class="font-mono text-[var(--text-primary)]">
                     {chopNow === null ? text("academy.structure.read.noData") : `${format1(chopNow)} · ${text("academy.structure.read.chopThreshold")}`}
                  </dd>
               </div>
            </dl>
         {/if}

         {#if section.key === "s4b"}
            <dl class="flex flex-col gap-1 text-sm">
               <div class="flex justify-between gap-3">
                  <dt class="text-[var(--text-secondary)]">{text("dashboard.alerts.indicators.output.bandwidth")}</dt>
                  <dd class="font-mono text-[var(--text-primary)]">{bwNow === null ? text("academy.structure.read.noData") : `${format1(bwNow)} %`}</dd>
               </div>
               <div class="flex justify-between gap-3">
                  <dt class="text-[var(--text-secondary)]">{text("dashboard.alerts.indicators.name.atr")}</dt>
                  <dd class="font-mono text-[var(--text-primary)]">{atrNow === null ? text("academy.structure.read.noData") : formatPrice(atrNow)}</dd>
               </div>
            </dl>
         {/if}

         <p class="text-sm text-[var(--text-primary)]">{body}</p>

         {#if section.key === "s2"}
            <figure class="flex flex-col gap-2 min-w-0 max-w-[560px]">
               <svg
                  viewBox="0 0 400 240"
                  class="w-full h-auto"
                  role="img"
                  aria-label={title}
                  data-testid="structure-diagram"
               >
                  <rect x="120" y="150" width="235" height="22" fill="var(--accent-color)" opacity="0.12" />
                  <line x1="125" y1="162" x2="245" y2="162" stroke="var(--text-tertiary)" stroke-width="1.5" stroke-dasharray="6 4" />
                  <polyline
                     points="15,195 70,128 125,162 180,100 240,188 300,148 360,158"
                     fill="none"
                     stroke="var(--text-primary)"
                     stroke-width="2"
                     stroke-linejoin="round"
                     stroke-linecap="round"
                  />
                  <g fill="var(--accent-color)">
                     <circle cx="70" cy="128" r="4" />
                     <circle cx="125" cy="162" r="4" />
                     <circle cx="180" cy="100" r="4" />
                     <circle cx="240" cy="188" r="4" />
                  </g>
                  <circle cx="300" cy="148" r="5" fill="none" stroke="var(--warning-color)" stroke-width="2" />
               </svg>
               <figcaption class="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--text-secondary)]">
                  <span class="inline-flex items-center gap-1.5">
                     <span class="inline-block w-2.5 h-2.5 rounded-full bg-[var(--accent-color)]"></span>
                     {text("academy.structure.s2.legendSwings")}
                  </span>
                  <span class="inline-flex items-center gap-1.5">
                     <span class="inline-block w-6 border-t-2 border-dashed border-[var(--text-tertiary)]"></span>
                     {text("academy.structure.s2.legendBos")}
                  </span>
                  <span class="inline-flex items-center gap-1.5">
                     <span class="inline-block w-2.5 h-2.5 rounded-full border-2 border-[var(--warning-color)]"></span>
                     {text("academy.structure.s2.legendChoch")}
                  </span>
                  <span class="inline-flex items-center gap-1.5">
                     <span class="inline-block w-2.5 h-2.5 rounded bg-[var(--accent-color)] opacity-40"></span>
                     {text("academy.structure.s2.legendZone")}
                  </span>
                  <span class="inline-flex items-center gap-1.5">
                     <span class="inline-flex w-2.5 h-2.5 items-center justify-center rounded-full border border-[var(--warning-color)] text-[8px] leading-none text-[var(--warning-color)]">S</span>
                     {text("academy.structure.s2.legendSweep")}
                  </span>
                  <span class="inline-flex items-center gap-1.5">
                     <span class="inline-block w-6 border-t border-dotted border-[var(--text-secondary)]"></span>
                     {text("academy.structure.s2.legendIdm")}
                  </span>
               </figcaption>
            </figure>
         {/if}

         {#if !showLiveChart}
            {@render lessonChips(section)}
         {/if}
         </div>

         {#if showLiveChart}
            <div class="flex flex-col gap-4 min-w-0" data-testid="structure-chart-{section.key}">
               {#if section.hint}
                  <p class="text-sm text-[var(--text-secondary)]">{text(section.hint)}</p>
               {/if}
               {#each section.charts as id (id)}
                  {@const entry = entryFor(id)}
                  {#if entry}
                     <IndicatorLessonChart
                        entry={entry}
                        timeframe={sharedTf}
                        showTimeframePicker={false}
                        series={section.key === "s1" ? (emaTrioSeries ?? undefined) : undefined}
                        markers={section.key === "s2" ? markersForChart() : undefined}
                        priceLines={section.key === "s2" ? inducementLines() : section.key === "s3" ? fibLines() : undefined}
                     />
                  {/if}
               {/each}
               {@render lessonChips(section)}
            </div>
         {/if}
      </article>
   {/each}
</div>
