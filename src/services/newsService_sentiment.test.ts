// @vitest-environment happy-dom
/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { newsService, type NewsItem } from "./newsService";
import { dbService } from "./dbService";
import { appFetch } from "../lib/appAuth";

vi.mock("../stores/settings.svelte", () => ({
    settingsState: {
        aiProvider: "gemini",
        geminiApiKey: "test-key",
        openaiApiKey: "",
        geminiModel: "gemini-1.5-flash"
    }
}));

vi.mock("./dbService", () => ({
    dbService: {
        get: vi.fn(),
        put: vi.fn(),
        getAll: vi.fn().mockResolvedValue([]),
        delete: vi.fn()
    }
}));

vi.mock("../lib/appAuth", () => ({
    appFetch: vi.fn()
}));

const news: NewsItem[] = [
    { title: "BTC rallies", url: "http://test.com/1", source: "test", published_at: new Date().toISOString() }
];

const NEUTRAL_FALLBACK = {
    score: 0,
    regime: "UNCERTAIN",
    summary: "Failed to analyze sentiment.",
    keyFactors: []
};

describe("newsService.analyzeSentiment — BUG-0006 schema validation", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(dbService.get).mockResolvedValue(undefined);
    });

    it("falls back to neutral sentiment on a malformed AI provider response", async () => {
        vi.mocked(appFetch).mockResolvedValue({
            ok: true,
            text: async () => JSON.stringify({
                analysis: { score: "not-a-number", regime: "TOTALLY_MADE_UP" }
            })
        } as unknown as Response);

        const result = await newsService.analyzeSentiment(news);

        expect(result).toEqual(NEUTRAL_FALLBACK);
    });

    it("falls back to neutral sentiment on a corrupted IDB cache entry, without crashing", async () => {
        vi.mocked(dbService.get).mockResolvedValue({
            data: { score: "nope" }, // shape doesn't match SentimentAnalysisSchema
            timestamp: Date.now(),
            newsHash: "irrelevant-doesnt-match-anyway"
        });
        vi.mocked(appFetch).mockResolvedValue({
            ok: true,
            text: async () => JSON.stringify({
                analysis: { score: 0.4, regime: "BULLISH", summary: "ok", keyFactors: ["x"] }
            })
        } as unknown as Response);

        const result = await newsService.analyzeSentiment(news);

        // The corrupted cache entry must be discarded, not returned as-is —
        // it should fall through to a fresh (valid) fetch here.
        expect(result).toEqual({ score: 0.4, regime: "BULLISH", summary: "ok", keyFactors: ["x"] });
        expect(dbService.delete).toHaveBeenCalledWith("sentiment", expect.any(String));
    });

    it("still returns a valid cached analysis unchanged", async () => {
        const cachedAnalysis = { score: -0.2, regime: "BEARISH", summary: "meh", keyFactors: ["y"] };

        // newsHash must match exactly for the cache-hit path.
        const CryptoJS = (await import("crypto-js")).default;
        const newsHash = CryptoJS.SHA256(
            news.slice(0, 10).map(n => `${n.published_at}|${n.title}`).join("||")
        ).toString();
        vi.mocked(dbService.get).mockResolvedValue({
            data: cachedAnalysis,
            timestamp: Date.now(),
            newsHash
        });

        const result = await newsService.analyzeSentiment(news);

        expect(result).toEqual(cachedAnalysis);
        expect(appFetch).not.toHaveBeenCalled();
    });
});
