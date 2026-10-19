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
  along with this program. If not, see <https://www.gnu.org/licenses/>.
-->
<!--
  BUG-0704 — the confirmation block says which prices the context could not
  confirm, before the user applies them. Two states, both informational:
  a value that matches no context level, and a batch that could not be checked
  at all (the context carried no price). Full silence would read as "safe".
-->
<script lang="ts">
    import { _ } from "../../../locales/i18n";
    import type { UnverifiedPrice } from "../../ai/actionContextCheck";

    let {
        entries = [],
        unchecked = false,
    }: { entries?: UnverifiedPrice[]; unchecked?: boolean } = $props();

    /** `TP 2` for an indexed target, so two flagged values stay tellable apart. */
    function describe(entry: UnverifiedPrice): string {
        return typeof entry.index === "number"
            ? `${entry.value} (TP ${entry.index + 1})`
            : entry.value;
    }
</script>

{#if unchecked}
    <div class="action-warning is-unchecked" role="status">
        <span aria-hidden="true">ℹ</span>
        <span>{$_("assistant.actionPricesUnchecked")}</span>
    </div>
{:else if entries.length > 0}
    <div class="action-warning" role="status">
        <span aria-hidden="true">⚠</span>
        <div>
            <div>{$_("assistant.unverifiedActionPrices")}</div>
            <ul class="action-warning-list">
                {#each entries as entry (entry.action + entry.value + (entry.index ?? ""))}
                    <li>{describe(entry)}</li>
                {/each}
            </ul>
        </div>
    </div>
{/if}

<style>
    .action-warning {
        display: flex;
        align-items: flex-start;
        gap: 6px;
        margin-top: 8px;
        padding: 6px 8px;
        border-radius: 4px;
        font-size: 11px;
        line-height: 1.35;
        color: var(--warning-color);
        border: 1px solid var(--warning-color);
        background: color-mix(in srgb, var(--warning-color) 12%, transparent);
    }
    .action-warning.is-unchecked {
        color: var(--text-secondary);
        border-color: var(--border-color);
        background: var(--bg-secondary);
    }
    .action-warning-list {
        margin: 4px 0 0;
        padding-left: 16px;
        list-style: disc;
    }
</style>
