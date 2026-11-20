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
  FEAT-0813 -- up to sixteen of them, mixed kinds, one level of groups.

  The plain-language read-back is not rendered here: AlertPanelView already
  derives it from the whole draft, so this tab's job is to write a correct
  document and let the sentence follow. Groups are cards rather than an
  indented list: the sentence is the read-back, the cards are the edit
  surface.
-->

<script lang="ts">
    import { _ } from "../../../locales/i18n";
    import { alertPanelState, refusalsForField } from "../../../stores/alertPanel.svelte";
    import { ruleSchema } from "../../../lib/rules/ruleSchema";
    import {
        COMBO_OPS,
        MAX_COMBO_CONDITIONS,
        RULE_WARMUP_CEILING,
        addGroup,
        addRow,
        buildComboCondition,
        canAddGroup,
        canAddRow,
        changeLeafKind,
        comboLockReason,
        emptyComboForm,
        leafPaths,
        readComboForm,
        refusalPath,
        removeRow,
        replaceRow,
        setLogicOp,
        type ComboForm,
        type ComboLeaf,
        type ComboLeafKind,
        type ComboLeafPatch,
    } from "../../../lib/alerts/comboConditionForm";
    import type { LogicOp, RuleRefusal } from "../../../lib/rules/types";
    import type { TranslationKey } from "../../../locales/schema";
    import ComboLeafRow from "./combo/ComboLeafRow.svelte";

    let { symbol: _symbol }: { symbol: string } = $props();

    // Read once at init, like every other builder in this panel.
    const initial = readComboForm(
        alertPanelState.draft.conditions,
        alertPanelState.draft.trigger_timeframe,
    );

    // A document this builder cannot represent -- a third level of groups, a
    // `none` join, more than sixteen conditions -- leaves the tab locked. The
    // write-through effect below never runs in that state, so opening this
    // tab on a rule it does not understand cannot erase it.
    const lockReason =
        initial === null
            ? (comboLockReason(alertPanelState.draft.conditions, alertPanelState.draft.trigger_timeframe) ??
              "unsupported")
            : null;
    const locked = lockReason !== null;

    let form = $state<ComboForm>(initial ?? emptyComboForm());

    let conditionRefusals = $derived(refusalsForField(alertPanelState.refusals, "conditions"));
    // Refusals no row claimed: the tree as a whole (an empty group, the
    // warmup ceiling) rather than one leaf of it. Computed from the leaves
    // actually rendered, so a refusal on a group's own field is never lost.
    let treeRefusals = $derived.by(() => {
        const claimed = leafPaths(form);
        return conditionRefusals.filter(
            (refusal) =>
                !claimed.some((path) => refusal.field === path || refusal.field.startsWith(`${path}.`)),
        );
    });

    /**
     * Candles the draft needs before it can judge, from the core -- the one
     * authority on warmup. `null` while the core is not loaded or the draft
     * is not a document yet; the line then stays away rather than guessing.
     */
    let warmup = $derived.by(() => {
        if (locked || form.rows.length === 0 || !ruleSchema.isReady()) return null;
        try {
            return ruleSchema.warmupCandles($state.snapshot(alertPanelState.draft));
        } catch {
            return null;
        }
    });

    $effect(() => {
        if (locked) return;
        alertPanelState.setConditionGroup(
            buildComboCondition(form, alertPanelState.draft.trigger_timeframe),
        );
    });

    function refusalsAt(rootIndex: number, memberIndex?: number): RuleRefusal[] {
        return refusalsForField(conditionRefusals, refusalPath(rootIndex, memberIndex));
    }

    function patch(leaf: ComboLeaf, next: ComboLeafPatch): void {
        form = replaceRow(form, leaf.id, next);
    }

    function switchKind(leaf: ComboLeaf, kind: ComboLeafKind): void {
        form = changeLeafKind(form, leaf.id, kind);
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

{#if locked}
    <div class="locked" role="status" data-testid="combo-locked" data-lock-reason={lockReason}>
        <h4>{$_("dashboard.alerts.combo.lockedTitle")}</h4>
        <p>
            {lockReason === "too_many"
                ? $_("dashboard.alerts.combo.lockedTooManyBody", { values: { max: MAX_COMBO_CONDITIONS } })
                : $_("dashboard.alerts.combo.lockedBody")}
        </p>
    </div>
{:else}
    <div class="builder">
        {@render opPicker(form.op, $_("dashboard.alerts.combo.logicLabel"), (op) => (form = setLogicOp(form, op)))}

        {#if form.rows.length === 0}
            <p class="empty">{$_("dashboard.alerts.combo.empty")}</p>
        {/if}

        {#each form.rows as node, index (node.id)}
            {#if node.kind === "group"}
                <section class="group" data-testid="combo-group">
                    <header>
                        <h5>{$_("dashboard.alerts.combo.groupLabel", { values: { index: index + 1 } })}</h5>
                        <button type="button" class="remove" onclick={() => (form = removeRow(form, node.id))}>
                            {$_("dashboard.alerts.combo.removeGroup", { values: { index: index + 1 } })}
                        </button>
                    </header>
                    {@render opPicker(
                        node.op,
                        $_("dashboard.alerts.combo.groupLogicLabel"),
                        (op) => (form = setLogicOp(form, op, node.id)),
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
                            onremove={() => (form = removeRow(form, leaf.id))}
                        />
                    {/each}
                    <button
                        type="button"
                        class="add"
                        disabled={!canAddRow(form)}
                        onclick={() => (form = addRow(form, "indicator", node.id))}
                    >
                        {$_("dashboard.alerts.combo.groupAddRow", { values: { index: index + 1 } })}
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
                    onremove={() => (form = removeRow(form, node.id))}
                />
            {/if}
        {/each}

        <div class="actions">
            <button type="button" class="add" disabled={!canAddRow(form)} onclick={() => (form = addRow(form))}>
                {$_("dashboard.alerts.combo.addRow")}
            </button>
            <button type="button" class="add" disabled={!canAddGroup(form)} onclick={() => (form = addGroup(form))}>
                {$_("dashboard.alerts.combo.addGroup")}
            </button>
            <p class="hint">
                {$_("dashboard.alerts.combo.limitHint", { values: { max: MAX_COMBO_CONDITIONS } })}
            </p>
        </div>

        {#if warmup !== null}
            <p class="hint" data-testid="combo-warmup">
                {$_("dashboard.alerts.combo.warmup", { values: { count: warmup, max: RULE_WARMUP_CEILING } })}
            </p>
        {/if}

        {#each treeRefusals as refusal (refusal.field + refusal.code)}
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
    .group {
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
        padding: var(--space-3);
        border: 1px solid var(--accent);
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
        border: 1px solid var(--border);
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
</style>
