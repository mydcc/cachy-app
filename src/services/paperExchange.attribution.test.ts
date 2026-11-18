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
 * FEAT-0806 — a simulated trade knows who opened it.
 *
 * The claim: attribution travels with the order into the simulated book —
 * position, entry metadata and opening fill — and the journal copies it as a
 * recorded fact. A bot whose rule was deleted keeps its track record, a
 * manual trade never masquerades as a bot's, and a trade written before
 * this change stays unattributed rather than guessing an owner.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { Decimal } from "decimal.js";

vi.mock("$app/env", () => ({ browser: true, dev: true }));

vi.mock("./logger", () => ({
    logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const settings = vi.hoisted(() => ({ journalPaperTrades: true }));
vi.mock("../stores/settings.svelte", () => ({ settingsState: settings }));

import { paperExchange, setPaperPriceFeed } from "./paperExchange";
import { paperJournalService } from "./paperJournalService";
import { paperState } from "../stores/paperTrading.svelte";
import { journalState } from "../stores/journal.svelte";
import { normalizeJournalEntry } from "../utils/utils";

const PRICE = new Decimal(50000);
const HASH = "ab".repeat(32);
let feed: Record<string, Decimal | null> = {};

/** The stamp a promoted rule's firing carries, as the seam delivers it. */
const BOT_STAMP = {
    origin: "bot",
    botId: "rule-bot-1",
    ruleId: "rule-bot-1",
    strategyHash: HASH,
};

beforeEach(() => {
    localStorage.clear();
    settings.journalPaperTrades = true;
    journalState.set([]);
    paperState.reloadFromStorage();
    paperState.resetBook();
    paperState.setConfig("failureMode", "none");
    paperState.setConfig("slippageBps", "0");
    paperState.setConfig("takerFeeBps", "0");
    paperState.setConfig("startingBalance", "10000");
    paperState.resetBook();
    paperState.setEnabled(true);
    feed = { BTCUSDT: PRICE };
    setPaperPriceFeed((symbol) => feed[symbol] ?? null);
});

async function open(payload: Record<string, unknown> = {}) {
    await paperExchange.handle("/api/orders", {
        type: "place-order",
        symbol: "BTCUSDT",
        side: "BUY",
        orderType: "MARKET",
        qty: "0.02",
        ...payload,
    });
}

function lastEntry() {
    return journalState.entries[journalState.entries.length - 1];
}

describe("FEAT-0806 — attribution in the simulated book", () => {
    it("stamps a bot order on the position, its metadata and the opening fill", async () => {
        await open(BOT_STAMP);

        const position = paperState.positions[0];
        expect(position.origin).toBe("bot");
        expect(position.botId).toBe("rule-bot-1");
        expect(position.ruleId).toBe("rule-bot-1");
        expect(position.strategyHash).toBe(HASH);

        const meta = paperState.getPositionMetadata(position.positionId);
        expect(meta?.origin).toBe("bot");
        expect(meta?.botId).toBe("rule-bot-1");
        expect(meta?.ruleId).toBe("rule-bot-1");
        expect(meta?.strategyHash).toBe(HASH);

        const fill = paperState.fills[0];
        expect(fill.tradeSide).toBe("OPEN");
        expect(fill.origin).toBe("bot");
        expect(fill.botId).toBe("rule-bot-1");
        expect(fill.ruleId).toBe("rule-bot-1");
        expect(fill.strategyHash).toBe(HASH);
    });

    it("stamps a manual entry with origin manual and no bot fields", async () => {
        await open({ origin: "manual" });

        const position = paperState.positions[0];
        expect(position.origin).toBe("manual");
        expect(position.botId).toBeUndefined();

        const fill = paperState.fills[0];
        expect(fill.origin).toBe("manual");
        expect(fill.botId).toBeUndefined();
    });

    it("leaves an unstamped order unattributed, like trades written before the change", async () => {
        await open();

        expect(paperState.positions[0].origin).toBeUndefined();
        expect(paperState.fills[0].origin).toBeUndefined();
    });

    it("keeps the opening position's attribution when a later order adds to it", async () => {
        await open(BOT_STAMP);
        await open({ origin: "manual" });

        const position = paperState.positions[0];
        expect(position.origin).toBe("bot");
        expect(position.botId).toBe("rule-bot-1");
    });

    it("stamps only the opening fill; a closing fill inherits by positionId", async () => {
        await open(BOT_STAMP);
        await paperExchange.handle("/api/orders", {
            type: "place-order",
            symbol: "BTCUSDT",
            // The close shape carries the position's side, not the
            // execution direction — BUY closes the long above.
            side: "BUY",
            orderType: "MARKET",
            qty: "0.02",
            tradeSide: "CLOSE",
        });

        expect(paperState.fills).toHaveLength(2);
        const closing = paperState.fills[1];
        expect(closing.tradeSide).toBe("CLOSE");
        expect(closing.origin).toBeUndefined();
        expect(closing.botId).toBeUndefined();
    });
});

describe("FEAT-0806 — the journal carries attribution", () => {
    it("copies the bot attribution into the journal entry", async () => {
        await open(BOT_STAMP);
        paperJournalService.reconcile();

        const entry = lastEntry();
        expect(entry?.origin).toBe("bot");
        expect(entry?.botId).toBe("rule-bot-1");
        expect(entry?.ruleId).toBe("rule-bot-1");
        expect(entry?.strategyHash).toBe(HASH);
    });

    it("leaves an unattributed trade's entry unattributed", async () => {
        await open();
        paperJournalService.reconcile();

        expect(lastEntry()?.origin).toBeUndefined();
    });

    it("survives a reload: the book, the metadata and the entry keep their attribution", async () => {
        await open(BOT_STAMP);
        paperJournalService.reconcile();

        paperState.reloadFromStorage();

        const position = paperState.positions[0];
        expect(position.origin).toBe("bot");
        expect(position.strategyHash).toBe(HASH);
        expect(paperState.getPositionMetadata(position.positionId)?.botId).toBe("rule-bot-1");

        paperJournalService.reconcile();
        const entry = lastEntry();
        expect(entry?.origin).toBe("bot");
        expect(entry?.strategyHash).toBe(HASH);

        // The persisted blob parses back through normalizeJournalEntry with
        // the attribution intact — and an older build strips the unknown
        // fields instead of failing, which is the "absent means manual or
        // unknown" honesty the item promises.
        const normalized = normalizeJournalEntry(JSON.parse(JSON.stringify(entry)));
        expect(normalized.origin).toBe("bot");
        expect(normalized.strategyHash).toBe(HASH);
    });

    it("keeps the attribution when the bot's rule no longer exists", async () => {
        // No rule store takes part anywhere in this flow: the fields are
        // recorded facts, so deleting the rule cannot erase the track record.
        await open(BOT_STAMP);
        paperJournalService.reconcile();

        const entry = lastEntry();
        expect(entry?.ruleId).toBe("rule-bot-1");
        expect(entry?.botId).toBe("rule-bot-1");
    });
});
