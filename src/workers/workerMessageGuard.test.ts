/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import { describe, it, expect } from "vitest";
import {
  MAX_AGGREGATOR_JOURNAL,
  MAX_WORKER_POINTS,
  readAggregatorWorkerMessage,
  readTechnicalsWorkerMessage,
} from "./workerMessageGuard";

const series = (length: number, value = 1) => {
  const out = new Float64Array(length);
  out.fill(value);
  return out;
};

const aligned = (length = 3) => ({
  times: series(length, 1),
  opens: series(length, 2),
  highs: series(length, 3),
  lows: series(length, 4),
  closes: series(length, 5),
  volumes: series(length, 6),
});

describe("readTechnicalsWorkerMessage", () => {
  it("accepts a CALCULATE message with aligned SoA arrays", () => {
    expect(
      readTechnicalsWorkerMessage({ type: "CALCULATE", payload: aligned() }),
    ).toMatchObject({ type: "CALCULATE" });
  });

  it("rejects SoA arrays whose lengths disagree", () => {
    const payload = aligned();
    payload.closes = series(4);

    expect(
      readTechnicalsWorkerMessage({ type: "CALCULATE", payload }),
    ).toBeNull();
  });

  it("rejects arrays above the cap", () => {
    expect(
      readTechnicalsWorkerMessage({
        type: "CALCULATE",
        payload: aligned(MAX_WORKER_POINTS + 1),
      }),
    ).toBeNull();
  });

  it("accepts the legacy klines shape and rejects a non-array", () => {
    expect(
      readTechnicalsWorkerMessage({
        type: "CALCULATE",
        payload: { klines: [{ time: 1 }] },
      }),
    ).not.toBeNull();
    expect(
      readTechnicalsWorkerMessage({ type: "CALCULATE", payload: { klines: {} } }),
    ).toBeNull();
  });

  it("requires an id for INITIALIZE and UPDATE", () => {
    expect(
      readTechnicalsWorkerMessage({ type: "INITIALIZE", payload: aligned() }),
    ).toBeNull();
    expect(
      readTechnicalsWorkerMessage({
        type: "INITIALIZE",
        id: "BTCUSDT:1m",
        payload: aligned(),
      }),
    ).not.toBeNull();
    expect(
      readTechnicalsWorkerMessage({
        type: "UPDATE",
        payload: { kline: { time: 1, open: 1, high: 1, low: 1, close: 1, volume: 1 } },
      }),
    ).toBeNull();
  });

  it("rejects an UPDATE kline with a missing or non-numeric field", () => {
    expect(
      readTechnicalsWorkerMessage({
        type: "UPDATE",
        id: "BTCUSDT:1m",
        payload: { kline: { time: 1, open: 1, high: 1, low: 1, close: 1 } },
      }),
    ).toBeNull();
  });

  it("accepts CLEANUP with no payload and rejects an unknown type", () => {
    expect(readTechnicalsWorkerMessage({ type: "CLEANUP" })).not.toBeNull();
    expect(readTechnicalsWorkerMessage({ type: "SHIFT" })).toBeNull();
    expect(readTechnicalsWorkerMessage(null)).toBeNull();
  });
});

describe("readAggregatorWorkerMessage", () => {
  it("accepts a journal array and preserves the id", () => {
    expect(
      readAggregatorWorkerMessage({ journal: [{ id: 1 }], id: "req-1" }),
    ).toEqual({ journal: [{ id: 1 }], id: "req-1" });
  });

  it("rejects a non-array journal and an oversized one", () => {
    expect(readAggregatorWorkerMessage({ journal: {} })).toBeNull();
    expect(
      readAggregatorWorkerMessage({ journal: new Array(MAX_AGGREGATOR_JOURNAL + 1) }),
    ).toBeNull();
  });

  it("rejects a non-object message", () => {
    expect(readAggregatorWorkerMessage("journal")).toBeNull();
  });
});
