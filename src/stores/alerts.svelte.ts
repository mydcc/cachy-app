import { _ } from "../locales/i18n";
import { get } from "svelte/store";
/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import { browser } from "$app/environment";
import { alertEngine, type AlertDefinition, type WasmModuleLoader } from "../services/alertEngine/alertEngine";
import { migrateAlertsToRuleDocuments } from "../services/alertEngine/migrateAlertsToRules";
import {
    reconcileStoredRules,
    type OrphanReconciliation,
} from "../services/alertEngine/reconcileOrphanedRules";
import { ruleThresholdOf } from "../services/alertEngine/migrateAlertsToRules";
import { ruleSchema } from "../lib/rules/ruleSchema";
import {
    alertsForLegacyEngine,
    disarmRule,
    originAlertIdOf,
    readCoveredAlertIds,
    releaseCoverage,
} from "../services/alertEngine/ruleCoverage";
import { recordFiring, recordLegacyFiring } from "../services/alertEngine/shadowLedger";
import type { FiringSink } from "../services/alertEngine/ruleEvaluationLoop";
import { logger } from "../services/logger";
import { toastService } from "../services/toastService.svelte";


export interface AlertState {
    definitions: AlertDefinition[];
}

/**
 * Whether the evaluation engine is actually running.
 *
 * `failed` is the state that matters: definitions are still stored, but
 * nothing evaluates them, so an armed alert cannot fire. That has to be
 * visible in the UI — a stored alert that silently never fires is BUG-0382.
 */
export type AlertEngineStatus = "idle" | "ready" | "failed";

class AlertsManager {
    // Local-First Class A Data
    private static STORAGE_KEY = "cachy_alerts_v1";

    definitions = $state<AlertDefinition[]>([]);
    engineStatus = $state<AlertEngineStatus>("idle");

    /**
     * What the FEAT-0387 cutover did to migrated rules at startup, or `null`
     * before it ran. Held as state rather than only logged: `withheld` is the
     * half a trader has to act on, and a report nobody can surface is the
     * "report" half of suspend-and-report missing.
     */
    orphanReport = $state<OrphanReconciliation | null>(null);

    constructor() {
        this.loadFromStorage();
    }

    private loadFromStorage() {
        try {
            const data = localStorage.getItem(AlertsManager.STORAGE_KEY);
            if (data) {
                const parsed = JSON.parse(data);
                this.definitions = parsed;
            }
        } catch (e) {
            logger.error('alerts', "Failed to load alerts from storage", e);
        }
    }

    private saveToStorage() {
        try {
            localStorage.setItem(AlertsManager.STORAGE_KEY, JSON.stringify(this.definitions));
        } catch (e) {
             logger.error('alerts', "Failed to save alerts to storage", e);
        }
    }

    addAlert(alert: AlertDefinition) {
        this.definitions.push(alert);
        this.saveToStorage();
        alertEngine.addAlert(alert);
    }

    removeAlert(id: string) {
        this.definitions = this.definitions.filter(a => a.id !== id);
        this.saveToStorage();
        alertEngine.removeAlert(id);
        // FEAT-0387: the rule that covered this alert would otherwise stay
        // armed until the next start, firing an alarm the trader just deleted.
        releaseCoverage(id);
    }

    updateAlert(id: string, updates: Partial<AlertDefinition>) {
        const idx = this.definitions.findIndex(a => a.id === id);
        if (idx !== -1) {
            this.definitions[idx] = { ...this.definitions[idx], ...updates };
            this.saveToStorage();
            // FEAT-0387: give the alert back to the legacy engine first. Its
            // rule still holds the pre-edit threshold until the next start
            // re-syncs it (BUG-0402), so it must not stay armed — and the
            // legacy engine has to hold this alert again for it to be
            // evaluated at all.
            releaseCoverage(id);
            alertEngine.addAlert(this.definitions[idx]); // engine replaces if ID exists
        }
    }

    /**
     * Pushes into the legacy engine only what the rule engine has not taken
     * over (FEAT-0387 cutover).
     *
     * Filtering here rather than at the evaluation call site means the legacy
     * engine never holds a covered alert at all, so a double fire is not
     * suppressed after the fact — it cannot be produced. An alert whose rule
     * is missing, disabled, unmigrated, or whose series is not being observed
     * is not covered and stays on this path, which is why the cutover cannot
     * open a silent gap.
     *
     * `covered` is supplied by the caller rather than always recomputed here:
     * `initAlertEngine()` must be able to pass an explicit empty set for a
     * shadow run, and the default — `readCoveredAlertIds()`'s own safe
     * default — keeps every alert on this engine for any caller that does not
     * know to ask for real coverage.
     */
    syncEngine(covered: ReadonlySet<string> = readCoveredAlertIds()) {
        alertEngine.setAlerts(alertsForLegacyEngine(this.definitions, covered));
    }
}

alertEngine.onAlertFired((event) => {
    // 0. FEAT-0387 shadow period: record what the legacy path actually fired,
    // so the rule loop's verdicts can be compared against it rather than
    // merely observed. Recording never throws and changes nothing below.
    recordLegacyFiring(event.alert_id, event.symbol, event.price.toString());

    // 1. Toast Notification
    const t = get(_);
    const msg = (t as (key: string, options?: Record<string, unknown>) => string)("dashboard.alerts.priceReached", { values: { symbol: event.symbol, price: event.price.toString() } }) || `${event.symbol} reached ${event.price}`;
    toastService.success(msg);

    // 2. Mark alert as inactive locally so UI updates
    const idx = alertState.definitions.findIndex(a => a.id === event.alert_id);
    if (idx !== -1) {
        alertState.definitions[idx] = { ...alertState.definitions[idx], active: false };
        // Don't call saveToStorage directly from outside the class easily without a public method,
        // so we'll just use updateAlert which saves and syncs.
        alertState.updateAlert(event.alert_id, { active: false });
    }
});

export const alertState = new AlertsManager();

/**
 * FEAT-0387 cutover — what happens when a *rule* fires.
 *
 * Deliberately the same three steps the legacy handler above performs, in the
 * same order: notify, record, disarm. A trader must not be able to tell which
 * engine served an alarm, and any difference here would be a behaviour change
 * smuggled in with an infrastructure swap.
 *
 * Lives in this module rather than in the loop's wiring because it needs the
 * store and the toast service; keeping it here leaves `ruleLoopWiring` free of
 * a dependency on `alertState`, which would otherwise be a cycle.
 */
export const notifyingRuleSink: FiringSink = ({ rule, verdict, anchorMs }) => {
    try {
        const t = get(_) as (key: string, options?: Record<string, unknown>) => string;
        const price = ruleThresholdOf(rule) ?? "";
        toastService.success(
            t("dashboard.alerts.priceReached", { values: { symbol: rule.symbol, price } }) ||
                `${rule.symbol} reached ${price}`,
        );

        recordFiring({
            source: "rule",
            recordedAtMs: Date.now(),
            symbol: rule.symbol,
            id: rule.id,
            timeframe: rule.trigger_timeframe,
            anchorMs,
            verdict: verdict.verdict,
        });

        // One shot, matching the legacy engine: an alert that fired is done
        // until the trader re-arms it. Both stores are disarmed because both
        // are still read — the rule by the loop, the alert by the migration
        // that would otherwise re-arm the rule from it on the next start.
        disarmRule(rule.id);
        const alertId = originAlertIdOf(rule.id);
        if (alertId !== undefined) {
            const idx = alertState.definitions.findIndex((a) => a.id === alertId);
            if (idx !== -1) alertState.updateAlert(alertId, { active: false });
        }
    } catch (e) {
        logger.error("alerts", `[Cutover] Handling a rule firing failed for ${rule.id}`, e);
    }
};

/**
 * `"live"` covers alerts the rule engine has taken over and notifies on their
 * behalf — the shipped cutover. `"shadow"` is the measurement mode: the loop
 * still evaluates and records to the ledger, but coverage is forced empty, so
 * every alert stays exactly where it was before this feature existed.
 *
 * The two must move together. Coverage answers "does anything besides the
 * legacy engine notify for this alert", and in shadow mode the answer is no —
 * `ledgerSink` records and notifies nobody. Computing real coverage while
 * arming `ledgerSink` would strip an alert from the legacy engine for an
 * observer that will never tell the trader: neither engine serves it, the
 * exact "neither" this cutover exists to rule out.
 */
export type AlertEngineMode = "live" | "shadow";

/**
 * Brings the alert engine up at client startup. BUG-0382: without this, every
 * method on `alertEngine` early-returns on a null instance and no alert can
 * ever fire, even though the market hot path calls `evaluate()` on every tick.
 *
 * The two steps are ordered and belong together: the engine has to exist
 * before definitions can be pushed into it, and definitions rehydrated from
 * `localStorage` only reach it via `syncEngine()` — `addAlert` covers alerts
 * armed in the current session, nothing covers alerts armed before a reload.
 *
 * Client-only: `ensureLoaded()` dynamically imports `/wasm/technicals_wasm.js`,
 * which does not exist during SSR.
 *
 * On failure this reports to the user itself — a toast now, and
 * `engineStatus: "failed"` for as long as it lasts — rather than leaving each
 * caller to remember. Alerts that are stored but never evaluated must not fail
 * silently a second time. It still rejects afterwards so a caller (or a test)
 * can tell that startup did not complete.
 *
 * Rolling the live cutover back to a measurement-only run is meant to be one
 * argument: `initAlertEngine(loadModule, "shadow")`. See `AlertEngineMode`
 * for why `mode` has to reach both the coverage decision and the sink choice
 * together, not just the sink.
 */
export async function initAlertEngine(
    loadModule?: WasmModuleLoader,
    mode: AlertEngineMode = "live",
): Promise<void> {
    if (!browser) return;

    // FEAT-0388: one-shot, best-effort — migrateAlertsToRuleDocuments()
    // never throws, so a migration hiccup cannot block the engine below.
    await migrateAlertsToRuleDocuments();

    // FEAT-0387 cutover: ordered after the migration, never before. The
    // migration is what re-syncs a rule with its alert and records new
    // origins; reconciling first would judge a rule set the migration has
    // not finished writing and could suspend a rule whose alert is about to
    // be re-linked.
    alertState.orphanReport = reconcileStoredRules();

    // FEAT-0387 cutover: the rule evaluator's own core, loaded before coverage
    // is computed. `ruleCoverage.readCoveredAlertIds()` treats an unloaded core
    // as "nothing is covered" precisely so this ordering matters: computing
    // coverage before this settles would report an alert as covered — and
    // drop it from the legacy engine below — for an evaluator that might still
    // be mid-fetch. A failure here is caught and logged, never thrown: it must
    // not block the legacy engine, which is the one thing guaranteed to still
    // work when it does.
    try {
        await ruleSchema.load();
    } catch (e) {
        logger.error("alerts", "[Cutover] Rule schema core failed to load — every alert stays on the legacy engine", e);
    }

    try {
        await alertEngine.ensureLoaded(loadModule);
    } catch (e) {
        alertState.engineStatus = "failed";
        const t = get(_) as (key: string) => string;
        toastService.error(t("dashboard.alerts.engineUnavailable"));
        throw e;
    }

    // Imported once, here, rather than at module scope: the wiring — and the
    // market store it reads — stays out of the import graph on the path this
    // function returns early from. `ensureLoaded()` above is client-only for
    // the same reason; the graph has to agree with the guard or SSR pulls in
    // the whole client half anyway. Both `isSeriesObserved` (needed for
    // coverage, below) and `startRuleEvaluationLoop` (needed after) come from
    // the same module, so one import covers both.
    const { isSeriesObserved, ledgerSink, startRuleEvaluationLoop } = await import(
        "../services/alertEngine/ruleLoopWiring"
    );

    // FEAT-0387 cutover: real coverage only in live mode. A shadow run must
    // remove nothing from the legacy engine — that is what makes it a pure
    // addition rather than a second, quieter cutover.
    const covered =
        mode === "live" && ruleSchema.isReady()
            ? readCoveredAlertIds(isSeriesObserved)
            : new Set<string>();
    alertState.syncEngine(covered);
    alertState.engineStatus = "ready";

    // FEAT-0387 cutover: coverage above is a startup snapshot, but the market
    // store keeps subscribing to new series for as long as the session runs —
    // a symbol the trader charts at 4h when the app opens can gain a 1m
    // subscription minutes later (a different chart, an indicator). Without
    // this, a rule whose series became observed only after startup would stay
    // armed and notifying on the rule path while its alert was never taken
    // off the legacy engine, since `syncEngine` above never runs again: both
    // engines would serve it, which is the double fire this cutover exists to
    // rule out — reached through staleness rather than construction.
    //
    // Only wired in live mode. Shadow mode must not touch legacy coverage at
    // all, for the same reason it forces `covered` empty above: a re-sync
    // here would start removing alerts from the legacy engine on behalf of a
    // sink that never notifies for them, recreating the exact "neither
    // engine" gap the mode split was built to close.
    const onClose =
        mode === "live"
            ? () => alertState.syncEngine(readCoveredAlertIds(isSeriesObserved))
            : undefined;

    // FEAT-0387 cutover: last, and only once the legacy engine is up, and only
    // if the evaluator it would drive can actually produce a verdict. Arming
    // an unready loop would not be unsafe by itself — every candle close would
    // throw inside the gate, caught and logged, evaluating nothing — but it
    // is pure overhead on the market hot path for a loop that has already
    // been excluded from coverage above.
    if (ruleSchema.isReady()) {
        startRuleEvaluationLoop(mode === "live" ? notifyingRuleSink : ledgerSink, onClose);
    }
}
