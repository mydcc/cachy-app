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
  FEAT-0028 -- the indicator condition builder.

  Three choices in a row: which indicator line, how it is related, and to what.
  The middle and right choices are filtered by the left one's dimension, so a
  pairing the core would refuse with `operand_dimension_mismatch` is never on
  offer. That is the whole design: the refusal still stands behind this, but a
  trader should not meet it by assembling something reasonable-looking and
  being told no after pressing arm.
-->

<script lang="ts">
    import { _ } from "../../../locales/i18n";
    import { alertPanelState, refusalsForField } from "../../../stores/alertPanel.svelte";
    import {
        INDICATOR_GROUP_ORDER,
        catalogueEntry,
        defaultRef,
        dimensionOf,
        groupHintKey,
        groupKey,
        indicatorsInGroup,
        nameKey,
        outputKey,
        paramKey,
        type CatalogueEntry,
        type OperandDimension,
    } from "../../../lib/alerts/indicatorCatalogue";
    import {
        INDICATOR_CATALOGUE,
    } from "../../../lib/alerts/indicatorCatalogue";
    import {
        buildIndicatorCondition,
        compatibleIndicators,
        defaultForm,
        isReferenceCompatible,
        readIndicatorForm,
        type Reference,
        type Relation,
    } from "../../../lib/alerts/indicatorConditionForm";
    import type { CompareOp, CrossDirection, ParamValue } from "../../../lib/rules/types";
    import type { TranslationKey } from "../../../locales/schema";

    let { symbol: _symbol }: { symbol: string } = $props();

    const COMPARE_OPS: readonly CompareOp[] = ["gt", "gte", "lt", "lte", "eq", "neq"];
    const CROSS_DIRECTIONS: readonly CrossDirection[] = ["above", "below", "any"];

    // Read once at init, like every other builder: from here the form owns the
    // document, and re-reading would fight the write-through effect below.
    const initial = readIndicatorForm(alertPanelState.draft.conditions);

    let chosenId = $state<string | null>(initial?.subject.id ?? null);
    let params = $state<Record<string, ParamValue>>({ ...(initial?.subject.params ?? {}) });
    let output = $state<string>(initial?.subject.output ?? "value");
    let relation = $state<Relation>(initial?.relation ?? { kind: "compare", op: "gt" });
    let reference = $state<Reference>(initial?.reference ?? { kind: "constant", value: "0" });

    let entry = $derived<CatalogueEntry | null>(chosenId ? catalogueEntry(chosenId) : null);
    let dimension = $derived<OperandDimension>(
        entry ? dimensionOf(entry, output) : "unitless",
    );
    let referenceIndicators = $derived(
        entry ? compatibleIndicators(dimension, INDICATOR_CATALOGUE) : [],
    );
    let conditionRefusals = $derived(refusalsForField(alertPanelState.refusals, "conditions"));

    // The document is the single source of truth, so the tab writes through on
    // every edit rather than converting on arm. Null clears the condition,
    // which is what keeps the arm button disabled -- an alert with no trigger
    // is worse than no alert.
    $effect(() => {
        if (!entry) {
            alertPanelState.setSingleCondition(null);
            return;
        }
        alertPanelState.setSingleCondition(
            buildIndicatorCondition(
                {
                    subject: { id: entry.id, params: { ...params }, output },
                    relation,
                    reference,
                },
                alertPanelState.draft.trigger_timeframe,
            ),
        );
    });

    function chooseIndicator(next: CatalogueEntry): void {
        const fresh = defaultForm(next);
        chosenId = next.id;
        params = { ...fresh.subject.params };
        output = fresh.subject.output ?? next.outputs[0].name;
        // A reference chosen for the previous indicator may be in a different
        // unit, so it goes back to a constant rather than silently becoming an
        // invalid document the core refuses on arm.
        reference = fresh.reference;
    }

    function chooseOutput(next: string): void {
        output = next;
        if (!entry) return;
        // Same reason: `bollinger.upper` is a price and `bollinger.percent_b`
        // is not, so switching line can invalidate the right-hand side.
        if (!isReferenceCompatible(dimensionOf(entry, next), reference)) {
            reference = { kind: "constant", value: "0" };
        }
    }

    function chooseRelationKind(kind: "compare" | "cross"): void {
        relation = kind === "compare" ? { kind: "compare", op: "gt" } : { kind: "cross", direction: "above" };
    }

    function chooseReferenceKind(kind: Reference["kind"]): void {
        if (kind === "constant") {
            reference = { kind: "constant", value: "0" };
            return;
        }
        if (kind === "price") {
            reference = { kind: "price", field: "close" };
            return;
        }
        const first = referenceIndicators[0];
        if (!first) return;
        const line = first.outputs.find((candidate) => candidate.dimension === dimension);
        reference = {
            kind: "indicator",
            indicator: { ...defaultRef(first), output: line?.name ?? first.outputs[0].name },
        };
    }

    function chooseReferenceIndicator(id: string): void {
        const next = catalogueEntry(id);
        if (!next) return;
        const line = next.outputs.find((candidate) => candidate.dimension === dimension);
        reference = {
            kind: "indicator",
            indicator: { ...defaultRef(next), output: line?.name ?? next.outputs[0].name },
        };
    }

    function setParam(name: string, raw: string, kind: "period" | "factor"): void {
        // A factor stays a string all the way to the document: these values
        // reach a comparison against a price, and parsing one into an f64 here
        // would be the rounding this project keeps decimal.js to avoid.
        params = { ...params, [name]: kind === "period" ? Number(raw) : raw };
    }

    const key = (raw: string): TranslationKey => raw as TranslationKey;
</script>

<div class="builder">
    <fieldset class="indicator-choice">
        <legend>{$_("dashboard.alerts.indicators.subjectLabel")}</legend>
        {#each INDICATOR_GROUP_ORDER as group (group)}
            <div class="group">
                <h5>{$_(key(groupKey(group)))}</h5>
                <p class="hint">{$_(key(groupHintKey(group)))}</p>
                <div class="tiles">
                    {#each indicatorsInGroup(group) as candidate (candidate.id)}
                        <button
                            type="button"
                            class="tile"
                            class:selected={chosenId === candidate.id}
                            aria-pressed={chosenId === candidate.id}
                            onclick={() => chooseIndicator(candidate)}
                        >
                            {$_(key(nameKey(candidate.id)))}
                        </button>
                    {/each}
                </div>
            </div>
        {/each}
    </fieldset>

    {#if entry}
        {#if entry.outputs.length > 1}
            <label class="field">
                <span>{$_("dashboard.alerts.indicators.outputLabel")}</span>
                <select value={output} onchange={(e) => chooseOutput(e.currentTarget.value)}>
                    {#each entry.outputs as line (line.name)}
                        <option value={line.name}>{$_(key(outputKey(line.name)))}</option>
                    {/each}
                </select>
            </label>
        {/if}

        {#if entry.params.length > 0}
            <fieldset class="params">
                <legend>{$_("dashboard.alerts.indicators.paramsLabel")}</legend>
                {#each entry.params as param (param.name)}
                    <label class="field">
                        <span>{$_(key(paramKey(param.name)))}</span>
                        <input
                            type={param.kind === "period" ? "number" : "text"}
                            inputmode="decimal"
                            value={String(params[param.name] ?? param.default)}
                            oninput={(e) => setParam(param.name, e.currentTarget.value, param.kind)}
                        />
                    </label>
                {/each}
            </fieldset>
        {/if}

        <label class="field">
            <span>{$_("dashboard.alerts.indicators.relationLabel")}</span>
            <select
                value={relation.kind}
                onchange={(e) => chooseRelationKind(e.currentTarget.value as "compare" | "cross")}
            >
                <option value="compare">{$_("dashboard.alerts.indicators.relationKind.compare")}</option>
                <option value="cross">{$_("dashboard.alerts.indicators.relationKind.cross")}</option>
            </select>
            {#if relation.kind === "compare"}
                <select
                    aria-label={$_("dashboard.alerts.indicators.relationLabel")}
                    value={relation.op}
                    onchange={(e) =>
                        (relation = { kind: "compare", op: e.currentTarget.value as CompareOp })}
                >
                    {#each COMPARE_OPS as op (op)}
                        <option value={op}>{$_(key(`dashboard.alerts.indicators.op.${op}`))}</option>
                    {/each}
                </select>
            {:else}
                <select
                    aria-label={$_("dashboard.alerts.indicators.relationLabel")}
                    value={relation.direction}
                    onchange={(e) =>
                        (relation = {
                            kind: "cross",
                            direction: e.currentTarget.value as CrossDirection,
                        })}
                >
                    {#each CROSS_DIRECTIONS as direction (direction)}
                        <option value={direction}>
                            {$_(key(`dashboard.alerts.indicators.cross.${direction}`))}
                        </option>
                    {/each}
                </select>
            {/if}
        </label>

        <label class="field">
            <span>{$_("dashboard.alerts.indicators.referenceLabel")}</span>
            <select
                value={reference.kind}
                onchange={(e) => chooseReferenceKind(e.currentTarget.value as Reference["kind"])}
            >
                <option value="constant">{$_("dashboard.alerts.indicators.reference.constant")}</option>
                {#if dimension === "price"}
                    <option value="price">{$_("dashboard.alerts.indicators.reference.price")}</option>
                {/if}
                {#if referenceIndicators.length > 0}
                    <option value="indicator">
                        {$_("dashboard.alerts.indicators.reference.indicator")}
                    </option>
                {/if}
            </select>

            {#if reference.kind === "constant"}
                <input
                    type="text"
                    inputmode="decimal"
                    aria-label={$_("dashboard.alerts.indicators.thresholdLabel")}
                    value={reference.value}
                    oninput={(e) => (reference = { kind: "constant", value: e.currentTarget.value })}
                />
            {:else if reference.kind === "indicator"}
                <select
                    aria-label={$_("dashboard.alerts.indicators.reference.indicator")}
                    value={reference.indicator.id}
                    onchange={(e) => chooseReferenceIndicator(e.currentTarget.value)}
                >
                    {#each referenceIndicators as candidate (candidate.id)}
                        <option value={candidate.id}>{$_(key(nameKey(candidate.id)))}</option>
                    {/each}
                </select>
            {/if}
        </label>

        <p class="hint">{$_("dashboard.alerts.indicators.dimensionHint")}</p>
        <p class="hint">{$_("dashboard.alerts.indicators.closedCandleHint")}</p>
    {:else}
        <p class="hint" role="status">{$_("dashboard.alerts.indicators.emptyHint")}</p>
    {/if}

    {#each conditionRefusals as refusal (refusal.code + refusal.field)}
        <p class="refusal" role="alert">{$_(refusal.i18n_key as TranslationKey)}</p>
    {/each}
</div>

<style>
    .builder {
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
    }
    fieldset {
        border: 1px solid var(--border);
        border-radius: var(--radius-sm);
        padding: var(--space-2);
        margin: 0;
    }
    legend {
        font-size: 0.8rem;
        color: var(--text-secondary);
        padding: 0 var(--space-1);
    }
    .group + .group {
        margin-top: var(--space-3);
    }
    .group h5 {
        margin: 0;
        font-size: 0.85rem;
        color: var(--text-primary);
    }
    .tiles {
        display: flex;
        flex-wrap: wrap;
        gap: var(--space-1);
        margin-top: var(--space-1);
    }
    .tile {
        padding: var(--space-1) var(--space-2);
        border: 1px solid var(--border);
        border-radius: var(--radius-sm);
        background: var(--bg-secondary);
        color: var(--text-primary);
        font-size: 0.8rem;
        cursor: pointer;
    }
    .tile.selected {
        border-color: var(--accent);
        background: var(--bg-tertiary);
    }
    .field {
        display: flex;
        align-items: center;
        gap: var(--space-2);
        font-size: 0.85rem;
    }
    .field > span {
        min-width: 8rem;
        color: var(--text-secondary);
    }
    .field select,
    .field input {
        flex: 1 1 auto;
        min-width: 0;
        padding: var(--space-1);
        background: var(--bg-secondary);
        color: var(--text-primary);
        border: 1px solid var(--border);
        border-radius: var(--radius-sm);
    }
    .hint {
        margin: 0;
        font-size: 0.78rem;
        line-height: 1.4;
        color: var(--text-secondary);
    }
    .refusal {
        margin: 0;
        font-size: 0.8rem;
        color: var(--danger);
    }
</style>
