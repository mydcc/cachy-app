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

import { describe, expect, it, vi } from "vitest";
import type { EvaluationCandle } from "../../lib/rules/types";
import { REPLAY_MAX_CANDLES, replayClosedCandles } from "./replayClosedCandles";

const candle = (close: string, i: number): EvaluationCandle => ({
    open_time_ms: 1757000000000 + i * 60_000,
    open: close,
    high: close,
    low: close,
    close,
    volume: "1",
});

const series = (closes: string[]): EvaluationCandle[] => closes.map(candle);

const alert = (id: string, symbol: string, active = true) => ({ id, symbol, active });

describe("replayClosedCandles", () => {
    it("feeds a symbol's closed candles oldest first, so a crossing that happened while the app was closed is seen", () => {
        const evaluate = vi.fn();
        const report = replayClosedCandles({
            alerts: [alert("a1", "BTCUSDT")],
            readCandles: () => series(["64000", "64500", "65500", "66000"]),
            evaluate,
        });

        expect(evaluate.mock.calls.map((c) => c[1])).toEqual(["64000", "64500", "65500", "66000"]);
        expect(report.symbols).toBe(1);
        expect(report.candles).toBe(4);
    });

    it("anchors each replayed close to its own candle, not to now", () => {
        const evaluate = vi.fn();
        replayClosedCandles({
            alerts: [alert("a1", "BTCUSDT")],
            readCandles: () => series(["64000", "65500"]),
            evaluate,
        });

        expect(evaluate.mock.calls.map((c) => c[2])).toEqual([1757000000000, 1757000060000]);
    });

    it("replays each symbol that has an active alert exactly once, however many alerts it carries", () => {
        const evaluate = vi.fn();
        const report = replayClosedCandles({
            alerts: [alert("a1", "BTCUSDT"), alert("a2", "BTCUSDT"), alert("a3", "ETHUSDT")],
            readCandles: () => series(["1", "2"]),
            evaluate,
        });

        expect(report.symbols).toBe(2);
        expect(evaluate.mock.calls.filter((c) => c[0] === "BTCUSDT")).toHaveLength(2);
        expect(evaluate.mock.calls.filter((c) => c[0] === "ETHUSDT")).toHaveLength(2);
    });

    it("ignores an alert that has already fired, so replay cannot resurrect it", () => {
        const evaluate = vi.fn();
        const report = replayClosedCandles({
            alerts: [alert("a1", "BTCUSDT", false)],
            readCandles: () => series(["1", "2"]),
            evaluate,
        });

        expect(evaluate).not.toHaveBeenCalled();
        expect(report.symbols).toBe(0);
    });

    it("replays nothing when the symbol has no usable history, rather than guessing a baseline", () => {
        const evaluate = vi.fn();
        const report = replayClosedCandles({
            alerts: [alert("a1", "BTCUSDT")],
            readCandles: () => [],
            evaluate,
        });

        expect(evaluate).not.toHaveBeenCalled();
        expect(report.skipped).toEqual(["BTCUSDT"]);
    });

    it("needs two candles: one close cannot express a crossing and must not seed a baseline alone", () => {
        const evaluate = vi.fn();
        const report = replayClosedCandles({
            alerts: [alert("a1", "BTCUSDT")],
            readCandles: () => series(["64000"]),
            evaluate,
        });

        expect(evaluate).not.toHaveBeenCalled();
        expect(report.skipped).toEqual(["BTCUSDT"]);
    });

    it("takes the first timeframe that has history, finest first", () => {
        const evaluate = vi.fn();
        const readCandles = vi.fn((_symbol: string, timeframe: string) =>
            timeframe === "5m" ? series(["10", "20"]) : [],
        );

        replayClosedCandles({ alerts: [alert("a1", "BTCUSDT")], readCandles, evaluate });

        expect(readCandles.mock.calls.map((c) => c[1])).toEqual(["1m", "5m"]);
        expect(evaluate.mock.calls.map((c) => c[1])).toEqual(["10", "20"]);
    });

    it("uses the symbol's own available timeframes when a provider is given, not a fixed probe list", () => {
        // BUG-0441 review: a symbol charted at 1h has no 1m/5m/15m series, so
        // probing a fixed list skips it even though history is right there.
        const evaluate = vi.fn();
        const readCandles = vi.fn((_symbol: string, timeframe: string) =>
            timeframe === "1h" ? series(["10", "20"]) : [],
        );

        replayClosedCandles({
            alerts: [alert("a1", "BTCUSDT")],
            readCandles,
            timeframesFor: () => ["1h"],
            evaluate,
        });

        expect(readCandles.mock.calls.map((c) => c[1])).toEqual(["1h"]);
        expect(evaluate.mock.calls.map((c) => c[1])).toEqual(["10", "20"]);
    });

    it("names the symbols it replayed so a per-symbol caller can mark them done", () => {
        const evaluate = vi.fn();
        const report = replayClosedCandles({
            alerts: [alert("a1", "BTCUSDT"), alert("a2", "ETHUSDT")],
            readCandles: (symbol) => (symbol === "BTCUSDT" ? series(["1", "2"]) : []),
            evaluate,
        });

        expect(report.symbols).toBe(1);
        expect(report.replayed).toEqual(["BTCUSDT"]);
        expect(report.skipped).toEqual(["ETHUSDT"]);
    });

    it("bounds the replay to the most recent window, keeping the newest closes", () => {
        const evaluate = vi.fn();
        const long = series(Array.from({ length: REPLAY_MAX_CANDLES + 50 }, (_, i) => String(i)));

        const report = replayClosedCandles({
            alerts: [alert("a1", "BTCUSDT")],
            readCandles: () => long,
            evaluate,
        });

        expect(report.candles).toBe(REPLAY_MAX_CANDLES);
        expect(evaluate.mock.calls[0][1]).toBe("50");
        expect(evaluate.mock.calls.at(-1)?.[1]).toBe(String(REPLAY_MAX_CANDLES + 49));
    });

    it("keeps going when one symbol's history cannot be read", () => {
        const evaluate = vi.fn();
        const report = replayClosedCandles({
            alerts: [alert("a1", "BROKEN"), alert("a2", "ETHUSDT")],
            readCandles: (symbol) => {
                if (symbol === "BROKEN") throw new Error("store gone");
                return series(["1", "2"]);
            },
            evaluate,
        });

        expect(report.failed).toEqual(["BROKEN"]);
        expect(evaluate.mock.calls.filter((c) => c[0] === "ETHUSDT")).toHaveLength(2);
    });

    it("keeps going when one evaluation throws", () => {
        const evaluate = vi.fn((symbol: string) => {
            if (symbol === "BROKEN") throw new Error("wasm refused");
        });
        const report = replayClosedCandles({
            alerts: [alert("a1", "BROKEN"), alert("a2", "ETHUSDT")],
            readCandles: () => series(["1", "2"]),
            evaluate,
        });

        expect(report.failed).toEqual(["BROKEN"]);
        expect(evaluate.mock.calls.filter((c) => c[0] === "ETHUSDT")).toHaveLength(2);
    });

    it("drops an unusable candle from the middle and replays the rest", () => {
        const evaluate = vi.fn();
        const broken = series(["64000", "64500", "65500", "66000"]);
        (broken[1] as { close: unknown }).close = null;

        const report = replayClosedCandles({
            alerts: [alert("a1", "BTCUSDT")],
            readCandles: () => broken,
            evaluate,
        });

        expect(evaluate.mock.calls.map((c) => c[1])).toEqual(["64000", "65500", "66000"]);
        expect(report.candles).toBe(3);
    });

    it("refuses to seed a baseline from a single usable close, however many candles the store held", () => {
        // One close says nothing about a crossing, and a lone stale baseline
        // paired with the next live tick spans an unknown gap — which is the
        // arbitrary jump this replay exists to avoid, not a cheap win.
        const evaluate = vi.fn();
        const broken = series(["64000", "65500"]);
        (broken[1] as { close: unknown }).close = null;

        const report = replayClosedCandles({
            alerts: [alert("a1", "BTCUSDT")],
            readCandles: () => broken,
            evaluate,
        });

        expect(evaluate).not.toHaveBeenCalled();
        expect(report.skipped).toEqual(["BTCUSDT"]);
    });

    it("does nothing at all when no alert is armed", () => {
        const evaluate = vi.fn();
        const readCandles = vi.fn(() => series(["1", "2"]));

        const report = replayClosedCandles({ alerts: [], readCandles, evaluate });

        expect(readCandles).not.toHaveBeenCalled();
        expect(evaluate).not.toHaveBeenCalled();
        expect(report.symbols).toBe(0);
    });
});
