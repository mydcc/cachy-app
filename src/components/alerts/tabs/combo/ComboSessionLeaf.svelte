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
  FEAT-0815 -- a daily UTC window the anchor close must fall in. Presets only
  fill the two times; the document stores the window, and every label shows
  the UTC times it stands for, because a named session that drifts with
  daylight saving is exactly what the core refuses to know about.
-->

<script lang="ts">
    import { _ } from "../../../../locales/i18n";
    import { SESSION_PRESETS, type ComboLeafPatch, type SessionLeaf } from "../../../../lib/alerts/comboConditionForm";
    import type { TranslationKey } from "../../../../locales/schema";

    let { leaf, onpatch }: { leaf: SessionLeaf; onpatch: (patch: ComboLeafPatch) => void } = $props();

    const key = (raw: string): TranslationKey => raw as TranslationKey;

    let preset = $derived(
        SESSION_PRESETS.find((p) => p.from === leaf.from && p.to === leaf.to)?.id ?? "custom",
    );

    function pick(id: string): void {
        const chosen = SESSION_PRESETS.find((p) => p.id === id);
        if (chosen) onpatch({ from: chosen.from, to: chosen.to });
    }
</script>

<label class="field">
    <span>{$_("dashboard.alerts.combo.sessionPreset")}</span>
    <select value={preset} onchange={(e) => pick(e.currentTarget.value)}>
        <option value="custom">{$_("dashboard.alerts.combo.sessionPresetOption.custom")}</option>
        {#each SESSION_PRESETS as p (p.id)}
            <option value={p.id}>
                {$_(key(`dashboard.alerts.combo.sessionPresetOption.${p.id}`), { values: { from: p.from, to: p.to } })}
            </option>
        {/each}
    </select>
</label>

<label class="field">
    <span>{$_("dashboard.alerts.combo.sessionFrom")}</span>
    <input type="time" value={leaf.from} oninput={(e) => onpatch({ from: e.currentTarget.value })} />
</label>

<label class="field">
    <span>{$_("dashboard.alerts.combo.sessionTo")}</span>
    <input type="time" value={leaf.to} oninput={(e) => onpatch({ to: e.currentTarget.value })} />
</label>

<p class="hint">{$_("dashboard.alerts.combo.sessionHint")}</p>

<style>
    .field {
        display: flex;
        flex-direction: column;
        gap: var(--space-1);
        min-width: 7rem;
        flex: 1 1 8rem;
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
