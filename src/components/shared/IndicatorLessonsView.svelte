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
  FEAT-0677 — the "Indicators & Setups" tab.

  The lesson list is `LESSON_GROUPS`, derived from the catalogue, so a new
  indicator arrives here with no edit. The prose is read from
  `academy.indicators.<id>.<field>` and rendered as text nodes: measured over
  all 184 values in both languages, no lesson carries any Markdown, so this view
  never needs `{@html}`.

  The indicator name, group headings, parameter names and output names are
  reused from the alert editor's namespace through the catalogue's key builders
  (`nameKey`, `groupKey`, `paramKey`, `outputKey`) rather than copied here.

  The layout mirrors `ChartPatternsView` deliberately — the same
  container-query classes, because the Academy lives in a resizable window
  where viewport breakpoints never fire. `AcademyResponsive.component.test.ts`
  holds this tab to the same contract as the other two.
-->

<script lang="ts">
    import { _ } from "../../locales/i18n";
    import type { TranslationKey } from "../../locales/schema";
    import {
        INDICATOR_GROUP_ORDER,
        groupKey,
        nameKey,
        outputKey,
        paramKey,
        type CatalogueEntry,
        type IndicatorGroup,
    } from "../../lib/alerts/indicatorCatalogue";
    import { LESSON_FIELDS, LESSON_GROUPS, lessonKey } from "../../lib/academy/indicatorLessons";
    import { INDICATOR_FORMULAS } from "../../lib/academy/indicatorFormulas";
    import { lessonParams, type LessonParameters } from "../../lib/academy/lessonSettings";
    import { createPatternFavorites } from "../../lib/academy/usePatternFavorites.svelte";
    import { indicatorState, shippedIndicatorDefaults } from "../../stores/indicator.svelte";
    import { markdown } from "../../actions/markdown";
    import "katex/dist/katex.min.css";
    import IndicatorLessonChart from "./IndicatorLessonChart.svelte";

    interface Props {
        /**
         * False on the public SEO route: the lesson text still renders, but the
         * live chart does not, so a marketing visit neither pages kline history
         * nor opens a market subscription for the default symbol.
         */
        showLiveChart?: boolean;
    }

    let { showLiveChart = true }: Props = $props();

    type LessonField = (typeof LESSON_FIELDS)[number];
    type GroupFilter = "all" | "favorites" | IndicatorGroup;

    /** Section headings for the four ADR-0025 fields, in reading order. */
    const FIELD_HEADINGS: Record<LessonField, TranslationKey> = {
        whatItMeasures: "indicatorLessons.field.whatItMeasures",
        howToRead: "indicatorLessons.field.howToRead",
        failureModes: "indicatorLessons.field.failureModes",
        confirmation: "indicatorLessons.field.confirmation",
    };

    let searchQuery = $state("");
    let groupFilter = $state<GroupFilter>("all");
    let selectedId = $state<string | null>(null);

    /*
     * The favorites hook is keyed by its storage key and was never pattern
     * specific, so the third caller reuses it rather than adding a module. Its
     * name still says "Pattern"; renaming it is a separate, mechanical change.
     */
    const favoritesStore = createPatternFavorites("indicator_lesson_favorites");
    let favorites = $derived(favoritesStore.favorites);

    /** A locale string, or `fallback` when the key is absent or empty. */
    function translated(key: string, fallback: string): string {
        const text = $_(key as TranslationKey);
        return text === key || text === "" ? fallback : text;
    }

    function lessonName(entry: CatalogueEntry): string {
        return translated(nameKey(entry.id), entry.id);
    }

    function groupLabel(group: IndicatorGroup): string {
        return translated(groupKey(group), group);
    }

    function lessonText(entry: CatalogueEntry, field: LessonField): string {
        return translated(lessonKey(entry.id, field), "");
    }

    const allEntries = LESSON_GROUPS.flatMap((group) => group.entries);

    let current = $derived(allEntries.find((entry) => entry.id === selectedId) ?? allEntries[0]);

    /*
     * FEAT-0681: the open lesson's parameters as the user configured them, and
     * which of them the trader moved away from the shipped defaults. One
     * `$derived` for both consumers — the chart below and the Parameter card —
     * so the number a reader sees and the number the line was drawn with cannot
     * drift apart. Read from `indicatorState` here, so a settings change
     * re-derives the card without a reload; compared against a copy of the
     * shipped indicator defaults, so a first-time trader sees no "your setting"
     * marker on a value they never touched.
     */
    const SHIPPED_PARAMETERS: LessonParameters = {
        values: {},
        field: undefined,
        modified: new Set(),
    };
    /*
     * The baseline the "your setting" marker compares against: the settings a
     * new install starts from. Taken once, and a copy, so it neither follows the
     * store's edits nor can be edited through it.
     */
    const SHIPPED_DEFAULTS = shippedIndicatorDefaults();
    let lessonParameters = $derived(
        current ? lessonParams(current, indicatorState, SHIPPED_DEFAULTS) : SHIPPED_PARAMETERS,
    );

    /** Normalised once per keystroke rather than once per entry. */
    const normalizedQuery = $derived(searchQuery.trim().toLowerCase());

    /*
     * Filtered in a `$derived`, never in the template: the repo forbids
     * sort/filter/map inside `{#each}`, and every keystroke recomputes this.
     */
    let visibleGroups = $derived(
        LESSON_GROUPS.map((group) => ({
            group: group.group,
            entries: group.entries.filter((entry) => {
                const matchesSearch = lessonName(entry).toLowerCase().includes(normalizedQuery);
                const matchesGroup =
                    groupFilter === "all"
                        ? true
                        : groupFilter === "favorites"
                          ? favorites.has(entry.id)
                          : entry.group === groupFilter;
                return matchesSearch && matchesGroup;
            }),
        })).filter((group) => group.entries.length > 0),
    );

    function selectLesson(id: string) {
        selectedId = id;
    }
</script>

<div class="flex flex-col @md:flex-row h-full gap-4 min-h-0 min-w-0">
    <!-- Sidebar -->
    <div
        class="w-full @md:w-1/4 @lg:w-1/5 @md:min-w-[200px] flex flex-col gap-4 max-h-[35vh] shrink-0 @md:max-h-none @md:shrink min-w-0 border-b border-[var(--border-color)] pb-4 @md:border-b-0 @md:border-r @md:pr-4"
    >
        <!-- Search & Filter -->
        <div
            class="flex flex-col gap-2 p-1 bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-color)]"
        >
            <label class="sr-only" for="indicator-lesson-search"
                >{$_("indicatorLessons.searchLabel")}</label
            >
            <input
                id="indicator-lesson-search"
                type="text"
                aria-label={$_("indicatorLessons.searchLabel")}
                placeholder={$_("indicatorLessons.searchPlaceholder")}
                bind:value={searchQuery}
                class="input-field w-full px-3 py-2 rounded-md text-xs bg-[var(--bg-tertiary)] border border-[var(--input-border-color)] focus:border-[var(--accent-color)] outline-none text-[var(--text-primary)] transition-all"
            />
            <label class="sr-only" for="indicator-lesson-group"
                >{$_("indicatorLessons.groupLabel")}</label
            >
            <!--
              `value` + `onchange` rather than `bind:value`: Svelte resolves a
              select binding through `select.querySelector(':checked')`, and
              happy-dom matches nothing there for an option whose value was set
              programmatically — so the binding falls back to the first option
              instead of the picked one. Same shape as the alerts panel's
              selects.
            -->
            <select
                id="indicator-lesson-group"
                aria-label={$_("indicatorLessons.groupLabel")}
                value={groupFilter}
                onchange={(event) => (groupFilter = event.currentTarget.value as GroupFilter)}
                class="input-field w-full px-3 py-2 rounded-md text-xs bg-[var(--bg-tertiary)] border border-[var(--input-border-color)] outline-none text-[var(--text-primary)] cursor-pointer hover:bg-[var(--bg-secondary)] transition-all"
            >
                <option value="all">{$_("indicatorLessons.filterAll")}</option>
                <option value="favorites">{$_("indicatorLessons.filterFavorites")}</option>
                {#each INDICATOR_GROUP_ORDER as group}
                    <option value={group}>{groupLabel(group)}</option>
                {/each}
            </select>
        </div>

        <!-- List -->
        <div
            class="flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-1 bg-[var(--bg-tertiary)] rounded-lg border border-[var(--border-color)] p-1"
        >
            {#each visibleGroups as group (group.group)}
                <h3
                    class="px-3 pt-2 pb-1 text-[10px] font-black uppercase tracking-widest text-[var(--text-tertiary)]"
                >
                    {groupLabel(group.group)}
                </h3>
                {#each group.entries as entry (entry.id)}
                    {@const selected = current?.id === entry.id}
                    <button
                        aria-current={selected ? "true" : undefined}
                        class="text-left px-3 py-2 rounded-lg text-xs font-medium transition-all flex justify-between items-center gap-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-color)]
                               {selected
                            ? 'bg-[var(--accent-color)] text-[var(--btn-accent-text)] shadow-lg'
                            : 'text-[var(--text-secondary)] hover:bg-[var(--nav-hover-bg)] hover:text-[var(--accent-color)]'}"
                        onclick={() => selectLesson(entry.id)}
                    >
                        <span class="truncate font-bold tracking-tight">{lessonName(entry)}</span>
                        {#if favorites.has(entry.id)}
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                viewBox="0 0 24 24"
                                fill="currentColor"
                                aria-hidden="true"
                                class="w-3.5 h-3.5 flex-shrink-0 {selected
                                    ? 'text-[var(--btn-accent-text)]'
                                    : 'text-[var(--warning-color)]'}"
                            >
                                <path
                                    fill-rule="evenodd"
                                    d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.007 5.404.433c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.433 2.082-5.006z"
                                    clip-rule="evenodd"
                                />
                            </svg>
                        {/if}
                    </button>
                {/each}
            {/each}
            {#if visibleGroups.length === 0}
                <div class="text-center text-[var(--text-tertiary)] text-sm py-4">
                    {$_("indicatorLessons.noLessons")}
                </div>
            {/if}
        </div>
    </div>

    <!-- Main Content -->
    <div
        class="w-full flex flex-col gap-4 overflow-y-auto custom-scrollbar px-2 flex-1 min-h-0 min-w-0"
    >
        {#if current}
            <!-- Header -->
            <div class="min-w-0">
                <div class="flex flex-wrap gap-2 justify-between items-start">
                    <div class="flex flex-wrap items-center gap-3 min-w-0">
                        <h2
                            class="text-xl @md:text-2xl font-bold text-[var(--accent-color)] break-words min-w-0"
                        >
                            {lessonName(current)}
                        </h2>
                        <button
                            class="p-1 hover:bg-[var(--bg-secondary)] rounded transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-color)]"
                            onclick={() => favoritesStore.toggle(current.id)}
                            aria-pressed={favorites.has(current.id)}
                            aria-label={favorites.has(current.id)
                                ? $_("marketOverview.tooltips.removeFavorite")
                                : $_("marketOverview.tooltips.addFavorite")}
                            title={favorites.has(current.id)
                                ? $_("marketOverview.tooltips.removeFavorite")
                                : $_("marketOverview.tooltips.addFavorite")}
                        >
                            {#if favorites.has(current.id)}
                                <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    viewBox="0 0 24 24"
                                    fill="currentColor"
                                    aria-hidden="true"
                                    class="w-6 h-6 text-[var(--warning-color)]"
                                >
                                    <path
                                        fill-rule="evenodd"
                                        d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.007 5.404.433c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.433 2.082-5.006z"
                                        clip-rule="evenodd"
                                    />
                                </svg>
                            {:else}
                                <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke-width="1.5"
                                    stroke="currentColor"
                                    aria-hidden="true"
                                    class="w-6 h-6 text-[var(--text-tertiary)]"
                                >
                                    <path
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                        d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.563.045.797.777.388 1.18l-4.204 4.152a.563.563 0 00-.161.503l1.26 5.289a.562.562 0 01-.84.62l-4.738-2.868a.562.562 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.62l1.26-5.289a.563.563 0 00-.161-.503L3.038 10.577a.562.562 0 01.388-1.18l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z"
                                    />
                                </svg>
                            {/if}
                        </button>
                    </div>

                    <div class="flex flex-wrap items-center gap-2 shrink-0">
                        <span
                            class="text-xs px-2 py-1 rounded bg-[var(--bg-tertiary)] border border-[var(--border-color)]"
                        >
                            {groupLabel(current.group)}
                        </span>
                        <span
                            class="text-xs px-2 py-1 rounded bg-[var(--bg-tertiary)] border border-[var(--border-color)]"
                        >
                            {$_(
                                `indicatorLessons.placement.${current.placement}` as TranslationKey,
                            )}
                        </span>
                    </div>
                </div>
            </div>

            <!--
              FEAT-0677, AC 8/9 — the live chart. A sibling of the split row
              rather than a third child: `split` carries the mobile flex
              contract pinned by AcademyResponsive.component.test.ts, and the
              children of the main column are unconstrained. Full width reads
              better for a chart than one column of the split.
            -->
            {#if showLiveChart}
                <IndicatorLessonChart
                    entry={current}
                    params={lessonParameters.values}
                    field={lessonParameters.field}
                />
            {/if}

            <div class="flex flex-col @lg:flex-row @lg:flex-wrap gap-6 h-full min-w-0">
                <!-- Left Column: the four lesson fields -->
                <div class="w-full @lg:flex-[2_1_320px] flex flex-col gap-6 min-w-0">
                    {#each LESSON_FIELDS as field (field)}
                        <div
                            class="bg-[var(--bg-tertiary)] p-4 rounded-xl border border-[var(--border-color)]"
                        >
                            <h3
                                class="text-sm font-bold uppercase text-[var(--text-secondary)] mb-2"
                            >
                                {$_(FIELD_HEADINGS[field])}
                            </h3>
                            <p class="text-sm text-[var(--text-primary)] leading-relaxed">
                                {lessonText(current, field)}
                            </p>
                        </div>
                    {/each}
                </div>

                <!-- Right Column: what the engine is configured with -->
                <div class="w-full @lg:flex-[1_1_280px] flex flex-col gap-6 h-full min-w-0">
                    <div
                        class="bg-[var(--bg-tertiary)] p-4 rounded-xl border border-[var(--border-color)]"
                    >
                        <h3
                            class="text-sm font-bold uppercase text-[var(--text-secondary)] mb-2"
                        >
                            {$_("indicatorLessons.parameters")}
                        </h3>
                        {#if current.params.length === 0}
                            <p class="text-sm text-[var(--text-tertiary)]">
                                {$_("indicatorLessons.parametersEmpty")}
                            </p>
                        {:else}
                            <ul class="flex flex-col gap-1">
                                {#each current.params as param (param.name)}
                                    {@const effective =
                                        lessonParameters.values[param.name] ?? param.default}
                                    {@const fromSettings =
                                        lessonParameters.modified.has(param.name)}
                                    <!--
                                      Three states, not two: a shipped Technicals
                                      default that differs from the catalogue's
                                      (the first EMA is 21, the catalogue says 20)
                                      is neither the catalogue default nor the
                                      trader's edit, and a reader comparing the two
                                      screens needs to know which they are on.
                                    -->
                                    {@const fromShippedDefault =
                                        !fromSettings &&
                                        String(effective) !== String(param.default)}
                                    <li class="flex justify-between items-baseline gap-3 text-sm">
                                        <span class="text-[var(--text-primary)]"
                                            >{translated(paramKey(param.name), param.name)}</span
                                        >
                                        <span
                                            class="flex items-baseline gap-1.5 shrink-0 font-mono text-[var(--accent-color)]"
                                        >
                                            {effective}
                                            {#if fromSettings}
                                                <!-- The value the chart drew with,
                                                     and whose it is: a number
                                                     that silently came from the
                                                     settings would be the one
                                                     thing a reader cannot check. -->
                                                <span
                                                    class="text-[10px] uppercase tracking-wide text-[var(--text-tertiary)]"
                                                    >{$_(
                                                        "indicatorLessons.parameterFromSettings",
                                                    )}</span
                                                >
                                            {:else if fromShippedDefault}
                                                <span
                                                    class="text-[10px] uppercase tracking-wide text-[var(--text-tertiary)]"
                                                    >{$_(
                                                        "indicatorLessons.parameterShippedDefault",
                                                    )}</span
                                                >
                                            {/if}
                                        </span>
                                    </li>
                                {/each}
                            </ul>
                        {/if}
                    </div>

                    <div
                        class="bg-[var(--bg-tertiary)] p-4 rounded-xl border border-[var(--border-color)]"
                    >
                        <h3
                            class="text-sm font-bold uppercase text-[var(--text-secondary)] mb-2"
                        >
                            {$_("indicatorLessons.formula")}
                        </h3>
                        <!--
                          Through the same Markdown/KaTeX action the two pattern
                          tabs use, so the formula is typeset maths rather than a
                          line of LaTeX source. The string is language-neutral
                          (ADR-0025), so it is read from the catalogue by id
                          instead of from the locale.
                        -->
                        <div
                            class="lesson-formula text-sm text-[var(--text-primary)]"
                            use:markdown={INDICATOR_FORMULAS[current.id] ?? ""}
                        ></div>
                    </div>

                    <div
                        class="bg-[var(--bg-tertiary)] p-4 rounded-xl border border-[var(--border-color)] flex-grow"
                    >
                        <h3
                            class="text-sm font-bold uppercase text-[var(--text-secondary)] mb-2"
                        >
                            {$_("indicatorLessons.outputs")}
                        </h3>
                        <ul class="flex flex-col gap-1">
                            {#each current.outputs as output (output.name)}
                                <li class="text-sm text-[var(--text-primary)]">
                                    {translated(outputKey(output.name), output.name)}
                                </li>
                            {/each}
                        </ul>
                    </div>
                </div>
            </div>
        {/if}
    </div>
</div>

<style>
    .input-field {
        transition: all 0.2s;
    }
    .custom-scrollbar::-webkit-scrollbar {
        width: 6px;
    }
    .custom-scrollbar::-webkit-scrollbar-thumb {
        background: var(--border-color);
        border-radius: 3px;
    }
    .custom-scrollbar::-webkit-scrollbar-track {
        background: transparent;
    }
    /* A display block in a narrow column scrolls instead of overflowing it. */
    :global(.lesson-formula .katex-display) {
        margin: 0;
        overflow-x: auto;
        overflow-y: hidden;
    }
</style>
