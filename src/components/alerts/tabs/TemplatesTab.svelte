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
  FEAT-0391 -- the template library.

  Picking a template does not arm anything. It loads the template into the
  Combo tab, where every value is visible and editable, because a strategy a
  trader has not read is not one they should be alerted on.

  The library is data (`templateLibrary.ts`); this tab only filters and loads
  it. Loading over a rule the trader is still building asks once first: the
  draft has no undo, and a stray click should not cost five conditions.
-->

<script lang="ts">
    import { _ } from "../../../locales/i18n";
    import { alertPanelState } from "../../../stores/alertPanel.svelte";
    import { nameKey } from "../../../lib/alerts/indicatorCatalogue";
    import {
        ALERT_TEMPLATES,
        offeredCategories,
        templateCategoryKey,
        templateDescriptionKey,
        templateIndicators,
        templateNameKey,
        templatesIn,
        type AlertTemplate,
        type TemplateCategory,
    } from "../../../lib/alerts/templateLibrary";
    import type { TranslationKey } from "../../../locales/schema";

    let { symbol: _symbol }: { symbol: string } = $props();

    // The keys are built from ids, so the cast is unavoidable here;
    // `templateLibrary.test.ts` resolves every one against both locales.
    const key = (raw: string): TranslationKey => raw as TranslationKey;

    const CATEGORIES = offeredCategories();

    /** Indicator ids per template, derived once: the library never changes at runtime. */
    const INDICATORS_BY_TEMPLATE = new Map(
        ALERT_TEMPLATES.map((entry) => [entry.id, templateIndicators(entry)]),
    );

    /** `null` shows every category. */
    let category = $state<TemplateCategory | null>(null);

    let shown = $derived(templatesIn(category));

    /** The template waiting for confirmation because loading it would replace a rule in progress. */
    let pendingId = $state<string | null>(null);

    let hasRuleInProgress = $derived(
        alertPanelState.draft.conditions.kind !== "group" ||
            alertPanelState.draft.conditions.of.length > 0,
    );

    function chooseCategory(next: TemplateCategory | null) {
        category = next;
        pendingId = null;
    }

    /** Card text per template, built once per render instead of per row inside `{#each}`. */
    let cards = $derived(
        shown.map((entry) => ({
            entry,
            uses: $_("dashboard.alerts.templates.uses", {
                values: {
                    indicators: (INDICATORS_BY_TEMPLATE.get(entry.id) ?? [])
                        .map((id) => $_(key(nameKey(id))))
                        .join(", "),
                },
            }),
        })),
    );

    function load(entry: AlertTemplate) {
        if (hasRuleInProgress && pendingId !== entry.id) {
            pendingId = entry.id;
            return;
        }
        pendingId = null;
        alertPanelState.loadTemplate(entry, $_(key(templateNameKey(entry.id))));
    }
</script>

<div class="templates-tab">
    <p class="intro">{$_("dashboard.alerts.templates.intro")}</p>

    <div class="filter" role="group" aria-label={$_("dashboard.alerts.templates.filterLabel")}>
        <button
            type="button"
            class="chip"
            class:selected={category === null}
            aria-pressed={category === null}
            onclick={() => chooseCategory(null)}
        >
            {$_("dashboard.alerts.templates.all")}
        </button>
        {#each CATEGORIES as option (option)}
            <button
                type="button"
                class="chip"
                class:selected={category === option}
                aria-pressed={category === option}
                data-category={option}
                onclick={() => chooseCategory(option)}
            >
                {$_(key(templateCategoryKey(option)))}
            </button>
        {/each}
    </div>

    <ul class="cards">
        {#each cards as { entry, uses } (entry.id)}
            <li class="card" data-template={entry.id}>
                <div class="card-head">
                    <h4 class="card-name">{$_(key(templateNameKey(entry.id)))}</h4>
                    <span class="badge">{entry.timeframe}</span>
                </div>
                <p class="card-description">{$_(key(templateDescriptionKey(entry.id)))}</p>
                <p class="card-uses">{uses}</p>

                {#if pendingId === entry.id}
                    <p class="replace-hint" role="alert">
                        {$_("dashboard.alerts.templates.replaceHint")}
                    </p>
                    <div class="actions">
                        <button type="button" class="primary" data-action="replace" onclick={() => load(entry)}>
                            {$_("dashboard.alerts.templates.replace")}
                        </button>
                        <button type="button" data-action="cancel" onclick={() => (pendingId = null)}>
                            {$_("dashboard.alerts.templates.cancel")}
                        </button>
                    </div>
                {:else}
                    <div class="actions">
                        <button type="button" class="primary" data-action="load" onclick={() => load(entry)}>
                            {$_("dashboard.alerts.templates.load")}
                        </button>
                    </div>
                {/if}
            </li>
        {/each}
    </ul>
</div>

<style>
    .templates-tab {
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
        padding: var(--space-1);
    }
    .intro {
        margin: 0;
        font-size: 0.8rem;
        line-height: 1.5;
        color: var(--text-secondary);
    }
    .filter {
        display: flex;
        flex-wrap: wrap;
        gap: var(--space-2);
    }
    .chip {
        padding: 0.2rem var(--space-3);
        border: 1px solid var(--border-color);
        border-radius: var(--radius-sm);
        background: var(--bg-primary);
        color: var(--text-secondary);
        font-size: 0.75rem;
        cursor: pointer;
    }
    .chip.selected {
        border-color: var(--accent-color);
        background: var(--bg-secondary);
        color: var(--text-primary);
    }
    .cards {
        list-style: none;
        margin: 0;
        padding: 0;
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(14rem, 1fr));
        gap: var(--space-2);
    }
    .card {
        display: flex;
        flex-direction: column;
        gap: var(--space-1);
        padding: var(--space-3);
        border: 1px solid var(--border-color);
        border-radius: var(--radius-sm);
        background: var(--bg-primary);
        min-width: 0;
    }
    .card-head {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: var(--space-2);
    }
    .card-name {
        margin: 0;
        font-size: 0.85rem;
        line-height: 1.3;
        color: var(--text-primary);
    }
    .badge {
        flex: none;
        font-size: 0.7rem;
        color: var(--text-secondary);
        border: 1px solid var(--border-color);
        border-radius: var(--radius-sm);
        padding: 0 var(--space-1);
    }
    .card-description,
    .card-uses,
    .replace-hint {
        margin: 0;
        font-size: 0.75rem;
        line-height: 1.4;
        color: var(--text-secondary);
    }
    .replace-hint {
        color: var(--text-primary);
    }
    .actions {
        display: flex;
        flex-wrap: wrap;
        gap: var(--space-2);
        margin-top: auto;
        padding-top: var(--space-2);
    }
    .actions button {
        padding: var(--space-1) var(--space-3);
        border: 1px solid var(--border-color);
        border-radius: var(--radius-sm);
        background: var(--bg-secondary);
        color: var(--text-primary);
        font-size: 0.75rem;
        cursor: pointer;
    }
    .actions button.primary {
        border-color: var(--accent-color);
    }
</style>
