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
  Market structure, trend and regime reference tab (FEAT-0679). Four sections
  in reading order: higher-timeframe bias, structure breaks, persisting levels,
  regime as a reading. Prose arrives as plain text nodes from
  `academy.structure.*` — no Markdown, the same contract the indicator lessons
  keep. Charts reuse IndicatorLessonChart with catalogue entries (the S1 EMA
  chart doubles as the timeframe-switch demo); the S2 schematic is a static
  language-neutral SVG whose legend comes from the locale, so both languages
  draw identical definitions. Lesson buttons ask the parent to switch to the
  indicators tab — tab state stays in AcademyContent, this view never owns it.

  Responsive: single column at every width with internal scroll, container
  queries only (`AcademyResponsive.component.test.ts` pins the contract, so no
  viewport `md:`/`lg:` classes here). SVG and charts are width-fluid.
-->

<script lang="ts">
   import { _ } from "../../locales/i18n";
   import type { TranslationKey } from "../../locales/schema";
   import {
      INDICATOR_CATALOGUE,
      nameKey,
      type CatalogueEntry,
   } from "../../lib/alerts/indicatorCatalogue";
   import IndicatorLessonChart from "./IndicatorLessonChart.svelte";

   interface Props {
      /**
       * False on the public SEO route: prose and the static schematic still
       * render, but no live chart pages history or opens a subscription.
       */
      showLiveChart?: boolean;
      /** Switch to the indicators tab; the parent owns tab state. */
      onOpenIndicators: (id: string) => void;
   }

   let { showLiveChart = true, onOpenIndicators }: Props = $props();

   /** A locale string, or the key when absent — mirrors IndicatorLessonsView. */
   function text(key: string): string {
      const value = $_(key as TranslationKey);
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

   interface Section {
      key: "s1" | "s2" | "s3" | "s4";
      charts: readonly string[];
      lessons: readonly string[];
   }

   const SECTIONS: readonly Section[] = [
      { key: "s1", charts: ["ema"], lessons: ["ema"] },
      { key: "s2", charts: [], lessons: [] },
      { key: "s3", charts: [], lessons: [] },
      { key: "s4", charts: ["adx", "bollinger"], lessons: ["adx", "choppiness", "bollinger", "atr"] },
   ];
</script>

<div
   class="flex flex-col gap-6 h-full min-h-0 min-w-0 overflow-y-auto"
   data-testid="structure-view"
>
   {#each SECTIONS as section, index (section.key)}
      {@const title = text(`academy.structure.${section.key}.title`)}
      {@const body = text(`academy.structure.${section.key}.body`)}
      <article
         class="bg-[var(--bg-tertiary)] p-4 rounded-xl border border-[var(--border-color)] flex flex-col gap-4 min-w-0"
         data-testid="structure-{section.key}"
      >
         <h3 class="text-sm font-bold uppercase text-[var(--text-secondary)]">
            {index + 1}. {title}
         </h3>
         <p class="text-sm text-[var(--text-primary)]">{body}</p>

         {#if section.key === "s2"}
            <figure class="flex flex-col gap-2 min-w-0">
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
               </figcaption>
            </figure>
         {/if}

         {#if showLiveChart}
            {#each section.charts as id (id)}
               {@const entry = entryFor(id)}
               {#if entry}
                  <IndicatorLessonChart entry={entry} />
               {/if}
            {/each}
         {/if}

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
      </article>
   {/each}
</div>
