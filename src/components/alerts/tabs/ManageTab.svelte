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
  FEAT-0389 -- the Manage tab of the Super-Alert panel: armed alerts, history,
  and the two cutover notices, moved across from AlertDefinitionsModal with
  their behaviour unchanged.

  The quick-add form comes along deliberately. The builder tabs are separate
  items (FEAT-0390 owns price conditions), and shipping the panel without any
  way to arm an alarm would be a regression dressed as a redesign. It leaves
  when the Price tab lands, not before.

  The engine-failed banner is NOT here: it belongs to the shell, so it stays on
  screen whichever tab is open. A banner that disappears when the trader
  switches tabs is the BUG-0382 gap re-opened one tab at a time.
-->

<script lang="ts">
    import { alertState } from "../../../stores/alerts.svelte";
    import { _ } from "../../../locales/i18n";
    import { generateId } from "../../../utils/utils";
    import {
        acknowledgeCutoverNotice,
        shouldShowCutoverNotice,
    } from "../../../services/alertEngine/cutoverNotice";
    import { uiState } from "../../../stores/ui.svelte";
    import { untrack } from "svelte";

    let { symbol = "BTCUSDT" }: { symbol?: string } = $props();

    let listTab = $state<"active" | "history">("active");

    // Read once when the tab mounts, not derived from the alert list: the
    // notice must not vanish mid-read because the trader deleted the last
    // covered alert while it was on screen.
    let showCutoverNotice = $state(false);
    shouldShowCutoverNotice().then((shouldShow) => {
        showCutoverNotice = shouldShow;
    });

    function dismissCutoverNotice() {
        acknowledgeCutoverNotice();
        showCutoverNotice = false;
    }

    // Seeded from the panel header once, then the trader's to edit. untrack()
    // states that on purpose: re-seeding on every header keystroke would
    // overwrite a symbol they had already typed here.
    let newAlertSymbol = $state(untrack(() => symbol));
    let newAlertPrice = $state("");

    let activeAlerts = $derived(alertState.definitions.filter((a) => a.active));
    let historyAlerts = $derived(alertState.definitions.filter((a) => !a.active));

    function formatCondition(condition: Record<string, unknown>) {
        if (condition.price_cross_up)
            return `${$_("dashboard.alerts.crossesUp")} ${condition.price_cross_up}`;
        if (condition.price_cross_down)
            return `${$_("dashboard.alerts.crossesDown")} ${condition.price_cross_down}`;
        if (condition.price_reached)
            return `${$_("dashboard.alerts.reaches")} ${condition.price_reached}`;
        return JSON.stringify(condition);
    }

    function createAlert() {
        if (!newAlertPrice || isNaN(Number(newAlertPrice))) return;
        alertState.addAlert({
            id: generateId(),
            symbol: newAlertSymbol,
            condition: { price_reached: newAlertPrice.toString() },
            active: true,
        });
        newAlertPrice = "";
        uiState.showToast($_("dashboard.alerts.createSuccess"), "success");
    }
</script>

<!--
  FEAT-0387: migrated alerts are evaluated on 1m candle close instead of per
  tick. Shown here rather than as a startup toast because this is the screen a
  trader is on when they think about their alarms.
-->
{#if showCutoverNotice}
    <div class="cutover-notice" role="status">
        <h4>{$_("dashboard.alerts.cutoverNoticeTitle")}</h4>
        <p>{$_("dashboard.alerts.cutoverNoticeBody")}</p>
        <button class="cutover-dismiss" onclick={dismissCutoverNotice}>
            {$_("dashboard.alerts.cutoverNoticeDismiss")}
        </button>
    </div>
{/if}

<!--
  FEAT-0387 cutover -- the "report" half of suspend-and-report
  (reconcileOrphanedRules.ts). Not dismissible and not derived once: `withheld`
  names alarms still armed despite unresolved doubt, and a trader has to see
  that for as long as it is true.
-->
{#if alertState.orphanReport && (alertState.orphanReport.suspended.length > 0 || alertState.orphanReport.withheld.length > 0)}
    <div
        class="engine-warning"
        role={alertState.orphanReport.withheld.length > 0 ? "alert" : "status"}
    >
        {#if alertState.orphanReport.suspended.length > 0}
            <p>
                {$_("dashboard.alerts.orphanSuspendedHint", {
                    values: { count: alertState.orphanReport.suspended.length },
                })}
            </p>
        {/if}
        {#if alertState.orphanReport.withheld.length > 0}
            <p>
                {$_("dashboard.alerts.orphanWithheldHint", {
                    values: { count: alertState.orphanReport.withheld.length },
                })}
            </p>
        {/if}
    </div>
{/if}

<div class="alert-form">
    <h4>{$_("dashboard.alerts.addAlert")}</h4>
    <div class="input-group">
        <input
            type="text"
            bind:value={newAlertSymbol}
            placeholder={$_("dashboard.alerts.symbol")}
            aria-label={$_("dashboard.alerts.symbol")}
            class="form-input"
        />
        <input
            type="number"
            bind:value={newAlertPrice}
            placeholder={$_("dashboard.alerts.priceLimit")}
            aria-label={$_("dashboard.alerts.priceLimit")}
            class="form-input"
        />
        <button class="add-btn" aria-label={$_("dashboard.alerts.addAlert")} onclick={createAlert}>
            +
        </button>
    </div>
</div>

<div class="list-tabs" role="tablist">
    <button
        role="tab"
        aria-selected={listTab === "active"}
        class:active={listTab === "active"}
        onclick={() => (listTab = "active")}
    >
        {$_("dashboard.alerts.active")}
    </button>
    <button
        role="tab"
        aria-selected={listTab === "history"}
        class:active={listTab === "history"}
        onclick={() => (listTab = "history")}
    >
        {$_("dashboard.alerts.history")}
    </button>
</div>

<div class="alert-list">
    {#each listTab === "active" ? activeAlerts : historyAlerts as alert (alert.id)}
        <div class="alert-item" class:history-item={listTab === "history"}>
            <div class="alert-info">
                <strong>{alert.symbol}</strong>
                <span>{formatCondition(alert.condition)}</span>
                {#if listTab === "history"}
                    <span class="fired-badge">{$_("dashboard.alerts.fired")}</span>
                {/if}
            </div>
            <button
                class="delete-btn"
                aria-label={$_("dashboard.alerts.deleteAlert")}
                onclick={() => alertState.removeAlert(alert.id)}
            >
                ×
            </button>
        </div>
    {:else}
        <div class="empty-state">
            {listTab === "active"
                ? $_("dashboard.alerts.noActive")
                : $_("dashboard.alerts.noHistory")}
        </div>
    {/each}
</div>

<style>
    .engine-warning {
        margin-bottom: var(--space-4);
        padding: var(--space-3);
        background: var(--bg-secondary);
        border-radius: var(--radius-sm);
        border-left: 3px solid var(--warning-color, var(--border-color));
        color: var(--text-primary);
        font-size: 0.85rem;
    }
    .cutover-notice {
        margin-bottom: var(--space-4);
        padding: var(--space-3);
        background: var(--bg-secondary);
        border-radius: var(--radius-sm);
        border-left: 3px solid var(--accent-color, var(--border-color));
        color: var(--text-primary);
        font-size: 0.85rem;
    }
    .cutover-notice h4 {
        margin: 0 0 var(--space-2) 0;
        font-size: 0.9rem;
    }
    .cutover-notice p {
        margin: 0 0 var(--space-3) 0;
        color: var(--text-secondary);
        line-height: 1.5;
    }
    .cutover-dismiss {
        padding: var(--space-1) var(--space-3);
        background: transparent;
        color: var(--text-primary);
        border: 1px solid var(--border-color);
        border-radius: var(--radius-sm);
        cursor: pointer;
        font-size: 0.8rem;
    }
    .cutover-dismiss:hover {
        background: var(--bg-tertiary, var(--bg-secondary));
    }
    .alert-form {
        margin-bottom: var(--space-4);
        padding: var(--space-3);
        background: var(--bg-secondary);
        border-radius: var(--radius-sm);
        border: 1px solid var(--border);
    }
    .alert-form h4 {
        margin: 0 0 var(--space-2) 0;
        font-size: 0.9rem;
        color: var(--text-secondary);
    }
    .input-group {
        display: flex;
        gap: 0.5rem;
    }
    .form-input {
        flex: 1;
        min-width: 0;
        background: var(--bg-primary);
        border: 1px solid var(--border);
        color: var(--text-primary);
        padding: var(--space-2);
        border-radius: var(--radius-sm);
    }
    .add-btn {
        background: var(--accent);
        color: var(--bg-primary);
        border: none;
        padding: 0 var(--space-4);
        border-radius: var(--radius-sm);
        cursor: pointer;
        font-weight: var(--font-bold);
    }
    .list-tabs {
        display: flex;
        gap: var(--space-2);
        margin-bottom: var(--space-3);
        border-bottom: 1px solid var(--border);
    }
    .list-tabs button {
        background: none;
        border: none;
        padding: var(--space-2) var(--space-3);
        color: var(--text-secondary);
        cursor: pointer;
    }
    .list-tabs button.active {
        color: var(--text-primary);
        border-bottom: 2px solid var(--accent);
    }
    .alert-list {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }
    .alert-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: var(--space-3);
        background: var(--bg-secondary);
        border-radius: var(--radius-sm);
        border-left: 3px solid var(--accent);
    }
    .history-item {
        border-left-color: var(--text-muted);
        opacity: 0.8;
    }
    .alert-info {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        min-width: 0;
    }
    .fired-badge {
        font-size: 0.7rem;
        color: var(--success);
        text-transform: uppercase;
        font-weight: var(--font-bold);
    }
    .delete-btn {
        background: none;
        border: none;
        color: var(--danger);
        font-size: var(--text-2xl);
        cursor: pointer;
    }
    .empty-state {
        text-align: center;
        color: var(--text-secondary);
        padding: var(--space-6);
    }
</style>
