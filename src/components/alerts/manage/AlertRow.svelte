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
  FEAT-0747 — one Manage row.

  The row answers the question the old one could not: what is this alarm? A
  type, the symbol, the rule's own name, a plain-language sentence, a status
  with text, and the lifecycle at a glance. The `<details>` block keeps
  FEAT-0543's full configuration one click away; the sentence is not repeated
  inside it.

  Presentational only: every action is a callback, so the row has no opinion
  about the store and the tab keeps the toasts and the version bumps.
-->
<script lang="ts">
    import { _ } from "../../../locales/i18n";
    import type { TranslationKey } from "../../../locales/schema";
    import {
        EVALUATION_KEYS,
        FREQUENCY_KEYS,
        METHOD_KEYS,
    } from "../../../lib/alerts/lifecycleLabels";
    import type { ManageRow } from "./manageView";
    import { KIND_KEYS, STATUS_KEYS } from "./manageView";

    let {
        row,
        broken,
        suspendedReason,
        dateFormatter,
        onToggle,
        onEdit,
        onDuplicate,
        onDelete,
    }: {
        row: ManageRow;
        broken?: { reason: string } | undefined;
        suspendedReason?: string | null;
        dateFormatter: Intl.DateTimeFormat;
        onToggle: (row: ManageRow) => void;
        onEdit: (id: string) => void;
        onDuplicate: (row: ManageRow) => void;
        onDelete: (id: string) => void;
    } = $props();

    /**
     * A translated option label, falling back to the stored value.
     *
     * A rule arrives from `JSON.parse` without validation. An unknown enum
     * value must not become an empty label (or a missing-message warning on
     * every render) — the raw value tells the trader what is stored.
     */
    function optionLabel(
        map: Record<string, TranslationKey | undefined>,
        value: string,
    ): string {
        const key = map[value];
        return key ? $_(key) : value;
    }

    let kindLabel = $derived($_(KIND_KEYS[row.kind]));
    let statusLabel = $derived($_(STATUS_KEYS[row.status]));
    let evaluationLabel = $derived(optionLabel(EVALUATION_KEYS, row.evaluation));
    let frequencyLabel = $derived(optionLabel(FREQUENCY_KEYS, row.frequency));
    let validUntil = $derived(
        row.validUntilMs === null ? "" : dateFormatter.format(new Date(row.validUntilMs)),
    );
    let lastFired = $derived(
        row.lastFiredAtMs === null ? "" : dateFormatter.format(new Date(row.lastFiredAtMs)),
    );

    /** Empty means the notification policy decides; unknown methods stay raw. */
    let channels = $derived(
        (Array.isArray(row.rule.trigger_methods) ? row.rule.trigger_methods : [])
            .map((method) => {
                const key = (METHOD_KEYS as Record<string, TranslationKey | undefined>)[method];
                return key ? $_(key) : String(method);
            })
            .join(", "),
    );

    /*
      A repeating rule can fire many times; the count is text, not colour, and
      it survives a reload because it is read from `fired_count` (BUG-0754).
    */
    let firedTimes = $derived(
        row.firedCount > 0 && row.status !== "fired"
            ? $_("dashboard.alerts.manageList.firedTimes", { values: { count: row.firedCount } })
            : "",
    );
</script>

<div class="alert-item" class:spent-item={row.status === "fired"}>
    <div class="row-main">
        <div class="alert-info">
            <div class="row-title">
                <span class="kind-chip">{kindLabel}</span>
                <strong>{row.symbol}</strong>
                {#if row.rule.name}
                    <span class="rule-name">{row.rule.name}</span>
                {/if}
                <span class="status-badge status-{row.status}">{statusLabel}</span>
                {#if firedTimes}
                    <span class="fired-count">{firedTimes}</span>
                {/if}
            </div>

            {#if row.sentence}
                <p class="sentence">{row.sentence}</p>
            {/if}

            <div class="row-meta">
                {#if row.timeframe}
                    <span>{row.timeframe}</span>
                {/if}
                <span>{evaluationLabel}</span>
                <span>{frequencyLabel}</span>
                {#if validUntil}
                    <span>{$_("dashboard.alerts.manageList.validUntil", { values: { date: validUntil } })}</span>
                {/if}
                {#if lastFired}
                    <span>{$_("dashboard.alerts.manageList.lastFired", { values: { date: lastFired } })}</span>
                {/if}
            </div>

            <!--
              BUG-0485 — a rule that cannot fire belongs next to the rule, not
              in a separate report. The badge text is localised; the title
              carries the developer-facing reason (indicator, drawing,
              timeframe) as the detail.
            -->
            {#if row.status === "suspended"}
                <span
                    class="suspended-badge"
                    title={suspendedReason ?? $_("dashboard.alerts.suspendedHint")}
                >
                    {$_("dashboard.alerts.suspended")}
                </span>
                {#if suspendedReason}
                    <span class="suspended-reason">{suspendedReason}</span>
                {/if}
            {:else if broken}
                <span class="broken-badge" title={broken.reason}>
                    {$_("dashboard.alerts.brokenRule.badge")}
                </span>
            {/if}
        </div>

        <div class="row-actions">
            {#if row.enabled || row.status !== "fired"}
                <button
                    type="button"
                    class="pause-btn"
                    aria-label={$_("dashboard.alerts.pauseAlert")}
                    aria-pressed={!row.enabled}
                    title={row.enabled
                        ? $_("dashboard.alerts.pauseAlert")
                        : $_("dashboard.alerts.resumeAlert")}
                    onclick={() => onToggle(row)}
                >
                    {row.enabled ? "⏸" : "▶"}
                </button>
            {/if}
            <button
                type="button"
                class="duplicate-btn"
                aria-label={$_("dashboard.alerts.duplicateAlert")}
                onclick={() => onDuplicate(row)}
            >
                ⧉
            </button>
            <button
                type="button"
                class="edit-btn"
                aria-label={$_("dashboard.alerts.editAlert")}
                onclick={() => onEdit(row.id)}
            >
                ✎
            </button>
            <button
                type="button"
                class="delete-btn"
                aria-label={$_("dashboard.alerts.deleteAlert")}
                onclick={() => onDelete(row.id)}
            >
                ×
            </button>
        </div>
    </div>

    {#if row.sentence !== null}
        <!--
          FEAT-0543 — native details for the keyboard contract and the
          disclosure semantics; the content is prepared, not mapped in the
          template.
        -->
        <details class="row-details">
            <summary aria-label={`${row.symbol}: ${$_("dashboard.alerts.configuration")}`}>
                {$_("dashboard.alerts.configuration")}
            </summary>
            {#if row.sentence}
                <p class="detail-sentence">{row.sentence}</p>
            {/if}
            <dl class="detail-grid">
                {#if row.timeframe}
                    <dt>{$_("dashboard.alerts.panel.timeframe")}</dt>
                    <dd>{row.timeframe}</dd>
                {/if}
                <dt>{$_("dashboard.alerts.panel.evaluationMode")}</dt>
                <dd>{evaluationLabel}</dd>
                <dt>{$_("dashboard.alerts.panel.lifecycle.frequency")}</dt>
                <dd>{frequencyLabel}</dd>
                {#if validUntil}
                    <dt>{$_("dashboard.alerts.panel.lifecycle.validUntil")}</dt>
                    <dd>{validUntil}</dd>
                {/if}
                {#if channels}
                    <dt>{$_("common.channels")}</dt>
                    <dd>{channels}</dd>
                {/if}
                {#if row.note}
                    <dt>{$_("dashboard.alerts.panel.lifecycle.note")}</dt>
                    <dd>{row.note}</dd>
                {/if}
            </dl>
        </details>
    {/if}
</div>

<style>
    .alert-item {
        display: flex;
        flex-direction: column;
        align-items: stretch;
        gap: var(--space-2);
        padding: var(--space-3);
        background: var(--bg-secondary);
        border-radius: var(--radius-sm);
        border-left: 3px solid var(--accent-color);
    }
    .spent-item {
        border-left-color: var(--text-secondary);
        opacity: 0.85;
    }
    .row-main {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: var(--space-2);
    }
    .alert-info {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        min-width: 0;
    }
    .row-title {
        display: flex;
        align-items: baseline;
        flex-wrap: wrap;
        gap: var(--space-2);
    }
    .kind-chip {
        padding: 0 var(--space-1);
        border: 1px solid var(--border-color);
        border-radius: var(--radius-sm);
        color: var(--text-secondary);
        font-size: 0.65rem;
        text-transform: uppercase;
        letter-spacing: 0.04em;
    }
    .rule-name {
        color: var(--text-secondary);
        font-size: 0.8rem;
    }
    .sentence {
        margin: 0;
        color: var(--text-primary);
        font-size: 0.85rem;
        line-height: 1.4;
    }
    .row-meta {
        display: flex;
        flex-wrap: wrap;
        gap: var(--space-2);
        color: var(--text-secondary);
        font-size: 0.75rem;
    }
    /* Text, not colour alone: the word is the state. */
    .status-badge {
        padding: 0 var(--space-2);
        border-radius: var(--radius-sm);
        background: var(--bg-tertiary, var(--bg-secondary));
        font-size: 0.7rem;
        text-transform: uppercase;
        letter-spacing: 0.04em;
    }
    .status-armed {
        color: var(--accent-color);
    }
    .status-expired {
        color: var(--text-secondary);
    }
    .status-suspended {
        color: var(--warning-color, var(--text-secondary));
    }
    .status-fired {
        color: var(--success-color);
    }
    .fired-count {
        color: var(--text-secondary);
        font-size: 0.7rem;
    }
    .broken-badge {
        align-self: flex-start;
        padding: 0 var(--space-2);
        border-radius: var(--radius-sm);
        background: var(--bg-tertiary, var(--bg-secondary));
        color: var(--danger-color);
        font-size: 0.7rem;
        text-transform: uppercase;
        letter-spacing: 0.04em;
    }
    .suspended-badge {
        align-self: flex-start;
        color: var(--warning-color, var(--text-secondary));
        font-size: 0.75rem;
    }
    .suspended-reason {
        color: var(--text-secondary);
        font-size: 0.75rem;
    }
    .row-actions {
        display: flex;
        align-items: center;
        gap: var(--space-1);
        flex-shrink: 0;
    }
    .pause-btn,
    .duplicate-btn,
    .edit-btn {
        background: none;
        border: none;
        color: var(--text-secondary);
        font-size: var(--text-xl);
        cursor: pointer;
    }
    .pause-btn:hover,
    .duplicate-btn:hover,
    .edit-btn:hover {
        color: var(--accent-color);
    }
    .delete-btn {
        background: none;
        border: none;
        color: var(--danger-color);
        font-size: var(--text-2xl);
        cursor: pointer;
    }
    .row-details {
        border-top: 1px solid var(--border-color);
        padding-top: var(--space-2);
    }
    .row-details summary {
        color: var(--text-secondary);
        cursor: pointer;
        font-size: 0.8rem;
    }
    .detail-sentence {
        margin: var(--space-2) 0 0;
        color: var(--text-primary);
        font-size: 0.8rem;
        line-height: 1.5;
    }
    .detail-grid {
        display: grid;
        grid-template-columns: max-content 1fr;
        gap: 0.25rem var(--space-3);
        margin: var(--space-2) 0 0;
        font-size: 0.8rem;
    }
    .detail-grid dt {
        color: var(--text-secondary);
    }
    .detail-grid dd {
        margin: 0;
        color: var(--text-primary);
        overflow-wrap: anywhere;
    }
</style>
