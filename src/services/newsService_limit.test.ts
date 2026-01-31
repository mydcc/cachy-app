import { describe, it, expect, vi, beforeEach } from 'vitest';
import { newsService } from './newsService';
import { dbService } from './dbService';

// Polyfill btoa if missing (Node env)
if (typeof global.btoa === 'undefined') {
    global.btoa = (str) => Buffer.from(str).toString('base64');
}

// Mock dependencies
vi.mock('../stores/settings.svelte', () => ({
    settingsState: {
        rssPresets: [],
        customRssFeeds: [],
        cryptoPanicApiKey: 'test',
        newsApiKey: 'test',
        cryptoPanicFilter: 'important',
        rssFilterBySymbol: false
    }
}));

vi.mock('./apiQuotaTracker.svelte', () => ({
    apiQuotaTracker: {
        isQuotaExhausted: () => false,
        logCall: () => {}
    }
}));

vi.mock('./dbService', () => ({
    dbService: {
        get: vi.fn(),
        put: vi.fn(),
        getAll: vi.fn().mockResolvedValue([]),
        delete: vi.fn()
    }
}));

vi.mock('./discordService', () => ({
    discordService: {
        fetchDiscordNews: async () => []
    }
}));

vi.mock('./rssParserService', () => ({
    rssParserService: {
        parseMultipleFeeds: async () => []
    }
}));

// Mock fetch
global.fetch = vi.fn();

describe('NewsService Limits', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should limit items to 100 when saving to DB', async () => {
        // Setup fetch to return 150 items
        const manyItems = Array.from({ length: 150 }, (_, i) => ({
            title: `News ${i}`,
            url: `http://test.com/${i}`,
            source: { title: 'test' },
            published_at: new Date().toISOString(),
            currencies: []
        }));

        const mockResponse = {
            ok: true,
            json: async () => ({ results: manyItems })
        };
        (global.fetch as any).mockResolvedValue(mockResponse);

        await newsService.fetchNews('BTC');

        // Verify put was called
        expect(dbService.put).toHaveBeenCalled();

        // Verify items length in the saved object
        const callArgs = (dbService.put as any).mock.calls[0][1];
        // console.log("Items length:", callArgs.items.length);
        expect(callArgs.items.length).toBe(100);
    });

    it('should call getAll with limit 50 during prune', async () => {
        const mockResponse = {
            ok: true,
            json: async () => ({ results: [] })
        };
        (global.fetch as any).mockResolvedValue(mockResponse);

        await newsService.fetchNews('ETH');

        // Prune is async floating promise. Wait a tick.
        await new Promise(r => setTimeout(r, 10));

        expect(dbService.getAll).toHaveBeenCalledWith('news', 50);
    });
});
