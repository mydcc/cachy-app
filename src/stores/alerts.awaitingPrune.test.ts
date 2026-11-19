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
 * FEAT-0823 review — the awaiting mirror prunes with the rules, not the
 * closes.
 *
 * The loop purges its own memos on the next close of a series that still
 * closes. These cases pin the other half: a rule whose series never
 * reports again (the trader stopped watching the market, the cache evicted
 * it) must not keep promising a wait forever, and a reused rule id must
 * not inherit one — the same reuse hazard the 0822 guard ledger learned
 * to prune at the source.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("$app/env", () => ({ browser: true, dev: false }));

const toastError = vi.hoisted(() => vi.fn());
vi.mock("../services/toastService.svelte", () => ({
    toastService: { error: toastError, success: vi.fn(), add: vi.fn() },
}));

vi.mock("../services/alertEngine/botExits", () => ({
    submitBotExit: vi.fn(async () => "close-refused"),
    botExitEnvironment: vi.fn(() => ({
        paperEnabled: () => true,
        close: vi.fn(),
        ownedPosition: () => undefined,
    })),
}));

vi.mock("../services/tradeService", () => ({
    tradeService: { closePosition: vi.fn() },
}));

const readBotsMock = vi.hoisted(() => vi.fn());
vi.mock("../services/alertEngine/botStore", () => ({
    readBots: readBotsMock,
    setBotEnabled: vi.fn(),
    deleteBot: vi.fn(),
    isBot: (rule: { action?: { consequence_level?: string } }) =>
        rule.action?.consequence_level === "simulate",
}));

import { migrateAccounts } from "./settings/accounts";
vi.mock("./settings.svelte", async () => {
    const actual = await vi.importActual<typeof import("./settings.svelte")>(
        "./settings.svelte",
    );
    return {
        settingsState: {
            ...actual.settingsState,
            apiProvider: "bitunix",
            ...migrateAccounts({
                apiKeys: { bitunix: { key: "test-key-1234", secret: "test-secret" } },
            }),
        },
    };
});

import { alertState, reportAwaitingSlice } from "./alerts.svelte";
import type { RuleDocument } from "../lib/rules/types";

/** A confirmation bot the prune filter recognises: the id and the mode. */
function confirmingBot(id: string): RuleDocument {
    return {
        schema_version: 5,
        id,
        name: `bot ${id}`,
        symbol: "BTCUSDT",
        trigger_timeframe: "1m",
        conditions: {
            kind: "compare",
            left: { kind: "price", field: "close" },
            op: "gte",
            right: { kind: "constant", value: "100" },
            timeframe: "1m",
        },
        action: {
            consequence_level: "simulate",
            order: { side: "buy", size_basis: "percent_of_equity", size: "1" },
        },
        entry_trigger: "confirmation",
        enabled: true,
        provenance: { source: "human", created_at_ms: 0 },
    } as RuleDocument;
}

beforeEach(() => {
    vi.clearAllMocks();
    alertState.awaitingReport = [];
});

describe("FEAT-0823 review — the awaiting mirror prunes with the rules", () => {
    it("keeps a live confirmation bot's wait in the report", () => {
        readBotsMock.mockImplementation(() => [confirmingBot("bot-1")]);

        reportAwaitingSlice("BTCUSDT", "1m", [{ ruleId: "bot-1", signalAnchorMs: 1_000 }]);

        expect(alertState.awaitingReport).toEqual([
            { ruleId: "bot-1", signalAnchorMs: 1_000 },
        ]);
    });

    it("drops a deleted bot's wait when the rules next change, even if its series never reports again", () => {
        // Seed the mirror with a wait the loop held.
        readBotsMock.mockImplementation(() => [confirmingBot("bot-1")]);
        reportAwaitingSlice("BTCUSDT", "1m", [{ ruleId: "bot-1", signalAnchorMs: 1_000 }]);

        // The bot is deleted and its market stops closing. The next
        // rules-change report — from ANY series — prunes the stale wait
        // instead of carrying it forever.
        readBotsMock.mockImplementation(() => []);
        alertState.rulesVersion += 1;
        reportAwaitingSlice("ETHUSDT", "1m", []);

        expect(alertState.awaitingReport).toEqual([]);
    });

    it("prunes nothing while the rule store is unreadable — a wrong prune would drop live waits", () => {
        // A live wait reported while the store cannot be read: the prune
        // skips rather than guessing, and the projection degrades on its
        // own terms.
        readBotsMock.mockImplementation(() => {
            throw new Error("rule store is not readable");
        });
        alertState.rulesVersion += 1;

        expect(() =>
            reportAwaitingSlice("BTCUSDT", "1m", [{ ruleId: "bot-1", signalAnchorMs: 1_000 }]),
        ).not.toThrow();
        expect(alertState.awaitingReport).toEqual([
            { ruleId: "bot-1", signalAnchorMs: 1_000 },
        ]);
    });
});
