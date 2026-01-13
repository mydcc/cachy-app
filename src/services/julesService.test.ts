import { describe, it, expect, vi } from "vitest";
import { julesService } from "./julesService";
import { get } from "svelte/store";

// Mock Stores
vi.mock("../stores/settingsStore", () => ({
  settingsStore: {
    subscribe: (fn: any) => {
      fn({ apiKeys: { bitunix: { apiKey: "123", apiSecret: "secret" } } });
      return () => {};
    },
  },
}));

vi.mock("../stores/tradeStore", () => ({
  tradeStore: {
    subscribe: (fn: any) => {
      fn({ symbol: "BTCUSDT", targets: [] });
      return () => {};
    },
  },
}));

vi.mock("../stores/uiStore", () => ({
  uiStore: {
    subscribe: (fn: any) => {
      fn({
        currentTheme: "dark",
        showJournalModal: false,
        showSettingsModal: false,
      });
      return () => {};
    },
  },
}));

vi.mock("../stores/accountStore", () => ({
  accountStore: {
    subscribe: (fn: any) => {
      fn({
        positions: [],
        openOrders: [],
        balance: "1000",
        availableBalance: "1000",
      });
      return () => {};
    },
  },
}));

vi.mock("../stores/marketStore", () => ({
  marketStore: {
    subscribe: (fn: any) => {
      fn({});
      return () => {};
    },
  },
  wsStatusStore: {
    subscribe: (fn: any) => {
      fn("connected");
      return () => {};
    },
  },
}));

// Mock Fetch
global.fetch = vi.fn();

describe("julesService", () => {
  it("should create a sanitized snapshot", () => {
    const snapshot = julesService.getSystemSnapshot();

    expect(snapshot.settings.apiKeys.bitunix.apiSecret).toBe("***REDACTED***");
    expect(snapshot.tradeState.symbol).toBe("BTCUSDT");
    expect(snapshot.accountSummary.isConnected).toBe(true);
  });

  it("should send a report to the API", async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ message: "Success" }),
    });

    const result = await julesService.reportToJules(null, "MANUAL");
    expect(result).toBe("Success");
    expect(global.fetch).toHaveBeenCalledWith("/api/jules", expect.anything());
  });
});
