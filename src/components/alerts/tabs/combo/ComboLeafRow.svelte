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
  One leaf of a combination, whatever its kind (FEAT-0813): the kind switch,
  the editor for that kind, the remove button, and the refusals the core
  anchored to this leaf's path -- so a refusal still points at the row that
  caused it once rows can sit inside groups.
-->

<script lang="ts">
    import { _ } from "../../../../locales/i18n";
    import {
        COMBO_LEAF_KINDS,
        type ComboLeaf,
        type ComboLeafKind,
        type ComboLeafPatch,
    } from "../../../../lib/alerts/comboConditionForm";
    import type { RuleRefusal } from "../../../../lib/rules/types";
    import type { TranslationKey } from "../../../../locales/schema";
    import ComboIndicatorLeaf from "./ComboIndicatorLeaf.svelte";
    import ComboPatternLeaf from "./ComboPatternLeaf.svelte";
    import ComboPriceLeaf from "./ComboPriceLeaf.svelte";

    let {
        leaf,
        label,
        removeLabel,
        refusals,
        onpatch,
        onkind,
        onremove,
    }: {
        leaf: ComboLeaf;
        label: string;
        removeLabel: string;
        refusals: readonly RuleRefusal[];
        onpatch: (patch: ComboLeafPatch) => void;
        onkind: (kind: ComboLeafKind) => void;
        onremove: () => void;
    } = $props();

    const key = (raw: string): TranslationKey => raw as TranslationKey;
</script>

<fieldset class="row" data-testid="combo-leaf" data-leaf-kind={leaf.kind}>
    <legend>{label}</legend>

    <label class="field kind">
        <span>{$_("dashboard.alerts.combo.leafKindLabel")}</span>
        <select value={leaf.kind} onchange={(e) => onkind(e.currentTarget.value as ComboLeafKind)}>
            {#each COMBO_LEAF_KINDS as kind (kind)}
                <option value={kind}>{$_(key(`dashboard.alerts.combo.leafKind.${kind}`))}</option>
            {/each}
        </select>
    </label>

    {#if leaf.kind === "indicator"}
        <ComboIndicatorLeaf {leaf} {onpatch} />
    {:else if leaf.kind === "price"}
        <ComboPriceLeaf {leaf} {onpatch} />
    {:else}
        <ComboPatternLeaf {leaf} {onpatch} />
    {/if}

    <button type="button" class="remove" onclick={onremove}>{removeLabel}</button>

    {#each refusals as refusal (refusal.field + refusal.code)}
        <p class="refusal" role="alert">{$_(key(refusal.i18n_key))}</p>
    {/each}
</fieldset>

<style>
    .row {
        display: flex;
        flex-wrap: wrap;
        align-items: end;
        gap: var(--space-3);
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
    .field {
        display: flex;
        flex-direction: column;
        gap: var(--space-1);
        min-width: 8rem;
        flex: 0 1 9rem;
    }
    .field span {
        color: var(--text-secondary);
        font-size: 0.8rem;
    }
    .remove {
        padding: var(--space-2) var(--space-3);
        border: 1px solid var(--border);
        border-radius: var(--radius-sm);
        background: var(--bg-secondary);
        color: var(--text-primary);
        cursor: pointer;
    }
    .refusal {
        flex-basis: 100%;
        margin: 0;
        color: var(--danger);
        font-size: 0.85rem;
    }
</style>
