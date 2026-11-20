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
  The condition tree as an edit surface (FEAT-0813), shared by the trigger
  (Combo tab) and the veto (FEAT-0814): operator, leaves, groups as cards,
  and the add buttons. It owns no document -- the caller holds the form,
  writes it where it belongs and says which refusals land on which leaf.
-->

<script lang="ts">
    import { _ } from "../../../../locales/i18n";
    import {
        COMBO_LEAF_KINDS,
        COMBO_OPS,
        MAX_COMBO_CONDITIONS,
        addGroup,
        addRow,
        canAddGroup,
        canAddRow,
        changeLeafKind,
        removeRow,
        replaceRow,
        setLogicOp,
        type ComboForm,
        type ComboLeaf,
        type ComboLeafKind,
        type ComboLeafPatch,
        type LeafDefaults,
    } from "../../../../lib/alerts/comboConditionForm";
    import type { LogicOp, RuleRefusal } from "../../../../lib/rules/types";
    import type { TranslationKey } from "../../../../locales/schema";
    import ComboLeafRow from "./ComboLeafRow.svelte";

    let {
        form,
        onchange,
        refusalsAt,
        kinds = COMBO_LEAF_KINDS,
        leafDefaults,
    }: {
        form: ComboForm;
        onchange: (next: ComboForm) => void;
        /** The refusals the core anchored to the leaf at this position. */
        refusalsAt: (rootIndex: number, memberIndex?: number) => RuleRefusal[];
        kinds?: readonly ComboLeafKind[];
        /** The panel header's price field and series, for a leaf switched to price. */
        leafDefaults?: LeafDefaults;
    } = $props();

    /** "Group 1", "Group 2" by groups, not by root position. */
    let groupNumbers = $derived.by(() => {
        const numbers = new Map<string, number>();
        for (const node of form.rows) if (node.kind === "group") numbers.set(node.id, numbers.size + 1);
        return numbers;
    });

    function patch(leaf: ComboLeaf, next: ComboLeafPatch): void {
        onchange(replaceRow(form, leaf.id, next));
    }

    function switchKind(leaf: ComboLeaf, kind: ComboLeafKind): void {
        onchange(changeLeafKind(form, leaf.id, kind, leafDefaults));
    }

    const key = (raw: string): TranslationKey => raw as TranslationKey;
</script>

{#snippet opPicker(current: LogicOp, legend: string, onpick: (op: LogicOp) => void)}
    <fieldset class="logic">
        <legend>{legend}</legend>
        <div class="ops">
            {#each COMBO_OPS as op (op)}
                <button
                    type="button"
                    class="tile"
                    class:selected={current === op}
                    aria-pressed={current === op}
                    onclick={() => onpick(op)}
                >
                    {$_(key(`dashboard.alerts.combo.op.${op}`))}
                </button>
            {/each}
        </div>
        <p class="hint">{$_(key(`dashboard.alerts.combo.opHint.${current}`))}</p>
    </fieldset>
{/snippet}

    {@render opPicker(form.op, $_("dashboard.alerts.combo.logicLabel"), (op) => onchange(setLogicOp(form, op)))}

    {#if form.rows.length === 0}
        <p class="empty">{$_("dashboard.alerts.combo.empty")}</p>
    {/if}

    {#each form.rows as node, index (node.id)}
        {#if node.kind === "group"}
            <section class="group" data-testid="combo-group">
                <header>
                    <h5>{$_("dashboard.alerts.combo.groupLabel", { values: { index: groupNumbers.get(node.id) ?? 0 } })}</h5>
                    <button type="button" class="remove" onclick={() => onchange(removeRow(form, node.id))}>
                        {$_("dashboard.alerts.combo.removeGroup", { values: { index: groupNumbers.get(node.id) ?? 0 } })}
                    </button>
                </header>
                {@render opPicker(
                    node.op,
                    $_("dashboard.alerts.combo.groupLogicLabel"),
                    (op) => onchange(setLogicOp(form, op, node.id)),
                )}
                {#each node.members as leaf, memberIndex (leaf.id)}
                    <ComboLeafRow
                        {leaf}
                        label={$_("dashboard.alerts.combo.rowLabel", {
                            values: { index: `${index + 1}.${memberIndex + 1}` },
                        })}
                        removeLabel={$_("dashboard.alerts.combo.removeRow", {
                            values: { index: `${index + 1}.${memberIndex + 1}` },
                        })}
                        refusals={refusalsAt(index, memberIndex)}
                        onpatch={(next) => patch(leaf, next)}
                        onkind={(kind) => switchKind(leaf, kind)}
                        {kinds}
                        onremove={() => onchange(removeRow(form, leaf.id))}
                    />
                {/each}
                <button
                    type="button"
                    class="add"
                    disabled={!canAddRow(form)}
                    onclick={() => onchange(addRow(form, "indicator", node.id))}
                >
                    {$_("dashboard.alerts.combo.groupAddRow", { values: { index: groupNumbers.get(node.id) ?? 0 } })}
                </button>
            </section>
        {:else}
            <ComboLeafRow
                leaf={node}
                label={$_("dashboard.alerts.combo.rowLabel", { values: { index: index + 1 } })}
                removeLabel={$_("dashboard.alerts.combo.removeRow", { values: { index: index + 1 } })}
                refusals={refusalsAt(index)}
                onpatch={(next) => patch(node, next)}
                onkind={(kind) => switchKind(node, kind)}
                {kinds}
                onremove={() => onchange(removeRow(form, node.id))}
            />
        {/if}
    {/each}

    <div class="actions">
        <button type="button" class="add" disabled={!canAddRow(form)} onclick={() => onchange(addRow(form))}>
            {$_("dashboard.alerts.combo.addRow")}
        </button>
        <button type="button" class="add" disabled={!canAddGroup(form)} onclick={() => onchange(addGroup(form))}>
            {$_("dashboard.alerts.combo.addGroup")}
        </button>
        <p class="hint">
            {$_("dashboard.alerts.combo.limitHint", { values: { max: MAX_COMBO_CONDITIONS } })}
        </p>
    </div>

<style>
    fieldset {
        border: 1px solid var(--border-color);
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
        border: 1px solid var(--border-color);
        border-radius: var(--radius-sm);
        background: var(--bg-secondary);
        color: var(--text-primary);
        cursor: pointer;
    }
    .tile.selected {
        border-color: var(--accent-color);
        background: var(--bg-tertiary);
    }
    .group {
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
        padding: var(--space-3);
        border: 1px solid var(--accent-color);
        border-radius: var(--radius-sm);
        background: var(--bg-secondary);
    }
    .group header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--space-3);
    }
    .group h5 {
        margin: 0;
        font-size: 0.85rem;
        color: var(--text-primary);
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
        border: 1px solid var(--border-color);
        border-radius: var(--radius-sm);
        background: var(--bg-secondary);
        color: var(--text-primary);
        cursor: pointer;
        align-self: flex-start;
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
</style>
