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
  FEAT-0747 — search, filter chips and sorting for the Manage list.

  Chips rather than selects for the three short groups: a trader with five
  alerts should see the whole filter state at once, and `aria-pressed` is the
  state assistive technology can read. Every group with nothing selected means
  "do not filter"; groups compose with AND, values inside a group with OR.
-->
<script lang="ts">
    import { _ } from "../../../locales/i18n";
    import { EVALUATION_KEYS } from "../../../lib/alerts/lifecycleLabels";
    import type { EvaluationMode } from "../../../lib/rules/types";
    import type { AlertLifecycleStatus } from "../../../services/alertEngine/ruleLifecycleView";
    import {
        KIND_KEYS,
        KIND_OPTIONS,
        NO_FILTERS,
        STATUS_KEYS,
        STATUS_OPTIONS,
        type AlertKind,
        type ManageFilters,
        type ManageSort,
    } from "./manageView";

    let {
        query = $bindable(""),
        filters = $bindable(NO_FILTERS),
        sort = $bindable<ManageSort>("symbol"),
        timeframes,
    }: {
        query?: string;
        filters?: ManageFilters;
        sort?: ManageSort;
        timeframes: readonly string[];
    } = $props();

    const EVALUATION_OPTIONS: readonly EvaluationMode[] = ["close", "intrabar"];

    function toggle<T>(selected: readonly T[], value: T): T[] {
        return selected.includes(value)
            ? selected.filter((candidate) => candidate !== value)
            : [...selected, value];
    }

    function toggleStatus(status: AlertLifecycleStatus) {
        filters = { ...filters, status: toggle(filters.status, status) };
    }

    function toggleKind(kind: AlertKind) {
        filters = { ...filters, kind: toggle(filters.kind, kind) };
    }

    function toggleTimeframe(timeframe: string) {
        filters = { ...filters, timeframe: toggle(filters.timeframe, timeframe) };
    }

    function toggleEvaluation(evaluation: EvaluationMode) {
        filters = { ...filters, evaluation: toggle(filters.evaluation, evaluation) };
    }

    let hasFilters = $derived(
        query.trim() !== "" ||
            filters.status.length > 0 ||
            filters.kind.length > 0 ||
            filters.timeframe.length > 0 ||
            filters.evaluation.length > 0,
    );

    function clearFilters() {
        query = "";
        filters = NO_FILTERS;
    }
</script>

<div class="manage-filters">
    <label class="search">
        <span class="field-label">{$_("dashboard.alerts.manageList.searchLabel")}</span>
        <input
            type="search"
            bind:value={query}
            placeholder={$_("dashboard.alerts.manageList.searchPlaceholder")}
            autocomplete="off"
        />
    </label>

    <fieldset class="chip-group">
        <legend>{$_("dashboard.alerts.manageList.filterStatus")}</legend>
        {#each STATUS_OPTIONS as status (status)}
            <button
                type="button"
                class="chip"
                aria-pressed={filters.status.includes(status)}
                onclick={() => toggleStatus(status)}
            >
                {$_(STATUS_KEYS[status])}
            </button>
        {/each}
    </fieldset>

    <fieldset class="chip-group">
        <legend>{$_("dashboard.alerts.manageList.filterKind")}</legend>
        {#each KIND_OPTIONS as kind (kind)}
            <button
                type="button"
                class="chip"
                aria-pressed={filters.kind.includes(kind)}
                onclick={() => toggleKind(kind)}
            >
                {$_(KIND_KEYS[kind])}
            </button>
        {/each}
    </fieldset>

    {#if timeframes.length > 1}
        <fieldset class="chip-group">
            <legend>{$_("dashboard.alerts.manageList.filterTimeframe")}</legend>
            {#each timeframes as timeframe (timeframe)}
                <button
                    type="button"
                    class="chip"
                    aria-pressed={filters.timeframe.includes(timeframe)}
                    onclick={() => toggleTimeframe(timeframe)}
                >
                    {timeframe}
                </button>
            {/each}
        </fieldset>
    {/if}

    <fieldset class="chip-group">
        <legend>{$_("dashboard.alerts.manageList.filterEvaluation")}</legend>
        {#each EVALUATION_OPTIONS as evaluation (evaluation)}
            <button
                type="button"
                class="chip"
                aria-pressed={filters.evaluation.includes(evaluation)}
                onclick={() => toggleEvaluation(evaluation)}
            >
                {$_(EVALUATION_KEYS[evaluation])}
            </button>
        {/each}
    </fieldset>

    <label class="sort">
        <span class="field-label">{$_("dashboard.alerts.manageList.sort")}</span>
        <select bind:value={sort}>
            <option value="symbol">{$_("dashboard.alerts.manageList.sortSymbol")}</option>
            <option value="last-fired">{$_("dashboard.alerts.manageList.sortLastFired")}</option>
            <option value="expiry">{$_("dashboard.alerts.manageList.sortExpiry")}</option>
        </select>
    </label>

    {#if hasFilters}
        <button type="button" class="clear" onclick={clearFilters}>
            {$_("dashboard.alerts.manageList.clearFilters")}
        </button>
    {/if}
</div>

<style>
    .manage-filters {
        display: flex;
        flex-wrap: wrap;
        align-items: flex-end;
        gap: var(--space-2) var(--space-3);
        margin-bottom: var(--space-3);
    }
    .search {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        flex: 1 1 14rem;
        min-width: 10rem;
    }
    .field-label,
    .chip-group legend {
        color: var(--text-secondary);
        font-size: 0.7rem;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        padding: 0;
    }
    .search input,
    .sort select {
        padding: var(--space-1) var(--space-2);
        background: var(--bg-secondary);
        color: var(--text-primary);
        border: 1px solid var(--border-color);
        border-radius: var(--radius-sm);
        font-size: 0.8rem;
    }
    .chip-group {
        display: flex;
        flex-wrap: wrap;
        gap: var(--space-1);
        margin: 0;
        padding: 0;
        border: none;
        min-width: 0;
    }
    .chip-group legend {
        margin-bottom: 0.25rem;
    }
    .chip {
        padding: 0 var(--space-2);
        background: var(--bg-secondary);
        color: var(--text-secondary);
        border: 1px solid var(--border-color);
        border-radius: var(--radius-sm);
        font-size: 0.75rem;
        cursor: pointer;
    }
    .chip[aria-pressed="true"] {
        background: var(--bg-accent-paired, var(--bg-tertiary, var(--bg-secondary)));
        color: var(--text-primary);
        border-color: var(--accent-color);
    }
    .sort {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
    }
    .clear {
        padding: var(--space-1) var(--space-2);
        background: none;
        color: var(--text-secondary);
        border: 1px solid var(--border-color);
        border-radius: var(--radius-sm);
        font-size: 0.75rem;
        cursor: pointer;
    }
</style>
