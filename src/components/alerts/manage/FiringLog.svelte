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
  FEAT-0747 — the Log tab: what was announced, read from the firing ledger.

  The ledger is the record of announcements, not a second history of rules.
  An entry survives deleting its rule, because a trader removing an obsolete
  alert is not asking to erase the evidence that it fired.
-->
<script lang="ts">
    import { _ } from "../../../locales/i18n";
    import { SHADOW_LEDGER_MAX_RECORDS } from "../../../services/alertEngine/shadowLedger";
    import type { FiringEntry } from "./manageView";

    let {
        entries,
        dateFormatter,
        onOpenRule,
    }: {
        entries: readonly FiringEntry[];
        dateFormatter: Intl.DateTimeFormat;
        onOpenRule: (ruleId: string) => void;
    } = $props();

    function format(ms: number | null): string {
        return ms === null ? "" : dateFormatter.format(new Date(ms));
    }
</script>

<p class="log-cap">
    {$_("dashboard.alerts.manageList.logCap", { values: { count: SHADOW_LEDGER_MAX_RECORDS } })}
</p>

{#if entries.length === 0}
    <div class="empty-state">{$_("dashboard.alerts.manageList.logEmpty")}</div>
{:else}
    <div class="log-list">
        {#each entries as entry (`${entry.ruleId}:${entry.recordedAtMs}:${entry.anchorMs}`)}
            {@const anchor = format(entry.anchorMs)}
            <div class="log-item">
                <div class="log-main">
                    <strong>{entry.symbol}</strong>
                    {#if entry.ruleName}
                        <button
                            type="button"
                            class="rule-link"
                            aria-label={$_("dashboard.alerts.manageList.openRule", {
                                values: { name: entry.ruleName },
                            })}
                            onclick={() => onOpenRule(entry.ruleId)}
                        >
                            {entry.ruleName}
                        </button>
                    {:else}
                        <span class="deleted-rule">
                            {$_("dashboard.alerts.manageList.logDeletedRule")}
                        </span>
                    {/if}
                    {#if entry.timeframe}
                        <span class="meta">{entry.timeframe}</span>
                    {/if}
                    {#if entry.verdict}
                        <span class="meta">{entry.verdict}</span>
                    {/if}
                </div>

                <div class="log-times">
                    {#if entry.recordedAtMs !== null}
                        <span>{format(entry.recordedAtMs)}</span>
                    {:else}
                        <!--
                          A fire the ledger never saw (pre-ledger state, or a
                          failed write) still gets an entry from the rule's own
                          anchor — but it must not pretend to have a wall clock.
                        -->
                        <span title={$_("dashboard.alerts.manageList.logAnchorOnly")}>
                            {anchor}
                        </span>
                    {/if}
                    {#if anchor && entry.recordedAtMs !== null}
                        <span class="meta">
                            {$_("dashboard.alerts.manageList.logCandle", { values: { time: anchor } })}
                        </span>
                    {/if}
                </div>
            </div>
        {/each}
    </div>
{/if}

<style>
    .log-cap {
        margin: 0 0 var(--space-2);
        color: var(--text-secondary);
        font-size: 0.75rem;
    }
    .log-list {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }
    .log-item {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        gap: var(--space-2);
        padding: var(--space-2) var(--space-3);
        background: var(--bg-secondary);
        border-radius: var(--radius-sm);
        border-left: 3px solid var(--success-color);
    }
    .log-main,
    .log-times {
        display: flex;
        flex-wrap: wrap;
        align-items: baseline;
        gap: var(--space-2);
        min-width: 0;
    }
    .log-times {
        flex-direction: column;
        align-items: flex-end;
        flex-shrink: 0;
        font-size: 0.75rem;
    }
    .rule-link {
        background: none;
        border: none;
        padding: 0;
        color: var(--accent-color);
        font-size: 0.8rem;
        cursor: pointer;
        text-decoration: underline;
    }
    .deleted-rule,
    .meta {
        color: var(--text-secondary);
        font-size: 0.75rem;
    }
    .empty-state {
        text-align: center;
        color: var(--text-secondary);
        padding: var(--space-6);
    }
</style>
