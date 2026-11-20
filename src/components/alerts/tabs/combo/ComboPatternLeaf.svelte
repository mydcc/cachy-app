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
  A candlestick pattern as one leaf of a combination (FEAT-0813). A plain
  select rather than the Candlesticks tab's tiles: the tiles teach a pattern,
  a row only names it.
-->

<script lang="ts">
    import { _ } from "../../../../locales/i18n";
    import { ALL_PATTERNS } from "../../../../lib/alerts/patternCatalogue";
    import type { ComboLeafPatch, PatternLeaf } from "../../../../lib/alerts/comboConditionForm";
    import type { CandlePatternName } from "../../../../lib/rules/types";
    import type { TranslationKey } from "../../../../locales/schema";

    let { leaf, onpatch }: { leaf: PatternLeaf; onpatch: (patch: ComboLeafPatch) => void } = $props();

    // The Academy translations, reused by id (FEAT-0394), as the Candlesticks tab does.
    const nameKey = (pattern: CandlePatternName): TranslationKey =>
        `candlestickPatterns.${pattern}.name` as TranslationKey;
</script>

<label class="field">
    <span>{$_("dashboard.alerts.combo.patternLabel")}</span>
    <select
        value={leaf.pattern}
        onchange={(e) => onpatch({ pattern: e.currentTarget.value as CandlePatternName })}
    >
        {#each ALL_PATTERNS as pattern (pattern)}
            <option value={pattern}>{$_(nameKey(pattern))}</option>
        {/each}
    </select>
</label>

<style>
    .field {
        display: flex;
        flex-direction: column;
        gap: var(--space-1);
        min-width: 10rem;
        flex: 1 1 10rem;
    }
    .field span {
        color: var(--text-secondary);
        font-size: 0.8rem;
    }
</style>
