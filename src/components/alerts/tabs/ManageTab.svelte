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
    import { _, locale } from "../../../locales/i18n";
    import { intlTagFor } from "../../../lib/i18n/intlTag";
    import {
        acknowledgeCutoverNotice,
        shouldShowCutoverNotice,
    } from "../../../services/alertEngine/cutoverNotice";
    import {
        alarmRows,
        type AlarmRow,
        type StoredRule,
    } from "../../../services/alertEngine/ruleLifecycleView";
    import { removeRule } from "../../../services/alertEngine/armRule";
    import { alertPanelState } from "../../../stores/alertPanel.svelte";
    import { uiState } from "../../../stores/ui.svelte";
    import {
        renderRuleSentence,
        type SentenceTranslator,
    } from "../../../lib/rules/ruleSentence";
    import {
        EVALUATION_KEYS,
        FREQUENCY_KEYS,
        METHOD_KEYS,
    } from "../../../lib/alerts/lifecycleLabels";
    import type { RuleDocument } from "../../../lib/rules/types";
    import type { TranslationKey } from "../../../locales/schema";
    import { logger } from "../../../services/logger";

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

      `alertState.rulesVersion` is the dependency that matters: the rule set
      lives in localStorage, which no rune observes, so every path that writes
      it bumps that counter and this re-derives. FEAT-0543 added one ordinary
      dependency beside it — the locale, because the detail's labels and dates
      are built here.

      FEAT-0543 -- the expandable detail needs the stored document, so the
      sentence and the locale-dependent metadata are prepared in this same
      derivation rather than mapped over inside the template.
    */
    interface DetailRow extends AlarmRow {
        sentence: string | null;
        timeframe: string;
        evaluation: string;
        frequency: string;
        validUntil: string;
        channels: string;
    }

    const translator: SentenceTranslator = (key, values) =>
        $_(key as TranslationKey, values ? { values } : undefined);

    const intlTag = $derived(intlTagFor($locale));
    const dateFormatter = $derived(
        new Intl.DateTimeFormat(intlTag, {
            dateStyle: "medium",
            timeStyle: "short",
        }),
    );

    /**
     * A translated option label, falling back to the stored value.
     *
     * A rule arrives from `JSON.parse` without validation. An unknown enum
     * value must not become an empty `<dd>` (or a missing-message warning on
     * every render) — the raw value tells the trader what is stored.
     */
    function optionLabel<T extends string>(
        map: Record<T, TranslationKey>,
        value: T | undefined,
        fallback: T,
    ): string {
        const stored = value ?? fallback;
        const key = (map as Record<string, TranslationKey | undefined>)[stored];
        return key ? $_(key) : stored;
    }

    /** Empty means the notification policy decides; unknown methods stay raw. */
    function channelsFor(rule: StoredRule): string {
        const methods = Array.isArray(rule.trigger_methods)
            ? rule.trigger_methods
            : [];
        return methods
            .map((method) => {
                const key = (METHOD_KEYS as Record<string, TranslationKey | undefined>)[
                    method
                ];
                return key ? $_(key) : String(method);
            })
            .join(", ");
    }

    function formatValidUntil(
        ms: number | undefined,
        formatter: Intl.DateTimeFormat,
    ): string {
        if (typeof ms !== "number" || !Number.isFinite(ms)) return "";
        return formatter.format(new Date(ms));
    }

    /**
     * A malformed entry is listable so it can be deleted (`alarmRows`
     * tolerates it), but it cannot always be phrased. `renderRuleSentence`
     * dereferences the condition graph (`group.of`, `compare.left`, indicator
     * params) and reads `action` for its lead, so the guard only proves the
     * outermost shape; the caller catches the rest per row rather than letting
     * one hand-edited rule take the whole list down.
     *
     * A pre-`action` legacy rule meant `notify`, so the display copy gets the
     * same fill `loadForEdit` applies rather than losing its detail.
     */
    const PHRASABLE_KINDS = new Set([
        "compare",
        "cross",
        "pattern",
        "position",
        "account",
        "group",
    ]);

    function sentenceFor(rule: StoredRule): string | null {
        const conditions = rule.conditions as { kind?: unknown } | null | undefined;
        if (
            !conditions ||
            typeof conditions !== "object" ||
            typeof conditions.kind !== "string" ||
            !PHRASABLE_KINDS.has(conditions.kind)
        ) {
            return null;
        }
        const display = (
            rule.action
                ? rule
                : { ...rule, action: { consequence_level: "notify" } }
        ) as RuleDocument;
        return renderRuleSentence(display, translator);
    }

    type RowDetail = Pick<
        DetailRow,
        "sentence" | "timeframe" | "evaluation" | "frequency" | "validUntil" | "channels"
    >;

    /**
     * Total per row: a detail that cannot be prepared hides itself, but the
     * row and its edit/delete actions survive. Without this, a partial
     * condition (`{ kind: "group" }`) throws inside the `$derived` and both
     * list tabs render nothing.
     */
    function detailFor(row: AlarmRow): RowDetail {
        try {
            const rule = row.rule;
            return {
                sentence: sentenceFor(rule),
                timeframe:
                    typeof rule.trigger_timeframe === "string"
                        ? rule.trigger_timeframe
                        : "",
                evaluation: optionLabel(
                    EVALUATION_KEYS,
                    rule.evaluation_mode,
                    "close",
                ),
                frequency: optionLabel(FREQUENCY_KEYS, rule.frequency, "once"),
                validUntil: formatValidUntil(rule.valid_until_ms, dateFormatter),
                channels: channelsFor(rule),
            };
        } catch (e) {
            logger.error("alerts", "rule detail could not be prepared", e);
            return {
                sentence: null,
                timeframe: "",
                evaluation: "",
                frequency: "",
                validUntil: "",
                channels: "",
            };
        }
    }

    let rows = $derived.by<DetailRow[]>(() => {
        void alertState.rulesVersion;
        return alarmRows().map((row) => ({ ...row, ...detailFor(row) }));
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
                uiState.showToast(
                    $_("dashboard.alerts.editUnreadable"),
                    "error",
                );
                return;
            case "bot":
                uiState.showToast($_("dashboard.alerts.editNotEditable"), "error");
                return;
            case "missing":
                uiState.showToast($_("dashboard.alerts.editMissing"), "error");
                return;
        }
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
        aria-selected={listTab === "active"}
        class:active={listTab === "active"}
        onclick={() => (listTab = "active")}
    >
        {$_("dashboard.alerts.active")}
    </button>
    <button
        type="button"
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
            <div class="row-main">
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
                <div class="row-actions">
                    <button
                        type="button"
                        class="edit-btn"
                        aria-label={$_("dashboard.alerts.editAlert")}
                        onclick={() => editRow(row.id)}
                    >
                        ✎
                    </button>
                    <button
                        type="button"
                        class="delete-btn"
                        aria-label={$_("dashboard.alerts.deleteAlert")}
                        onclick={() => deleteRow(row.id)}
                    >
                        ×
                    </button>
                </div>
            </div>

            {#if row.sentence !== null}
                <!--
                  FEAT-0543 -- native details for the keyboard contract and the
                  disclosure semantics; the content is prepared, not mapped in
                  the template.
                -->
                <details class="row-details">
                    <summary
                        aria-label={`${row.symbol}: ${$_("dashboard.alerts.configuration")}`}
                    >
                        {$_("dashboard.alerts.configuration")}
                    </summary>
                    <p class="detail-sentence">{row.sentence}</p>
                    <dl class="detail-grid">
                        {#if row.timeframe}
                            <dt>{$_("dashboard.alerts.panel.timeframe")}</dt>
                            <dd>{row.timeframe}</dd>
                        {/if}
                        {#if row.evaluation}
                            <dt>{$_("dashboard.alerts.panel.evaluationMode")}</dt>
                            <dd>{row.evaluation}</dd>
                        {/if}
                        {#if row.frequency}
                            <dt>{$_("dashboard.alerts.panel.lifecycle.frequency")}</dt>
                            <dd>{row.frequency}</dd>
                        {/if}
                        {#if row.validUntil}
                            <dt>{$_("dashboard.alerts.panel.lifecycle.validUntil")}</dt>
                            <dd>{row.validUntil}</dd>
                        {/if}
                        {#if row.channels}
                            <dt>{$_("common.channels")}</dt>
                            <dd>{row.channels}</dd>
                        {/if}
                        {#if row.note}
                            <dt>{$_("dashboard.alerts.panel.lifecycle.note")}</dt>
                            <dd>{row.note}</dd>
                        {/if}
                    </dl>
                </details>
            {/if}
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
        flex-direction: column;
        align-items: stretch;
        gap: var(--space-2);
        padding: var(--space-3);
        background: var(--bg-secondary);
        border-radius: var(--radius-sm);
        border-left: 3px solid var(--accent-color);
    }
    .row-main {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: var(--space-2);
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
    .row-actions {
        display: flex;
        align-items: center;
        gap: var(--space-1);
        flex-shrink: 0;
    }
    .edit-btn {
        background: none;
        border: none;
        color: var(--text-secondary);
        font-size: var(--text-xl);
        cursor: pointer;
    }
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
        margin: var(--space-2) 0;
        color: var(--text-primary);
        line-height: 1.5;
    }
    .detail-grid {
        display: grid;
        grid-template-columns: max-content 1fr;
        gap: 0.25rem var(--space-3);
        margin: 0;
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
    .empty-state {
        text-align: center;
        color: var(--text-secondary);
        padding: var(--space-6);
    }
</style>
