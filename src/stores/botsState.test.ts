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

/*
 * FEAT-0807 — the projection store.
 *
 * The claim: the store recomputes from the two version counters and the
 * paper book, persists nothing, and degrades instead of throwing when the
 * book cannot be read. Each test names the input it flips, because a
 * projection that misses one trigger is silently stale.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// The rule and fire-state readers are localStorage-backed and no-op when
// `browser` is false (unit project default), so this store test flips it the
// same way botStore.integration.test.ts does.
vi.mock("$app/env", () => ({ browser: true, dev: false }));

import { Decimal } from "decimal.js";

import type { RuleDocument } from "../lib/rules/types";
import { CONSTANTS } from "../lib/constants";
import { RULES_STORAGE_KEY } from "../services/alertEngine/migrateAlertsToRules";
import { recordBotEntry, recordRuleFiring, RULE_STATE_STORAGE_KEY } from "../services/alertEngine/ruleStateStore";
import { clearBotClosing, notifyBotClosing } from "../services/alertEngine/botSubmissionBus";
import { paperExchange, setPaperPriceFeed } from "../services/paperExchange";
import { alertState } from "./alerts.svelte";
import { botsState } from "./botsState.svelte";
import { paperState } from "./paperTrading.svelte";
import { slotKey } from "../services/alertEngine/botState";

const HASH = "ab".repeat(32);

function botDocument(id: string, overrides: Partial<RuleDocument> = {}): RuleDocument {
    return {
        schema_version: 2,
        id,
        name: `bot ${id}`,
        symbol: "BTCUSDT",
        trigger_timeframe: "1h",
        conditions: {
            kind: "compare",
            left: { kind: "price", field: "close" },
            op: "gte",
            right: { kind: "constant", value: "50000" },
            timeframe: "1h",
        },
        action: { consequence_level: "simulate", order: { side: "buy", size_basis: "percent_of_equity", size: "1" } },
        enabled: true,
        provenance: { source: "human", created_at_ms: 0 },
        ...overrides,
    };
}

function seedBots(...documents: RuleDocument[]): void {
    localStorage.setItem(RULES_STORAGE_KEY, JSON.stringify(documents));
    alertState.rulesVersion += 1;
}

/** A bot-stamped market entry into the simulated book (FEAT-0806's stamp). */
async function openAs(botId: string): Promise<void> {
    await paperExchange.handle("/api/orders", {
        type: "place-order",
        symbol: "BTCUSDT",
        side: "BUY",
        orderType: "MARKET",
        qty: "0.02",
        origin: "bot",
        botId,
        ruleId: botId,
        strategyHash: HASH,
    });
}

beforeEach(() => {
    localStorage.clear();
    paperState.reloadFromStorage();
    paperState.resetBook();
    paperState.setConfig("failureMode", "none");
    paperState.setConfig("slippageBps", "0");
    paperState.setConfig("takerFeeBps", "0");
    paperState.setConfig("startingBalance", "10000");
    paperState.resetBook();
    paperState.setEnabled(true);
    setPaperPriceFeed(() => new Decimal(50000));

    alertState.unevaluableReport = [];
    alertState.rulesVersion += 1;
    alertState.firingsVersion += 1;
    botsState.setSubmitting(new Set());
    clearBotClosing();
});

describe("FEAT-0807 — the botsState projection", () => {
    it("reads armed for an enabled bot that has done nothing", () => {
        seedBots(botDocument("bot-1"));

        const life = botsState.states.get("bot-1");
        expect(life?.state).toBe("armed");
        expect(life?.hasPosition).toBe(false);
    });

    it("recomputes when the rule set changes: disabling the bot reads paused", () => {
        seedBots(botDocument("bot-1"));
        expect(botsState.states.get("bot-1")?.state).toBe("armed");

        // The rule set is deliberately not mirrored into a rune — the
        // counter is the whole signal, so the rewrite only counts once it
        // bumps.
        seedBots(botDocument("bot-1", { enabled: false }));

        expect(botsState.states.get("bot-1")?.state).toBe("paused");
    });

    it("recomputes when a firing lands: a fired bot without a position reads closed", () => {
        seedBots(botDocument("bot-1"));

        recordRuleFiring("bot-1", 12345);
        alertState.firingsVersion += 1;

        expect(botsState.states.get("bot-1")?.state).toBe("closed");
    });

    it("recomputes on paper-book changes without a version bump: an owned position reads in_position", async () => {
        seedBots(botDocument("bot-1"));
        await openAs("bot-1");

        const life = botsState.states.get("bot-1");
        expect(life?.state).toBe("in_position");
        expect(life?.hasPosition).toBe(true);

        // FEAT-0810's future refusal input: the slot names its owner.
        expect(botsState.slots.get(slotKey("BTCUSDT", "long"))).toEqual({
            positionId: paperState.positions[0].positionId,
            botId: "bot-1",
        });
    });

    it("keeps one state for a paused bot with an open position", async () => {
        seedBots(botDocument("bot-1", { enabled: false }));
        await openAs("bot-1");

        const life = botsState.states.get("bot-1");
        expect(life?.state).toBe("paused");
        expect(life?.hasPosition).toBe(true);
    });

    it("reads blocked from the loop's unevaluable report", () => {
        seedBots(botDocument("bot-1"));

        alertState.unevaluableReport = [
            { ruleId: "bot-1", name: "bot bot-1", symbol: "BTCUSDT", reason: "warmup" },
        ];

        expect(botsState.states.get("bot-1")?.state).toBe("blocked");
    });

    it("reads submitting from the in-flight observer's snapshot", () => {
        seedBots(botDocument("bot-1"));

        botsState.setSubmitting(new Set(["bot-1"]));

        expect(botsState.states.get("bot-1")?.state).toBe("submitting");
    });

    it("a fired bot whose exit closed everything reads closed — FEAT-0810 AC 6's state half", async () => {
        seedBots(botDocument("bot-1"));
        await openAs("bot-1");
        expect(botsState.states.get("bot-1")?.state).toBe("in_position");

        // The exit story's end: the rule fired once (recorded), and the
        // position it owned is gone — the projection says "closed", the
        // state a full close returns the bot to.
        recordRuleFiring("bot-1", 1);
        alertState.firingsVersion += 1;
        paperState.resetBook();

        const life = botsState.states.get("bot-1");
        expect(life?.state).toBe("closed");
        expect(life?.hasPosition).toBe(false);
    });

    it("reads closing from the exit sink's snapshot — FEAT-0810's channel", async () => {
        seedBots(botDocument("bot-1"));
        await openAs("bot-1");

        // The exit sink notifies through the closing channel the same way
        // the entry sink notifies through the submission channel: an exit
        // in flight over an owned position reads "closing".
        notifyBotClosing(new Set(["bot-1"]));

        const life = botsState.states.get("bot-1");
        expect(life?.state).toBe("closing");
        expect(life?.hasPosition).toBe(true);
    });

    it("a closing signal without an owned position has nothing to close and reads armed", () => {
        seedBots(botDocument("bot-1"));

        notifyBotClosing(new Set(["bot-1"]));

        expect(botsState.states.get("bot-1")?.state).toBe("armed");
    });

    it("a deleted rule leaves no state but keeps its slot in the owner index", async () => {
        seedBots(botDocument("bot-1"));
        await openAs("bot-1");
        expect(botsState.slots.has(slotKey("BTCUSDT", "long"))).toBe(true);

        localStorage.setItem(RULES_STORAGE_KEY, JSON.stringify([]));
        alertState.rulesVersion += 1;

        expect(botsState.states.has("bot-1")).toBe(false);
        expect(botsState.slots.get(slotKey("BTCUSDT", "long"))?.botId).toBe("bot-1");
    });

    it("two bots on one slot: the index names the opener, the second stays armed", async () => {
        seedBots(botDocument("bot-1"), botDocument("bot-2"));
        await openAs("bot-1");

        expect(botsState.slots.get(slotKey("BTCUSDT", "long"))?.botId).toBe("bot-1");
        expect(botsState.states.get("bot-1")?.state).toBe("in_position");
        // An add does not transfer ownership (FEAT-0806): the second bot has
        // no owned row, which is exactly what FEAT-0810 needs to refuse it.
        expect(botsState.states.get("bot-2")?.state).toBe("armed");
    });

    it("an unreadable paper book degrades every bot to blocked with a notice", async () => {
        seedBots(botDocument("bot-1"), botDocument("bot-2"));

        localStorage.setItem(CONSTANTS.LOCAL_STORAGE_PAPER_KEY, "{not json");
        paperState.reloadFromStorage();

        expect(paperState.bookUnreadable).toBe(true);
        expect(botsState.degraded.book).toBe(true);
        expect(botsState.states.get("bot-1")?.state).toBe("blocked");
        expect(botsState.states.get("bot-2")?.state).toBe("blocked");
        expect(botsState.states.get("bot-1")?.hasPosition).toBe(false);
    });

    it("reads limit_reached from the durable day counter", () => {
        seedBots(
            botDocument("bot-1", { max_entries_per_day: 1, firing_policy: "multi" }),
        );
        expect(botsState.states.get("bot-1")?.state).toBe("armed");

        // One landed entry exhausts the day cap the document states, and
        // the projection re-reads the durable counter on the version bump.
        recordBotEntry("bot-1");
        alertState.firingsVersion += 1;

        expect(botsState.states.get("bot-1")?.state).toBe("limit_reached");
    });

    it("a day cap spent yesterday binds nothing today — the reader answers the rollover", () => {
        seedBots(
            botDocument("bot-1", { max_entries_per_day: 1, firing_policy: "multi" }),
        );
        // A stored counter from another local day, straight off the ledger:
        // the writer that would stamp today is the submission the cap would
        // refuse, so the projection's re-read must answer "today: zero"
        // for a chip that would otherwise read limit_reached forever.
        localStorage.setItem(
            RULE_STATE_STORAGE_KEY,
            JSON.stringify({
                "bot-1": {
                    fired_count: 0,
                    bot_entries: { total: 1, day: "2000-01-01", today: 1 },
                },
            }),
        );
        alertState.firingsVersion += 1;

        expect(botsState.states.get("bot-1")?.state).toBe("armed");
    });

    it("introduces no storage key of its own", async () => {
        seedBots(botDocument("bot-1"));
        await openAs("bot-1");
        recordRuleFiring("bot-1", 1);
        alertState.firingsVersion += 1;
        botsState.setSubmitting(new Set(["bot-1"]));

        // The projection persists nothing: after a full round of reads the
        // key set is exactly what the other stores own.
        expect([...Object.keys(localStorage)].sort()).toEqual(
            [CONSTANTS.LOCAL_STORAGE_PAPER_KEY, RULES_STORAGE_KEY, RULE_STATE_STORAGE_KEY].sort(),
        );
    });

    it("degrades to an empty projection with a notice when the rule store is unreadable", () => {
        seedBots(botDocument("bot-1"));
        // The rule store throws on a blob it cannot read (FEAT-0542's
        // RuleStoreUnreadableError); the Manage tab renders its refusal
        // rather than dying, and so does the projection.
        localStorage.setItem(RULES_STORAGE_KEY, "{not json");
        alertState.rulesVersion += 1;

        expect(botsState.states.size).toBe(0);
        expect(botsState.degraded.rules).toBe(true);

        // Recovery: a re-seeded store is picked up on the next bump.
        seedBots(botDocument("bot-1"));
        expect(botsState.states.get("bot-1")?.state).toBe("armed");
        expect(botsState.degraded.rules).toBe(false);
    });

    it("turns expired when the consumer's clock passes the deadline", () => {
        seedBots(botDocument("bot-1", { valid_until_ms: 100 }));

        botsState.now = 50;
        expect(botsState.states.get("bot-1")?.state).toBe("armed");

        botsState.now = 200;
        expect(botsState.states.get("bot-1")?.state).toBe("expired");
    });

    it("clears the unreadable-book flag once a persist writes a valid book again", async () => {
        seedBots(botDocument("bot-1"));
        localStorage.setItem(CONSTANTS.LOCAL_STORAGE_PAPER_KEY, "{not json");
        paperState.reloadFromStorage();
        expect(botsState.degraded.book).toBe(true);

        // The entry's own persist() writes a book the next reload can read;
        // the flag describes the storage, not the session's worst moment.
        await openAs("bot-1");
        expect(botsState.degraded.book).toBe(false);
        expect(botsState.states.get("bot-1")?.state).toBe("in_position");
    });

    it("an unknown origin value reads as unattributed and the book stays readable", async () => {
        seedBots(botDocument("bot-1"));
        await openAs("bot-1");
        const blob = JSON.parse(
            localStorage.getItem(CONSTANTS.LOCAL_STORAGE_PAPER_KEY) as string,
        ) as { positions: Array<Record<string, unknown>> };
        blob.positions[0].origin = "grid";
        localStorage.setItem(CONSTANTS.LOCAL_STORAGE_PAPER_KEY, JSON.stringify(blob));
        paperState.reloadFromStorage();

        expect(paperState.bookUnreadable).toBe(false);
        expect(botsState.degraded.book).toBe(false);
        expect(paperState.positions).toHaveLength(1);
    });

    it("skips a malformed bot without a string id rather than keying a phantom row", () => {
        const malformed = botDocument("bot-2") as RuleDocument & { id: string | undefined };
        malformed.id = undefined;
        seedBots(botDocument("bot-1"), malformed);

        expect([...botsState.states.keys()]).toEqual(["bot-1"]);
    });
});
