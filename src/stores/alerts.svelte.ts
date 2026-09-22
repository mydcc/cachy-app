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
import { migrateAlertsToRuleDocuments } from "../services/alertEngine/migrateAlertsToRules";
import {
    reconcileStoredRules,
    type OrphanReconciliation,
} from "../services/alertEngine/reconcileOrphanedRules";
import { reconcileStoredDrawingRules, type DrawingReconciliation } from "../services/alertEngine/reconcileDrawingRules";
import {
    renderConditionSentence,
    type SentenceTranslator,
} from "../lib/rules/ruleSentence";
import {
    reportLegacyMigrationState,
    type LegacyMigrationReport,
} from "../services/alertEngine/verifyLegacyMigration";
import { runLegacyHandoff } from "../services/alertEngine/legacyHandoff";
import { ruleSchema } from "../lib/rules/ruleSchema";
import { disarmRule } from "../services/alertEngine/armRule";
import { recordFiring } from "../services/alertEngine/shadowLedger";
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


/**
 * Whether the evaluation engine is actually running.
 *
 * `failed` is the state that matters: rules are still stored, but nothing
 * evaluates them, so an armed alarm cannot fire. That has to be visible in
 * the UI — a stored alarm that silently never fires is BUG-0382.
 */
export type AlertEngineStatus = "idle" | "ready" | "failed";

/**
 * FEAT-0399: what is left of this store once `cachy_alerts_v1` is gone.
 *
 * It no longer holds alerts. The rule set lives in `cachy_rules_v1` and is
 * read straight from storage by the loop that evaluates it and the panel that
 * lists it, so a second in-memory copy here would be a third version of the
 * truth. What remains is the state the UI cannot derive from storage: whether
 * the engine is up, what startup found, and a counter the list can depend on.
 */
class AlertsManager {
    engineStatus = $state<AlertEngineStatus>("idle");

    /**
     * Bumped by every path that writes `cachy_rules_v1`, so a list derived
     * from the rule store re-reads it.
     *
     * localStorage is not reactive and the rule set is deliberately not
     * mirrored into a rune (see the class comment). A counter is the smallest
     * thing that closes that gap without creating a second copy to keep in
     * step.
     */
    rulesVersion = $state(0);

    /**
     * What the FEAT-0387 cutover did to migrated rules at startup, or `null`
     * before it ran. Held as state rather than only logged: `withheld` is the
     * half a trader has to act on, and a report nobody can surface is the
     * "report" half of suspend-and-report missing.
     */
    orphanReport = $state<OrphanReconciliation | null>(null);

    /**
     * What the FEAT-0029 reconciliation did to drawing-anchored rules at
     * startup, or `null` before it ran. Held as state for the same reason as
     * `orphanReport` above: a disabled rule the panel cannot explain is the
     * "report" half of suspend-and-report missing, and FEAT-0029's acceptance
     * criteria require the reason to reach the panel.
     */
    drawingReport = $state<DrawingReconciliation | null>(null);

    /**
     * FEAT-0399's per-device proof that retiring the legacy alert path lost
     * nothing, or `null` when this device never had a legacy store to check.
     *
     * The acceptance criterion this satisfies asks for every `cachy_alerts_v1`
     * entry to be accounted for "not merely assumed" — and the only place
     * that can be established is the device holding the data (Class A, no
     * telemetry, ADR-0001). Held as state for the same reason `orphanReport`
     * is: a finding nobody can see is not a finding.
     */
    legacyMigrationReport = $state<LegacyMigrationReport | null>(null);
}

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
 * The threshold of a rule that really is a price against a number — BUG-0481.
 *
 * `ruleThresholdOf` answers for any condition carrying `right.value`, which
 * was written for FEAT-0388's migration where every document was exactly that
 * shape. It is too generous for a message: "RSI(14) crosses above 70" carries
 * the constant 70 on its right, and reading that as a price announced
 * "BTCUSDT reached 70" about a level that is not a price at all.
 *
 * So this asks the narrower question the message needs, and everything it
 * declines — indicators, patterns, combos, windows — is described by its own
 * sentence instead of by an empty price slot.
 */
function priceThresholdOf(rule: RuleDocument): string | undefined {
    const condition = rule.conditions;
    if (!condition || condition.kind !== "compare") return undefined;
    if (condition.left?.kind !== "price" || condition.right?.kind !== "constant") return undefined;

    const value = condition.right.value;
    return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

/**
 * The condition clause, or the trader's own name for the rule if rendering it
 * fails.
 *
 * `renderConditionSentence` is documented never to throw and is tested for it.
 * The guard is here anyway because of where this now sits: `firingMessage`
 * runs before `notificationService.notify`, so a throw here is an alarm the
 * trader never hears — the one failure this engine exists to rule out. A terse
 * message is a bad outcome; silence is a different kind.
 */
function firedConditionText(
    rule: RuleDocument,
    t: (key: string, options?: Record<string, unknown>) => string,
): string {
    // `SentenceTranslator` takes the values directly; `svelte-i18n`'s `$_`
    // wants them under a `values` key. The same one-line adapter
    // `AlertPanelView.svelte` builds — without it every nested fragment of the
    // sentence renders as its bare i18n key.
    const translate: SentenceTranslator = (key, values) => t(key, { values: values ?? {} });

    try {
        return renderConditionSentence(rule, translate);
    } catch (e) {
        logger.error("alerts", `[Alerts] Rendering the fired condition failed for ${rule.id}`, e);
        return rule.name;
    }
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

    // A price rule keeps the line traders already recognise. Everything else
    // is announced with the clause the panel armed it from, so an indicator
    // alarm names its indicator and its level instead of a blank.
    const price = priceThresholdOf(rule);
    let message: string;
    if (price !== undefined) {
        message =
            t("dashboard.alerts.priceReached", { values: { symbol: rule.symbol, price } }) ||
            `${rule.symbol} reached ${price}`;
    } else {
        const condition = firedConditionText(rule, t);
        message =
            t("dashboard.alerts.ruleTriggered", { values: { symbol: rule.symbol, condition } }) ||
            `${rule.symbol} — ${condition}`;
    }

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
 *
 * Typed `TranslationKey`, not `string`: a `Record<…, string>` plus a cast at
 * the call site accepts a key that no locale file defines, and the failure
 * surfaces as a toast reading `settings.automation.orderRefusedTypo` to a
 * trader whose bot just did nothing. Adding a member to `BotOrderRefusal` now
 * fails the build here until both locales carry its message.
 */
const BOT_REFUSAL_KEYS: Record<BotOrderRefusal, TranslationKey> = {
    "paper-trading-off": "settings.automation.orderRefusedPaperOff",
    "no-order": "settings.automation.orderRefusedOther",
    "reduce-only-unsupported": "settings.automation.orderRefusedReduceOnly",
    "no-stop": "settings.automation.orderRefusedNoStop",
    "no-entry-price": "settings.automation.orderRefusedOther",
    "no-equity": "settings.automation.orderRefusedOther",
    "size-not-positive": "settings.automation.orderRefusedOther",
    "level-not-supported": "settings.automation.orderRefusedLevelNotSupported",
};

export function reportBotOrderRefusal(
    firing: { rule: RuleDocument },
    refusal: BotOrderRefusal,
): void {
    logger.warn("alerts", `bot ${firing.rule.id} fired but submitted nothing: ${refusal}`);
    toastService.error(
        get(_)(BOT_REFUSAL_KEYS[refusal], {
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

        // One shot: an alarm that fired is done until the trader re-arms it.
        // FEAT-0399 removed the second half of this — the legacy alert behind
        // the rule also had to be flagged inactive, or the migration re-armed
        // the rule from it on the next start. The migration no longer reads
        // back from that store, so the rule is now the only thing to disarm.
        disarmRule(rule.id);
        alertState.rulesVersion += 1;
    } catch (e) {
        logger.error("alerts", `[Cutover] Handling a rule firing failed for ${rule.id}`, e);
    }
};


/**
 * `live` notifies the trader; `shadow` records verdicts to the ledger and
 * notifies nobody.
 *
 * Before FEAT-0399 this flag also had to reach the coverage decision, because
 * arming `ledgerSink` while computing real coverage would strip an alert from
 * the legacy engine for an observer that never tells the trader — the "neither
 * engine" gap the cutover existed to rule out. With one engine left the flag
 * only picks a sink.
 */
export type AlertEngineMode = "live" | "shadow";


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
 * Stops the rule path — FEAT-0406.
 *
 * FEAT-0399 removed the timer this also used to stop: coverage existed to
 * keep exactly one of two engines serving each alert, and re-syncing it had
 * nothing left to decide once the legacy engine was gone.
 *
 * Cleared before it is called so a disarm that throws cannot leave a stale
 * disposer behind to be called a second time.
 */
function disarmRuleEngine(): void {
    const disarm = disarmRuleLoop;
    disarmRuleLoop = null;
    disarm?.();
}

/**
 * Brings the rule evaluation engine up at client startup.
 *
 * FEAT-0399 removed the other half of this function. Until then it also loaded
 * the legacy `AlertEngineWasm`, computed which alerts the rule engine covered,
 * and handed the rest to that engine — the cutover machinery that kept exactly
 * one of two engines serving each alarm. With one engine left, coverage has
 * nothing to decide and the re-sync it drove has nothing to re-sync.
 *
 * Client-only: the rule core is fetched over HTTP, which does not exist during
 * SSR.
 *
 * On failure this reports to the user itself — `engineStatus: "failed"`, which
 * the panel renders — rather than leaving each caller to remember. Rules that
 * are stored but never evaluated must not fail silently.
 *
 * Rolling the cutover back to a measurement-only run is still one argument:
 * `initAlertEngine("shadow")` arms `ledgerSink`, which records verdicts and
 * notifies nobody.
 */
export async function initAlertEngine(mode: AlertEngineMode = "live"): Promise<void> {
    if (!browser) return;

    // FEAT-0388: one-shot, best-effort — migrateAlertsToRuleDocuments()
    // never throws, so a migration hiccup cannot block the engine below.
    // FEAT-0399 left this in place deliberately: it is now the only reader of
    // `cachy_alerts_v1`, and deleting it would strand every trader who has
    // legacy alerts and has not started the app since they were written.
    await migrateAlertsToRuleDocuments();

    // FEAT-0387 cutover: ordered after the migration, never before. The
    // migration is what records new origins; reconciling first would judge a
    // rule set the migration has not finished writing and could suspend a
    // rule whose alert is about to be re-linked.
    alertState.orphanReport = reconcileStoredRules();

    // FEAT-0399: the per-device proof that AC 3 asks for — every legacy entry
    // accounted for in the migration ledger, checked rather than assumed.
    alertState.legacyMigrationReport = reportLegacyMigrationState();

    // FEAT-0399: hand back any alarm the old cutover parked on the legacy
    // engine. That engine is gone, so a rule left disabled by it is evaluated
    // by nothing at all (BUG-0382). Once per device; see `runLegacyHandoff`.
    if (runLegacyHandoff() !== null) alertState.rulesVersion += 1;

    // FEAT-0029: and the rules whose *drawing* is gone. Ordered after the
    // orphan pass for the same reason that one is ordered after the
    // migration — each reads the rule set the previous one has finished
    // writing, and judging a half-written set is how a rule gets disabled for
    // a reason that was about to stop being true.
    const drawingReport = reconcileStoredDrawingRules();
    alertState.drawingReport = drawingReport;
    if (drawingReport.suspended.length > 0) {
        logger.warn(
            "alerts",
            `[FEAT-0029] ${drawingReport.suspended.length} alert(s) disabled: their drawing is gone`,
        );
    }
    if (drawingReport.withheld.length > 0) {
        // Withheld is a decision, not a non-event: these rules are still armed
        // on a level nobody can see, because the drawing store could not be
        // read and absence proved nothing.
        logger.warn(
            "alerts",
            `[FEAT-0029] ${drawingReport.withheld.length} drawing alert(s) left armed — drawing store unreadable`,
        );
    }

    // The rule evaluator's own core. A failure here is caught and logged
    // rather than thrown: it decides `ready` below, and the trader is told
    // through `engineStatus` instead of through an unhandled rejection.
    try {
        await ruleSchema.load();
        logger.log("alerts", "[RuleSchema] core loaded, schema v" + ruleSchema.schemaVersion());
    } catch (e) {
        logger.error("alerts", "[RuleSchema] core failed to load — no rule can be evaluated", e);
    }

    // Imported once, here, rather than at module scope: the wiring — and the
    // market store it reads — stays out of the import graph on the path this
    // function returns early from.
    const { ledgerSink, startRuleEvaluationLoop } = await import(
        "../services/alertEngine/ruleLoopWiring"
    );
    // Bots ride the same sink the alerts do, so they load with it rather than
    // at module scope: a session with no bot never pays for the order path.
    const { closeAtAnchor, withBotOrders } = await import("../services/alertEngine/botOrders");

    // FEAT-0406: one read, and every later tick re-decides from its own.
    const ready = ruleSchema.isReady();

    // Cleared before the arming decision, not inside it: a second
    // `initAlertEngine()` whose schema failed to load this time must not leave
    // the previous run's loop evaluating and notifying.
    disarmRuleEngine();

    if (!ready) {
        // A rule the panel armed is now evaluated by nothing at all. That is
        // BUG-0382 exactly, and it must not stay silent behind "ready".
        alertState.engineStatus = "failed";
        return;
    }

    alertState.engineStatus = "ready";
    // Bots ride the live sink only. Shadow mode exists to measure the
    // evaluator without consequences, and an order — even a simulated one —
    // is a consequence: it moves the paper balance every later sizing
    // decision is measured against. Wrapping the ledger sink also breaks
    // `startRuleEvaluationLoop`'s `onFiring === ledgerSink` identity check,
    // which is what makes a shadow run say so in the log instead of claiming
    // it is notifying.
    disarmRuleLoop = startRuleEvaluationLoop(
        mode === "live"
            ? withBotOrders(
                  notifyingRuleSink,
                  botOrderEnvironment(closeAtAnchor),
                  reportBotOrderRefusal,
              )
            : ledgerSink,
        // FEAT-0406: a core that stops being ready mid-session must stop the
        // loop, or it keeps evaluating against an evaluator that is no longer
        // there. With the legacy engine gone there is nothing to hand the
        // alarms back to, so saying so is the whole job.
        mode === "live"
            ? () => {
                  if (ruleSchema.isReady()) return;
                  disarmRuleEngine();
                  alertState.engineStatus = "failed";
              }
            : undefined,
    );
}
