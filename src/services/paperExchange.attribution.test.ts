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
import { CONSTANTS } from "../lib/constants";
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

    it("refuses bot identity on a manual order — nothing mis-stamps as a bot", async () => {
        // The paranoid case a boundary has to answer: identity without the
        // matching origin. The guard drops it, so the book reads a manual
        // trade, never a manual-looking bot.
        await open({
            origin: "manual",
            botId: "rule-bot-1",
            ruleId: "rule-bot-1",
            strategyHash: HASH,
        });

        const position = paperState.positions[0];
        expect(position.origin).toBe("manual");
        expect(position.botId).toBeUndefined();
        expect(position.strategyHash).toBeUndefined();

        const fill = paperState.fills[0];
        expect(fill.origin).toBe("manual");
        expect(fill.botId).toBeUndefined();
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
        // the attribution intact. The other direction — a blob written
        // before this change — is pinned by the legacy-blob tests below.
        const normalized = normalizeJournalEntry(JSON.parse(JSON.stringify(entry)));
        expect(normalized.origin).toBe("bot");
        expect(normalized.strategyHash).toBe(HASH);
    });

    it("reads a journal entry written before the change as unattributed", async () => {
        await open(BOT_STAMP);
        paperJournalService.reconcile();

        // The entry a pre-0806 build would have stored: the same row, minus
        // the four attribution keys.
        const legacy = JSON.parse(JSON.stringify(lastEntry())) as Record<string, unknown>;
        for (const key of ["origin", "botId", "ruleId", "strategyHash"]) delete legacy[key];

        const normalized = normalizeJournalEntry(legacy);
        expect(normalized.symbol).toBe("BTCUSDT");
        expect(normalized.origin).toBeUndefined();
        expect(normalized.botId).toBeUndefined();
        expect(normalized.ruleId).toBeUndefined();
        expect(normalized.strategyHash).toBeUndefined();
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

describe("FEAT-0806 — attribution stays on the device (ADR-0001)", () => {
    function storedKeys(): string[] {
        const keys: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key !== null) keys.push(key);
        }
        return keys.sort();
    }

    it("writes a bot trade under the same keys as a manual one, with no network call", async () => {
        const fetchSpy = vi.spyOn(globalThis, "fetch");
        try {
            await open({ origin: "manual" });
            paperJournalService.reconcile();
            const manualKeys = storedKeys();
            expect(manualKeys).toContain(CONSTANTS.LOCAL_STORAGE_PAPER_KEY);

            localStorage.clear();
            journalState.set([]);
            paperState.resetBook();
            await open(BOT_STAMP);
            paperJournalService.reconcile();

            expect(lastEntry()?.origin).toBe("bot");
            expect(storedKeys()).toEqual(manualKeys);
            expect(fetchSpy).not.toHaveBeenCalled();
        } finally {
            fetchSpy.mockRestore();
        }
    });
});

describe("FEAT-0806 — blobs from other builds", () => {
    /** The same book a pre-0806 build would have written: minus every key. */
    function stripAttribution(raw: string): string {
        const blob = JSON.parse(raw) as {
            positions?: Record<string, unknown>[];
            fills?: Record<string, unknown>[];
            positionMetadata?: Record<string, Record<string, unknown>>;
        };
        const keys = ["origin", "botId", "ruleId", "strategyHash"] as const;
        for (const row of blob.positions ?? []) for (const key of keys) delete row[key];
        for (const row of blob.fills ?? []) for (const key of keys) delete row[key];
        for (const meta of Object.values(blob.positionMetadata ?? {}))
            for (const key of keys) delete meta[key];
        return JSON.stringify(blob);
    }

    it("loads a pre-field blob: the book survives and reads unattributed", async () => {
        await open(BOT_STAMP);
        localStorage.setItem(
            CONSTANTS.LOCAL_STORAGE_PAPER_KEY,
            stripAttribution(localStorage.getItem(CONSTANTS.LOCAL_STORAGE_PAPER_KEY) as string),
        );
        paperState.reloadFromStorage();

        expect(paperState.positions).toHaveLength(1);
        expect(paperState.positions[0].origin).toBeUndefined();
        expect(paperState.fills[0].origin).toBeUndefined();
        expect(
            paperState.getPositionMetadata(paperState.positions[0].positionId)?.botId,
        ).toBeUndefined();
    });

    it("reads an unknown origin value as unattributed instead of wiping the book", async () => {
        await open(BOT_STAMP);
        const blob = JSON.parse(
            localStorage.getItem(CONSTANTS.LOCAL_STORAGE_PAPER_KEY) as string,
        ) as { positions: Record<string, unknown>[]; fills: Record<string, unknown>[] };
        // A value a later build may know (ADR-0027's grid bot) but this one
        // does not. The catch is per-field: the row survives, the unknown
        // value reads as "manual or unknown", and the next persist() has a
        // book to write instead of an empty one over the saved history.
        blob.positions[0].origin = "grid";
        blob.fills[0].origin = "grid";
        localStorage.setItem(CONSTANTS.LOCAL_STORAGE_PAPER_KEY, JSON.stringify(blob));
        paperState.reloadFromStorage();

        expect(paperState.positions).toHaveLength(1);
        expect(paperState.positions[0].origin).toBeUndefined();
        expect(paperState.positions[0].botId).toBe("rule-bot-1");
        expect(paperState.fills).toHaveLength(1);
        expect(paperState.fills[0].origin).toBeUndefined();
        expect(paperState.fills[0].botId).toBe("rule-bot-1");
    });
});
