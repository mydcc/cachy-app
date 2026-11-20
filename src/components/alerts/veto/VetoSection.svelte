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
  FEAT-0814 -- the rule's veto: conditions that, when they hold, suppress a
  trigger that would otherwise fire. The same tree editor as the trigger,
  plus a third-party feed leaf, which is legal here and nowhere else.

  Two promises this component keeps:
  - Opening it writes nothing. The draft's veto is only rewritten once the
    trader edits it, so a stored veto -- even a bare leaf, even one this
    editor cannot represent -- keeps its exact document and hash.
  - "No veto" is the absence of the field, never an empty group.
-->

<script lang="ts">
    import { _ } from "../../../locales/i18n";
    import { alertPanelState, refusalsForField } from "../../../stores/alertPanel.svelte";
    import {
        VETO_LEAF_KINDS,
        addRow,
        buildComboDraft,
        comboLockReason,
        emptyComboForm,
        leafPaths,
        readComboForm,
        refusalPath,
        vetoAsGroup,
        type ComboForm,
    } from "../../../lib/alerts/comboConditionForm";
    import { renderVetoSentence, type SentenceTranslator } from "../../../lib/rules/ruleSentence";
    import type { RuleRefusal } from "../../../lib/rules/types";
    import type { TranslationKey } from "../../../locales/schema";
    import ConditionTree from "../tabs/combo/ConditionTree.svelte";

    let { translate }: { translate: SentenceTranslator } = $props();

    const READ = { allowFeed: true } as const;

    // Read once, like every builder: the panel re-creates this section when
    // the draft itself is replaced (a reset, a rule loaded for editing).
    const stored = vetoAsGroup(alertPanelState.draft.veto);
    const initial = readComboForm(stored, alertPanelState.draft.trigger_timeframe, READ);
    // Not a constant: removing a veto this editor cannot represent is still
    // allowed, and leaves the section empty rather than locked.
    let locked = $state(
        stored !== null && initial === null
            ? (comboLockReason(stored, alertPanelState.draft.trigger_timeframe, READ) ?? "unsupported")
            : null,
    );

    let form = $state<ComboForm>(initial ?? emptyComboForm());
    /** Whether the trader has edited the veto; until then nothing is written. */
    let touched = $state(false);

    let built = $derived(buildComboDraft(form, alertPanelState.draft.trigger_timeframe));

    // A leaf on the trigger's timeframe is read as "the trigger's", like in
    // Combo. When the trigger moves, an untouched veto must move with it, or
    // the stored veto keeps the old timeframe while the editor shows the new.
    const openedOn = alertPanelState.draft.trigger_timeframe;
    $effect(() => {
        if (locked !== null || alertPanelState.draft.veto === undefined) return;
        if (alertPanelState.draft.trigger_timeframe !== openedOn) touched = true;
    });

    $effect(() => {
        if (!touched || locked !== null) return;
        alertPanelState.setVeto(built.condition);
        alertPanelState.incompleteVeto = built.incomplete;
    });

    $effect(() => () => {
        alertPanelState.incompleteVeto = false;
    });

    let hasVeto = $derived(alertPanelState.draft.veto !== undefined);
    let sentence = $derived(renderVetoSentence(alertPanelState.draft, translate));

    let vetoRefusals = $derived(refusalsForField(alertPanelState.refusals, "veto"));
    let sectionRefusals = $derived.by(() => {
        if (built.incomplete && touched) return [];
        const claimed = leafPaths(form, "veto");
        return vetoRefusals.filter(
            (refusal) => !claimed.some((path) => refusal.field === path || refusal.field.startsWith(`${path}.`)),
        );
    });

    function refusalsAt(rootIndex: number, memberIndex?: number): RuleRefusal[] {
        if (built.incomplete && touched) return [];
        return refusalsForField(vetoRefusals, refusalPath(rootIndex, memberIndex, "veto"));
    }

    function edit(next: ComboForm): void {
        form = next;
        touched = true;
    }

    function addVeto(): void {
        edit(addRow(emptyComboForm()));
    }

    function removeVeto(): void {
        form = emptyComboForm();
        touched = false;
        locked = null;
        alertPanelState.setVeto(null);
        alertPanelState.incompleteVeto = false;
    }

    const key = (raw: string): TranslationKey => raw as TranslationKey;
</script>

<section class="veto" data-testid="veto-section" aria-labelledby="veto-heading">
    <header>
        <h4 id="veto-heading">{$_("dashboard.alerts.veto.title")}</h4>
        {#if hasVeto}
            <button type="button" class="remove" data-testid="veto-remove" onclick={removeVeto}>
                {$_("dashboard.alerts.veto.remove")}
            </button>
        {/if}
    </header>

    {#if locked !== null}
        <p class="hint" role="status" data-testid="veto-locked" data-lock-reason={locked}>
            {$_("dashboard.alerts.veto.locked")}
        </p>
    {:else if !hasVeto && !touched}
        <p class="hint" data-testid="veto-empty">{$_("dashboard.alerts.veto.empty")}</p>
        <button type="button" class="add" data-testid="veto-add" onclick={addVeto}>
            {$_("dashboard.alerts.veto.add")}
        </button>
    {:else}
        <p class="hint">{$_("dashboard.alerts.veto.explain")}</p>
        <ConditionTree
            {form}
            onchange={edit}
            {refusalsAt}
            kinds={VETO_LEAF_KINDS}
            leafDefaults={{ field: alertPanelState.priceField, source: alertPanelState.priceSeries }}
        />
        {#if built.incomplete && touched}
            <p class="hint" role="status" data-testid="veto-incomplete">
                {$_("dashboard.alerts.veto.incomplete")}
            </p>
        {/if}
    {/if}

    {#if sentence}
        <p class="sentence" data-testid="veto-sentence">
            {$_("dashboard.alerts.veto.sentence", { values: { condition: sentence } })}
        </p>
    {/if}

    {#each sectionRefusals as refusal (refusal.field + refusal.code)}
        <p class="refusal" role="alert">{$_(key(refusal.i18n_key), { values: { field: refusal.field } })}</p>
    {/each}
</section>

<style>
    .veto {
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
        padding: var(--space-3);
        border: 1px dashed var(--border-color);
        border-radius: var(--radius-sm);
    }
    header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--space-3);
    }
    h4 {
        margin: 0;
        font-size: 0.9rem;
        color: var(--text-primary);
    }
    .hint {
        margin: 0;
        color: var(--text-secondary);
        font-size: 0.85rem;
        line-height: 1.5;
    }
    .sentence {
        margin: 0;
        color: var(--text-primary);
        font-size: 0.85rem;
    }
    .refusal {
        margin: 0;
        color: var(--danger-color);
        font-size: 0.85rem;
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
</style>
