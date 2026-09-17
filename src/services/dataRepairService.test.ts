import { describe, it, expect, vi, beforeEach } from "vitest";
import { dataRepairService } from "./dataRepairService";
import { journalState } from "../stores/journal.svelte";
import { apiService } from "./apiService";

// Mock the dependencies (same pattern as src/benchmarks/dataRepair.test.ts)
vi.mock("./apiService", () => {
  return {
    apiService: {
      fetchBitunixKlines: vi.fn(),
      fetchBitgetKlines: vi.fn(),
    },
  };
});

vi.mock("../stores/settings.svelte", () => ({
  settingsState: {
    repairTimeframe: "5m",
  },
}));

vi.mock("../lib/calculator", () => ({
  calculator: {
    calculateATR: vi.fn(() => ({ isNaN: () => false, toString: () => "123" })),
  },
}));

// Also mock logger to suppress noise
vi.mock("./logger", () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

const MS_5M = 5 * 60 * 1000;

interface MockKline {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/** Builds an ascending kline series of `count` 5m candles ending at `endTs`. */
function buildSeries(endTs: number, count: number, high = 51000, low = 49000): MockKline[] {
  const out: MockKline[] = [];
  const first = endTs - (count - 1) * MS_5M;
  for (let i = 0; i < count; i++) {
    out.push({
      time: first + i * MS_5M,
      open: 50000,
      high,
      low,
      close: 50500,
      volume: 100,
    });
  }
  return out;
}

/**
 * Simulates an exchange that returns at most `limit` candles at/before `end`,
 * like a real (startTime, endTime, limit) windowed endpoint: older history
 * beyond the returned window is simply not included.
 */
function mockWindowedEndpoint(fullSeries: MockKline[]) {
  return async (
    _symbol: string,
    _interval: string,
    limit: number,
    _start?: number,
    end?: number,
  ) => {
    const endTs = end ?? Number.POSITIVE_INFINITY;
    const eligible = fullSeries.filter((k) => k.time <= endTs);
    return eligible.slice(-limit);
  };
}

function longTrade(entryDate: string, exitDate: string) {
  return {
    id: "long-trade-1",
    symbol: "BTCUSDT",
    status: "Won",
    entryDate,
    exitDate,
    tradeType: "Long",
    entryPrice: 50000,
    provider: "bitunix",
  };
}

const noop = () => {};

describe("dataRepairService truncation guards (BUG-0479)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    journalState.updateEntry = vi.fn();
  });

  it("never persists MFE/MAE from a truncated window (partial coverage -> failed)", async () => {
    // Trade open for 4 days on 5m = 1152 candles, but the exchange only has
    // the most recent 1000 candles of history (e.g. recent listing).
    const exitTs = Date.parse("2026-09-10T00:00:00.000Z");
    const entryTs = exitTs - 1151 * MS_5M;
    const available = buildSeries(exitTs, 1000);

    vi.mocked(apiService.fetchBitunixKlines).mockImplementation(mockWindowedEndpoint(available));

    journalState.entries = [longTrade(new Date(entryTs).toISOString(), new Date(exitTs).toISOString())] as never[];

    await dataRepairService.repairMfeMae(noop);

    // The 152 oldest candles are missing: writing would corrupt the journal.
    expect(journalState.updateEntry).not.toHaveBeenCalled();
  });

  it("writes correct MFE/MAE when the window is fully covered", async () => {
    const exitTs = Date.parse("2026-09-10T00:00:00.000Z");
    const entryTs = exitTs - 99 * MS_5M;
    const full = buildSeries(exitTs, 100);

    vi.mocked(apiService.fetchBitunixKlines).mockImplementation(mockWindowedEndpoint(full));

    journalState.entries = [longTrade(new Date(entryTs).toISOString(), new Date(exitTs).toISOString())] as never[];

    await dataRepairService.repairMfeMae(noop);

    expect(journalState.updateEntry).toHaveBeenCalledTimes(1);
    const written = vi.mocked(journalState.updateEntry).mock.calls[0][0] as unknown as {
      mfe: { toString(): string };
      mae: { toString(): string };
    };
    expect(written.mfe.toString()).toBe("1000");
    expect(written.mae.toString()).toBe("1000");
  });

  it("batch-fetches history for trades longer than one request so extremes are not missed", async () => {
    // 1152-candle trade with full history available, but each request returns
    // at most 1000 candles. The all-time high sits in the oldest 152 candles.
    const exitTs = Date.parse("2026-09-10T00:00:00.000Z");
    const entryTs = exitTs - 1151 * MS_5M;
    const full = buildSeries(exitTs, 1152);
    for (let i = 0; i < 100; i++) full[i].high = 60000;

    vi.mocked(apiService.fetchBitunixKlines).mockImplementation(mockWindowedEndpoint(full));

    journalState.entries = [longTrade(new Date(entryTs).toISOString(), new Date(exitTs).toISOString())] as never[];

    await dataRepairService.repairMfeMae(noop);

    expect(journalState.updateEntry).toHaveBeenCalledTimes(1);
    const written = vi.mocked(journalState.updateEntry).mock.calls[0][0] as unknown as {
      mfe: { toString(): string };
    };
    // A single 1000-candle fetch would yield mfe 1000; paged fetch sees 60000.
    expect(written.mfe.toString()).toBe("10000");
  });

  it("never persists ATR when fewer than 14 prior candles exist", async () => {
    const entryTs = Date.parse("2026-09-10T00:00:00.000Z");
    const available = buildSeries(entryTs, 10);

    vi.mocked(apiService.fetchBitunixKlines).mockImplementation(mockWindowedEndpoint(available));

    journalState.entries = [
      {
        id: "atr-trade-1",
        symbol: "BTCUSDT",
        status: "Won",
        entryDate: new Date(entryTs).toISOString(),
        date: new Date(entryTs).toISOString(),
        tradeType: "Long",
        entryPrice: 50000,
        provider: "bitunix",
      },
    ] as never[];

    await dataRepairService.repairMissingAtr(noop, true);

    expect(journalState.updateEntry).not.toHaveBeenCalled();
  });
});
