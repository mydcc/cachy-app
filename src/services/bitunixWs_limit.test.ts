/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { bitunixWs } from './bitunixWs';
import { marketState } from '../stores/market.svelte';
import { uiState } from '../stores/ui.svelte';

// Mock UI State
vi.mock('../stores/ui.svelte', () => ({
    uiState: {
        showError: vi.fn()
    }
}));

describe('BitunixWS Hardening', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        // Reset private state via any
        const ws = bitunixWs as any;
        ws.throttleMap.clear();
        ws.errorCountPublic = 0;
        ws.lastErrorTimePublic = 0;
        marketState.connectionStatus = 'connected';
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should throttle frequent updates', () => {
        const ws = bitunixWs as any;
        const key = 'BTCUSDT:price';

        // First call: allowed
        expect(ws.shouldThrottle(key)).toBe(false);

        // Immediate second call: throttled
        expect(ws.shouldThrottle(key)).toBe(true);

        // After 250ms: allowed
        vi.advanceTimersByTime(250);
        expect(ws.shouldThrottle(key)).toBe(false);
    });

    it('should respect LRU limit for throttle map', () => {
        const ws = bitunixWs as any;
        const LIMIT = 500; // From code constant

        // Fill map
        for (let i = 0; i < LIMIT + 10; i++) {
            ws.shouldThrottle(`key-${i}`);
        }

        // Size should be close to limit (lazy prune removes 1 on insert if full)
        // With current logic: delete firstKey if > LIMIT.
        // So size should stick to LIMIT.
        expect(ws.throttleMap.size).toBeLessThanOrEqual(LIMIT);

        // Oldest keys should be gone
        expect(ws.throttleMap.has('key-0')).toBe(false);
        expect(ws.throttleMap.has(`key-${LIMIT + 5}`)).toBe(true);
    });

    it('should switch to slow retry after excessive connection errors', () => {
        const ws = bitunixWs as any;

        // Simulate errors
        for (let i = 0; i < 12; i++) { // > 10 (2x threshold)
            ws.handleInternalError('public', new Error('Test'));
            vi.advanceTimersByTime(100);
        }

        expect(marketState.connectionStatus).toBe('reconnecting');
        // We no longer show error dialog, we just retry slowly
        expect(uiState.showError).not.toHaveBeenCalled();
    });
});
