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

const mockFetchNews = vi.fn();
const mockAnalyzeSentiment = vi.fn();

vi.mock("$app/environment", () => ({ browser: true, dev: true }));
vi.mock("../services/newsService", () => ({
  newsService: {
    fetchNews: (...args: any[]) => mockFetchNews(...args),
    analyzeSentiment: (...args: any[]) => mockAnalyzeSentiment(...args)
  }
}));

// Mock window.indexedDB to prevent the save error on Settings store
const indexedDBMock = {
  open: vi.fn(),
};
Object.defineProperty(window, 'indexedDB', { value: indexedDBMock });

describe("NewsStore", () => {
  let newsStore: any;
  let settingsState: any;

  beforeEach(async () => {
    vi.useFakeTimers();
    mockFetchNews.mockReset();
    mockAnalyzeSentiment.mockReset();
    vi.resetModules();

    const settingsModule = await import("./settings.svelte");
    settingsState = settingsModule.settingsState;
    settingsState.enableNewsAnalysis = true;

    const newsModule = await import("./news.svelte");
    newsStore = newsModule.newsStore;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should not refresh if enableNewsAnalysis is false", async () => {
    settingsState.enableNewsAnalysis = false;
    await newsStore.refresh("BTC");
    expect(mockFetchNews).not.toHaveBeenCalled();
    expect(newsStore.isLoading).toBe(false);
  });

  it("should fetch news and update state on success", async () => {
    mockFetchNews.mockResolvedValueOnce([{ title: "Test News", url: "http://test.com", source: "Test", published_at: "2023-01-01" }]);
    mockAnalyzeSentiment.mockResolvedValueOnce({ score: 0.8, regime: "BULLISH", summary: "Good", keyFactors: [] });

    await newsStore.refresh("BTC");

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

    await newsStore.refresh("BTC");

    expect(mockFetchNews).toHaveBeenCalledWith("BTC");
    expect(mockAnalyzeSentiment).not.toHaveBeenCalled();
    expect(newsStore.error).toBe("Network Error");
    expect(newsStore.isLoading).toBe(false);
  });

  it("should enforce cooldown and not fetch if recently fetched", async () => {
    mockFetchNews.mockResolvedValueOnce([{ title: "Test News", url: "http://test.com", source: "Test", published_at: "2023-01-01" }]);
    mockAnalyzeSentiment.mockResolvedValueOnce({ score: 0.8, regime: "BULLISH", summary: "Good", keyFactors: [] });

    await newsStore.refresh("BTC");
    expect(mockFetchNews).toHaveBeenCalledTimes(1);

    // Call again immediately, should respect cooldown and skip because symbol is the same and not forced
    await newsStore.refresh("BTC");
    expect(mockFetchNews).toHaveBeenCalledTimes(1);

    // Force call, should bypass cooldown
    await newsStore.refresh("BTC", true);
    expect(mockFetchNews).toHaveBeenCalledTimes(2);

    // Call with different symbol, should fetch
    await newsStore.refresh("ETH");
    expect(mockFetchNews).toHaveBeenCalledTimes(3);
  });

  it("should retry if recent call was empty but cooldown passed", async () => {
      // Mock empty results
      mockFetchNews.mockResolvedValueOnce([]);
      await newsStore.refresh("XRP");
      expect(mockFetchNews).toHaveBeenCalledTimes(1);

      // Still within cooldown
      vi.advanceTimersByTime(30000); // 30s
      await newsStore.refresh("XRP");
      // Still 1 because cooldown is active and results were empty (error=null, news=[] logic)
      expect(mockFetchNews).toHaveBeenCalledTimes(1);

      // Pass cooldown
      vi.advanceTimersByTime(35000); // 35s

      // Should fetch again since cooldown passed and force is true implicitly when recent is false but no data
      await newsStore.refresh("XRP");
      expect(mockFetchNews).toHaveBeenCalledTimes(2);
  });

  it("should handle empty news results", async () => {
    mockFetchNews.mockResolvedValueOnce([]);

    await newsStore.refresh("ETH");

    expect(mockFetchNews).toHaveBeenCalledWith("ETH");
    expect(mockAnalyzeSentiment).not.toHaveBeenCalled();
    expect(newsStore.news.length).toBe(0);
    expect(newsStore.sentiment).toBeNull();
  });

  it("should skip concurrent requests", async () => {
      mockFetchNews.mockImplementationOnce(
        () =>
          new Promise((resolve) =>
            setTimeout(() => resolve([{ title: "Slow News", url: "http://slow.com", source: "Test", published_at: "2023-01-01" }]), 50)
          )
      );

      const req1 = newsStore.refresh("XRP");
      const req2 = newsStore.refresh("XRP"); // Should be skipped

      expect(newsStore.isLoading).toBe(true);

      vi.advanceTimersByTime(100);

      await Promise.all([req1, req2]);

      // Only 1 request should be made to the API
      expect(mockFetchNews).toHaveBeenCalledTimes(1);
      expect(newsStore.isLoading).toBe(false);
  });
});
