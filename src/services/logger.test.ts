import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { logger } from './logger';
import { toastService } from './toastService.svelte';
import * as appEnvironment from '$app/environment';

// Mock dependencies
vi.mock('./toastService.svelte', () => ({
    toastService: {
        error: vi.fn(),
        add: vi.fn()
    }
}));

// Mock settingsState
vi.mock('../stores/settings.svelte', () => ({
    settingsState: {
        debugMode: false,
        logSettings: {
            ui: true,
            network: false,
            general: true
        }
    }
}));

// Mock browser check
vi.mock('$app/environment', () => ({
    browser: true
}));

describe('LoggerService', () => {
    let consoleErrorSpy: any;
    let consoleLogSpy: any;

    beforeEach(() => {
        vi.clearAllMocks();
        consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

        // Reset browser mock default
        // @ts-ignore
        appEnvironment.browser = true;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should log error to console when category enabled', () => {
        logger.error('general', 'Test error');
        expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('[GENERAL] Test error'), '');
    });

    it('should support legacy boolean force parameter', () => {
        // network is disabled in mock settings, forcing it should log
        logger.error('network', 'Should log forced', undefined, true);
        expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('should NOT log when category disabled and not forced', () => {
        logger.error('network', 'Should not log', undefined, false);
        expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('should toast when explicitly requested via options object', () => {
        logger.error('general', 'Toast me', undefined, { toast: true });

        expect(consoleErrorSpy).toHaveBeenCalled();
        expect(toastService.error).toHaveBeenCalledWith('Toast me');
    });

    it('should auto-toast for UI category when forced (critical UI errors)', () => {
        // Legacy behavior: force=true on UI category -> toast
        logger.error('ui', 'UI Critical', undefined, true);
        expect(toastService.error).toHaveBeenCalledWith('UI Critical');
    });

    it('should NOT auto-toast for UI category when NOT forced', () => {
        logger.error('ui', 'UI Info', undefined, false);
        expect(toastService.error).not.toHaveBeenCalled();
    });

    it('should handle options object with force: true', () => {
        // network is disabled, but forced via options
        logger.error('network', 'Forced via options', undefined, { force: true });
        expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('should handle silent option to suppress console output', () => {
        logger.error('general', 'Silent error', undefined, { silent: true });
        expect(consoleErrorSpy).not.toHaveBeenCalled();

        // Let's verify silent + toast
        logger.error('general', 'Silent toast', undefined, { silent: true, toast: true });
        expect(consoleErrorSpy).not.toHaveBeenCalled(); // Still silent console
        expect(toastService.error).toHaveBeenCalledWith('Silent toast'); // But toast shown
    });
});
