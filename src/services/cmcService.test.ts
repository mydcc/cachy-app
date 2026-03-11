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

  it("serves from TTL cache after promise resolves without new fetch", async () => {
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

    // First call triggers the fetch
    const first = await cmcService.getGlobalMetrics();
    expect(first).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Second call after promise resolved should hit TTL cache, not fetch again
    const second = await cmcService.getGlobalMetrics();
    expect(second).toEqual(first);
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

  it("clears globalPromise after fetch failure so retries work", async () => {
    // First call fails
    fetchMock.mockRejectedValueOnce(new Error("Network error"));

    const result = await cmcService.getGlobalMetrics();
    expect(result).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Promise should be cleared, so next call triggers a new fetch
    expect((cmcService as any).globalPromise).toBeNull();

    // Second call succeeds
    fetchMock.mockResolvedValueOnce({
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
    });

    const retry = await cmcService.getGlobalMetrics();
    expect(retry).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("clears coinPromises after fetch failure so retries work", async () => {
    fetchMock.mockRejectedValueOnce(new Error("Network error"));

    const result = await cmcService.getCoinMetadata("BTC");
    expect(result).toBeNull();
    expect((cmcService as any).coinPromises.has("BTC")).toBe(false);

    // Retry succeeds
    fetchMock.mockResolvedValueOnce({
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
    });

    const retry = await cmcService.getCoinMetadata("BTC");
    expect(retry).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns null when result.data is falsy", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue({ data: null })
    });

    const result = await cmcService.getGlobalMetrics();
    expect(result).toBeNull();

    // Promise should be cleaned up
    expect((cmcService as any).globalPromise).toBeNull();
  });
});
