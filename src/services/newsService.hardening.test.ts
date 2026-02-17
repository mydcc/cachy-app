import { describe, it, expect, vi, beforeEach } from 'vitest';
import { newsService, type NewsItem } from './newsService';
import { dbService } from './dbService';
import { settingsState } from '../stores/settings.svelte';

describe('NewsService Hardening Tests', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        settingsState.aiProvider = 'openai';
        settingsState.openaiApiKey = 'test';

        // Mock DB service to avoid actual IDB
        vi.spyOn(dbService, 'get').mockResolvedValue(undefined);
        vi.spyOn(dbService, 'put').mockResolvedValue(undefined);

        // Spy on fetch to avoid network calls (and return dummy response)
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            text: async () => JSON.stringify({ analysis: { score: 0.5, regime: 'NEUTRAL', summary: 'Test', keyFactors: [] } })
        } as any);
    });

    it('should generate different cache hashes for different news sets even if first item is same', async () => {
        const news1: NewsItem[] = [
            { title: 'Bitcoin Up', url: 'u1', source: 's1', published_at: '2025-01-01' },
            { title: 'Ethereum Down', url: 'u2', source: 's2', published_at: '2025-01-01' }
        ];

        const news2: NewsItem[] = [
            { title: 'Bitcoin Up', url: 'u1', source: 's1', published_at: '2025-01-01' },
            { title: 'Ethereum Flat', url: 'u3', source: 's2', published_at: '2025-01-01' }
        ];

        const getSpy = vi.spyOn(dbService, 'get');

        await newsService.analyzeSentiment(news1);
        // Call 0 args: [storeName, key]
        const hash1 = getSpy.mock.calls[0][1];

        getSpy.mockClear();

        await newsService.analyzeSentiment(news2);
        const hash2 = getSpy.mock.calls[0][1];

        console.log('Hash1:', hash1);
        console.log('Hash2:', hash2);

        // Expectation: Hashes should be different because content is different
        expect(hash1).not.toBe(hash2);
    });
});
