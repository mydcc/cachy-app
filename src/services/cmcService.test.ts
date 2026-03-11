import { describe, it, expect, vi, beforeEach } from "vitest";
import { cmcService } from "./cmcService";
import { settingsState } from "../stores/settings.svelte";

vi.mock("../stores/settings.svelte", () => ({
  settingsState: { cmcApiKey: "test-key" }
}));

describe("CmcService", () => {
  let fetchMock;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        data: {
          btc_dominance: 50,
          eth_dominance: 20,
          active_cryptocurrencies: 10000,
          last_updated: new Date().toISOString(),
          quote: { USD: { total_market_cap: 1000, total_volume_24h: 100 } },
          BTC: {
            id: 1,
            name: "Bitcoin",
            symbol: "BTC",
            slug: "bitcoin",
            date_added: "2013",
            tags: [],
            platform: null,
            category: "coin"
          }
        }
      })
    });
    global.fetch = fetchMock;

    // Reset private caches via any
    (cmcService as any).globalCache = null;
    (cmcService as any).globalPromise = null;
    (cmcService as any).coinCache.clear();
    (cmcService as any).coinPromises.clear();
  });

  it("caches concurrent global metrics requests", async () => {
    // Simulate slow network to ensure requests happen concurrently
    fetchMock.mockImplementation(() => new Promise(resolve => {
      setTimeout(() => resolve({
        ok: true,
        json: vi.fn().mockResolvedValue({
          data: {
            btc_dominance: 50,
            eth_dominance: 20,
            active_cryptocurrencies: 10000,
            last_updated: new Date().toISOString(),
            quote: { USD: { total_market_cap: 1000, total_volume_24h: 100 } }
          }
        })
      }), 50);
    }));

    const start = performance.now();
    const results = await Promise.all([
      cmcService.getGlobalMetrics(),
      cmcService.getGlobalMetrics(),
      cmcService.getGlobalMetrics()
    ]);
    const end = performance.now();

    // Verify all returned the same data
    expect(results[0]).toBeTruthy();
    expect(results[1]).toEqual(results[0]);
    expect(results[2]).toEqual(results[0]);

    // We expect fetch to be called exactly once
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("caches concurrent coin metadata requests", async () => {
    fetchMock.mockImplementation(() => new Promise(resolve => {
      setTimeout(() => resolve({
        ok: true,
        json: vi.fn().mockResolvedValue({
          data: {
            BTC: {
              id: 1,
              name: "Bitcoin",
              symbol: "BTC",
              slug: "bitcoin",
              date_added: "2013",
              tags: [],
              platform: null,
              category: "coin"
            }
          }
        })
      }), 50);
    }));

    const results = await Promise.all([
      cmcService.getCoinMetadata("BTC"),
      cmcService.getCoinMetadata("BTC"),
      cmcService.getCoinMetadata("BTC")
    ]);

    expect(results[0]).toBeTruthy();
    expect(results[1]).toEqual(results[0]);
    expect(results[2]).toEqual(results[0]);

    // Expect exactly one network request
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
