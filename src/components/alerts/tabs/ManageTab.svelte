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

  The quick-add form has left: FEAT-0390's Price tab now builds price
  conditions, so the stop-gap that kept the panel usable while it was still a
  placeholder has nothing left to do. This tab lists and manages; it does not
  author.

  The engine-failed banner is NOT here: it belongs to the shell, so it stays on
  screen whichever tab is open. A banner that disappears when the trader
  switches tabs is the BUG-0382 gap re-opened one tab at a time.
-->

<script lang="ts">
    import { alertState } from "../../../stores/alerts.svelte";
    import { _ } from "../../../locales/i18n";
    import {
        acknowledgeCutoverNotice,
        shouldShowCutoverNotice,
    } from "../../../services/alertEngine/cutoverNotice";
    import { alarmRows } from "../../../services/alertEngine/ruleLifecycleView";
    import { removeRule } from "../../../services/alertEngine/armRule";

    // Declared to satisfy the shell's tab contract, unused since the quick-add
    // form left: this tab lists armed rules, which it reads from the store
    // rather than from the header's symbol.
    let { symbol: _symbol }: { symbol?: string } = $props();

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


    /*
      FEAT-0399 -- read from `cachy_rules_v1`, the store the evaluation loop
      actually reads. Until this item the list came from `cachy_alerts_v1`
      while the panel armed rules, so an alarm armed here never appeared in
      it at all.

      `alertState.rulesVersion` is the dependency: the rule set lives in
      localStorage, which no rune observes, so every path that writes it bumps
      that counter and this re-derives.
    */
    let rows = $derived.by(() => {
        void alertState.rulesVersion;
        return alarmRows();
    });

    /*
      FEAT-0393 AC 2 -- a rule past its validity period stays in the active
      list with an "expired" badge rather than dropping into history, where
      every row reads "fired". A setup that lapsed untriggered is not one that
      paid off, and a trader deciding whether the level held must not be told
      the wrong one.
    */
    let activeAlerts = $derived(rows.filter((r) => r.status !== "fired"));
    let historyAlerts = $derived(rows.filter((r) => r.status === "fired"));

    /*
      BUG-0485 -- the loop's inert record, keyed by rule id so each row can
      ask about itself. Read from `alertState`, which the loop feeds through
      its subscriber: the store's rule set lives in localStorage and cannot
      carry this, and the loop stays store-free by design.
    */
    let brokenById = $derived(new Map(alertState.unevaluableReport.map((r) => [r.ruleId, r])));

    const OP_KEYS = {
        gte: "dashboard.alerts.reaches",
        gt: "dashboard.alerts.crossesUp",
        lte: "dashboard.alerts.reaches",
        lt: "dashboard.alerts.crossesDown",
        eq: "dashboard.alerts.reaches",
        neq: "dashboard.alerts.reaches",
    } as const;

    function formatCondition(row: { op?: keyof typeof OP_KEYS; threshold?: string }) {
        // A rule whose conditions this list cannot phrase still gets a row:
        // the trader has to be able to see and delete what they armed.
        if (row.threshold === undefined || row.op === undefined) return "";
        return `${$_(OP_KEYS[row.op])} ${row.threshold}`;
    }

    function deleteRow(id: string) {
        removeRule(id);
        alertState.rulesVersion += 1;
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

<!--
  FEAT-0399 -- the legacy alert path is gone, so an alert that never became a
  rule no longer evaluates anywhere. Named rather than counted: the trader
  cannot re-arm what the app will not tell them it dropped. `unreadable` gets
  its own line because "could not verify" must never be shown as "verified".
-->
{#if alertState.legacyMigrationReport && alertState.legacyMigrationReport.verdict !== "clean"}
    <div class="engine-warning" role="alert">
        {#if alertState.legacyMigrationReport.verdict === "unmigrated"}
            <p>
                {$_("dashboard.alerts.legacyUnmigratedHint", {
                    values: { count: alertState.legacyMigrationReport.unmigrated.length },
                })}
            </p>
        {:else}
            <p>{$_("dashboard.alerts.legacyUnverifiedHint")}</p>
        {/if}
    </div>
{/if}

<!--
  FEAT-0029 drawing reconciliation -- the "report" half of suspend-and-report
  (reconcileDrawingRules.ts). Same shape as the orphan banner above: a rule
  disabled because its drawing was deleted must say so in the panel, and a
  rule left armed because the drawing store proved nothing must stay visible
  for as long as it is true.
-->
{#if alertState.drawingReport && (alertState.drawingReport.suspended.length > 0 || alertState.drawingReport.withheld.length > 0)}
    <div
        class="engine-warning"
        role={alertState.drawingReport.withheld.length > 0 ? "alert" : "status"}
    >
        {#if alertState.drawingReport.suspended.length > 0}
            <p>
                {$_("dashboard.alerts.drawingSuspendedHint", {
                    values: { count: alertState.drawingReport.suspended.length },
                })}
            </p>
        {/if}
        {#if alertState.drawingReport.withheld.length > 0}
            <p>
                {$_("dashboard.alerts.drawingWithheldHint", {
                    values: { count: alertState.drawingReport.withheld.length },
                })}
            </p>
        {/if}
    </div>
{/if}

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
    {#each listTab === "active" ? activeAlerts : historyAlerts as row (row.id)}
        {@const broken = brokenById.get(row.id)}
        <div class="alert-item" class:history-item={listTab === "history"}>
            <div class="alert-info">
                <strong>{row.symbol}</strong>
                <span>{formatCondition(row)}</span>
                <!--
                  BUG-0485 -- a rule that cannot fire belongs next to the
                  rule, not in a separate report. The badge text is
                  localised; the title carries the developer-facing reason
                  (indicator, drawing, timeframe) as the detail.
                -->
                {#if broken}
                    <span class="broken-badge" title={broken.reason}>
                        {$_("dashboard.alerts.brokenRule.badge")}
                    </span>
                {:else if row.status === "expired"}
                    <span class="expired-badge" title={$_("dashboard.alerts.expiredHint")}>
                        {$_("dashboard.alerts.expired")}
                    </span>
                {:else if listTab === "history"}
                    <span class="fired-badge">{$_("dashboard.alerts.fired")}</span>
                {/if}
            </div>
            <button
                class="delete-btn"
                aria-label={$_("dashboard.alerts.deleteAlert")}
                onclick={() => deleteRow(row.id)}
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
    .list-tabs {
        display: flex;
        gap: var(--space-2);
        margin-bottom: var(--space-3);
        border-bottom: 1px solid var(--border-color);
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
        border-bottom: 2px solid var(--accent-color);
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
        border-left: 3px solid var(--accent-color);
    }
    .history-item {
        border-left-color: var(--text-secondary);
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
        color: var(--success-color);
        text-transform: uppercase;
        font-weight: var(--font-bold);
    }
    /* BUG-0485: reads as broken, not as lapsed — the danger colour is the
       distinction from the expired badge above. */
    .broken-badge {
        margin-left: var(--space-2);
        padding: 0 var(--space-2);
        border-radius: var(--radius-sm);
        background: var(--bg-tertiary, var(--bg-secondary));
        color: var(--danger-color);
        font-size: 0.7rem;
        text-transform: uppercase;
        letter-spacing: 0.04em;
    }
    /* Reads as a lapse, not a success: an expired alert never fired. */
    .expired-badge {
        margin-left: var(--space-2);
        padding: 0 var(--space-2);
        border-radius: var(--radius-sm);
        background: var(--bg-tertiary, var(--bg-secondary));
        color: var(--text-secondary);
        font-size: 0.7rem;
        text-transform: uppercase;
        letter-spacing: 0.04em;
    }
    .delete-btn {
        background: none;
        border: none;
        color: var(--danger-color);
        font-size: var(--text-2xl);
        cursor: pointer;
    }
    .empty-state {
        text-align: center;
        color: var(--text-secondary);
        padding: var(--space-6);
    }
</style>
