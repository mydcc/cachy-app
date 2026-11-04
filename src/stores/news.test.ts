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

// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { NewsItem } from "../services/newsTypes";

const mockFetchNews = vi.fn();
const mockAnalyzeSentiment = vi.fn();

vi.mock("$app/env", () => ({ browser: true, dev: true }));
vi.mock("../services/newsService", () => ({
  newsService: {
    fetchNews: (symbol?: string) => mockFetchNews(symbol),
    analyzeSentiment: (news: NewsItem[]) => mockAnalyzeSentiment(news)
  }
}));


describe("NewsStore", () => {
  let newsStore: typeof import("./news.svelte")["newsStore"];
  let settingsState: typeof import("./settings.svelte")["settingsState"];

  beforeEach(async () => {
    mockFetchNews.mockReset();
    mockAnalyzeSentiment.mockReset();
    vi.resetModules();

    const settingsModule = await import("./settings.svelte");
    settingsState = settingsModule.settingsState;
    settingsState.enableNewsAnalysis = true;

    const newsModule = await import("./news.svelte");
    newsStore = newsModule.newsStore;
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // refresh() awaits a deliberate 3s setTimeout unless force=true, so real-time
  // data gets priority during startup. Under fake timers that promise only
  // settles once the clock is advanced — awaiting refresh() directly deadlocks
  // until the test times out, which is what these tests used to do.
  const refresh = async (symbol?: string, force = false) => {
    const p = newsStore.refresh(symbol, force);
    await vi.advanceTimersByTimeAsync(3000);
    return p;
  };

  it("should not refresh if enableNewsAnalysis is false", async () => {
    settingsState.enableNewsAnalysis = false;
    await refresh("BTC");
    expect(mockFetchNews).not.toHaveBeenCalled();
    expect(newsStore.isLoading).toBe(false);
  });

  it("should fetch news and update state on success", async () => {
    mockFetchNews.mockResolvedValueOnce([{ title: "Test News", url: "http://test.com", source: "Test", published_at: "2023-01-01" }]);
    mockAnalyzeSentiment.mockResolvedValueOnce({ score: 0.8, regime: "BULLISH", summary: "Good", keyFactors: [] });

    await refresh("BTC");

    expect(mockFetchNews).toHaveBeenCalledWith("BTC");
    expect(mockAnalyzeSentiment).toHaveBeenCalled();
    expect(newsStore.news.length).toBe(1);
    expect(newsStore.sentiment?.regime).toBe("BULLISH");
    expect(newsStore.isLoading).toBe(false);
    expect(newsStore.error).toBeNull();
    expect(newsStore.lastSymbol).toBe("BTC");
    expect(newsStore.lastFetchTime).toBeGreaterThan(0);
  });

  it("should handle error when fetching news", async () => {
    mockFetchNews.mockRejectedValueOnce(new Error("Network Error"));

    await refresh("BTC");

    expect(mockFetchNews).toHaveBeenCalledWith("BTC");
    expect(mockAnalyzeSentiment).not.toHaveBeenCalled();
    expect(newsStore.error).toBe("Network Error");
    expect(newsStore.isLoading).toBe(false);
  });

  it("should enforce cooldown and not fetch if recently fetched", async () => {
    mockFetchNews.mockResolvedValueOnce([{ title: "Test News", url: "http://test.com", source: "Test", published_at: "2023-01-01" }]);
    mockAnalyzeSentiment.mockResolvedValueOnce({ score: 0.8, regime: "BULLISH", summary: "Good", keyFactors: [] });

    await refresh("BTC");
    expect(mockFetchNews).toHaveBeenCalledTimes(1);

    // Call again immediately, should respect cooldown and skip because symbol is the same and not forced
    await refresh("BTC");
    expect(mockFetchNews).toHaveBeenCalledTimes(1);

    // Force call, should bypass cooldown
    mockFetchNews.mockResolvedValueOnce([{ title: "Test News 2", url: "http://test2.com", source: "Test", published_at: "2023-01-02" }]);
    mockAnalyzeSentiment.mockResolvedValueOnce({ score: 0.6, regime: "NEUTRAL", summary: "Ok", keyFactors: [] });
    await refresh("BTC", true);
    expect(mockFetchNews).toHaveBeenCalledTimes(2);

    // Call with different symbol, should fetch
    mockFetchNews.mockResolvedValueOnce([{ title: "ETH News", url: "http://eth.com", source: "Test", published_at: "2023-01-03" }]);
    mockAnalyzeSentiment.mockResolvedValueOnce({ score: 0.5, regime: "NEUTRAL", summary: "Neutral", keyFactors: [] });
    await refresh("ETH");
    expect(mockFetchNews).toHaveBeenCalledTimes(3);
  });

  it("should retry if recent call was empty but cooldown passed", async () => {
      // Mock empty results
      mockFetchNews.mockResolvedValueOnce([]);
      await refresh("XRP");
      expect(mockFetchNews).toHaveBeenCalledTimes(1);

      // Still within cooldown
      vi.advanceTimersByTime(30000); // 30s
      await refresh("XRP");
      // Still 1 because cooldown is active and results were empty (error=null, news=[] logic)
      expect(mockFetchNews).toHaveBeenCalledTimes(1);

      // Pass cooldown
      vi.advanceTimersByTime(35000); // 35s

      // Should fetch again since cooldown has expired (65s > 60s), so isRecent is false and the early return is not triggered
      await refresh("XRP");
      expect(mockFetchNews).toHaveBeenCalledTimes(2);
  });

  it("should handle empty news results", async () => {
    mockFetchNews.mockResolvedValueOnce([]);

    await refresh("ETH");

    expect(mockFetchNews).toHaveBeenCalledWith("ETH");
    expect(mockAnalyzeSentiment).not.toHaveBeenCalled();
    expect(newsStore.news.length).toBe(0);
    expect(newsStore.sentiment).toBeNull();
  });

  it("drops a refresh parked in the startup delay when a newer one lands first (BUG-0785)", async () => {
      // A non-forced call waits 3 s before it fetches. If a newer refresh lands
      // in that window, the parked call must not claim a fresh generation when
      // it wakes and overwrite the newer symbol.
      mockFetchNews.mockResolvedValueOnce([
        { title: "ETH News", url: "http://eth.com", source: "Test", published_at: "2023-01-03" },
      ]);
      mockAnalyzeSentiment.mockResolvedValue({
        score: 0.5,
        regime: "NEUTRAL",
        summary: "Neutral",
        keyFactors: [],
      });

      const parked = newsStore.refresh("BTC"); // non-forced: parks for 3 s
      await vi.advanceTimersByTimeAsync(0);
      expect(mockFetchNews).not.toHaveBeenCalled();

      await newsStore.refresh("ETH", true); // forced: no delay
      expect(newsStore.news[0]?.title).toBe("ETH News");

      await vi.advanceTimersByTimeAsync(3000); // BTC wakes up
      await parked;

      expect(mockFetchNews).toHaveBeenCalledTimes(1);
      expect(newsStore.news[0]?.title).toBe("ETH News");
      expect(newsStore.lastSymbol).toBe("ETH");
  });

  it("discards a slow fetch when the symbol moved while it was in flight (BUG-0785)", async () => {
      // BTC's fetch stays pending; ETH's resolves first. The BTC result must
      // not be written over ETH's news/sentiment once it finally arrives.
      let resolveBtc: ((items: NewsItem[]) => void) | undefined;
      mockFetchNews.mockImplementation((symbol: string) => {
        if (symbol === "BTC") {
          return new Promise<NewsItem[]>((resolve) => {
            resolveBtc = resolve;
          });
        }
        return Promise.resolve([
          { title: "ETH News", url: "http://eth.com", source: "Test", published_at: "2023-01-03" },
        ]);
      });
      mockAnalyzeSentiment.mockResolvedValue({
        score: 0.5,
        regime: "NEUTRAL",
        summary: "Neutral",
        keyFactors: [],
      });

      const btcRequest = newsStore.refresh("BTC", true);
      await vi.advanceTimersByTimeAsync(0); // BTC reaches its fetch
      expect(resolveBtc).toBeTypeOf("function");

      await newsStore.refresh("ETH", true);
      expect(newsStore.news[0]?.title).toBe("ETH News");
      expect(newsStore.lastSymbol).toBe("ETH");

      // The slow BTC request finishes last; its result is stale.
      resolveBtc?.([
        { title: "BTC News", url: "http://btc.com", source: "Test", published_at: "2023-01-01" },
      ]);
      await btcRequest;

      expect(mockFetchNews).toHaveBeenCalledWith("BTC");
      expect(newsStore.news[0]?.title).toBe("ETH News");
      expect(newsStore.lastSymbol).toBe("ETH");
  });

  it("keeps the newer sentiment when a slow analysis lands late (BUG-0785)", async () => {
      // The news write and the sentiment write are separate awaits; guarding
      // only the first would still let the old symbol's sentiment win.
      let resolveBtcAnalysis: ((a: unknown) => void) | undefined;
      mockFetchNews.mockImplementation((symbol: string) =>
        Promise.resolve([
          {
            title: `${symbol} News`,
            url: `http://${symbol.toLowerCase()}.com`,
            source: "Test",
            published_at: "2023-01-01",
          },
        ])
      );
      mockAnalyzeSentiment.mockImplementation((items: NewsItem[]) => {
        if (items[0]?.title.startsWith("BTC")) {
          return new Promise((resolve) => {
            resolveBtcAnalysis = resolve;
          });
        }
        return Promise.resolve({
          score: 0,
          regime: "NEUTRAL",
          summary: "Neutral",
          keyFactors: [],
        });
      });

      const btcRequest = newsStore.refresh("BTC", true);
      await vi.advanceTimersByTimeAsync(0);
      expect(resolveBtcAnalysis).toBeTypeOf("function");

      await newsStore.refresh("ETH", true);
      expect(newsStore.sentiment?.regime).toBe("NEUTRAL");

      resolveBtcAnalysis?.({
        score: 0.9,
        regime: "BULLISH",
        summary: "Bullish",
        keyFactors: [],
      });
      await btcRequest;

      expect(newsStore.news[0]?.title).toBe("ETH News");
      expect(newsStore.sentiment?.regime).toBe("NEUTRAL");
  });

  it("keeps the newer state when a superseded refresh fails (BUG-0785)", async () => {
      // A stale rejection must not set the error banner or bump the cooldown
      // that belongs to the request now on screen.
      let rejectBtc: ((e: unknown) => void) | undefined;
      mockFetchNews.mockImplementation((symbol: string) => {
        if (symbol === "BTC") {
          return new Promise<NewsItem[]>((_resolve, reject) => {
            rejectBtc = reject;
          });
        }
        return Promise.resolve([
          { title: "ETH News", url: "http://eth.com", source: "Test", published_at: "2023-01-03" },
        ]);
      });
      mockAnalyzeSentiment.mockResolvedValue({
        score: 0,
        regime: "NEUTRAL",
        summary: "Neutral",
        keyFactors: [],
      });

      const btcRequest = newsStore.refresh("BTC", true);
      await vi.advanceTimersByTimeAsync(0);
      expect(rejectBtc).toBeTypeOf("function");

      await newsStore.refresh("ETH", true);
      const ethFetchTime = newsStore.lastFetchTime;

      rejectBtc?.(new Error("Network Error"));
      await btcRequest;

      expect(newsStore.error).toBeNull();
      expect(newsStore.news[0]?.title).toBe("ETH News");
      expect(newsStore.lastFetchTime).toBe(ethFetchTime);
  });

  it("does not clear the spinner of a newer in-flight refresh (BUG-0785)", async () => {
      let resolveBtc: ((items: NewsItem[]) => void) | undefined;
      let resolveEth: ((items: NewsItem[]) => void) | undefined;
      mockFetchNews.mockImplementation((symbol: string) =>
        new Promise<NewsItem[]>((resolve) => {
          if (symbol === "BTC") resolveBtc = resolve;
          else resolveEth = resolve;
        })
      );
      mockAnalyzeSentiment.mockResolvedValue({
        score: 0,
        regime: "NEUTRAL",
        summary: "Neutral",
        keyFactors: [],
      });

      const btcRequest = newsStore.refresh("BTC", true);
      await vi.advanceTimersByTimeAsync(0);
      const ethRequest = newsStore.refresh("ETH", true);
      await vi.advanceTimersByTimeAsync(0);
      expect(newsStore.isLoading).toBe(true);

      resolveBtc?.([
        { title: "BTC News", url: "http://btc.com", source: "Test", published_at: "2023-01-01" },
      ]);
      await btcRequest;
      // ETH is still loading; the stale completion must not hide that.
      expect(newsStore.isLoading).toBe(true);

      resolveEth?.([
        { title: "ETH News", url: "http://eth.com", source: "Test", published_at: "2023-01-03" },
      ]);
      await ethRequest;
      expect(newsStore.isLoading).toBe(false);
  });

  it("should skip concurrent requests", async () => {
      mockFetchNews.mockImplementationOnce(
        () =>
          new Promise((resolve) =>
            setTimeout(() => resolve([{ title: "Slow News", url: "http://slow.com", source: "Test", published_at: "2023-01-01" }]), 50)
          )
      );
      mockAnalyzeSentiment.mockResolvedValueOnce({ score: 0.5, regime: "NEUTRAL", summary: "Ok", keyFactors: [] });

      const req1 = newsStore.refresh("XRP");
      const req2 = newsStore.refresh("XRP"); // Should be skipped

      // Both calls are still parked on the deliberate 3s delay at this point, so
      // isLoading is not set yet. The duplicate is rejected by pendingSymbols,
      // which is populated before the delay — isLoading could not do that job,
      // since it is only set after the delay has elapsed.
      await vi.advanceTimersByTimeAsync(3000);
      expect(newsStore.isLoading).toBe(true);

      // Let the slow (50ms) fetchNews mock resolve.
      await vi.advanceTimersByTimeAsync(100);

      await Promise.all([req1, req2]);

      // Only 1 request should be made to the API
      expect(mockFetchNews).toHaveBeenCalledTimes(1);
      expect(newsStore.isLoading).toBe(false);
  });
});
