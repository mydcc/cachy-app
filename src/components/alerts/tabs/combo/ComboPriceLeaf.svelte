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
  A price condition as one leaf of a combination (FEAT-0813). Writes the same
  reading the Price tab writes, through the same `buildPriceCondition`, so a
  price leaf built here and one built there are one document.

  The price field and series stay what the reading already carries: a leaf
  read from a rule over the mark price keeps reading the mark price.
-->

<script lang="ts">
    import { _ } from "../../../../locales/i18n";
    import type { ComboLeafPatch, PriceLeaf } from "../../../../lib/alerts/comboConditionForm";
    import type { PriceConditionKind } from "../../../../lib/alerts/priceFormLeaf";
    import type { TranslationKey } from "../../../../locales/schema";

    let { leaf, onpatch }: { leaf: PriceLeaf; onpatch: (patch: ComboLeafPatch) => void } = $props();

    const KINDS: readonly PriceConditionKind[] = ["rises_above", "falls_below", "rise_reaches", "fall_reaches"];
    const KIND_KEYS: Record<PriceConditionKind, TranslationKey> = {
        rises_above: "dashboard.alerts.price.risesAbove",
        falls_below: "dashboard.alerts.price.fallsBelow",
        rise_reaches: "dashboard.alerts.price.riseReaches",
        fall_reaches: "dashboard.alerts.price.fallReaches",
    };

    let isPercent = $derived(
        leaf.reading.form.kind === "rise_reaches" || leaf.reading.form.kind === "fall_reaches",
    );

    function setForm(next: Partial<PriceLeaf["reading"]["form"]>): void {
        onpatch({ reading: { ...leaf.reading, form: { ...leaf.reading.form, ...next } } });
    }

    function setLookback(raw: string): void {
        setForm({ lookback: Number(raw) });  // audit: safe — candle count, not a price
    }
</script>

<label class="field">
    <span>{$_("dashboard.alerts.price.conditionType")}</span>
    <select
        value={leaf.reading.form.kind}
        onchange={(e) => setForm({ kind: e.currentTarget.value as PriceConditionKind })}
    >
        {#each KINDS as kind (kind)}
            <option value={kind}>{$_(KIND_KEYS[kind])}</option>
        {/each}
    </select>
</label>

<label class="field narrow">
    <span>
        {isPercent ? $_("dashboard.alerts.price.percentLabel") : $_("dashboard.alerts.price.priceLabel")}
    </span>
    <!-- Text, not number: the threshold stays the string the trader typed
         until buildPriceCondition parses it with decimal.js. -->
    <input
        type="text"
        inputmode="decimal"
        value={leaf.reading.form.threshold}
        oninput={(e) => setForm({ threshold: e.currentTarget.value })}
    />
</label>

{#if isPercent}
    <label class="field narrow">
        <span>{$_("dashboard.alerts.price.lookbackLabel")}</span>
        <input
            type="number"
            min="1"
            step="1"
            value={leaf.reading.form.lookback}
            onchange={(e) => setLookback(e.currentTarget.value)}
        />
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
</style>
