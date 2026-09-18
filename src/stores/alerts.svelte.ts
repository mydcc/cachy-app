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

import { get } from "svelte/store";

import { browser } from "$app/environment";
import { _ } from "../locales/i18n";
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
import {
    configureLegacyReplay,
    replayPendingLegacySymbolsAtStartup,
    setLegacyReplayPopulation,
} from "../services/alertEngine/legacyReplayCoordinator";
import { recordFiring, recordLegacyFiring } from "../services/alertEngine/shadowLedger";
import { recordRuleFiring } from "../services/alertEngine/ruleStateStore";
import { notificationService } from "../services/notificationService.svelte";
import { alertNotificationKey } from "../lib/notificationPolicy";
import type { FiringSink } from "../services/alertEngine/ruleEvaluationLoop";
import type { RuleDocument } from "../lib/rules/types";
import { logger } from "../services/logger";
import { toastService } from "../services/toastService.svelte";
import { paperState } from "./paperTrading.svelte";
import { settingsState } from "./settings.svelte";
import type { TranslationKey } from "../locales/schema";
import type { BotOrderEnvironment, BotOrderRefusal } from "../services/alertEngine/botOrders";


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
/**
 * Whether this announcement was the rule's last one — FEAT-0440.
 *
 * Only `once` retires a rule. `every_time` and `once_per_candle_close` stay
 * armed and are held back by the core instead, which answers `already_fired`
 * for a candle whose slot is spent; that check needs `RuleState`, which is why
 * this ships with the state store and not before it.
 *
 * An absent `frequency` is `once`, matching both the schema default and the
 * legacy engine every migrated rule came from — an infrastructure swap must not
 * turn a one-shot alarm into a repeating one.
 */
export function isSpentAfterFiring(rule: RuleDocument): boolean {
    return (rule.frequency ?? "once") === "once";
}

/**
 * The line a trader reads, with their own note on the end — FEAT-0393 AC 6.
 *
 * The note is Class A and stays on the device: this renders into a local toast
 * and a browser notification the user's own browser draws, neither of which
 * leaves the machine. It is appended rather than substituted because the
 * symbol and price are what makes the message scannable at a glance, and the
 * note is what makes it actionable two weeks later.
 */
export function firingMessage(rule: RuleDocument): string {
    const t = get(_) as (key: string, options?: Record<string, unknown>) => string;
    const price = ruleThresholdOf(rule) ?? "";
    let message =
        t("dashboard.alerts.priceReached", { values: { symbol: rule.symbol, price } }) ||
        `${rule.symbol} reached ${price}`;

    // FEAT-0477 — an intrabar rule fired on a candle that had not closed, so
    // the value it fired on is provisional and can be gone by the close.
    //
    // The caveat rides on the notification and not only on the arming screen,
    // because the two are read at different moments: the trader armed this
    // hours ago and is reading the alarm now, with a decision in front of them.
    // "This might revert" is only actionable while there is still a candle to
    // wait for, which is exactly here.
    if (rule.evaluation_mode === "intrabar") {
        message =
            t("dashboard.alerts.firedIntrabar", { values: { message } }) ||
            `${message} (provisional)`;
    }

    const note = rule.note?.trim();
    if (!note) return message;

    return t("dashboard.alerts.firedWithNote", { values: { message, note } }) || `${message} — ${note}`;
}

/**
 * FEAT-0387 cutover, FEAT-0440 sink — what happens when a *rule* fires.
 *
 * The same four steps in the same order every time: announce, count, record,
 * and retire only if the frequency is spent. A trader must not be able to tell
 * which engine served an alarm, so the ordering matches the legacy handler
 * above; what is new is that retiring is now a decision rather than a
 * certainty.
 *
 * Counting happens before the disarm and after the announcement. Before the
 * disarm because `isSpentAfterFiring` is about the *rule*, not about whether a
 * write succeeded; after the announcement because a storage quota error must
 * never be the reason a trader did not hear their alarm.
 *
 * Lives in this module rather than in the loop's wiring because it needs the
 * store; keeping it here leaves `ruleLoopWiring` free of a dependency on
 * `alertState`, which would otherwise be a cycle.
 */
/**
 * The ports `botOrders` needs, assembled here because a service may not import
 * a store — `eslint.architecture.boundaries.js`, and the boundary is the reason
 * the module takes an environment at all.
 *
 * `paperState.balance` is the simulated equity a bot sizes against. There is
 * deliberately no live equivalent: this item stops at `simulate`, and a bot
 * that could read the funded account would be one line away from sizing against
 * it.
 */
function botOrderEnvironment(closeAt: BotOrderEnvironment["closeAt"]): BotOrderEnvironment {
    return {
        paperEnabled: () => paperState.enabled,
        equity: () => paperState.balance,
        exchange: () => settingsState.apiProvider,
        closeAt,
        // Imported at the moment an order is actually placed, not at startup.
        // `orderPlacementService` pulls the account and TP/SL stores in behind
        // it, and the alert engine starts on every session — including the
        // overwhelming majority that never arm a bot. Deferring it keeps the
        // order path out of that startup entirely.
        place: async (plan) => {
            const { orderPlacementService } = await import("../services/orderPlacementService");
            return orderPlacementService.placeEntryGroup(plan);
        },
    };
}

/**
 * What a trader sees when a bot fires and places nothing.
 *
 * A toast rather than only a log, and named per reason, because the two common
 * ones are both things the trader can fix in one click — switch paper trading
 * on, or give the bot a stop. A bot sitting armed and silently doing nothing is
 * the failure this whole engine exists to avoid, and it is worse for a bot than
 * for an alert: an alert that does not fire is quiet, a bot that does not fire
 * looks like a strategy that found no setup.
 *
 * `withBotOrders` already limits this to once per rule and reason.
 */
const BOT_REFUSAL_KEYS: Record<BotOrderRefusal, string> = {
    "paper-trading-off": "settings.automation.orderRefusedPaperOff",
    "no-stop": "settings.automation.orderRefusedNoStop",
    "no-entry-price": "settings.automation.orderRefusedOther",
    "no-equity": "settings.automation.orderRefusedOther",
    "size-not-positive": "settings.automation.orderRefusedOther",
};

export function reportBotOrderRefusal(
    firing: { rule: RuleDocument },
    refusal: BotOrderRefusal,
): void {
    logger.warn("alerts", `bot ${firing.rule.id} fired but submitted nothing: ${refusal}`);
    toastService.error(
        get(_)(BOT_REFUSAL_KEYS[refusal] as TranslationKey, {
            values: { name: firing.rule.name },
        }),
    );
}

export const notifyingRuleSink: FiringSink = ({ rule, verdict, anchorMs }) => {
    try {
        // Keyed per candle, not per rule: the service's 60s duplicate window is
        // exactly one 1m candle, and swallowing an `every_time` rule's second
        // announcement would mute an alarm the trader explicitly asked to hear
        // on every touch. See `alertNotificationKey`.
        notificationService.notify({
            category: "alert-fired",
            eventId: alertNotificationKey(rule.id, anchorMs),
            message: firingMessage(rule),
            tone: "success",
        });

        recordRuleFiring(rule.id, anchorMs);

        recordFiring({
            source: "rule",
            recordedAtMs: Date.now(),
            symbol: rule.symbol,
            id: rule.id,
            timeframe: rule.trigger_timeframe,
            anchorMs,
            verdict: verdict.verdict,
        });

        if (!isSpentAfterFiring(rule)) return;

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
 * How often live-mode coverage is recomputed independently of candle closes.
 *
 * `onClose` notices a coverage change the moment *some* series closes, which
 * covers every change that matters for as long as a series is still closing.
 * The case it cannot reach is the one where the closes themselves stop: a
 * trader charting only `4h` whose `1m` rule series goes quiet has no `1m`
 * close left to notice it with, and the next `4h` close can be four hours
 * away. For that whole window the alert is off the legacy engine and evaluated
 * by nothing — BUG-0382 with a four-hour fuse.
 *
 * A minute is chosen against the window it has to detect, not against a load
 * budget: `isSeriesObserved` calls a series stale after three trigger periods,
 * which is three minutes for the `1m` timeframe the migration pins rules to
 * (FEAT-0388), so checking once a minute lands well inside it. The cost is one
 * coverage recomputation a minute — a `localStorage` read and a parse — and
 * `setAlerts` skips the WASM crossing entirely on the usual outcome, that
 * nothing changed.
 */
const COVERAGE_RESYNC_INTERVAL_MS = 60_000;

/**
 * Module-scope, and session-long by design: it has the same lifetime as the
 * rule loop and the legacy engine, neither of which is owned by a component
 * either, so there is no `$effect` teardown or unmount hook to hang it on.
 * `initAlertEngine()` clears it before each arming decision, which is what
 * keeps a re-init from stacking timers. Under dev HMR a replaced module leaves
 * the previous interval running against an orphaned `alertState`; harmless,
 * and not worth a teardown path that production would never use.
 */
let coverageResyncTimer: ReturnType<typeof setInterval> | null = null;

/** Stops the coverage re-sync timer, if one is running. */
function stopCoverageResync(): void {
    if (coverageResyncTimer === null) return;
    clearInterval(coverageResyncTimer);
    coverageResyncTimer = null;
}

/**
 * The disarm for the loop this module armed, or `null` while nothing is armed
 * — FEAT-0406.
 *
 * Module-scope for the same reason the timer above is: the loop outlives every
 * component, and a second `initAlertEngine()` has to be able to stop the *first*
 * run's loop. Without this, a re-init whose core failed to load would leave the
 * previous run's loop evaluating and notifying while the coverage it was
 * balanced against had just been recomputed as empty — both engines serving
 * the same alert.
 */
let disarmRuleLoop: (() => void) | null = null;

/**
 * Stops the rule path: the loop first, then the timer that kept its coverage
 * fresh — FEAT-0406.
 *
 * The loop goes first because that ordering is the whole no-double-fire
 * argument: from the moment it returns, nothing on the rule path can notify,
 * so handing the alerts back to the legacy engine afterwards cannot overlap
 * with a rule firing for the same alert. The reverse order would leave a
 * window — short, but a window — in which both engines hold it.
 *
 * Cleared before it is called so a disarm that throws cannot leave a stale
 * disposer behind to be called a second time.
 */
function disarmRuleEngine(): void {
    const disarm = disarmRuleLoop;
    disarmRuleLoop = null;
    disarm?.();
    stopCoverageResync();
}

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
        logger.log("alerts", "[RuleSchema] core loaded, schema v" + ruleSchema.schemaVersion());
    } catch (e) {
        logger.error("alerts", "[Cutover] Rule schema core failed to load — every alert stays on the legacy engine", e);
    }

    // Imported once, here, rather than at module scope: the wiring — and the
    // market store it reads — stays out of the import graph on the path this
    // function returns early from. `ensureLoaded()` below is client-only for
    // the same reason; the graph has to agree with the guard or SSR pulls in
    // the whole client half anyway. `isSeriesObserved` (needed for coverage),
    // `readClosedCandles` (needed for the BUG-0441 replay) and
    // `startRuleEvaluationLoop` all come from the same module, so one import
    // covers them.
    //
    // Ordered *before* `ensureLoaded()` rather than after it, which BUG-0441
    // made a correctness requirement: awaiting anything between the engine
    // becoming usable and the replay below would let a WebSocket tick seed the
    // crossing baseline first, and the replay's oldest close would then be
    // compared against the live price instead of against its own predecessor.
    // With the last `await` here, everything from `ensureLoaded()`'s
    // continuation through the replay runs in one synchronous stretch that no
    // callback can interleave.
    const {
        isSeriesObserved,
        ledgerSink,
        readClosedCandles,
        readAvailableKlineTimeframes,
        startRuleEvaluationLoop,
    } = await import("../services/alertEngine/ruleLoopWiring");
    // Bots ride the same sink the alerts do, so they load with it rather than
    // at module scope: a session with no bot never pays for the order path.
    const { closeAtAnchor, withBotOrders } = await import("../services/alertEngine/botOrders");

    try {
        await alertEngine.ensureLoaded(loadModule);
    } catch (e) {
        alertState.engineStatus = "failed";
        const t = get(_) as (key: string) => string;
        toastService.error(t("dashboard.alerts.engineUnavailable"));
        throw e;
    }

    // FEAT-0387 cutover: real coverage only in live mode. A shadow run must
    // remove nothing from the legacy engine — that is what makes it a pure
    // addition rather than a second, quieter cutover.
    // FEAT-0406: read once, decide both halves from it. Everything from here
    // to the arming decision at the end of this function runs synchronously —
    // the last `await` is above — so this one answer is the same answer the
    // arming would compute for itself, and now it provably is.
    const ready = ruleSchema.isReady();
    const covered =
        mode === "live" && ready ? readCoveredAlertIds(isSeriesObserved, ready) : new Set<string>();
    alertState.syncEngine(covered);

    // BUG-0441: give the legacy engine the history it lost across a reload.
    //
    // This cannot be a single startup pass. The market store is empty right
    // here — klines arrive later as the chart/watchlist subscribes — so a
    // startup-only replay usually finds no history and lets the first live tick
    // consume the crossing the fix exists to recover. `legacyReplayCoordinator`
    // therefore also replays each symbol the moment its history becomes
    // observable (the market store's kline write path) and immediately before
    // its first live evaluation, the last point at which a replay is still the
    // engine's *first* evaluation for that symbol. The second-init hazard the
    // old `hasReplayedAlertHistory` flag covered is now the coordinator's
    // `decided` set.
    configureLegacyReplay({
        readCandles: readClosedCandles,
        timeframesFor: readAvailableKlineTimeframes,
        evaluate: (symbol, close, timestampMs) => {
            if (!alertEngine.evaluate(symbol, close, timestampMs)) {
                throw new Error(`[BUG-0441] legacy replay evaluation failed for ${symbol}`);
            }
        },
        // BUG-0448: the replay decides only the alerts below — anything armed
        // on the symbol later sits it out.
        heldAlertsFor: (symbol) => alertEngine.heldAlertsFor(symbol),
        withAlertsWithheld: (ids, run) => alertEngine.withAlertsWithheld(ids, run),
    });
    setLegacyReplayPopulation(alertsForLegacyEngine(alertState.definitions, covered));
    const replayed = replayPendingLegacySymbolsAtStartup();
    if (replayed !== null) {
        logger.log(
            "alerts",
            `[BUG-0441] Replayed ${replayed.candles} closes across ${replayed.symbols} symbol(s); ` +
                `${replayed.skipped.length} awaiting history, ${replayed.failed.length} failed`,
        );
    }

    // FEAT-0387 cutover: coverage above is a startup snapshot, but the market
    // store keeps subscribing and unsubscribing to series for as long as the
    // session runs — a symbol the trader charts at 4h when the app opens can
    // gain a 1m subscription minutes later (a different chart, an indicator),
    // and just as easily lose one when the trader switches away. Without this,
    // either direction opens a gap: a rule whose series becomes observed only
    // after startup would stay armed and notifying on the rule path while its
    // alert was never taken off the legacy engine (both engines serving it —
    // the double fire this cutover exists to rule out, reached through
    // staleness rather than construction); a rule whose series later goes
    // quiet (round 4: `isSeriesObserved` is recency-based precisely so a
    // dropped subscription is detected here) would stay off the legacy engine
    // while nothing evaluates it anymore (BUG-0382, the mirror image). Both
    // directions are the same re-sync — recomputing coverage fresh each time
    // catches whichever one just happened.
    //
    // Only wired in live mode. Shadow mode must not touch legacy coverage at
    // all, for the same reason it forces `covered` empty above: a re-sync
    // here would start removing alerts from the legacy engine on behalf of a
    // sink that never notifies for them, recreating the exact "neither
    // engine" gap the mode split was built to close.
    //
    // Every re-sync recomputes coverage from scratch — `readCoveredAlertIds`
    // walks each armed rule and re-checks `isSeriesObserved` for it — so a
    // close on any series re-validates all of them, not only the one that
    // closed. What a close cannot do is fire once there are no closes left,
    // which is why `COVERAGE_RESYNC_INTERVAL_MS` drives this same re-sync on a
    // timer too.
    // FEAT-0406: one tick, one `isReady()` read, both halves decided from it.
    //
    // Before this item the tick only recomputed coverage, and arming was a
    // startup decision nothing revisited. The two shared an input and could
    // not be kept in step: a core that stopped being ready mid-session would
    // push every alert back onto the legacy engine here while the loop, armed
    // since startup, kept evaluating and notifying for the same alerts — a
    // double fire reached through staleness rather than construction.
    //
    // So the not-ready branch does the other half too, and does it first: the
    // loop is stopped before the alerts are handed back, never after. The
    // mirror gap — alerts off the legacy engine with nothing evaluating them —
    // is closed by the same ordering, because `syncEngine` with empty coverage
    // is what puts every one of them back.
    //
    // `engineStatus` is set for the trader's sake, not the store's: a rule the
    // panel armed without a legacy alert behind it is evaluated by nothing
    // after a disarm, which is BUG-0382 exactly, and the panel already renders
    // a banner for `failed`. Overstating it slightly for migrated alerts (they
    // really are being served, by the legacy engine) is the right side to err
    // on for an alert system.
    const resyncCoverage = () => {
        const stillReady = ruleSchema.isReady();
        if (!stillReady) {
            disarmRuleEngine();
            alertState.syncEngine(new Set<string>());
            alertState.engineStatus = "failed";
            return;
        }
        alertState.syncEngine(readCoveredAlertIds(isSeriesObserved, stillReady));
    };
    const onClose = mode === "live" ? resyncCoverage : undefined;

    // FEAT-0387 cutover: last, and only once the legacy engine is up, and only
    // if the evaluator it would drive can actually produce a verdict. Arming
    // an unready loop would not be unsafe by itself — every candle close would
    // throw inside the gate, caught and logged, evaluating nothing — but it
    // is pure overhead on the market hot path for a loop that has already
    // been excluded from coverage above.
    // Cleared before the arming decision, not inside it: a second
    // `initAlertEngine()` whose schema failed to load this time must not leave
    // the previous run's timer re-syncing coverage on behalf of an evaluator
    // that is no longer there.
    disarmRuleEngine();

    // Arming and coverage now come from the same `ready` read taken above, and
    // every later tick re-decides both together (see `resyncCoverage`). This
    // no longer rests on `ruleSchema.isReady()` being monotonic — FEAT-0406.
    if (ready) {
        alertState.engineStatus = "ready";
        disarmRuleLoop = startRuleEvaluationLoop(
            withBotOrders(
                mode === "live" ? notifyingRuleSink : ledgerSink,
                botOrderEnvironment(closeAtAnchor),
                reportBotOrderRefusal,
            ),
            onClose,
        );

        // The half of the re-sync that survives a series going quiet. Started
        // only alongside the loop, because coverage is empty without a ready
        // evaluator and a timer would do nothing but log that once a minute.
        if (mode === "live") {
            coverageResyncTimer = setInterval(resyncCoverage, COVERAGE_RESYNC_INTERVAL_MS);
        }
    } else {
        // Mirrors `resyncCoverage`'s not-ready branch: the loop is already
        // disarmed (via `disarmRuleEngine()` just above) and the alerts are
        // back on the legacy engine — but a rule the panel armed without a
        // legacy alert behind it is now evaluated by nothing at all. That is
        // the BUG-0382 shape, and it must not stay silent behind "ready".
        alertState.engineStatus = "failed";
    }
}
