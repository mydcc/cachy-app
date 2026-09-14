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
  FEAT-0390 -- the price condition builder.

  Four questions a trader actually asks, and the condition each one becomes:

    rises above     -> cross above a threshold
    falls below     -> cross below a threshold
    rise reaches n% -> percent_change >= n over `lookback` closes
    fall reaches n% -> percent_change <= -n over `lookback` closes

  A crossing rather than a comparison for the first two, and that is the whole
  point of the tab: "rises above 60000" must not fire on a price that was
  already above 60000 when the alarm was armed. The evaluator enforces it
  (`rises_above_does_not_fire_when_the_price_was_already_above`); this component
  only has to pick the right variant.

  A fall is the rise operand against a negative threshold, not a second
  operand -- so the trader types a positive 5 and the document carries -5. The
  sentence in the shell's footer reads back what was actually written, which is
  where that translation is checked by eye.

  Everything numeric goes through decimal.js. `Number` is forbidden for a
  financial value here as everywhere else (AGENTS.md), and a threshold is one.
-->

<script lang="ts">
    import { _ } from "../../../locales/i18n";
    import {
        alertPanelState,
        refusalsForField,
    } from "../../../stores/alertPanel.svelte";
    import type { Condition, PriceSource } from "../../../lib/rules/types";
    import {
        BLANK_PRICE_FORM,
        readPriceReading,
        type PriceConditionKind,
    } from "../../../lib/alerts/priceConditionForm";
    import {
        buildPriceCondition,
        parsePriceThreshold,
    } from "../../../lib/alerts/priceFormLeaf";
    import type { TranslationKey } from "../../../locales/schema";

    let { symbol: _symbol }: { symbol: string } = $props();

    const KIND_KEYS: Record<PriceConditionKind, TranslationKey> = {
        rises_above: "dashboard.alerts.price.risesAbove",
        falls_below: "dashboard.alerts.price.fallsBelow",
        rise_reaches: "dashboard.alerts.price.riseReaches",
        fall_reaches: "dashboard.alerts.price.fallReaches",
    };

    const SERIES_KEYS: Record<PriceSource, TranslationKey> = {
        last: "dashboard.alerts.price.seriesLast",
        mark: "dashboard.alerts.price.seriesMark",
    };

    const KINDS: PriceConditionKind[] = [
        "rises_above",
        "falls_below",
        "rise_reaches",
        "fall_reaches",
    ];
    const SERIES: PriceSource[] = ["last", "mark"];

    /*
     * The form starts from the draft rather than from blank (FEAT-0395).
     *
     * The document is the source of truth, so the tab renders it instead of
     * remembering its own copy: a draft seeded by a right-click on the chart
     * shows the price that was clicked, and switching tabs and back no longer
     * discards a half-built condition. Read once at init on purpose -- from
     * here on the form owns the document, and re-reading it on every write
     * would fight the write-through effect below.
     *
     * The field and the series are read back too (BUG-0444). They are panel
     * state the builder applies, and a chart click seeds the draft straight
     * after `reset()` put them back to close and last: without this the
     * mount-time write turned a mark-price alert into a last-price one.
     */
    const reading = readPriceReading(alertPanelState.draft.conditions);
    const initial = reading?.form ?? BLANK_PRICE_FORM;
    if (reading) {
        alertPanelState.priceField = reading.field;
        alertPanelState.priceSeries = reading.source;
    }

    let kind = $state<PriceConditionKind>(initial.kind);
    /** The threshold, as typed. A string so a half-typed "60." is not mangled. */
    let threshold = $state(initial.threshold);
    /** How many closes back the percentage is measured from. */
    let lookback = $state(initial.lookback);

    let isPercent = $derived(kind === "rise_reaches" || kind === "fall_reaches");

    /** The typed threshold as a Decimal, or null while it is not a number yet. */
    let parsedThreshold = $derived(parsePriceThreshold(threshold));

    /**
     * The condition the current form describes, or null when it is not usable
     * yet. The builder is shared with the reader, which claims a condition
     * only when this rebuilds it unchanged (`priceFormLeaf.ts`).
     */
    function buildCondition(): Condition | null {
        return buildPriceCondition(
            {
                form: { kind, threshold, lookback },
                field: alertPanelState.priceField,
                source: alertPanelState.priceSeries,
            },
            alertPanelState.draft.trigger_timeframe,
        );
    }

    // The document is the single source of truth (see alertPanel.svelte.ts), so
    // the form writes through to it on every edit rather than converting on
    // arm. That is what keeps the sentence in the footer and the rule the core
    // is handed from ever drifting apart.
    $effect(() => {
        alertPanelState.setSlotCondition("price", buildCondition());
    });

    let conditionRefusals = $derived(
        refusalsForField(alertPanelState.refusals, "conditions"),
    );
</script>

<div class="price-tab">
    <fieldset class="kinds">
        <legend class="field-label">{$_("dashboard.alerts.price.conditionType")}</legend>
        {#each KINDS as option (option)}
            <label class="kind">
                <input type="radio" name="price-condition-kind" value={option} bind:group={kind} />
                <span>{$_(KIND_KEYS[option])}</span>
            </label>
        {/each}
    </fieldset>

    <label class="field">
        <span class="field-label">
            {isPercent
                ? $_("dashboard.alerts.price.percentLabel")
                : $_("dashboard.alerts.price.priceLabel")}
        </span>
        <input
            class="field-input"
            type="text"
            inputmode="decimal"
            bind:value={threshold}
            placeholder={isPercent ? "5" : "60000"}
            aria-invalid={threshold.trim() !== "" && parsedThreshold === null}
        />
    </label>

    {#if isPercent}
        <label class="field">
            <span class="field-label">{$_("dashboard.alerts.price.lookbackLabel")}</span>
            <input class="field-input" type="number" min="1" step="1" bind:value={lookback} />
            <span class="hint">{$_("dashboard.alerts.price.lookbackHint")}</span>
        </label>
    {/if}

    <label class="field">
        <span class="field-label">{$_("dashboard.alerts.price.seriesLabel")}</span>
        <select class="field-input" bind:value={alertPanelState.priceSeries}>
            {#each SERIES as option (option)}
                <option value={option}>{$_(SERIES_KEYS[option])}</option>
            {/each}
        </select>
        <span class="hint">{$_("dashboard.alerts.price.seriesHint")}</span>
    </label>

    <!--
      Refusals the core raised against the condition this tab owns, anchored
      here rather than left to the shell's catch-all: a refusal shown far from
      the control that caused it is one a trader has to hunt for.
    -->
    {#if conditionRefusals.length > 0}
        <div class="field-refusals" role="alert">
            {#each conditionRefusals as refusal (refusal.code + refusal.field)}
                <span class="refusal">{$_(refusal.i18n_key as TranslationKey)}</span>
            {/each}
        </div>
    {/if}
</div>

<style>
    .price-tab {
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
        padding: var(--space-1);
    }
    .kinds {
        display: flex;
        flex-direction: column;
        gap: var(--space-1);
        border: 1px solid var(--border-color);
        border-radius: var(--radius-sm);
        padding: var(--space-2);
        margin: 0;
    }
    .kind {
        display: flex;
        align-items: center;
        gap: var(--space-2);
        font-size: 0.85rem;
        cursor: pointer;
    }
    .field {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        min-width: 0;
    }
    .field-label {
        font-size: 0.75rem;
        color: var(--text-secondary);
        padding: 0;
    }
    .field-input {
        width: 100%;
        min-width: 0;
        background: var(--bg-primary);
        border: 1px solid var(--border-color);
        color: var(--text-primary);
        padding: var(--space-2);
        border-radius: var(--radius-sm);
    }
    .field-input[aria-invalid="true"] {
        border-color: var(--danger-color);
    }
    .hint {
        font-size: 0.7rem;
        color: var(--text-secondary);
        line-height: 1.4;
    }
    .refusal {
        display: block;
        color: var(--danger-color);
        font-size: 0.75rem;
        line-height: 1.4;
    }
</style>
