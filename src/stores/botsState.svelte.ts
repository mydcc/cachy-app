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

/**
 * FEAT-0807 — the projection store: what every bot is doing right now.
 *
 * A projection, not a source: `states` derives from the two version counters
 * and the simulated book on every read and persists nothing. The rule set and
 * the fire ledger live in localStorage and are deliberately not mirrored into
 * runes — the counters are the whole signal that this store re-reads them.
 *
 * Neither input is allowed to take a subscriber down. A rule store the
 * app cannot read is a routine failure here (the Manage tab renders its
 * refusal, FEAT-0542); the projection degrades to an empty map and says so
 * through `degraded`. A paper book that failed to parse degrades every bot
 * to `blocked` rather than claiming "armed" over positions the app cannot
 * see.
 *
 * The engine wiring (initAlertEngine) hands the order sink's in-flight
 * snapshot in through `setSubmitting` and the clock in through `now`; this
 * module never imports the order path, and the order path never imports a
 * store.
 */

import type { GridDocument, RuleDocument } from "../lib/rules/types";
import { Decimal } from "decimal.js";
import { readBots } from "../services/alertEngine/botStore";
import { readGrids, readGridStates } from "../services/alertEngine/gridStore";
import { deriveGridState, type GridLifeState } from "../services/alertEngine/gridState";
import { readRuleStates } from "../services/alertEngine/ruleStateStore";
import { localDayKey, openRiskOfRow, type OwnedRowLite } from "../services/alertEngine/botGuards";
import {
    setBotClosingListener,
    setBotSubmissionsListener,
} from "../services/alertEngine/botSubmissionBus";
import {
    deriveBotState,
    ownedSlots,
    type BotBook,
    type BotLifeState,
} from "../services/alertEngine/botState";
import { executingBotAccount } from "../services/alertEngine/botAccount";
import { alertState } from "./alerts.svelte";
import { paperState } from "./paperTrading.svelte";

/** FEAT-0810 wires the exit sink's closing snapshot through the bus above. */

/**
 * The rule store throws on a blob it cannot read (FEAT-0542's
 * RuleStoreUnreadableError) — a failure this repo treats as routine: the
 * Manage tab renders its refusal rather than taking the tab down, and a
 * derived that threw would take every subscriber of this projection down
 * with it. No bots are listed, `degraded.rules` says why, and a re-seeded
 * store is picked up on the next `rulesVersion` bump.
 */
function readBotsOrRefusal(): { bots: RuleDocument[]; unreadable: boolean } {
    try {
        return { bots: readBots(), unreadable: false };
    } catch {
        return { bots: [], unreadable: true };
    }
}

class BotsStateManager {
    constructor() {
        // The engine wiring notifies through the submission channel, and
        // the store subscribes — the division the evaluation loop uses for
        // its panel-side readers. A direct import from the wiring would
        // grow the dependency cycle the architecture ratchet freezes, so
        // the channel is the only edge either side holds.
        setBotSubmissionsListener((ids) => this.setSubmitting(ids));
        // FEAT-0810 — the closing channel, same shape, other side of the
        // trade: `closing` shows while an exit travels, `submitting` while
        // an entry does, and neither overwrites the other.
        setBotClosingListener((ids) => {
            this.closingIds = new Set(ids);
        });
    }

    /**
     * The order sink's in-flight snapshot (FEAT-0488's guard), observed.
     * Copied on the way in — the set belongs to the sink, and a live
     * reference would let it change under the projection without a signal.
     */
    private submittingIds = $state<ReadonlySet<string>>(new Set());

    /**
     * The exit sink's in-flight snapshot (FEAT-0810's guard), observed the
     * same way. Keyed by `ruleId|positionId` at the sink; the projection
     * cares only about which rules are closing, so the sink's snapshot is
     * already rule-keyed where it matters (the projection reads the rule
     * ids it names).
     */
    private closingIds = $state<ReadonlySet<string>>(new Set());

    /**
     * FEAT-0807 — the projection's clock, kept as state so `expired` turns
     * when the deadline passes and not the next time an unrelated input
     * changes. A derived that read `Date.now()` directly would freeze the
     * answer at whatever moment it was first cached. A consumer that
     * renders states ticks it — the pattern accountVerification.svelte.ts
     * uses for its own expiries. Unticked, the projection answers "as of
     * the last tick".
     */
    now = $state(Date.now());

    /**
     * Called by the engine wiring after every in-flight change and once per
     * sink (re)start — the fresh empty set resets a snapshot the previous
     * engine's guard could have left behind.
     */
    public setSubmitting(ids: ReadonlySet<string>): void {
        this.submittingIds = new Set(ids);
    }

    private buildBook(): BotBook {
        // One read of the fire-state ledger for every consumer it feeds:
        // `firedCounts`, and the per-bot entry counters below. Parsing the
        // whole blob once per bot per recompute — a projection that ticks
        // with the clock — was the accidental cost this map removes.
        const ruleStates = readRuleStates();
        const firedCounts = new Map<string, number>();
        const activityByBot = new Map<string, { total: number; today: number }>();
        for (const [ruleId, state] of Object.entries(ruleStates)) {
            firedCounts.set(ruleId, state.fired_count ?? 0);
            const entries = state.bot_entries;
            if (entries === undefined) continue;
            // The same day-rollover `botEntryActivity` answers with: a
            // stored `today` from another day reads as zero here too, so
            // the chip and the lane can never disagree about the day.
            activityByBot.set(ruleId, {
                total: entries.total,
                today: entries.day === localDayKey() ? entries.today : 0,
            });
        }
        // FEAT-0822 — the standing limits' consumption, read per bot from the
        // same durable counter the enforcement lane refuses with and the
        // same resting-stop risk it prices budgets with. The single-truth
        // rule that made the guard decisions pure: both halves read one
        // function, so a chip that says `limit reached` and an engine that
        // refuses can never disagree about whether a limit binds.
        const entriesToday = new Map<string, number>();
        const budgetUsed = new Map<string, Decimal | null>();
        const orders = paperState.orders;
        for (const bot of readBotsOrRefusal().bots) {
            if (typeof bot.id !== "string") continue;
            entriesToday.set(bot.id, activityByBot.get(bot.id)?.today ?? 0);
            const risks = paperState.positions
                .filter((p) => p.origin === "bot" && p.botId === bot.id)
                .map((row) => openRiskOfRow(row as OwnedRowLite, orders));
            // `null` (a row whose stop does not answer, or one on the wrong
            // side of its entry) makes the whole budget unmeasurable, never
            // zero: the standing chip treats it as reached, mirroring the
            // lane's fail-closed refusal — unknown risk is never free.
            budgetUsed.set(
                bot.id,
                risks.some((risk) => risk === null)
                    ? null
                    : risks.reduce<Decimal>(
                          (sum, risk) => sum.plus(risk ?? 0),
                          new Decimal(0),
                      ),
            );
        }
        return {
            // FEAT-0825 / ADR-0028 — read through the rune, so turning paper
            // trading off turns every bot's chip on the same render.
            executingAccount: this.executingAccount,
            positions: paperState.positions,
            submitting: this.submittingIds,
            closing: this.closingIds,
            unevaluable: new Set(alertState.unevaluableReport.map((rule) => rule.ruleId)),
            // FEAT-0823 — the loop's awaiting report, the same in-memory
            // mirror discipline the unevaluable set above uses: re-derived
            // on every close, honest about a reload's gap, and never a
            // second persisted truth.
            awaiting: new Set(alertState.awaitingReport.map((entry) => entry.ruleId)),
            firedCounts,
            entriesToday,
            budgetUsed,
        };
    }

    /**
     * Every live bot's state, keyed by bot id. A deleted bot has no entry;
     * the position it left behind stays answerable through `slots`.
     */
    states = $derived.by(() => {
        // The rule set and the fire ledger are localStorage reads; the two
        // counters are the whole signal that this projection re-reads them.
        // FEAT-0823 adds the awaiting report: it is a $state array the loop's
        // port rewrites on every confirmation-relevant close, so reading it
        // here is the reactive edge — a held signal turns the chip without
        // any version bump pretending a ledger moved.
        void alertState.rulesVersion;
        void alertState.firingsVersion;
        void alertState.awaitingReport;

        const book = this.buildBook();
        const { bots, unreadable } = readBotsOrRefusal();
        const states = new Map<string, BotLifeState>();

        // The rule store is the input that could not be read: nothing can
        // be listed, and `degraded.rules` carries the notice.
        if (unreadable) return states;

        if (paperState.bookUnreadable) {
            // The book is one of the two inputs, and it could not be read.
            // "Armed" over an unseen book would promise a trader their bot
            // is waiting on positions the app cannot see; "blocked" with a
            // degraded flag is the honest answer (FEAT-0807's degradation).
            for (const bot of bots) {
                if (typeof bot.id !== "string") continue;
                states.set(bot.id, { state: "blocked", hasPosition: false });
            }
            return states;
        }

        for (const bot of bots) {
            // A malformed document without a string id would key a phantom
            // row — and, worse, match a bot-stamped row that carries no
            // botId. The listing readers skip it, and so does the projection.
            if (typeof bot.id !== "string") continue;
            states.set(bot.id, deriveBotState(bot, book, this.now));
        }
        return states;
    });

    /**
     * (symbol, side) → the bot that owns the paper position on that slot.
     * Built from the book alone, so it survives the rule's deletion — which
     * is the case FEAT-0808 renders and FEAT-0810 refuses against. Keyed on
     * the book only: positions are `$state`, and no version counter or
     * ledger read is spent on it.
     */
    slots = $derived.by(() => ownedSlots(paperState.positions));

    /**
     * FEAT-0825 / ADR-0028 — the account bots may execute against right now,
     * `null` while a live exchange account is active. The bot surfaces filter
     * on it: they list only the executing account's bots and say how many
     * they are hiding otherwise.
     */
    executingAccount = $derived.by(() => executingBotAccount(paperState.enabled));

    /**
     * Which input could not be read — the consumer renders its own wording.
     * Keyed like `states`, so a re-seeded rule store or a re-persisted book
     * recovers on the next read.
     */
    degraded = $derived.by(() => {
        void alertState.rulesVersion;
        return {
            rules: readBotsOrRefusal().unreadable,
            book: paperState.bookUnreadable,
        };
    });

    /** FEAT-0819 — live lifecycle state of each stored grid bot. */
    gridStates = $derived.by(() => {
        void alertState.gridsVersion;
        const executingAccount = executingBotAccount(paperState.enabled);
        let grids: GridDocument[];
        let runtimeStates: ReturnType<typeof readGridStates>;
        try {
            grids = readGrids();
            runtimeStates = readGridStates();
        } catch {
            return new Map<string, GridLifeState>();
        }
        const activeGrids = grids.map((grid) => ({
            grid,
            status: runtimeStates[grid.id]?.status ?? ("armed" as const),
        }));
        const book = {
            executingAccount,
            positions: paperState.positions,
            orders: paperState.orders,
            activeGrids,
            bookUnreadable: paperState.bookUnreadable,
        };
        const result = new Map<string, GridLifeState>();
        for (const grid of grids) {
            if (typeof grid.id !== "string") continue;
            result.set(grid.id, deriveGridState(grid, runtimeStates[grid.id], book));
        }
        return result;
    });

    gridDegraded = $derived.by(() => {
        void alertState.gridsVersion;
        let gridsUnreadable = false;
        try {
            readGrids();
            readGridStates();
        } catch {
            gridsUnreadable = true;
        }
        return {
            grids: gridsUnreadable,
            book: paperState.bookUnreadable,
        };
    });
}

export const botsState = new BotsStateManager();
