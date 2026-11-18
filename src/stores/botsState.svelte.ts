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
 * The engine wiring (initAlertEngine) hands the order sink's in-flight
 * snapshot in through `setSubmitting`; this module never imports the order
 * path, and the order path never imports a store.
 */

import { readBots } from "../services/alertEngine/botStore";
import { readRuleStates } from "../services/alertEngine/ruleStateStore";
import {
    deriveBotState,
    ownedSlots,
    type BotBook,
    type BotLifeState,
    type OwnedSlot,
} from "../services/alertEngine/botState";
import { alertState } from "./alerts.svelte";
import { paperState } from "./paperTrading.svelte";

/** FEAT-0810 wires the exit signal; until then the closing set stays empty. */
const NO_CLOSING: ReadonlySet<string> = new Set();

class BotsStateManager {
    /**
     * The order sink's in-flight snapshot (FEAT-0488's guard), observed.
     * Copied on the way in — the set belongs to the sink, and a live
     * reference would let it change under the projection without a signal.
     */
    private submittingIds = $state<ReadonlySet<string>>(new Set());

    /**
     * Called by the engine wiring after every in-flight change and once per
     * sink (re)start — the fresh empty set resets a snapshot the previous
     * engine's guard could have left behind.
     */
    public setSubmitting(ids: ReadonlySet<string>): void {
        this.submittingIds = new Set(ids);
    }

    private buildBook(): BotBook {
        const firedCounts = new Map<string, number>();
        for (const [ruleId, state] of Object.entries(readRuleStates())) {
            firedCounts.set(ruleId, state.fired_count ?? 0);
        }
        return {
            positions: paperState.positions,
            submitting: this.submittingIds,
            closing: NO_CLOSING,
            unevaluable: new Set(alertState.unevaluableReport.map((rule) => rule.ruleId)),
            firedCounts,
        };
    }

    /**
     * Every live bot's state, keyed by bot id. A deleted bot has no entry;
     * the position it left behind stays answerable through `slots`.
     */
    states = $derived.by(() => {
        // The rule set and the fire ledger are localStorage reads; the two
        // counters are the whole signal that this projection re-reads them.
        void alertState.rulesVersion;
        void alertState.firingsVersion;

        const book = this.buildBook();
        const states = new Map<string, BotLifeState>();

        if (paperState.bookUnreadable) {
            // The book is one of the two inputs, and it could not be read.
            // "Armed" over an unseen book would promise a trader their bot
            // is waiting on positions the app cannot see; "blocked" with a
            // degraded flag is the honest answer (FEAT-0807's degradation).
            for (const bot of readBots()) {
                states.set(bot.id, { state: "blocked", hasPosition: false });
            }
            return states;
        }

        const now = Date.now();
        for (const bot of readBots()) {
            states.set(bot.id, deriveBotState(bot, book, now));
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

    /** The degradation notice: the simulated book could not be read. */
    degraded = $derived(paperState.bookUnreadable);
}

export const botsState = new BotsStateManager();
