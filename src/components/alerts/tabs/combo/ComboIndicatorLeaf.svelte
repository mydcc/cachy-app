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
  One indicator comparison in the Combo builder (FEAT-0030, moved out of
  ComboTab by FEAT-0813). Reports every edit as a patch; the tab owns the form.
-->

<script lang="ts">
    import { _ } from "../../../../locales/i18n";
    import {
        INDICATOR_CATALOGUE,
        catalogueEntry,
        defaultRef,
        dimensionOf,
        nameKey,
        outputKey,
        paramKey,
    } from "../../../../lib/alerts/indicatorCatalogue";
    import {
        CROSS_DIRECTIONS,
        MAX_WINDOW_LOOKBACK,
        MIN_WINDOW_LOOKBACK,
        committedWindowLookback,
        compareOpsFor,
        compatibleIndicators,
        defaultForm,
        defaultWindowReference,
        isReferenceCompatible,
        referenceKindsFor,
        type IndicatorForm,
        type Reference,
        type Relation,
    } from "../../../../lib/alerts/indicatorConditionForm";
    import type { ComboLeafPatch, IndicatorLeaf } from "../../../../lib/alerts/comboConditionForm";
    import type { CompareOp, CrossDirection, ParamValue, PriceField, WindowAgg } from "../../../../lib/rules/types";
    import type { TranslationKey } from "../../../../locales/schema";

    let { leaf, onpatch }: { leaf: IndicatorLeaf; onpatch: (patch: ComboLeafPatch) => void } = $props();

    const PRICE_FIELDS: readonly PriceField[] = ["open", "high", "low", "close", "hl2", "hlc3"];

    let entry = $derived(catalogueEntry(leaf.form.subject.id));
    let dimension = $derived(
        entry ? dimensionOf(entry, leaf.form.subject.output ?? "value") : "unitless",
    );
    let compareOps = $derived(compareOpsFor(leaf.form.reference));
    let referenceKinds = $derived(entry ? referenceKindsFor(entry, dimension) : []);
    let referenceCandidates = $derived(compatibleIndicators(dimension, INDICATOR_CATALOGUE));

    function setForm(form: IndicatorForm): void {
        onpatch({ form });
    }

    function chooseIndicator(id: string): void {
        const next = catalogueEntry(id);
        if (!next) return;
        // A whole fresh form rather than a swapped id: the previous
        // indicator's params and reference may be in another unit, and
        // carrying them over would build a document the core refuses on arm.
        setForm(defaultForm(next));
    }

    function chooseOutput(output: string): void {
        if (!entry) return;
        const reference = isReferenceCompatible(dimensionOf(entry, output), leaf.form.reference)
            ? leaf.form.reference
            : ({ kind: "constant", value: "0" } as Reference);
        setForm({ ...leaf.form, subject: { ...leaf.form.subject, output }, reference });
    }

    function setParam(name: string, raw: string, kind: "period" | "factor"): void {
        // A factor stays a string all the way to the document: these values
        // are compared against prices, and parsing one into a float here is
        // the rounding decimal.js exists to avoid.
        const params: Record<string, ParamValue> = {
            ...leaf.form.subject.params,
            [name]: kind === "period" ? Number(raw) : raw,  // audit: safe — indicator lookback in bars, not a price
        };
        setForm({ ...leaf.form, subject: { ...leaf.form.subject, params } });
    }

    function setRelation(relation: Relation): void {
        setForm({ ...leaf.form, relation });
    }

    function setReference(reference: Reference): void {
        // A comparison that cannot fire against the new reference moves to one
        // that can: `>` against a window's highest is never true.
        const ops = compareOpsFor(reference);
        const relation =
            leaf.form.relation.kind === "compare" && !ops.includes(leaf.form.relation.op)
                ? ({ kind: "compare", op: ops[0] } as Relation)
                : leaf.form.relation;
        setForm({ ...leaf.form, reference, relation });
    }

    function referenceIndicator(id: string): Reference | null {
        const next = catalogueEntry(id);
        if (!next) return null;
        const line = next.outputs.find((candidate) => candidate.dimension === dimension);
        return {
            kind: "indicator",
            indicator: { ...defaultRef(next), output: line?.name ?? next.outputs[0].name },
        };
    }

    function chooseReferenceKind(kind: Reference["kind"]): void {
        if (kind === "constant") return setReference({ kind: "constant", value: "0" });
        if (kind === "price") return setReference({ kind: "price", field: "close" });
        if (kind === "window") return setReference(defaultWindowReference());
        const first = referenceCandidates[0];
        const reference = first ? referenceIndicator(first.id) : null;
        if (reference) setReference(reference);
    }

    function chooseReferenceIndicator(id: string): void {
        const reference = referenceIndicator(id);
        if (reference) setReference(reference);
    }

    const key = (raw: string): TranslationKey => raw as TranslationKey;
</script>

<label class="field">
    <span>{$_("dashboard.alerts.combo.indicatorLabel")}</span>
    <select value={leaf.form.subject.id} onchange={(e) => chooseIndicator(e.currentTarget.value)}>
        {#each INDICATOR_CATALOGUE as candidate (candidate.id)}
            <option value={candidate.id}>{$_(key(nameKey(candidate.id)))}</option>
        {/each}
    </select>
</label>

{#if entry && entry.outputs.length > 1}
    <label class="field">
        <span>{$_("dashboard.alerts.combo.outputLabel")}</span>
        <select
            value={leaf.form.subject.output ?? entry.outputs[0].name}
            onchange={(e) => chooseOutput(e.currentTarget.value)}
        >
            {#each entry.outputs as line (line.name)}
                <option value={line.name}>{$_(key(outputKey(line.name)))}</option>
            {/each}
        </select>
    </label>
{/if}

{#if entry}
    {#each entry.params as param (param.name)}
        <label class="field narrow">
            <span>{$_(key(paramKey(param.name)))}</span>
            <input
                type="number"
                value={leaf.form.subject.params[param.name]}
                onchange={(e) => setParam(param.name, e.currentTarget.value, param.kind)}
            />
        </label>
    {/each}
{/if}

<label class="field">
    <span>{$_("dashboard.alerts.combo.relationLabel")}</span>
    <select
        value={leaf.form.relation.kind}
        onchange={(e) =>
            setRelation(
                e.currentTarget.value === "compare"
                    ? { kind: "compare", op: compareOps[0] }
                    : { kind: "cross", direction: "above" },
            )}
    >
        <option value="compare">{$_("dashboard.alerts.combo.relation.compare")}</option>
        <option value="cross">{$_("dashboard.alerts.combo.relation.cross")}</option>
    </select>
</label>

{#if leaf.form.relation.kind === "compare"}
    <label class="field">
        <span class="visually-hidden">{$_("dashboard.alerts.combo.relationLabel")}</span>
        <select
            value={leaf.form.relation.op}
            onchange={(e) => setRelation({ kind: "compare", op: e.currentTarget.value as CompareOp })}
        >
            {#each compareOps as op (op)}
                <option value={op}>{$_(key(`dashboard.alerts.combo.compareOp.${op}`))}</option>
            {/each}
        </select>
    </label>
{:else}
    <label class="field">
        <span class="visually-hidden">{$_("dashboard.alerts.combo.relationLabel")}</span>
        <select
            value={leaf.form.relation.direction}
            onchange={(e) =>
                setRelation({ kind: "cross", direction: e.currentTarget.value as CrossDirection })}
        >
            {#each CROSS_DIRECTIONS as direction (direction)}
                <option value={direction}>{$_(key(`rules.sentence.cross.${direction}`))}</option>
            {/each}
        </select>
    </label>
{/if}

<label class="field">
    <span>{$_("dashboard.alerts.combo.referenceLabel")}</span>
    <select
        value={leaf.form.reference.kind}
        onchange={(e) => chooseReferenceKind(e.currentTarget.value as Reference["kind"])}
    >
        {#each referenceKinds as kind (kind)}
            <option value={kind}>{$_(key(`dashboard.alerts.combo.reference.${kind}`))}</option>
        {/each}
    </select>
</label>

{#if leaf.form.reference.kind === "window"}
    {@const window = leaf.form.reference}
    <label class="field">
        <span class="visually-hidden">{$_("dashboard.alerts.indicators.windowAggLabel")}</span>
        <select
            value={window.agg}
            onchange={(e) => setReference({ ...window, agg: e.currentTarget.value as WindowAgg })}
        >
            <option value="max">{$_("dashboard.alerts.indicators.windowAgg.max")}</option>
            <option value="min">{$_("dashboard.alerts.indicators.windowAgg.min")}</option>
        </select>
    </label>
    <label class="field narrow">
        <span>{$_("dashboard.alerts.indicators.lookbackLabel")}</span>
        <input
            type="number"
            min={MIN_WINDOW_LOOKBACK}
            max={MAX_WINDOW_LOOKBACK}
            step="1"
            value={window.lookback}
            onchange={(e) => {
                const lookback = committedWindowLookback(e.currentTarget.value, window.lookback);
                // Written back to the field too: a clamp onto the span the
                // row already holds changes no state, so nothing re-renders.
                e.currentTarget.value = String(lookback);
                setReference({ ...window, lookback });
            }}
        />
    </label>
{:else if leaf.form.reference.kind === "constant"}
    <label class="field narrow">
        <span class="visually-hidden">{$_("dashboard.alerts.combo.reference.constant")}</span>
        <input
            type="text"
            inputmode="decimal"
            value={leaf.form.reference.value}
            onchange={(e) => setReference({ kind: "constant", value: e.currentTarget.value })}
        />
    </label>
{:else if leaf.form.reference.kind === "price"}
    <label class="field">
        <span class="visually-hidden">{$_("dashboard.alerts.combo.reference.price")}</span>
        <select
            value={leaf.form.reference.field}
            onchange={(e) => setReference({ kind: "price", field: e.currentTarget.value as PriceField })}
        >
            {#each PRICE_FIELDS as field (field)}
                <option value={field}>{$_(key(`dashboard.alerts.combo.priceField.${field}`))}</option>
            {/each}
        </select>
    </label>
{:else}
    <label class="field">
        <span class="visually-hidden">{$_("dashboard.alerts.combo.reference.indicator")}</span>
        <select
            value={leaf.form.reference.indicator.id}
            onchange={(e) => chooseReferenceIndicator(e.currentTarget.value)}
        >
            {#each referenceCandidates as candidate (candidate.id)}
                <option value={candidate.id}>{$_(key(nameKey(candidate.id)))}</option>
            {/each}
        </select>
    </label>
{/if}

<style>
    .field {
        display: flex;
        flex-direction: column;
        gap: var(--space-1);
        min-width: 10rem;
        flex: 1 1 10rem;
    }
    .field.narrow {
        min-width: 6rem;
        flex: 0 1 8rem;
    }
    .field span {
        color: var(--text-secondary);
        font-size: 0.8rem;
    }
    .visually-hidden {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip: rect(0 0 0 0);
        white-space: nowrap;
    }
</style>
