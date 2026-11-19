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
 * FEAT-0810 — the money-path end to end: a bot's exit closes the position it
 * owns, through the same lane a manual close takes.
 *
 * The three parties are all real here — the wasm core (parsing and
 * evaluating the exit), the loop (the exit window on a closed candle), and
 * the single-close lane (gate, OMS refresh, paper transport). The harness is
 * `paperTrading_seam.test.ts`'s: mocked network, mocked settings, the real
 * book. What is asserted is the spec's own list: closes exactly once,
 * reaches no network, opens nothing, a partial keeps the remainder owned, a
 * manual close ends the story, and a reload mid-exit does not close twice.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Decimal } from "decimal.js";

vi.mock("$app/env", () => ({ browser: true, dev: true }));

vi.mock("./logger", () => ({
    logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("./toastService.svelte", () => ({
    toastService: { error: vi.fn(), success: vi.fn(), add: vi.fn() },
}));

const appFetchMock = vi.hoisted(() => vi.fn());
vi.mock("../lib/appAuth", () => ({
    appFetch: appFetchMock,
    appAuthHeaders: () => ({}),
}));

import { migrateAccounts } from "../../stores/settings/accounts";
vi.mock("../../stores/settings.svelte", async () => {
    const actual = await vi.importActual<typeof import("../../stores/settings.svelte")>(
        "../../stores/settings.svelte",
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

import { tradeService } from "../tradeService";
import { paperState } from "../../stores/paperTrading.svelte";
import { paperExchange, setPaperPriceFeed } from "../paperExchange";
import { registerKillSwitch, registerRiskLimitCheck } from "../orderGate";
import { omsService } from "../omsService";
import { marketState } from "../../stores/market.svelte";
import { RuleEvaluationLoop, type OwnedBotPosition } from "./ruleEvaluationLoop";
import { withBotExits, type BotExitEnvironment } from "./botExits";
import {
    exitActionAnchorFor,
    recordExitActionAnchor,
} from "./ruleStateStore";
import { ruleSchema } from "../../lib/rules/ruleSchema";
import type { RuleDocument } from "../../lib/rules/types";

const WASM_JS = pathToFileURL(resolve(process.cwd(), "static/wasm/technicals_wasm.js")).href;
const WASM_BINARY = resolve(process.cwd(), "static/wasm/technicals_wasm_bg.wasm");

const HASH = "ab".repeat(32);
const STEP = 60_000;

/** The fill price the simulator charges: set to the entry, then to the exit. */
let feedPrice = "100";

function candles(...closes: string[]): Array<Record<string, string | number>> {
    return closes.map((close, i) => ({
        open_time_ms: i * STEP,
        open: "100",
        high: "100",
        low: "100",
        close,
        volume: "0",
    }));
}

function botDocument(id: string, overrides: Partial<RuleDocument> = {}): RuleDocument {
    return {
        schema_version: 3,
        id,
        name: `exit bot ${id}`,
        symbol: "BTCUSDT",
        trigger_timeframe: "1m",
        conditions: {
            kind: "compare",
            left: { kind: "price", field: "close" },
            op: "gte",
            right: { kind: "constant", value: "999999" },
            timeframe: "1m",
        },
        action: {
            consequence_level: "simulate",
            order: { side: "buy", size_basis: "percent_of_equity", size: "10" },
        },
        enabled: true,
        provenance: { source: "human", created_at_ms: 0 },
        exits: [
            {
                when: {
                    kind: "compare",
                    left: { kind: "price", field: "close" },
                    op: "gte",
                    right: { kind: "constant", value: "120" },
                    timeframe: "1m",
                },
                close: "all",
            },
        ],
        ...overrides,
    } as RuleDocument;
}

/** A bot-stamped market entry into the simulated book (FEAT-0806's stamp). */
async function openAs(botId: string): Promise<void> {
    await paperExchange.handle("/api/orders", {
        type: "place-order",
        symbol: "BTCUSDT",
        side: "BUY",
        orderType: "MARKET",
        qty: "2",
        origin: "bot",
        botId,
        ruleId: botId,
        strategyHash: HASH,
    });
}

/**
 * What the app's paper hydration cycle does before a trader closes by hand:
 * the paper row, mapped into the OMS shape the single-close lane reads. The
 * lane's freshness check finds it current, so the close runs against the
 * book without touching the network — the paper contract FEAT-0327 pinned.
 */
function hydrateOms(): void {
    for (const p of paperState.positions) {
        omsService.updatePosition({
            symbol: p.symbol,
            side: p.side as "long" | "short",
            amount: new Decimal(p.amount),
            entryPrice: new Decimal(p.entryPrice),
            unrealizedPnl: new Decimal(0),
            leverage: new Decimal(p.leverage ?? 1),
            marginMode: (p.marginMode ?? "isolated") as "isolated" | "cross",
            positionId: p.positionId,
            lastUpdated: Date.now(),
        });
    }
}

/** The store-layer assembly from `alerts.svelte.ts`, rebuilt on the real book. */
function ownedPositionsOf(ruleId: string): OwnedBotPosition[] {
    return paperState.positions
        .filter((p) => p.origin === "bot" && p.botId === ruleId)
        .map((p) => ({
            symbol: p.symbol,
            positionId: p.positionId,
            side: p.side,
            entryPrice: p.entryPrice,
            amount: p.amount,
            lastExitActionAnchorMs: exitActionAnchorFor(ruleId, p.positionId),
        }));
}

function exitEnv(): BotExitEnvironment {
    return {
        paperEnabled: () => paperState.enabled,
        close: (params) =>
            tradeService.closePosition({
                symbol: params.symbol,
                positionSide: params.positionSide,
                ...(params.amount !== undefined ? { amount: params.amount } : {}),
                ...(params.forceFullClose !== undefined ? { forceFullClose: true } : {}),
            }),
        ownedPosition: (ruleId, positionId) => {
            const position = paperState.positions.find(
                (p) => p.origin === "bot" && p.botId === ruleId && p.positionId === positionId,
            );
            if (position === undefined) return undefined;
            return {
                symbol: position.symbol,
                positionId: position.positionId,
                side: position.side,
                entryPrice: position.entryPrice,
                amount: position.amount,
                lastExitActionAnchorMs: null,
            };
        },
    };
}

/** The loop the wiring arms, over a fixture series. */
function loopOver(
    series: Array<Record<string, string | number>>,
    rule: RuleDocument,
    onRefusal: (firing: unknown, refusal: string) => void = () => {},
) {
    // The account port as a spy: its call count says whether the exit
    // window ran for an anchor at all — a window that never calls it was
    // skipped before evaluation, whatever the candle said.
    const accountProbe = vi.fn(() => null);
    const loop = new RuleEvaluationLoop({
        readCandles: () => series as never,
        readFormingCandles: () => [],
        readRules: () => [rule],
        onFiring: vi.fn(),
        ownedPositions: () => ownedPositionsOf(rule.id),
        accountForPosition: accountProbe,
        recordExitAction: recordExitActionAnchor,
        onExitFiring: withBotExits(exitEnv(), onRefusal as never, () => {}),
    });
    return { loop, accountProbe };
}

beforeEach(async () => {
    localStorage.clear();
    paperState.reloadFromStorage();
    paperState.resetBook();
    paperState.setConfig("slippageBps", "0");
    paperState.setConfig("takerFeeBps", "0");
    paperState.setConfig("failureMode", "none");
    paperState.setConfig("startingBalance", "10000");
    paperState.resetBook();
    paperState.setEnabled(true);
    feedPrice = "100";
    setPaperPriceFeed(() => new Decimal(feedPrice));
    registerKillSwitch(null);
    registerRiskLimitCheck(null);
    omsService.reset();

    // The instrument metadata a partial close is measured against
    // (FEAT-0256): the bot's partial hits the same guard the trader's does,
    // so the test supplies what the app would have loaded from the venue —
    // a 0.01 step and a 0.01 minimum, both comfortably under the sizes here.
    marketState.symbolMeta["BTCUSDT"] = {
        symbol: "BTCUSDT",
        basePrecision: 2,
        minTradeVolume: new Decimal("0.01"),
    };
    appFetchMock.mockReset();
    appFetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ code: "0", data: {} }),
    });

    const mod = (await import(/* @vite-ignore */ WASM_JS)) as {
        default: (binary: BufferSource) => Promise<unknown>;
    };
    await mod.default(readFileSync(WASM_BINARY));
    ruleSchema.setLoader(async () => mod as never);
    await ruleSchema.load();
});

afterEach(() => {
    registerKillSwitch(null);
    registerRiskLimitCheck(null);
    paperState.setEnabled(false);
});

describe("FEAT-0810 — a bot exits through the single-close lane", () => {
    it("closes its owned position exactly once when the exit holds on a closed candle", async () => {
        await openAs("bot-1");
        // The paper hydration the app runs before any close: the OMS holds
        // the row, fresh, so the lane reads the book without the network.
        hydrateOms();
        const positionId = paperState.positions[0]?.positionId;
        expect(new Decimal(paperState.positions[0]?.entryPrice ?? "0").toString()).toBe("100");

        // The market moves to the exit's candle: the anchor's close is 121
        // and the lane fills at the feed's 121.
        feedPrice = "121";
        const series = candles("121", "100");
        const { loop } = loopOver(series, botDocument("bot-1"));

        // The second candle closes the first: the exit window runs at the
        // first candle's anchor, where the close is 121 and >= 120 holds.
        loop.observeCandles("BTCUSDT", "1m", [{ time: 0 }]);
        loop.observeCandles("BTCUSDT", "1m", [{ time: STEP }]);

        await vi.waitFor(() => expect(paperState.positions).toHaveLength(0));

        // The close was real: the exit filled at the feed's 121, entry 100,
        // amount 2 — forty-two realized, no fees, nothing opened.
        expect(paperState.balance.toString()).toBe("10042");
        // And the lane is the paper one: no network call anywhere in it.
        expect(appFetchMock).not.toHaveBeenCalled();
        // The durable ledger recorded the action this close was.
        expect(exitActionAnchorFor("bot-1", positionId ?? "missing")).toBe(0);
        // AC 6's journal half rides on this close: the lane left exactly
        // the closing fill the completion reconciles from — qty 2 at 121 on
        // the exited position, inherited attribution by positionId
        // (FEAT-0806). The journal service's own suite pins what reconcile
        // does with a fill like this one; here the pin is that a bot's exit
        // produces it through the shared lane at all.
        const closeFill = paperState.fills.find(
            (f) => f.positionId === positionId && f.tradeSide === "CLOSE",
        );
        expect(closeFill).toBeDefined();
        expect(closeFill?.qty).toBe("2");
        expect(closeFill?.price).toBe("121");
    });

    it("does not close when the exit does not hold, and evaluates again on the next anchor", async () => {
        await openAs("bot-2");
        hydrateOms();

        // 119 never reaches the 120 exit; 121 on the next anchor does.
        feedPrice = "121";
        const series = candles("119", "121", "100");
        const { loop } = loopOver(series, botDocument("bot-2"));

        loop.observeCandles("BTCUSDT", "1m", [{ time: 0 }]);
        loop.observeCandles("BTCUSDT", "1m", [{ time: STEP }]);
        expect(paperState.positions).toHaveLength(1);

        loop.observeCandles("BTCUSDT", "1m", [{ time: 2 * STEP }]);
        await vi.waitFor(() => expect(paperState.positions).toHaveLength(0));
        expect(appFetchMock).not.toHaveBeenCalled();
    });

    it("a partial exit closes the fraction and leaves the remainder owned, closable by a stronger exit", async () => {
        await openAs("bot-3");
        hydrateOms();

        // Document order is priority: the full exit at the stronger signal
        // is checked first, and only a candle that fails it falls through to
        // the fraction exit — so one rule can scale out at 120 and flatten
        // at 130, with the core picking the first exit that fires.
        const exitWhen = (value: string) => ({
            kind: "compare",
            left: { kind: "price", field: "close" },
            op: "gte",
            right: { kind: "constant", value },
            timeframe: "1m",
        });
        const doc = botDocument("bot-3", {
            exits: [
                { when: exitWhen("130"), close: "all" },
                { when: exitWhen("120"), close: "partial", fraction: "0.5" },
            ],
        } as Partial<RuleDocument>);
        feedPrice = "121";
        const series = candles("121", "100", "130");
        const refusals: Array<[unknown, string]> = [];
        const handleSpy = vi.spyOn(paperExchange, "handle");
        const { loop, accountProbe } = loopOver(series, doc, (firing, refusal) => {
            refusals.push([firing, refusal]);
        });

        // A candle only closes when a later one is announced (`advance`'s
        // mark semantics), so the story takes four notifications: the first
        // sets the mark, the second closes the 121 candle (the partial
        // fires), the third closes the 100 candle (nothing fires — the
        // remainder stayed owned and protected), the fourth closes the 130
        // candle and the stronger exit flattens the remainder.
        loop.observeCandles("BTCUSDT", "1m", [{ time: 0 }]);
        loop.observeCandles("BTCUSDT", "1m", [{ time: STEP }]);
        loop.observeCandles("BTCUSDT", "1m", [{ time: 2 * STEP }]);

        // The exit's submission chain runs detached from the candle drive:
        // settle on the outcome the chain is supposed to produce — half of
        // the book's 2 — before asking how it got there.
        await vi.waitFor(() => expect(paperState.positions[0]?.amount).toBe("1"));

        if (refusals.length > 0) {
            // Visible on failure only: which refusal kept the position open.
            throw new Error(`exit refused: ${refusals.map(([, r]) => r).join(", ")}`);
        }
        // The durable ledger recorded before the sink ran — the firing is a
        // fact even if every later step fails.
        const ledgerPositionId = ownedPositionsOf("bot-3")[0]?.positionId ?? "";
        expect(exitActionAnchorFor("bot-3", ledgerPositionId)).toBe(0);
        // The lane is the paper one or it is nothing: a bot close reaching
        // the network is the one failure mode this test exists to exclude.
        expect(appFetchMock).not.toHaveBeenCalled();
        expect(handleSpy.mock.calls.length).toBe(1);
        expect(handleSpy.mock.calls[0]?.[1]).toMatchObject({
            type: "place-order",
            symbol: "BTCUSDT",
            side: "BUY",
            tradeSide: "CLOSE",
            qty: "1",
            reduceOnly: true,
        });
        expect(paperState.positions[0]?.origin).toBe("bot");
        expect(paperState.positions[0]?.botId).toBe("bot-3");

        // The stronger exit closes the rest — the middle window (the 100
        // candle, nothing fires) proved the remainder stayed the bot's to
        // protect; this notification closes the 130 candle and the exit
        // flattens it. Both halves of the story went through the paper
        // lane, never the network. The refusal check rides inside the poll
        // so a late-arriving refusal names itself in the timeout.
        hydrateOms();
        loop.observeCandles("BTCUSDT", "1m", [{ time: 3 * STEP }]);
        await vi.waitFor(() => {
            if (refusals.length > 0) {
                throw new Error(`exit refused: ${refusals.map(([, r]) => r).join(", ")}`);
            }
            expect(paperState.positions).toHaveLength(0);
        });
        expect(handleSpy.mock.calls.length).toBe(2);
        expect(appFetchMock).not.toHaveBeenCalled();
        // The window ran once per anchor that had an owned position —
        // a count under three means the third anchor was never evaluated.
        expect(accountProbe.mock.calls.length).toBe(3);
    });

    it("a manual close ends the bot's exit story: the window finds no owned position", async () => {
        await openAs("bot-4");
        hydrateOms();

        // The trader closes by hand through the same lane, before any exit
        // is evaluated.
        await tradeService.closePosition({
            symbol: "BTCUSDT",
            positionSide: "long",
            forceFullClose: true,
        });
        expect(paperState.positions).toHaveLength(0);

        const series = candles("121", "100");
        const { loop } = loopOver(series, botDocument("bot-4"));
        loop.observeCandles("BTCUSDT", "1m", [{ time: 0 }]);
        loop.observeCandles("BTCUSDT", "1m", [{ time: STEP }]);

        // The window asked about a position the book no longer lists, and
        // that is the whole story: no close, no re-entry, nothing.
        expect(paperState.positions).toHaveLength(0);
    });

    it("a reload mid-exit does not close twice: the durable ledger bounds the anchor", async () => {
        await openAs("bot-5");

        // The pre-reload session acted at anchor 0 and recorded it — that
        // write is what a reload re-reads before it can act again.
        const positionId = paperState.positions[0]?.positionId ?? "missing";
        recordExitActionAnchor("bot-5", positionId, 0);

        const series = candles("121", "100");
        const { loop } = loopOver(series, botDocument("bot-5"));
        loop.observeCandles("BTCUSDT", "1m", [{ time: 0 }]);
        loop.observeCandles("BTCUSDT", "1m", [{ time: STEP }]);

        // The position is exactly as the reload found it: the ledger said
        // this anchor was already acted on, and the window stayed quiet.
        expect(paperState.positions).toHaveLength(1);
        expect(paperState.positions[0]?.amount).toBe("2");
        expect(appFetchMock).not.toHaveBeenCalled();
    });
});
