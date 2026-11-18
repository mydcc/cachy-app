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
import { recordRuleFiring } from "../services/alertEngine/ruleStateStore";
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
        expect(botsState.degraded).toBe(true);
        expect(botsState.states.get("bot-1")?.state).toBe("blocked");
        expect(botsState.states.get("bot-2")?.state).toBe("blocked");
        expect(botsState.states.get("bot-1")?.hasPosition).toBe(false);
    });

    it("introduces no storage key of its own", async () => {
        seedBots(botDocument("bot-1"));
        await openAs("bot-1");
        recordRuleFiring("bot-1", 1);
        alertState.firingsVersion += 1;
        botsState.setSubmitting(new Set(["bot-1"]));

        // The projection persists nothing; every key it read belongs to
        // another store.
        const newKeys = Object.keys(localStorage).filter((key) => key.startsWith("cachy_bots"));
        expect(newKeys).toEqual([]);
    });
});
