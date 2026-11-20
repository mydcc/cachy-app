/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
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
 * FEAT-0812 — who ended the trade.
 *
 * FEAT-0806 recorded who opened a position and stopped there, deliberately:
 * attribution is an open-time fact. The track record needs the other end,
 * because a position a bot opened and a human closed by hand says nothing
 * about whether the bot's exit works — the exit never ran.
 *
 * The claim these tests pin: a bot-opened entry completes carrying a verdict
 * about its exit, that verdict says "manual" unless the bot's own exit lane
 * reported the close, and a trade nobody attributed stays unstamped.
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

const PRICE = new Decimal(50000);
const HASH = "ab".repeat(32);
let feed: Record<string, Decimal | null> = {};

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

async function open(payload: Record<string, unknown> = {}): Promise<string> {
    await paperExchange.handle("/api/orders", {
        type: "place-order",
        symbol: "BTCUSDT",
        side: "BUY",
        orderType: "MARKET",
        qty: "0.02",
        ...payload,
    });
    // The open entry has to exist before the close can complete it — the
    // reconciler is what writes it, exactly as the app's own wiring does.
    paperJournalService.reconcile();
    return paperState.positions[0].positionId;
}

async function closeByHand(): Promise<void> {
    await paperExchange.handle("/api/orders", {
        type: "place-order",
        symbol: "BTCUSDT",
        // Bitunix's close shape names the *position's* side, so BUY closes
        // the long opened above — see `applyClose` in `paperExchange`.
        side: "BUY",
        orderType: "MARKET",
        qty: "0.02",
        reduceOnly: true,
    });
    paperJournalService.reconcile();
}

async function openWithStop(payload: Record<string, unknown> = {}): Promise<string> {
    return open({ ...payload, slPrice: "49000" });
}

/** Walks the feed through the resting stop, the way the price loop does. */
function crossTheStop(price: string): void {
    feed = { BTCUSDT: new Decimal(price) };
    paperExchange.settleRestingOrders("BTCUSDT", new Decimal(price));
    paperJournalService.reconcile();
}

function entryFor(positionId: string) {
    return journalState.entries.find((e) => e.tradeId === positionId);
}

describe("FEAT-0812 — exit attribution on a completed entry", () => {
    it("marks a bot-opened position closed by hand as a manual exit", async () => {
        const positionId = await open(BOT_STAMP);

        await closeByHand();

        const entry = entryFor(positionId);
        expect(entry?.origin).toBe("bot");
        expect(entry?.exitOrigin).toBe("manual");
    });

    it("marks the exit as the bot's when its exit lane reported the close", async () => {
        const positionId = await open(BOT_STAMP);

        paperJournalService.recordBotExit(positionId);
        await closeByHand();

        expect(entryFor(positionId)?.exitOrigin).toBe("bot");
    });

    it("keeps the bot's verdict when the report arrives after the entry completed", async () => {
        // The close lane resolves after the simulator has already reconciled,
        // so the report can land on an entry that is already closed. The
        // record must still say the bot ended the trade.
        const positionId = await open(BOT_STAMP);
        await closeByHand();

        paperJournalService.recordBotExit(positionId);

        expect(entryFor(positionId)?.exitOrigin).toBe("bot");
    });

    it("leaves a trade nobody attributed without an exit verdict", async () => {
        const positionId = await open();

        await closeByHand();

        const entry = entryFor(positionId);
        expect(entry?.origin).toBeUndefined();
        expect(entry?.exitOrigin).toBeUndefined();
    });
});

describe("FEAT-0812 — the bot's own stop is the bot's exit", () => {
    it("counts a stop the bot attached as the bot's exit, not the trader's", async () => {
        // `submitBotOrder` sends `stopLossPrice` with the entry, so the stop
        // resting against a bot position is the strategy's own. When it fires
        // nobody pressed anything — reading it as human intervention drops
        // exactly the losing trades out of the headline figures.
        const positionId = await openWithStop(BOT_STAMP);
        expect(paperState.orders.some((o) => o.planType === "SL")).toBe(true);

        crossTheStop("48000");

        const entry = entryFor(positionId);
        expect(entry?.status).toBe("Lost");
        expect(entry?.exitOrigin).toBe("bot");
    });

    it("leaves a plan on an unattributed position without a verdict", async () => {
        const positionId = await openWithStop();

        crossTheStop("48000");

        expect(entryFor(positionId)?.exitOrigin).toBeUndefined();
    });
});

describe("FEAT-0812 — a book reset must not rewrite old attribution", () => {
    it("gives a position opened after a reset an id of its own", async () => {
        const first = await open(BOT_STAMP);
        await closeByHand();
        expect(entryFor(first)?.exitOrigin).toBe("manual");

        // The reset wipes the book and keeps the journal, so a rewound id
        // counter would hand this position the first entry's `tradeId`.
        paperState.resetBook();
        const second = await open(BOT_STAMP);
        expect(second).not.toBe(first);

        paperJournalService.recordBotExit(second);
        await closeByHand();

        expect(entryFor(first)?.exitOrigin).toBe("manual");
        expect(entryFor(second)?.exitOrigin).toBe("bot");
    });

    it("reports on the newest entry when a stored book already reused an id", async () => {
        // A book written before the fix above: two journal entries share a
        // tradeId, and the verdict belongs to the one closed last.
        const positionId = await open(BOT_STAMP);
        await closeByHand();
        const stale = { ...journalState.entries[0], id: "legacy-1" };
        journalState.set([stale, ...journalState.entries]);

        paperJournalService.recordBotExit(positionId);

        // `entryFor` takes the first match, which is the stale copy here — so
        // the live entry is named explicitly rather than looked up the way
        // the bug itself looked it up.
        const live = [...journalState.entries]
            .reverse()
            .find((e) => e.tradeId === positionId);
        expect(live?.id).not.toBe("legacy-1");
        expect(live?.exitOrigin).toBe("bot");
        expect(journalState.entries.find((e) => e.id === "legacy-1")?.exitOrigin).toBe(
            "manual",
        );
    });
});
