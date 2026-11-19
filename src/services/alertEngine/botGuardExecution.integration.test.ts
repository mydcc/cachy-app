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
 * FEAT-0822 — the money-path end to end: a bot's limits are enforced between
 * the firing and the book, and a refused entry leaves nothing behind.
 *
 * The three parties are all real here — the wasm core (parsing and evaluating
 * the firing), the loop (the close that fires both bots), and the entry lane
 * (gate, paper transport, simulator). The harness is
 * `botExitExecution.integration.test.ts`'s: mocked network, mocked settings,
 * the real book and the real guard ledger.
 *
 * What is asserted is the spec's own list: two bots racing one slot, only one
 * entry lands and the loser is refused with the reason the trader is shown
 * and a guard row that survives a restart; a day cap that refuses the second
 * entry of the same day without touching the book; and none of it reaching
 * the network.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";
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

import { marketState } from "../../stores/market.svelte";
import { paperState } from "../../stores/paperTrading.svelte";
import { setPaperPriceFeed } from "../paperExchange";
import { registerKillSwitch, registerRiskLimitCheck } from "../orderGate";
import { omsService } from "../omsService";
import { RuleEvaluationLoop } from "./ruleEvaluationLoop";
import { withBotOrders, type RuleFiring } from "./botOrders";
import { botOrderEnvironment } from "../../stores/alerts.svelte";
import { botEntryActivity } from "./ruleStateStore";
import { readBotGuards, recordBotGuard } from "./botGuardStore";
import type { AwaitingEntrySignal } from "./ruleEvaluationLoop";
import { ruleEvaluationGate } from "../../lib/rules/ruleEvaluationGate";
import type { RuleDocument } from "../../lib/rules/types";

const WASM_JS = pathToFileURL(resolve(process.cwd(), "static/wasm/technicals_wasm.js")).href;
const WASM_BINARY = resolve(process.cwd(), "static/wasm/technicals_wasm_bg.wasm");

/** The fill price the simulator charges for the entries in this file. */
const FEED_PRICE = "100";

const STEP = 60_000;

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
        schema_version: 4,
        id,
        name: `guard bot ${id}`,
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
            order: {
                side: "buy",
                size_basis: "percent_of_equity",
                size: "1",
                stop: { basis: "percent_of_entry", distance: "2" },
            },
        },
        firing_policy: "multi",
        enabled: true,
        provenance: { source: "human", created_at_ms: 0 },
        ...overrides,
    } as RuleDocument;
}

/**
 * The loop the wiring arms over a fixture series, with the entry sink and the
 * real guard ledger. The two price readers are the seam this harness owns:
 * `botOrderEnvironment` takes them as parameters, so the wired environment is
 * assembled exactly as the app assembles it while the prices stay under the
 * test's control.
 */
function loopOver(rules: RuleDocument[], series: Array<Record<string, string | number>>) {
    const refusals: Array<{ ruleId: string; refusal: string }> = [];
    const loop = new RuleEvaluationLoop({
        readCandles: () => series as never,
        readFormingCandles: () => [],
        readRules: () => rules,
        onFiring: withBotOrders(
            vi.fn(),
            botOrderEnvironment(
                () => new Decimal("100"),
                () => new Decimal(FEED_PRICE),
            ),
            (firing: RuleFiring, refusal: string) => {
                refusals.push({ ruleId: firing.rule.id, refusal });
            },
        ) as never,
    });
    return { loop, refusals };
}

/**
 * Announce `closes + 1` forming candles: each announcement closes the
 * previous one (`advance`'s mark semantics), so `drive(loop, 2)` closes the
 * first two candles of the fixture series — the loop reads their OHLC from
 * `readCandles`, exactly as it does when the market store announces.
 *
 * The FIRST firing is the second close: a plain price rule warms up on two
 * candles, so the anchor at candle 0 is withheld by the gate and the anchor
 * at candle 1 is the one that produces a verdict.
 */
function drive(loop: RuleEvaluationLoop, closes: number): void {
    for (let i = 0; i <= closes; i++) {
        loop.observeCandles("BTCUSDT", "1m", [{ time: i * STEP }] as never);
    }
}

/**
 * The outcome of one landed entry, polled as a whole.
 *
 * The paper write happens synchronously inside the transport, so a position
 * becomes visible while the placing promise is still resolving — the
 * counter lands only after it settles. Polling the position alone would race
 * that gap; one predicate over both facts cannot.
 *
 * The budget is generous on purpose: the entry lane resolves its stop attach
 * through a lazy import that costs seconds the first time a process runs it
 * — the transport lands long before the chain settles, and a tight timeout
 * would fail on exactly the first, correct run.
 */
async function waitForEntry(
    positions: number,
    total: number,
): Promise<void> {
    await vi.waitFor(
        () => {
            expect(paperState.positions).toHaveLength(positions);
            expect(botEntryActivity("bot-c").total).toBe(total);
        },
        { timeout: 10_000 },
    );
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
    setPaperPriceFeed(() => new Decimal(FEED_PRICE));
    registerKillSwitch(null);
    registerRiskLimitCheck(null);
    omsService.reset();

    // The instrument metadata the entry lane measures against (FEAT-0256):
    // the bot's entry hits the same guard the trader's does, so the test
    // supplies what the app would have loaded from the venue.
    marketState.symbolMeta["BTCUSDT"] = {
        basePrecision: 2,
        minTradeVolume: new Decimal("0.01"),
    };

    // The artifact is committed under `static/wasm/`, so this runs on a bare
    // checkout — the same loader discipline every rule integration test uses.
    const mod = (await import(/* @vite-ignore */ WASM_JS)) as {
        default: (binary: string) => Promise<unknown>;
    };
    await mod.default(readFileSync(WASM_BINARY));
    const { ruleSchema } = await import("../../lib/rules/ruleSchema");
    ruleSchema.setLoader(async () => mod as never);
    await ruleSchema.load();
});

describe("FEAT-0822 — firing limits on the money path", () => {
    it("two bots race one slot: one entry lands, the loser is refused and logged", async () => {
        const series = candles("100", "100", "100");
        const { loop, refusals } = loopOver(
            [botDocument("bot-a"), botDocument("bot-b")],
            series,
        );

        drive(loop, 2);
        await vi.waitFor(
            () => {
                // The winner owns the only new position; the loser's refusal
                // names the reason the trader is shown. One predicate: the entry
                // and its refusal are one anchor's outcome.
                expect(paperState.positions).toHaveLength(1);
                expect(paperState.positions[0]?.botId).toBe("bot-a");
                expect(refusals).toEqual([{ ruleId: "bot-b", refusal: "slot-reserved" }]);
            },
            { timeout: 10_000 },
        );

        // The refusal left a ledger row, not just a toast: the history the
        // sidebar renders is fed from the same store this lane writes.
        expect(readBotGuards("bot-b")[0]?.reason).toBe("slot-reserved");

        // No exposure the trader did not ask for, no network either.
        expect(appFetchMock).not.toHaveBeenCalled();
    });

    it("a day cap refuses the second entry, and the count survives a restart", async () => {
        const capped = botDocument("bot-c", { max_entries_per_day: 1 });
        const series = candles("100", "100", "100", "100", "100");
        const { loop, refusals } = loopOver([capped], series);

        // Anchors 0 and 1 close; the second one is the first that can fire,
        // and the entry lands with the counter recording it.
        drive(loop, 2);
        await waitForEntry(1, 1);

        // Anchor 2: the same day, the cap is spent. The refusal names the
        // day limit, the book keeps exactly one position, and the counter
        // did not move — a refused attempt is never an entry.
        drive(loop, 3);
        await vi.waitFor(
            () => {
                expect(refusals.some((r) => r.refusal === "limit-entries-day")).toBe(true);
                expect(paperState.positions).toHaveLength(1);
                expect(botEntryActivity("bot-c").total).toBe(1);
            },
            { timeout: 10_000 },
        );
        expect(readBotGuards("bot-c")[0]?.reason).toBe("limit-entries-day");

        // A restart is a new loop over the same storage. The gate's
        // in-memory anchor map does not survive a restart — `forget` is the
        // disarm-and-rearm that makes the second loop's anchor decidable
        // again — but the COUNTER is a fact of the ledger, and it is the
        // counter that must still be spent.
        ruleEvaluationGate.forget("bot-c");
        const second = loopOver([capped], series);
        drive(second.loop, 2);
        await vi.waitFor(
            () => {
                expect(
                    second.refusals.some((r) => r.refusal === "limit-entries-day"),
                ).toBe(true);
                expect(paperState.positions).toHaveLength(1);
                expect(botEntryActivity("bot-c").total).toBe(1);
            },
            { timeout: 10_000 },
        );

        // And nothing anywhere reached the network.
        expect(appFetchMock).not.toHaveBeenCalled();
    });
});

describe("FEAT-0823 — confirmation entries on the money path", () => {
    /**
     * The loop the wiring arms, with the confirmation ports the live wiring
     * provides: the awaiting report captured, and the discards landed in the
     * same guard ledger every other refusal records through.
     */
    function loopOverConfirmation(
        rules: RuleDocument[],
        series: Array<Record<string, string | number>>,
    ) {
        const refusals: Array<{ ruleId: string; refusal: string }> = [];
        const awaiting: Array<AwaitingEntrySignal[]> = [];
        const loop = new RuleEvaluationLoop({
            readCandles: () => series as never,
            readFormingCandles: () => [],
            readRules: () => rules,
            onFiring: withBotOrders(
                vi.fn(),
                botOrderEnvironment(
                    () => new Decimal("100"),
                    () => new Decimal(FEED_PRICE),
                ),
                (firing: RuleFiring, refusal: string) => {
                    refusals.push({ ruleId: firing.rule.id, refusal });
                },
            ) as never,
            onAwaiting: (_symbol, _timeframe, slice) => {
                awaiting.push(slice);
            },
            onSignalDiscarded: (ruleId, anchorMs, reason) => {
                recordBotGuard(ruleId, reason, anchorMs);
            },
        });
        return { loop, refusals, awaiting };
    }

    it("waits at the signal, then enters once on the green confirmation close", async () => {
        const bot = botDocument("bot-confirm", {
            schema_version: 5,
            entry_trigger: "confirmation",
        });
        // Candle 1 carries the signal (close 100 >= 100); candle 2 is the
        // green confirmation (close 101 over open 100).
        const series = candles("100", "100", "101");
        const { loop, refusals, awaiting } = loopOverConfirmation([bot], series);

        // Closes 0 and 1: warmup withholds the first anchor, the second is
        // the signal — held, reported, and nothing entered.
        drive(loop, 2);
        expect(paperState.positions).toHaveLength(0);
        expect(awaiting.at(-1)).toEqual([{ ruleId: "bot-confirm", signalAnchorMs: STEP }]);

        // The confirmation close consumes the wait and the entry lands
        // through the same lane every entry takes.
        drive(loop, 3);
        await vi.waitFor(
            () => {
                expect(paperState.positions).toHaveLength(1);
                expect(paperState.positions[0]?.botId).toBe("bot-confirm");
                expect(botEntryActivity("bot-confirm").total).toBe(1);
            },
            { timeout: 10_000 },
        );

        // The entry is the whole story: no refusals, no discards, no
        // network — and the confirm close's own signal (conditions still
        // holding) is the next wait, not another entry.
        expect(refusals).toEqual([]);
        expect(readBotGuards("bot-confirm")).toEqual([]);
        expect(appFetchMock).not.toHaveBeenCalled();
        expect(awaiting.at(-1)).toEqual([{ ruleId: "bot-confirm", signalAnchorMs: 2 * STEP }]);
    });

    it("a counter candle discards the signal and the guard ledger says why", async () => {
        const bot = botDocument("bot-counter", {
            schema_version: 5,
            entry_trigger: "confirmation",
        });
        // Candle 2 closes red (99 under open 100): the market refused.
        const series = candles("100", "100", "99");
        const { loop, refusals } = loopOverConfirmation([bot], series);

        drive(loop, 3);
        await vi.waitFor(
            () => {
                expect(readBotGuards("bot-counter")[0]?.reason).toBe(
                    "confirmation-against-direction",
                );
            },
            { timeout: 10_000 },
        );

        // The discard is the whole outcome: no position, no entry counted,
        // no refusal reached the lane, nothing reached the network.
        expect(paperState.positions).toHaveLength(0);
        expect(botEntryActivity("bot-counter").total).toBe(0);
        expect(refusals).toEqual([]);
        expect(appFetchMock).not.toHaveBeenCalled();
    });
});
