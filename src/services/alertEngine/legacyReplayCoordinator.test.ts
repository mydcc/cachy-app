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

import { beforeEach, describe, expect, it } from "vitest";
import type { EvaluationCandle } from "../../lib/rules/types";
import {
    configureLegacyReplay,
    noteLegacyReplaySeriesObserved,
    replayBeforeLegacyEvaluation,
    replayPendingLegacySymbolsAtStartup,
    resetLegacyReplayState,
    setLegacyReplayPopulation,
    type LegacyReplayMember,
} from "./legacyReplayCoordinator";

const candle = (close: string, i: number): EvaluationCandle => ({
    open_time_ms: 1757000000000 + i * 60_000,
    open: close,
    high: close,
    low: close,
    close,
    volume: "1",
});

const series = (closes: string[]): EvaluationCandle[] => closes.map(candle);

/** An alert armed on `symbol` before the reload, i.e. a replay population member. */
const survivor = (symbol: string, id = `${symbol}-survivor`): LegacyReplayMember => ({
    id,
    symbol,
    condition: { price_reached: "15" },
});

interface EvaluateCall {
    symbol: string;
    close: string;
    at: number;
}

/** A mutable fake market store plus a recorder for what the replay fed it. */
function makeSource(initialHistory: Record<string, string[]>, initialHeld: LegacyReplayMember[] = []) {
    const history: Record<string, string[]> = { ...initialHistory };
    const calls: EvaluateCall[] = [];
    let held: LegacyReplayMember[] = [...initialHeld];
    /** The ids out of the engine during each replay, one entry per replay. */
    const withheldPerRun: string[][] = [];

    const source = {
        readCandles: (symbol: string, _timeframe: string): EvaluationCandle[] =>
            history[symbol] ? series(history[symbol]) : [],
        timeframesFor: (symbol: string): readonly string[] => (history[symbol] ? ["1m"] : []),
        evaluate: (symbol: string, close: string, at: number): void => {
            calls.push({ symbol, close, at });
        },
        heldAlertsFor: (symbol: string): readonly LegacyReplayMember[] =>
            held.filter((alert) => alert.symbol === symbol),
        withAlertsWithheld: <T>(ids: readonly string[], run: () => T): T => {
            withheldPerRun.push([...ids]);
            return run();
        },
    };

    return {
        source,
        calls,
        withheldPerRun,
        arm(alert: LegacyReplayMember) {
            held = [...held.filter((a) => a.id !== alert.id), alert];
        },
        setHistory(symbol: string, closes: string[]) {
            history[symbol] = closes;
        },
    };
}

describe("legacyReplayCoordinator", () => {
    beforeEach(() => {
        resetLegacyReplayState();
    });

    it("is inert until a source is configured and a symbol is pending", () => {
        setLegacyReplayPopulation([survivor("BTCUSDT")]);

        expect(() => noteLegacyReplaySeriesObserved("BTCUSDT")).not.toThrow();
        expect(replayPendingLegacySymbolsAtStartup()).toBeNull();
    });

    it("replays a pending symbol as soon as its history becomes observable", () => {
        const h = makeSource({ BTCUSDT: ["10", "20"] });
        configureLegacyReplay(h.source);
        setLegacyReplayPopulation([survivor("BTCUSDT")]);

        noteLegacyReplaySeriesObserved("BTCUSDT");

        expect(h.calls.map((c) => c.close)).toEqual(["10", "20"]);
    });

    it("keeps a symbol pending at startup when its history has not arrived yet, then replays it when it does", () => {
        const h = makeSource({});
        configureLegacyReplay(h.source);
        setLegacyReplayPopulation([survivor("BTCUSDT")]);

        expect(replayPendingLegacySymbolsAtStartup()?.skipped).toEqual(["BTCUSDT"]);
        expect(h.calls).toHaveLength(0);

        h.setHistory("BTCUSDT", ["10", "20"]);
        noteLegacyReplaySeriesObserved("BTCUSDT");

        expect(h.calls.map((c) => c.close)).toEqual(["10", "20"]);
    });

    it("replays before the first live evaluation and never again", () => {
        const h = makeSource({ BTCUSDT: ["10", "20"] });
        configureLegacyReplay(h.source);
        setLegacyReplayPopulation([survivor("BTCUSDT")]);

        replayBeforeLegacyEvaluation("BTCUSDT");
        replayBeforeLegacyEvaluation("BTCUSDT");
        h.setHistory("BTCUSDT", ["30", "40"]);
        noteLegacyReplaySeriesObserved("BTCUSDT");

        expect(h.calls.map((c) => c.close)).toEqual(["10", "20"]);
    });

    it("decides a history-less symbol before its first evaluation, so a late replay cannot fire", () => {
        const h = makeSource({});
        configureLegacyReplay(h.source);
        setLegacyReplayPopulation([survivor("BTCUSDT")]);

        replayBeforeLegacyEvaluation("BTCUSDT");
        h.setHistory("BTCUSDT", ["10", "20"]);
        noteLegacyReplaySeriesObserved("BTCUSDT");

        expect(h.calls).toHaveLength(0);
    });

    it("does not retry a symbol whose replay threw, so a partial baseline is never extended", () => {
        const h = makeSource({ BTCUSDT: ["10", "20"] });
        configureLegacyReplay({
            ...h.source,
            evaluate: (symbol: string, close: string, at: number): void => {
                h.calls.push({ symbol, close, at });
                throw new Error("wasm refused");
            },
        });
        setLegacyReplayPopulation([survivor("BTCUSDT")]);

        expect(replayPendingLegacySymbolsAtStartup()?.failed).toEqual(["BTCUSDT"]);

        noteLegacyReplaySeriesObserved("BTCUSDT");
        expect(h.calls).toHaveLength(1);
    });

    it("does not resurrect a decided symbol when the pending set is recomputed", () => {
        const h = makeSource({ BTCUSDT: ["10", "20"] });
        configureLegacyReplay(h.source);
        setLegacyReplayPopulation([survivor("BTCUSDT")]);
        replayBeforeLegacyEvaluation("BTCUSDT");
        expect(h.calls).toHaveLength(2);

        setLegacyReplayPopulation([survivor("BTCUSDT")]);
        noteLegacyReplaySeriesObserved("BTCUSDT");
        expect(h.calls).toHaveLength(2);
    });

    describe("BUG-0448 — only the population is replayed", () => {
        it("withholds nothing when the engine holds exactly the population", () => {
            const h = makeSource({ BTCUSDT: ["10", "20"] }, [survivor("BTCUSDT")]);
            configureLegacyReplay(h.source);
            setLegacyReplayPopulation([survivor("BTCUSDT")]);

            noteLegacyReplaySeriesObserved("BTCUSDT");

            expect(h.withheldPerRun).toEqual([[]]);
        });

        it("withholds an alert armed on the symbol after the population was taken", () => {
            const h = makeSource({}, [survivor("BTCUSDT")]);
            configureLegacyReplay(h.source);
            setLegacyReplayPopulation([survivor("BTCUSDT")]);
            replayPendingLegacySymbolsAtStartup();

            h.arm({ id: "armed-later", symbol: "BTCUSDT", condition: { price_reached: "15" } });
            h.setHistory("BTCUSDT", ["10", "20"]);
            replayBeforeLegacyEvaluation("BTCUSDT");

            expect(h.withheldPerRun.at(-1)).toEqual(["armed-later"]);
        });

        it("withholds a survivor whose level moved after the population was taken", () => {
            const h = makeSource({ BTCUSDT: ["10", "20"] }, [survivor("BTCUSDT")]);
            configureLegacyReplay(h.source);
            setLegacyReplayPopulation([survivor("BTCUSDT")]);

            h.arm({ ...survivor("BTCUSDT"), condition: { price_reached: "18" } });
            noteLegacyReplaySeriesObserved("BTCUSDT");

            expect(h.withheldPerRun).toEqual([["BTCUSDT-survivor"]]);
        });

        it("scopes a startup batch per symbol, leaving other symbols' alerts alone", () => {
            const h = makeSource({ BTCUSDT: ["10", "20"], ETHUSDT: ["1", "2"] }, [
                survivor("BTCUSDT"),
                survivor("ETHUSDT"),
                { id: "eth-later", symbol: "ETHUSDT", condition: { price_reached: "1.5" } },
            ]);
            configureLegacyReplay(h.source);
            setLegacyReplayPopulation([survivor("BTCUSDT"), survivor("ETHUSDT")]);

            replayPendingLegacySymbolsAtStartup();

            expect(h.withheldPerRun).toEqual([["eth-later"]]);
        });
    });
});
