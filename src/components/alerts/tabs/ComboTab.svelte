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
  FEAT-0030 -- combine several conditions into one rule.

  The plain-language read-back is not rendered here: AlertPanelView already
  derives it from the whole draft, so this tab's job is to write a correct
  document and let the sentence follow.
-->

<script lang="ts">
    import { _ } from "../../../locales/i18n";
    import { alertPanelState, refusalsForField } from "../../../stores/alertPanel.svelte";
    import {
        INDICATOR_CATALOGUE,
        catalogueEntry,
        defaultRef,
        dimensionOf,
        nameKey,
        outputKey,
        paramKey,
        type CatalogueEntry,
    } from "../../../lib/alerts/indicatorCatalogue";
    import {
        compatibleIndicators,
        defaultForm,
        isReferenceCompatible,
        type Reference,
        type Relation,
    } from "../../../lib/alerts/indicatorConditionForm";
    import {
        COMBO_OPS,
        MAX_COMBO_CONDITIONS,
        addRow,
        buildComboCondition,
        canAddRow,
        emptyComboForm,
        readComboForm,
        removeRow,
        replaceRow,
        setLogicOp,
        type ComboForm,
        type ComboRow,
    } from "../../../lib/alerts/comboConditionForm";
    import type { CompareOp, CrossDirection, LogicOp, ParamValue, PriceField } from "../../../lib/rules/types";
    import type { TranslationKey } from "../../../locales/schema";

    let { symbol: _symbol }: { symbol: string } = $props();

    const COMPARE_OPS: readonly CompareOp[] = ["gt", "gte", "lt", "lte", "eq", "neq"];
    const CROSS_DIRECTIONS: readonly CrossDirection[] = ["above", "below", "any"];
    const PRICE_FIELDS: readonly PriceField[] = ["open", "high", "low", "close", "hl2", "hlc3"];

    // Read once at init, like every other builder in this panel.
    const initial = readComboForm(
        alertPanelState.draft.conditions,
        alertPanelState.draft.trigger_timeframe,
    );

    // A document this builder cannot represent -- a nested group, a `none`
    // join, a price or pattern condition from another tab -- leaves the tab
    // locked. The write-through effect below never runs in that state, so
    // opening this tab on a rule it does not understand cannot erase it.
    // Losing a five-condition rule to a stray click is the one outcome this
    // tab must make impossible.
    const locked = initial === null;

    let form = $state<ComboForm>(initial ?? emptyComboForm());

    let conditionRefusals = $derived(refusalsForField(alertPanelState.refusals, "conditions"));

    $effect(() => {
        if (locked) return;
        alertPanelState.setConditionGroup(
            buildComboCondition(form, alertPanelState.draft.trigger_timeframe),
        );
    });

    function entryFor(row: ComboRow): CatalogueEntry | null {
        return catalogueEntry(row.form.subject.id);
    }

    function dimensionFor(row: ComboRow) {
        const entry = entryFor(row);
        return entry ? dimensionOf(entry, row.form.subject.output ?? "value") : "unitless";
    }

    function chooseIndicator(row: ComboRow, id: string): void {
        const next = catalogueEntry(id);
        if (!next) return;
        // A whole fresh form rather than a swapped id: the previous
        // indicator's params and reference may be in another unit, and
        // carrying them over would build a document the core refuses on arm.
        form = replaceRow(form, row.id, { form: defaultForm(next) });
    }

    function chooseOutput(row: ComboRow, output: string): void {
        const entry = entryFor(row);
        if (!entry) return;
        const reference = isReferenceCompatible(dimensionOf(entry, output), row.form.reference)
            ? row.form.reference
            : ({ kind: "constant", value: "0" } as Reference);
        form = replaceRow(form, row.id, {
            form: { ...row.form, subject: { ...row.form.subject, output }, reference },
        });
    }

    function setParam(row: ComboRow, name: string, raw: string, kind: "period" | "factor"): void {
        // A factor stays a string all the way to the document: these values
        // are compared against prices, and parsing one into a float here is
        // the rounding decimal.js exists to avoid.
        const params: Record<string, ParamValue> = {
            ...row.form.subject.params,
            [name]: kind === "period" ? Number(raw) : raw,
        };
        form = replaceRow(form, row.id, {
            form: { ...row.form, subject: { ...row.form.subject, params } },
        });
    }

    function setRelation(row: ComboRow, relation: Relation): void {
        form = replaceRow(form, row.id, { form: { ...row.form, relation } });
    }

    function setReference(row: ComboRow, reference: Reference): void {
        form = replaceRow(form, row.id, { form: { ...row.form, reference } });
    }

    function chooseReferenceKind(row: ComboRow, kind: Reference["kind"]): void {
        if (kind === "constant") return setReference(row, { kind: "constant", value: "0" });
        if (kind === "price") return setReference(row, { kind: "price", field: "close" });
        const dimension = dimensionFor(row);
        const first = compatibleIndicators(dimension, INDICATOR_CATALOGUE)[0];
        if (!first) return;
        const line = first.outputs.find((candidate) => candidate.dimension === dimension);
        setReference(row, {
            kind: "indicator",
            indicator: { ...defaultRef(first), output: line?.name ?? first.outputs[0].name },
        });
    }

    function chooseReferenceIndicator(row: ComboRow, id: string): void {
        const next = catalogueEntry(id);
        if (!next) return;
        const dimension = dimensionFor(row);
        const line = next.outputs.find((candidate) => candidate.dimension === dimension);
        setReference(row, {
            kind: "indicator",
            indicator: { ...defaultRef(next), output: line?.name ?? next.outputs[0].name },
        });
    }

    const key = (raw: string): TranslationKey => raw as TranslationKey;
</script>

{#if locked}
    <div class="locked" role="status">
        <h4>{$_("dashboard.alerts.combo.lockedTitle")}</h4>
        <p>{$_("dashboard.alerts.combo.lockedBody")}</p>
    </div>
{:else}
    <div class="builder">
        <fieldset class="logic">
            <legend>{$_("dashboard.alerts.combo.logicLabel")}</legend>
            <div class="ops">
                {#each COMBO_OPS as op (op)}
                    <button
                        type="button"
                        class="tile"
                        class:selected={form.op === op}
                        aria-pressed={form.op === op}
                        onclick={() => (form = setLogicOp(form, op as LogicOp))}
                    >
                        {$_(key(`dashboard.alerts.combo.op.${op}`))}
                    </button>
                {/each}
            </div>
            <p class="hint">{$_(key(`dashboard.alerts.combo.opHint.${form.op}`))}</p>
        </fieldset>

        {#if form.rows.length === 0}
            <p class="empty">{$_("dashboard.alerts.combo.empty")}</p>
        {/if}

        {#each form.rows as row, index (row.id)}
            {@const entry = entryFor(row)}
            <fieldset class="row">
                <legend>
                    {$_("dashboard.alerts.combo.rowLabel", { values: { index: index + 1 } })}
                </legend>

                <label class="field">
                    <span>{$_("dashboard.alerts.combo.indicatorLabel")}</span>
                    <select
                        value={row.form.subject.id}
                        onchange={(e) => chooseIndicator(row, e.currentTarget.value)}
                    >
                        {#each INDICATOR_CATALOGUE as candidate (candidate.id)}
                            <option value={candidate.id}>{$_(key(nameKey(candidate.id)))}</option>
                        {/each}
                    </select>
                </label>

                {#if entry && entry.outputs.length > 1}
                    <label class="field">
                        <span>{$_("dashboard.alerts.combo.outputLabel")}</span>
                        <select
                            value={row.form.subject.output ?? entry.outputs[0].name}
                            onchange={(e) => chooseOutput(row, e.currentTarget.value)}
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
                                value={row.form.subject.params[param.name]}
                                onchange={(e) => setParam(row, param.name, e.currentTarget.value, param.kind)}
                            />
                        </label>
                    {/each}
                {/if}

                <label class="field">
                    <span>{$_("dashboard.alerts.combo.relationLabel")}</span>
                    <select
                        value={row.form.relation.kind}
                        onchange={(e) =>
                            setRelation(
                                row,
                                e.currentTarget.value === "compare"
                                    ? { kind: "compare", op: "gt" }
                                    : { kind: "cross", direction: "above" },
                            )}
                    >
                        <option value="compare">{$_("dashboard.alerts.combo.relation.compare")}</option>
                        <option value="cross">{$_("dashboard.alerts.combo.relation.cross")}</option>
                    </select>
                </label>

                {#if row.form.relation.kind === "compare"}
                    <label class="field">
                        <span class="visually-hidden">{$_("dashboard.alerts.combo.relationLabel")}</span>
                        <select
                            value={row.form.relation.op}
                            onchange={(e) =>
                                setRelation(row, {
                                    kind: "compare",
                                    op: e.currentTarget.value as CompareOp,
                                })}
                        >
                            {#each COMPARE_OPS as op (op)}
                                <option value={op}>
                                    {$_(key(`dashboard.alerts.combo.compareOp.${op}`))}
                                </option>
                            {/each}
                        </select>
                    </label>
                {:else}
                    <label class="field">
                        <span class="visually-hidden">{$_("dashboard.alerts.combo.relationLabel")}</span>
                        <select
                            value={row.form.relation.direction}
                            onchange={(e) =>
                                setRelation(row, {
                                    kind: "cross",
                                    direction: e.currentTarget.value as CrossDirection,
                                })}
                        >
                            {#each CROSS_DIRECTIONS as direction (direction)}
                                <option value={direction}>
                                    {$_(key(`rules.sentence.cross.${direction}`))}
                                </option>
                            {/each}
                        </select>
                    </label>
                {/if}

                <label class="field">
                    <span>{$_("dashboard.alerts.combo.referenceLabel")}</span>
                    <select
                        value={row.form.reference.kind}
                        onchange={(e) =>
                            chooseReferenceKind(row, e.currentTarget.value as Reference["kind"])}
                    >
                        <option value="constant">{$_("dashboard.alerts.combo.reference.constant")}</option>
                        <option value="price">{$_("dashboard.alerts.combo.reference.price")}</option>
                        <option value="indicator">{$_("dashboard.alerts.combo.reference.indicator")}</option>
                    </select>
                </label>

                {#if row.form.reference.kind === "constant"}
                    <label class="field narrow">
                        <span class="visually-hidden">{$_("dashboard.alerts.combo.reference.constant")}</span>
                        <input
                            type="text"
                            inputmode="decimal"
                            value={row.form.reference.value}
                            onchange={(e) =>
                                setReference(row, { kind: "constant", value: e.currentTarget.value })}
                        />
                    </label>
                {:else if row.form.reference.kind === "price"}
                    <label class="field">
                        <span class="visually-hidden">{$_("dashboard.alerts.combo.reference.price")}</span>
                        <select
                            value={row.form.reference.field}
                            onchange={(e) =>
                                setReference(row, {
                                    kind: "price",
                                    field: e.currentTarget.value as PriceField,
                                })}
                        >
                            {#each PRICE_FIELDS as field (field)}
                                <option value={field}>
                                    {$_(key(`dashboard.alerts.combo.priceField.${field}`))}
                                </option>
                            {/each}
                        </select>
                    </label>
                {:else}
                    <label class="field">
                        <span class="visually-hidden">{$_("dashboard.alerts.combo.reference.indicator")}</span>
                        <select
                            value={row.form.reference.indicator.id}
                            onchange={(e) => chooseReferenceIndicator(row, e.currentTarget.value)}
                        >
                            {#each compatibleIndicators(dimensionFor(row), INDICATOR_CATALOGUE) as candidate (candidate.id)}
                                <option value={candidate.id}>{$_(key(nameKey(candidate.id)))}</option>
                            {/each}
                        </select>
                    </label>
                {/if}

                <button
                    type="button"
                    class="remove"
                    onclick={() => (form = removeRow(form, row.id))}
                >
                    {$_("dashboard.alerts.combo.removeRow", { values: { index: index + 1 } })}
                </button>
            </fieldset>
        {/each}

        <div class="actions">
            <button
                type="button"
                class="add"
                disabled={!canAddRow(form)}
                onclick={() => (form = addRow(form))}
            >
                {$_("dashboard.alerts.combo.addRow")}
            </button>
            <p class="hint">
                {$_("dashboard.alerts.combo.limitHint", {
                    values: { max: MAX_COMBO_CONDITIONS },
                })}
            </p>
        </div>

        {#each conditionRefusals as refusal (refusal.field + refusal.code)}
            <p class="refusal" role="alert">{$_(key(refusal.i18n_key))}</p>
        {/each}
    </div>
{/if}

<style>
    .builder {
        display: flex;
        flex-direction: column;
        gap: var(--space-4);
    }
    fieldset {
        border: 1px solid var(--border);
        border-radius: var(--radius-sm);
        padding: var(--space-3);
        margin: 0;
    }
    legend {
        padding: 0 var(--space-2);
        color: var(--text-secondary);
        font-size: 0.8rem;
    }
    .ops {
        display: flex;
        flex-wrap: wrap;
        gap: var(--space-2);
    }
    .tile {
        padding: var(--space-2) var(--space-3);
        border: 1px solid var(--border);
        border-radius: var(--radius-sm);
        background: var(--bg-secondary);
        color: var(--text-primary);
        cursor: pointer;
    }
    .tile.selected {
        border-color: var(--accent);
        background: var(--bg-tertiary);
    }
    .row {
        display: flex;
        flex-wrap: wrap;
        align-items: end;
        gap: var(--space-3);
    }
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
    .actions {
        display: flex;
        align-items: center;
        gap: var(--space-3);
        flex-wrap: wrap;
    }
    .add,
    .remove {
        padding: var(--space-2) var(--space-3);
        border: 1px solid var(--border);
        border-radius: var(--radius-sm);
        background: var(--bg-secondary);
        color: var(--text-primary);
        cursor: pointer;
    }
    .add:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }
    .hint,
    .empty {
        margin: 0;
        color: var(--text-secondary);
        font-size: 0.85rem;
        line-height: 1.5;
    }
    .refusal {
        margin: 0;
        color: var(--danger);
        font-size: 0.85rem;
    }
    .locked {
        padding: var(--space-6) var(--space-4);
        text-align: center;
        color: var(--text-secondary);
        background: var(--bg-secondary);
        border-radius: var(--radius-sm);
        border: 1px dashed var(--border);
    }
    .locked h4 {
        margin: 0 0 var(--space-2) 0;
        color: var(--text-primary);
        font-size: 0.9rem;
    }
    .locked p {
        margin: 0;
        line-height: 1.5;
        font-size: 0.85rem;
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
