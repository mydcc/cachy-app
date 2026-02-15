
import { describe, it, expect, vi } from 'vitest';
import { activeTechnicalsManager } from './activeTechnicalsManager.svelte';
import { technicalsService } from './technicalsService';
import { marketWatcher } from './marketWatcher';

// Mock environment
vi.mock('$app/environment', () => ({
    browser: true
}));

// Mock technicalsService
vi.mock('./technicalsService', () => ({
    technicalsService: {
        cleanup: vi.fn(),
        initializeTechnicals: vi.fn(),
        updateTechnicals: vi.fn()
    }
}));

// Mock marketWatcher
vi.mock('./marketWatcher', () => ({
    marketWatcher: {
        register: vi.fn(),
        unregister: vi.fn()
    }
}));

// Mock stores
vi.mock('../stores/market.svelte', () => ({
    marketState: { data: {} }
}));
vi.mock('../stores/settings.svelte', () => ({
    settingsState: { enabledIndicators: {} }
}));
vi.mock('../stores/trade.svelte', () => ({
    tradeState: { symbol: 'BTCUSDT' }
}));
vi.mock('../stores/indicator.svelte', () => ({
    indicatorState: { toJSON: () => ({}) }
}));
vi.mock('../stores/favorites.svelte', () => ({
    favoritesState: { items: [] }
}));

// Mock Svelte runes/effects
vi.mock('svelte', () => ({
    untrack: (fn: any) => fn(),
    $state: { snapshot: (x: any) => x },
    // Mock $effect.root to return a cleanup function wrapper
    // The real $effect.root executes the function and returns a cleanup function
    // We mock it to just execute and return a dummy cleanup
    $effect: Object.assign((fn: any) => {}, {
        root: (fn: any) => { fn(); return () => {}; }
    })
}));

describe('ActiveTechnicalsManager Cleanup', () => {
    it('should call technicalsService.cleanup when unregistering triggers stopMonitoring', () => {
        // 1. Register to start monitoring
        // Count becomes 1
        activeTechnicalsManager.register('ETHUSDT', '1h');

        // 2. Unregister to stop monitoring
        // Count becomes 0 -> stopMonitoring called -> cleanup called
        activeTechnicalsManager.unregister('ETHUSDT', '1h');

        // 3. Verify cleanup was called
        expect(technicalsService.cleanup).toHaveBeenCalledWith('ETHUSDT', '1h');
    });
});
