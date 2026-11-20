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
  FEAT-0815 -- the volatility regime as one leaf: where the current ATR sits
  among its last N values, in percent, against a threshold. "Top quartile" is
  ">= 75"; "volatility collapsed" is "<= 25". The threshold is a string end to
  end and parsed with decimal.js when the condition is built.
-->

<script lang="ts">
    import { _ } from "../../../../locales/i18n";
    import { REGIME_OPS, type ComboLeafPatch, type RegimeLeaf } from "../../../../lib/alerts/comboConditionForm";
    import type { CompareOp } from "../../../../lib/rules/types";
    import type { TranslationKey } from "../../../../locales/schema";

    let { leaf, onpatch }: { leaf: RegimeLeaf; onpatch: (patch: ComboLeafPatch) => void } = $props();

    const key = (raw: string): TranslationKey => raw as TranslationKey;

    /** A whole count from an input, or null while it is not one. */
    function count(raw: string): number | null {
        if (!/^\d+$/.test(raw.trim())) return null;
        return Number(raw.trim()); // audit: safe — a candle count, not a money value
    }
</script>

<label class="field">
    <span>{$_("dashboard.alerts.combo.regimePeriod")}</span>
    <input
        type="text"
        inputmode="numeric"
        value={String(leaf.period)}
        onchange={(e) => {
            const period = count(e.currentTarget.value);
            if (period !== null) onpatch({ period });
        }}
    />
</label>

<label class="field">
    <span>{$_("dashboard.alerts.combo.regimeLookback")}</span>
    <input
        type="text"
        inputmode="numeric"
        value={String(leaf.lookback)}
        onchange={(e) => {
            const lookback = count(e.currentTarget.value);
            if (lookback !== null) onpatch({ lookback });
        }}
    />
</label>

<label class="field">
    <span>{$_("dashboard.alerts.combo.regimeOp")}</span>
    <select value={leaf.op} onchange={(e) => onpatch({ op: e.currentTarget.value as CompareOp })}>
        {#each REGIME_OPS as op (op)}
            <option value={op}>{$_(key(`dashboard.alerts.combo.compareOp.${op}`))}</option>
        {/each}
    </select>
</label>

<label class="field">
    <span>{$_("dashboard.alerts.combo.regimeValue")}</span>
    <input
        type="text"
        inputmode="decimal"
        value={leaf.value}
        oninput={(e) => onpatch({ value: e.currentTarget.value })}
    />
</label>

<p class="hint">{$_("dashboard.alerts.combo.regimeHint")}</p>

<style>
    .field {
        display: flex;
        flex-direction: column;
        gap: var(--space-1);
        min-width: 6rem;
        flex: 1 1 7rem;
    }
    .field span {
        color: var(--text-secondary);
        font-size: 0.8rem;
    }
    input {
        padding: var(--space-2);
        border: 1px solid var(--border-color);
        border-radius: var(--radius-sm);
        background: var(--bg-primary);
        color: var(--text-primary);
    }
    .hint {
        flex-basis: 100%;
        margin: 0;
        color: var(--text-secondary);
        font-size: 0.8rem;
    }
</style>
