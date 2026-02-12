import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { newsService } from '../src/services/newsService';
import { dbService } from '../src/services/dbService';

// Mock dbService
vi.mock('../src/services/dbService', () => ({
  dbService: {
    get: vi.fn().mockResolvedValue(null),
    put: vi.fn(),
    getAll: vi.fn().mockResolvedValue([]),
    delete: vi.fn()
  }
}));

// Mock settingsState
vi.mock('../src/stores/settings.svelte', () => ({
  settingsState: {
    aiProvider: 'openai',
    openaiApiKey: 'test-key',
    openaiModel: 'gpt-4o'
  }
}));

describe('NewsService Sentiment Hardening', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('should return safe default when API returns malformed data', async () => {
    const mockNews = [{ title: "Test News", url: "http://test.com", source: "Test", published_at: "2023-01-01" }];

    // Mock fetch to return malformed data (score is string instead of number)
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(JSON.stringify({
        analysis: {
          score: "invalid-score", // Should be number
          regime: "BULLISH",
          summary: "Test",
          keyFactors: []
        }
      }))
    });

    const result = await newsService.analyzeSentiment(mockNews);

    // Verify safe fallback behavior
    expect(result).not.toBeNull();
    expect(result!.score).toBe(0);
    expect(result!.regime).toBe("UNCERTAIN");
    expect(result!.summary).toBe("Analysis failed validation.");
  });
});
