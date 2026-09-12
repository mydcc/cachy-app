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
    setPendingLegacyReplaySymbols,
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

interface EvaluateCall {
    symbol: string;
    close: string;
    at: number;
}

/** A mutable fake market store plus a recorder for what the replay fed it. */
function makeSource(initialHistory: Record<string, string[]>) {
    const history: Record<string, string[]> = { ...initialHistory };
    const calls: EvaluateCall[] = [];

    const source = {
        readCandles: (symbol: string, _timeframe: string): EvaluationCandle[] =>
            history[symbol] ? series(history[symbol]) : [],
        timeframesFor: (symbol: string): readonly string[] => (history[symbol] ? ["1m"] : []),
        evaluate: (symbol: string, close: string, at: number): void => {
            calls.push({ symbol, close, at });
        },
    };

    return {
        source,
        calls,
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
        setPendingLegacyReplaySymbols(["BTCUSDT"]);

        expect(() => noteLegacyReplaySeriesObserved("BTCUSDT")).not.toThrow();
        expect(replayPendingLegacySymbolsAtStartup()).toBeNull();
    });

    it("replays a pending symbol as soon as its history becomes observable", () => {
        const h = makeSource({ BTCUSDT: ["10", "20"] });
        configureLegacyReplay(h.source);
        setPendingLegacyReplaySymbols(["BTCUSDT"]);

        noteLegacyReplaySeriesObserved("BTCUSDT");

        expect(h.calls.map((c) => c.close)).toEqual(["10", "20"]);
    });

    it("keeps a symbol pending at startup when its history has not arrived yet, then replays it when it does", () => {
        const h = makeSource({});
        configureLegacyReplay(h.source);
        setPendingLegacyReplaySymbols(["BTCUSDT"]);

        expect(replayPendingLegacySymbolsAtStartup()?.skipped).toEqual(["BTCUSDT"]);
        expect(h.calls).toHaveLength(0);

        h.setHistory("BTCUSDT", ["10", "20"]);
        noteLegacyReplaySeriesObserved("BTCUSDT");

        expect(h.calls.map((c) => c.close)).toEqual(["10", "20"]);
    });

    it("replays before the first live evaluation and never again", () => {
        const h = makeSource({ BTCUSDT: ["10", "20"] });
        configureLegacyReplay(h.source);
        setPendingLegacyReplaySymbols(["BTCUSDT"]);

        replayBeforeLegacyEvaluation("BTCUSDT");
        replayBeforeLegacyEvaluation("BTCUSDT");
        h.setHistory("BTCUSDT", ["30", "40"]);
        noteLegacyReplaySeriesObserved("BTCUSDT");

        expect(h.calls.map((c) => c.close)).toEqual(["10", "20"]);
    });

    it("decides a history-less symbol before its first evaluation, so a late replay cannot fire", () => {
        const h = makeSource({});
        configureLegacyReplay(h.source);
        setPendingLegacyReplaySymbols(["BTCUSDT"]);

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
        setPendingLegacyReplaySymbols(["BTCUSDT"]);

        expect(replayPendingLegacySymbolsAtStartup()?.failed).toEqual(["BTCUSDT"]);

        noteLegacyReplaySeriesObserved("BTCUSDT");
        expect(h.calls).toHaveLength(1);
    });

    it("does not resurrect a decided symbol when the pending set is recomputed", () => {
        const h = makeSource({ BTCUSDT: ["10", "20"] });
        configureLegacyReplay(h.source);
        setPendingLegacyReplaySymbols(["BTCUSDT"]);
        replayBeforeLegacyEvaluation("BTCUSDT");
        expect(h.calls).toHaveLength(2);

        setPendingLegacyReplaySymbols(["BTCUSDT"]);
        noteLegacyReplaySeriesObserved("BTCUSDT");
        expect(h.calls).toHaveLength(2);
    });
});
