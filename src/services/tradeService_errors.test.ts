import { describe, it, expect, vi } from 'vitest';
import { tradeService, BitunixApiError } from './tradeService';
import { toastService } from './toastService.svelte';
import { logger } from './logger';
import { settingsState } from '../stores/settings.svelte';

vi.mock('$app/environment', () => ({ browser: false }));
vi.stubGlobal('window', { location: { hostname: 'localhost' }, indexedDB: {} });
vi.stubGlobal('localStorage', { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn() });

vi.mock('./toastService.svelte', () => ({
    toastService: { error: vi.fn(), success: vi.fn() }
}));

vi.mock('./logger', () => ({
    logger: { debug: vi.fn(), warn: vi.fn(), error: vi.fn(), info: vi.fn() }
}));

describe('TradeService Error Hardening', () => {
    it('fetchTpSlOrders handles HTML error messages securely', async () => {
        settingsState.apiProvider = 'bitunix';
        settingsState.apiKeys = { 'bitunix': { key: "test", secret: "test", phrase: "" } };

        vi.spyOn(tradeService as any, 'signedRequest').mockRejectedValue(new BitunixApiError(502, "Bad Gateway", "<html><body>502 Bad Gateway</body></html>"));

        try {
            await tradeService.fetchTpSlOrders("pending");
        } catch (e) {
             expect(e instanceof Error ? e.message : String(e)).not.toContain("<html>");
        }

    });
});
