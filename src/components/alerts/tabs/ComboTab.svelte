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
        MAX_COMBO_CONDITIONS,
        RULE_WARMUP_CEILING,
        buildComboDraft,
        comboLockReason,
        emptyComboForm,
        leafPaths,
        readComboForm,
        refusalPath,
        type ComboForm,
    } from "../../../lib/alerts/comboConditionForm";
    import type { RuleRefusal } from "../../../lib/rules/types";
    import type { TranslationKey } from "../../../locales/schema";
    import ConditionTree from "./combo/ConditionTree.svelte";

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
        if (built.incomplete) return [];
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

    // Every leaf that builds goes into the draft; an unfinished one is left
    // out and flagged, which keeps arming off. Writing nothing (or an empty
    // group) instead would let one blank price threshold wipe every other
    // condition the moment the trader switches tabs (BUG-0443 class).
    let built = $derived(buildComboDraft(form, alertPanelState.draft.trigger_timeframe));

    $effect(() => {
        if (locked) return;
        alertPanelState.setConditionGroup(built.condition);
        alertPanelState.incompleteConditions = built.incomplete;
    });

    // Leaving the tab drops the unfinished leaf with the form; what stays in
    // the draft is complete, so the flag must not outlive the tab.
    $effect(() => () => {
        alertPanelState.incompleteConditions = false;
    });

    // While a leaf is left out, the document's indices no longer line up with
    // the rows on screen, so a refusal would land on the wrong one.
    function refusalsAt(rootIndex: number, memberIndex?: number): RuleRefusal[] {
        if (built.incomplete) return [];
        return refusalsForField(conditionRefusals, refusalPath(rootIndex, memberIndex));
    }

    const key = (raw: string): TranslationKey => raw as TranslationKey;
</script>


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
        <ConditionTree {form} onchange={(next) => (form = next)} {refusalsAt} />

        {#if built.incomplete}
            <p class="hint" role="status" data-testid="combo-incomplete">
                {$_("dashboard.alerts.combo.incomplete")}
            </p>
        {/if}

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
    .hint {
        margin: 0;
        color: var(--text-secondary);
        font-size: 0.85rem;
        line-height: 1.5;
    }
    .refusal {
        margin: 0;
        color: var(--danger-color);
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
