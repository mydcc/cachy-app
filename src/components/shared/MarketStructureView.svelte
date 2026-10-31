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
  The reading order of a chart, as a lesson (FEAT-0767).

  Five steps in the order a discretionary trader should read before looking
  for a pattern: bias, structure, levels, regime, volatility. Each card states
  its job, shows one schematic that *is* the thing being taught, and explains
  it in prose. The applied version of this order lives in the Technicals panel
  (FEAT-0766) — this tab is the explanation behind it, not a second dashboard.

  No live data: schematics are inline SVG, so the page is identical in the app
  and on the public SEO route, sharp at any size and free of chart lifecycles.
-->

<script lang="ts">
   import { _ } from "../../locales/i18n";
   import type { TranslationKey } from "../../locales/schema";
   import { nameKey } from "../../lib/alerts/indicatorCatalogue";

   interface Props {
      /** Switch to the indicators tab; the parent owns tab state. */
      onOpenIndicators: (id: string) => void;
   }

   let { onOpenIndicators }: Props = $props();

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

   interface Section {
      key: "s1" | "s2" | "s3" | "s4a" | "s4b";
      lessons: readonly string[];
   }

   const SECTIONS: readonly Section[] = [
      { key: "s1", lessons: ["ema"] },
      { key: "s2", lessons: [] },
      { key: "s3", lessons: [] },
      { key: "s4a", lessons: ["adx", "choppiness"] },
      { key: "s4b", lessons: ["bollinger", "atr"] },
   ];
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
   class="flex flex-col gap-8 h-full min-h-0 min-w-0 overflow-y-auto scroll-pt-8"
   data-testid="structure-view"
>
   <p class="text-xs text-[var(--text-secondary)] max-w-[52rem] mx-auto w-full">
      {text("academy.structure.panelHint")}
   </p>

   {#each SECTIONS as section, index (section.key)}
      {@const title = text(`academy.structure.${section.key}.title`)}
      <article
         class="bg-[var(--bg-tertiary)] p-5 rounded-xl border border-[var(--border-color)] flex flex-col gap-4 min-w-0 w-full max-w-[52rem] mx-auto"
         data-testid="structure-{section.key}"
      >
         <header class="flex flex-col gap-2">
            <h3 class="text-sm font-bold uppercase text-[var(--text-secondary)]">
               {index + 1}. {title}
            </h3>
            <p class="text-sm font-bold text-[var(--text-primary)]">
               {text(`academy.structure.${section.key}.takeaway`)}
            </p>
         </header>

         <figure class="flex flex-col gap-2 min-w-0" data-testid="structure-figure-{section.key}">
            <!-- The heading above already names the card; the drawing needs a
                 description of what it shows, not a repetition of the title. -->
            <p class="sr-only" id="structure-alt-{section.key}">
               {text(`academy.structure.${section.key}.diagramAlt`)}
            </p>
            <svg
               viewBox="0 0 400 240"
               class="w-full h-auto max-w-[520px] mx-auto"
               role="img"
               aria-labelledby="structure-alt-{section.key}"
               data-testid="structure-diagram-{section.key}"
            >
               {#if section.key === "s1"}
                  <!-- The higher timeframe sets the direction; the lower one
                       only times the entry inside it. -->
                  <rect
                     x="8"
                     y="8"
                     width="384"
                     height="100"
                     rx="6"
                     fill="none"
                     stroke="var(--border-color)"
                  />
                  <text
                     x="18"
                     y="26"
                     fill="var(--text-secondary)"
                     font-size="11"
                     font-family="monospace">4h</text
                  >
                  <polyline
                     points="24,32 70,36 116,44 162,52 208,58 254,66 300,74 346,82 378,88"
                     fill="none"
                     stroke="var(--text-primary)"
                     stroke-width="2.5"
                     stroke-linejoin="round"
                     stroke-linecap="round"
                  />
                  <rect
                     x="8"
                     y="120"
                     width="384"
                     height="112"
                     rx="6"
                     fill="none"
                     stroke="var(--border-color)"
                  />
                  <text
                     x="18"
                     y="138"
                     fill="var(--text-secondary)"
                     font-size="11"
                     font-family="monospace">1h</text
                  >
                  <polyline
                     points="24,150 44,168 64,156 84,182 104,162 124,186 144,166 164,190 184,170 204,192 224,172 244,188 264,168 284,190 304,174 324,186 344,168 364,184 378,176"
                     fill="none"
                     stroke="var(--text-primary)"
                     stroke-width="1.5"
                     stroke-linejoin="round"
                     stroke-linecap="round"
                     opacity="0.8"
                  />
               {:else if section.key === "s2"}
                  <rect
                     x="120"
                     y="150"
                     width="235"
                     height="22"
                     fill="var(--accent-color)"
                     opacity="0.12"
                  />
                  <line
                     x1="125"
                     y1="162"
                     x2="245"
                     y2="162"
                     stroke="var(--text-tertiary)"
                     stroke-width="1.5"
                     stroke-dasharray="6 4"
                  />
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
                  <circle
                     cx="300"
                     cy="148"
                     r="5"
                     fill="none"
                     stroke="var(--warning-color)"
                     stroke-width="2"
                  />
               {:else if section.key === "s3"}
                  <!-- Old resistance becomes support: the retest is the entry. -->
                  <rect x="8" y="64" width="384" height="14" fill="var(--accent-color)" opacity="0.14" />
                  <line
                     x1="8"
                     y1="71"
                     x2="392"
                     y2="71"
                     stroke="var(--accent-color)"
                     stroke-width="1"
                     stroke-dasharray="6 4"
                     opacity="0.7"
                  />
                  <polyline
                     points="20,214 46,150 66,178 92,74 112,120 138,78 158,128 182,120 206,50 226,44 250,72 274,74 300,58 340,34 378,22"
                     fill="none"
                     stroke="var(--text-primary)"
                     stroke-width="2"
                     stroke-linejoin="round"
                     stroke-linecap="round"
                  />
                  <rect
                     x="270"
                     y="70"
                     width="8"
                     height="8"
                     transform="rotate(45 274 74)"
                     fill="none"
                     stroke="var(--accent-color)"
                     stroke-width="2"
                  />
               {:else if section.key === "s4a"}
                  <!-- Left: a trend that keeps making higher lows. Right: the
                       same range, where every breakout fails. -->
                  <rect
                     x="8"
                     y="8"
                     width="184"
                     height="224"
                     rx="6"
                     fill="none"
                     stroke="var(--border-color)"
                  />
                  <rect
                     x="208"
                     y="8"
                     width="184"
                     height="224"
                     rx="6"
                     fill="none"
                     stroke="var(--border-color)"
                  />
                  <polyline
                     points="24,204 24,176 56,176 56,150 88,150 88,124 120,124 120,96 152,96 152,66 176,66"
                     fill="none"
                     stroke="var(--success-color)"
                     stroke-width="2"
                     stroke-linejoin="round"
                     stroke-linecap="round"
                  />
                  <line
                     x1="216"
                     y1="64"
                     x2="384"
                     y2="64"
                     stroke="var(--text-tertiary)"
                     stroke-width="1"
                     stroke-dasharray="5 4"
                  />
                  <line
                     x1="216"
                     y1="176"
                     x2="384"
                     y2="176"
                     stroke="var(--text-tertiary)"
                     stroke-width="1"
                     stroke-dasharray="5 4"
                  />
                  <polyline
                     points="222,150 244,56 266,170 288,184 310,168 332,58 354,172 376,74"
                     fill="none"
                     stroke="var(--warning-color)"
                     stroke-width="1.5"
                     stroke-linejoin="round"
                     stroke-linecap="round"
                     opacity="0.85"
                  />
               {:else}
                  <!-- Compression narrows the range; expansion pays for the stop. -->
                  <line
                     x1="16"
                     y1="46"
                     x2="192"
                     y2="102"
                     stroke="var(--text-tertiary)"
                     stroke-width="1.5"
                     stroke-dasharray="6 4"
                  />
                  <line
                     x1="16"
                     y1="194"
                     x2="192"
                     y2="122"
                     stroke="var(--text-tertiary)"
                     stroke-width="1.5"
                     stroke-dasharray="6 4"
                  />
                  <polyline
                     points="16,120 44,64 70,168 96,80 122,142 148,96 172,122 192,112"
                     fill="none"
                     stroke="var(--text-primary)"
                     stroke-width="1.5"
                     stroke-linejoin="round"
                     stroke-linecap="round"
                     opacity="0.85"
                  />
                  <line
                     x1="192"
                     y1="112"
                     x2="384"
                     y2="16"
                     stroke="var(--accent-color)"
                     stroke-width="1.5"
                     stroke-dasharray="6 4"
                     opacity="0.7"
                  />
                  <line
                     x1="192"
                     y1="112"
                     x2="384"
                     y2="76"
                     stroke="var(--accent-color)"
                     stroke-width="1.5"
                     stroke-dasharray="6 4"
                     opacity="0.7"
                  />
                  <polyline
                     points="192,112 216,104 240,86 264,84 288,70 312,64 336,50 360,40 384,20"
                     fill="none"
                     stroke="var(--text-primary)"
                     stroke-width="2.5"
                     stroke-linejoin="round"
                     stroke-linecap="round"
                  />
               {/if}
            </svg>

            {#if section.key === "s2"}
               <figcaption
                  class="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--text-secondary)] max-w-[520px] mx-auto w-full"
               >
                  <span class="inline-flex items-center gap-1.5">
                     <span class="inline-block w-2.5 h-2.5 rounded-full bg-[var(--accent-color)]"></span>
                     {text("academy.structure.s2.legendSwings")}
                  </span>
                  <span class="inline-flex items-center gap-1.5">
                     <span
                        class="inline-block w-6 border-t-2 border-dashed border-[var(--text-tertiary)]"
                     ></span>
                     {text("academy.structure.s2.legendBos")}
                  </span>
                  <span class="inline-flex items-center gap-1.5">
                     <span
                        class="inline-block w-2.5 h-2.5 rounded-full border-2 border-[var(--warning-color)]"
                     ></span>
                     {text("academy.structure.s2.legendChoch")}
                  </span>
                  <span class="inline-flex items-center gap-1.5">
                     <span
                        class="inline-block w-2.5 h-2.5 rounded bg-[var(--accent-color)] opacity-40"
                     ></span>
                     {text("academy.structure.s2.legendZone")}
                  </span>
               </figcaption>
            {/if}
         </figure>

         <p class="text-sm text-[var(--text-primary)]">{text(`academy.structure.${section.key}.body`)}</p>

         {@render lessonChips(section)}
      </article>
   {/each}
</div>
