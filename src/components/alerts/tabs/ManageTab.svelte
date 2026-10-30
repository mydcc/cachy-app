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
  FEAT-0747 — the Manage tab: the operating list of armed rules and the firing
  log beside it.

  FEAT-0389 moved this tab across from the old modal; FEAT-0542/0543/0746 gave
  its rows edit, full configuration and pause/duplicate. What was still missing
  was the overview: one hard-coded Active/History split, a symbol and a
  fragment of a price comparison per row, and no way to answer "what fired?".

  The tab owns the banners and the actions; the rows, the filters and the log
  are components, and the filtering lives in `manageView.ts` so that neither
  the template nor the test has to mount this file to prove it.

  The engine-failed banner stays on the shell (`AlertPanelView`), not here.
-->

<script lang="ts">
    import { alertState } from "../../../stores/alerts.svelte";
    import { _, locale } from "../../../locales/i18n";
    import { intlTagFor } from "../../../lib/i18n/intlTag";
    import {
        acknowledgeCutoverNotice,
        shouldShowCutoverNotice,
    } from "../../../services/alertEngine/cutoverNotice";
    import { alarmRows } from "../../../services/alertEngine/ruleLifecycleView";
    import { removeRule } from "../../../services/alertEngine/armRule";
    import {
        duplicateRule,
        setRuleEnabled,
        type DuplicateRefusal,
        type SetRuleEnabledReason,
    } from "../../../services/alertEngine/ruleActions";
    import { readDrawingAnchorLedger } from "../../../services/alertEngine/drawingAnchors";
    import { readShadowLedger } from "../../../services/alertEngine/shadowLedger";
    import { readBotLogRows } from "../../../services/alertEngine/botStore";
    import {
        ruleEffectiveChannels,
        sendTestAnnouncement,
    } from "../../../stores/alertDelivery";
    import { channelsLabel } from "../../../lib/alerts/lifecycleLabels";
    import { alertPanelState } from "../../../stores/alertPanel.svelte";
    import { uiState } from "../../../stores/ui.svelte";
    import type { SentenceTranslator } from "../../../lib/rules/ruleSentence";
    import type { TranslationKey } from "../../../locales/schema";
    import AlertFilters from "../manage/AlertFilters.svelte";
    import AlertRow from "../manage/AlertRow.svelte";
    import FiringLog from "../manage/FiringLog.svelte";
    import {
        buildFiringLog,
        buildManageRows,
        filterManageRows,
        lastFiringByRule,
        NO_FILTERS,
        ruleNameOf,
        sortManageRows,
        timeframeOptions,
        type ManageFilters,
        type ManageRow,
        type ManageSort,
    } from "../manage/manageView";

    // Declared to satisfy the shell's tab contract, unused: this tab lists
    // armed rules, which it reads from the store rather than from the header's
    // symbol.
    let { symbol: _symbol }: { symbol?: string } = $props();

    let listTab = $state<"alerts" | "log">("alerts");

    /** Unique per mount: two panels must not share tab/panel ids. */
    const instanceId = $props.id();

    /**
     * Arrow keys move between the two tabs, as the tab pattern promises.
     * Home/End are omitted because there are only two, and both are reachable
     * with a single arrow either way.
     */
    function onTabKeydown(event: KeyboardEvent) {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
        event.preventDefault();
        const next = listTab === "alerts" ? "log" : "alerts";
        listTab = next;
        // Focus follows selection; the id is the one rendered below.
        document.getElementById(`manage-tab-${instanceId}-${next}`)?.focus();
    }
    let query = $state("");
    let filters = $state<ManageFilters>(NO_FILTERS);
    let sort = $state<ManageSort>("symbol");

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

    const translator: SentenceTranslator = (key, values) =>
        $_(key as TranslationKey, values ? { values } : undefined);

    const DUPLICATE_REFUSAL_KEYS: Record<DuplicateRefusal, TranslationKey> = {
        unknown: "dashboard.alerts.editMissing",
        bot: "dashboard.alerts.duplicateBot",
        unreadable: "dashboard.alerts.duplicateUnreadable",
        "anchor-failed": "dashboard.alerts.duplicateAnchorFailed",
        invalid: "dashboard.alerts.duplicateInvalid",
        "core-unavailable": "dashboard.alerts.duplicateUnavailable",
    };

    const SET_ENABLED_KEYS: Record<SetRuleEnabledReason, TranslationKey> = {
        unknown: "dashboard.alerts.editMissing",
        bot: "dashboard.alerts.editNotEditable",
        unreadable: "dashboard.alerts.editUnreadable",
        conflict: "dashboard.alerts.ruleChanged",
        "write-failed": "dashboard.alerts.editUnreadable",
    };

    const intlTag = $derived(intlTagFor($locale));
    const dateFormatter = $derived(
        new Intl.DateTimeFormat(intlTag, {
            dateStyle: "medium",
            timeStyle: "short",
        }),
    );

    /*
      FEAT-0399 → FEAT-0747. Three dependencies, each for a distinct write:

      - `rulesVersion` — the rule set lives in localStorage, which no rune
        observes, so every path that writes it bumps that counter.
      - `firingsVersion` — an announcement writes the ledger and, for a
        repeating rule, touches no rule at all; without this the log would
        freeze on the very rules it exists to show.
      - `locale` — the sentences the row renders are built here.
    */
    let records = $derived.by(() => {
        void alertState.firingsVersion;
        return readShadowLedger().records;
    });

    let lastFiring = $derived(lastFiringByRule(records));

    let baseRows = $derived.by<ManageRow[]>(() => {
        void alertState.rulesVersion;
        const drawings = readDrawingAnchorLedger();
        const drawingIds = new Set(Object.keys(drawings.ledger));
        return buildManageRows(alarmRows(), drawingIds, translator, lastFiring);
    });

    let visibleRows = $derived(
        sortManageRows(filterManageRows(baseRows, filters, query), sort),
    );

    // Bots fire through the same sink but never appear in `alarmRows`, so the
    // log needs them separately: otherwise an active bot reads as deleted, and
    // a bot whose ledger write failed disappears.
    let botRows = $derived.by(() => {
        void alertState.rulesVersion;
        return readBotLogRows();
    });
    let logEntries = $derived(buildFiringLog(records, baseRows, botRows));
    let timeframeChoices = $derived(timeframeOptions(baseRows));

    /*
      BUG-0485 -- the loop's inert record, keyed by rule id so each row can
      ask about itself. Read from `alertState`, which the loop feeds through
      its subscriber: the store's rule set lives in localStorage and cannot
      carry this, and the loop stays store-free by design.
    */
    let brokenById = $derived(
        new Map(alertState.unevaluableReport.map((report) => [report.ruleId, report])),
    );

    /**
     * BUG-0755 — why a suspended rule was disabled, as far as the reports
     * that did it can say. A rule disabled by the firing path has no entry in
     * either report; the generic hint is the honest answer there.
     */
    function suspendedReason(id: string): string | null {
        if (alertState.drawingReport?.suspended.includes(id)) {
            return $_("dashboard.alerts.suspendedDrawing");
        }
        if (alertState.orphanReport?.suspended.includes(id)) {
            return $_("dashboard.alerts.suspendedOrphan");
        }
        return null;
    }

    /**
     * FEAT-0748 — one labelled test to the channels this rule would use. The
     * service owns the body and the delivery; nothing here touches rule state,
     * so pressing it cannot spend a `once` rule.
     */
    function testRow(row: ManageRow) {
        const channels = ruleEffectiveChannels(row.rule);
        const outcome = sendTestAnnouncement(row.rule);
        // A toast is the only acknowledgement an external-only set produces:
        // the in-app channel is by definition not part of it.
        const label = channelsLabel(channels, $_);
        uiState.showToast(
            outcome.duplicate
                ? $_("dashboard.alerts.panel.lifecycle.testSuppressed")
                : $_("dashboard.alerts.panel.lifecycle.testDispatched", {
                      values: { channels: label },
                  }),
            "info",
        );
    }

    function deleteRow(id: string) {
        removeRule(id);
        alertState.rulesVersion += 1;
    }

    /**
     * FEAT-0542 — load the row's rule into the builder that owns it.
     *
     * The button only exists for rows `alarmRows()` returned, so a failure
     * here is a race (the rule vanished), a non-notification rule promoted
     * between render and click, or a rule store / drawing ledger that cannot
     * be read. Each needs its own toast: a click that opens nothing is
     * otherwise indistinguishable from a broken button.
     */
    function editRow(id: string) {
        const outcome = alertPanelState.loadForEdit(id);
        switch (outcome) {
            case "loaded":
                // The button that had focus belongs to the tab that just
                // unmounted. Move focus into the panel so its Tab trap keeps
                // the keyboard user inside it instead of dropping to <body>.
                document.getElementById("alert-tab-panel")?.focus();
                return;
            case "unreadable":
                uiState.showToast($_("dashboard.alerts.editUnreadable"), "error");
                return;
            case "bot":
                uiState.showToast($_("dashboard.alerts.editNotEditable"), "error");
                return;
            case "missing":
                uiState.showToast($_("dashboard.alerts.editMissing"), "error");
                return;
        }
    }

    /**
     * FEAT-0746 — pause/resume writes only `enabled`; the store keeps the
     * anchors, so resuming cannot replay a candle the rule already saw.
     */
    function toggleRow(row: ManageRow) {
        const result = setRuleEnabled(row.id, !row.enabled);
        if (!result.ok) {
            uiState.showToast($_(SET_ENABLED_KEYS[result.reason]), "error");
            return;
        }
        alertState.rulesVersion += 1;
    }

    /**
     * FEAT-0746 — the copy starts paused, with a fresh id and a provenance
     * link to the source hash. The UI composes the localised name, including
     * the "(copy)" suffix; the store carries the string but no locale logic.
     */
    function duplicateRow(row: ManageRow) {
        const baseName = ruleNameOf(row.rule) ?? row.symbol;
        const name = $_("dashboard.alerts.copyName", { values: { name: baseName } });
        const result = duplicateRule(row.id, name);
        if (!result.ok) {
            uiState.showToast($_(DUPLICATE_REFUSAL_KEYS[result.reason]), "error");
            return;
        }
        alertState.rulesVersion += 1;
        uiState.showToast($_("dashboard.alerts.duplicated"), "success");
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
        <button type="button" class="cutover-dismiss" onclick={dismissCutoverNotice}>
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
        type="button"
        role="tab"
        id="manage-tab-{instanceId}-alerts"
        aria-controls={listTab === "alerts" ? `manage-panel-${instanceId}-alerts` : undefined}
        aria-selected={listTab === "alerts"}
        tabindex={listTab === "alerts" ? 0 : -1}
        class:active={listTab === "alerts"}
        onclick={() => (listTab = "alerts")}
        onkeydown={onTabKeydown}
    >
        {$_("dashboard.alerts.manageList.tabAlerts", { values: { count: visibleRows.length } })}
    </button>
    <button
        type="button"
        role="tab"
        id="manage-tab-{instanceId}-log"
        aria-controls={listTab === "log" ? `manage-panel-${instanceId}-log` : undefined}
        aria-selected={listTab === "log"}
        tabindex={listTab === "log" ? 0 : -1}
        class:active={listTab === "log"}
        onclick={() => (listTab = "log")}
        onkeydown={onTabKeydown}
    >
        {$_("dashboard.alerts.manageList.tabLog", { values: { count: logEntries.length } })}
    </button>
</div>

{#if listTab === "alerts"}
    <div
        role="tabpanel"
        id="manage-panel-{instanceId}-alerts"
        aria-labelledby="manage-tab-{instanceId}-alerts"
        tabindex="0"
    >
    <AlertFilters
        bind:query
        bind:filters
        bind:sort
        timeframes={timeframeChoices}
    />

    <div class="alert-list">
        {#if baseRows.length === 0}
            <div class="empty-state">
                {$_("dashboard.alerts.manageList.emptyAlerts")}
            </div>
        {:else if visibleRows.length === 0}
            <div class="empty-state">
                {$_("dashboard.alerts.manageList.noMatches")}
            </div>
        {:else}
            {#each visibleRows as row (row.id)}
                <AlertRow
                    {row}
                    broken={brokenById.get(row.id)}
                    suspendedReason={suspendedReason(row.id)}
                    {dateFormatter}
                    onToggle={toggleRow}
                    onEdit={editRow}
                    onDuplicate={duplicateRow}
                    onDelete={deleteRow}
                    onTest={testRow}
                />
            {/each}
        {/if}
    </div>
    </div>
{:else}
    <div
        role="tabpanel"
        id="manage-panel-{instanceId}-log"
        aria-labelledby="manage-tab-{instanceId}-log"
        tabindex="0"
    >
        <FiringLog entries={logEntries} {dateFormatter} onOpenRule={editRow} />
    </div>
{/if}

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
    .empty-state {
        text-align: center;
        color: var(--text-secondary);
        padding: var(--space-6);
    }
</style>
