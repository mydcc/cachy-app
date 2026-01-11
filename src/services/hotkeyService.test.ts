import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { handleGlobalKeydown } from './hotkeyService';
import { settingsStore } from '../stores/settingsStore';
import { tradeStore } from '../stores/tradeStore';
import { uiStore } from '../stores/uiStore';
import { app } from './app';
import { get } from 'svelte/store';
import { CONSTANTS } from '../lib/constants';
import { DEFAULT_HOTKEY_MAPS } from './hotkeyConfig';
import { Decimal } from 'decimal.js';

// Mock app service functions
vi.mock('./app', () => ({
    app: {
        addTakeProfitRow: vi.fn(),
        selectSymbolSuggestion: vi.fn(),
        adjustTpPercentages: vi.fn()
    }
}));

// Mock DOM elements
const mockFocus = vi.fn();
const mockSelect = vi.fn();
const getElementById = vi.fn();
document.getElementById = getElementById;

describe('Hotkey Service', () => {
    beforeEach(() => {
        vi.clearAllMocks();

        // Setup default DOM mock behavior
        getElementById.mockImplementation((id: string) => {
            if (id === 'entry-price-input' || id === 'stop-loss-price-input' || id.startsWith('tp-price-')) {
                return {
                    focus: mockFocus,
                    select: mockSelect,
                    tagName: 'INPUT',
                    value: ''
                };
            }
            return null;
        });

        // Reset stores to default state
        settingsStore.set({
            hotkeyMode: 'mode1', // Default to Direct Mode for testing
            hotkeyBindings: DEFAULT_HOTKEY_MAPS['mode1'],
            apiProvider: 'bitunix',
            marketDataInterval: '1m',
            autoUpdatePriceInput: true,
            autoFetchBalance: false,
            showSidebars: true,
            showTechnicals: true,
            hideUnfilledOrders: false,
            positionViewMode: 'detailed',
            pnlViewMode: 'value',
            isPro: true,
            feePreference: 'maker',
            favoriteTimeframes: [],
            syncRsiTimeframe: true,
            imgbbApiKey: '',
            imgbbExpiration: 0,
            apiKeys: { bitunix: { key: '', secret: '' }, binance: { key: '', secret: '' } },
            enableSidePanel: true,
            sidePanelMode: 'chat',
            sidePanelLayout: 'standard',
            aiProvider: 'gemini',
            openaiApiKey: '',
            openaiModel: 'gpt-4o',
            geminiApiKey: '',
            geminiModel: 'gemini-2.0-flash',
            anthropicApiKey: '',
            anthropicModel: 'claude-3-5-sonnet-20240620',
            disclaimerAccepted: true,
            enableAdvancedMetrics: false,
            visibleColumns: [],
            tradeListSettings: {
                minTradeValue: 0,
                maxTradeAgeSeconds: 600,
                maxTradeCount: 10
            }
        });

        tradeStore.set({
            symbol: 'BTCUSDT',
            entryPrice: 0,
            stopLossPrice: 0,
            targets: [],
            tradeType: 'long',
            accountSize: 1000,
            riskPercentage: 1,
            leverage: 10,
            fees: 0.04,
            exitFees: 0.04,
            feeMode: 'maker_taker',
            useAtrSl: false,
            atrValue: 0,
            atrMultiplier: 1.5,
            atrMode: 'auto',
            atrTimeframe: '5m',
            multiAtrData: {},
            tradeNotes: '',
            tags: [],
            analysisTimeframe: '15m',
            isPositionSizeLocked: false,
            lockedPositionSize: new Decimal(0),
            isRiskAmountLocked: false,
            riskAmount: 0,
            journalSearchQuery: '',
            journalFilterStatus: 'all',
            currentTradeData: null
        });

        uiStore.set({
            currentTheme: 'dark',
            showJournalModal: false,
            showChangelogModal: false,
            showGuideModal: false,
            showPrivacyModal: false,
            showWhitepaperModal: false,
            showSettingsModal: false,
            showCopyFeedback: false,
            showSaveFeedback: false,
            errorMessage: '',
            showErrorMessage: false,
            isPriceFetching: false,
            symbolSuggestions: [],
            showSymbolSuggestions: false,
            isLoading: false,
            loadingMessage: '',
        });
    });

    // Helper to create keyboard events
    function createEvent(key: string, modifiers: { alt?: boolean, shift?: boolean, ctrl?: boolean, meta?: boolean } = {}) {
        return {
            key,
            altKey: !!modifiers.alt,
            shiftKey: !!modifiers.shift,
            ctrlKey: !!modifiers.ctrl,
            metaKey: !!modifiers.meta,
            preventDefault: vi.fn(),
            target: document.body
        } as unknown as KeyboardEvent;
    }

    describe('Mode 1 (Direct Mode)', () => {
        beforeEach(() => {
            settingsStore.update(s => ({ ...s, hotkeyMode: 'mode1', hotkeyBindings: DEFAULT_HOTKEY_MAPS['mode1'] }));
        });

        it('should trigger add TP on +', () => {
            const event = createEvent('+');
            handleGlobalKeydown(event);
            expect(app.addTakeProfitRow).toHaveBeenCalled();
            expect(event.preventDefault).toHaveBeenCalled();
        });

        it('should focus entry on e', () => {
            const event = createEvent('e');
            handleGlobalKeydown(event);
            expect(getElementById).toHaveBeenCalledWith('entry-price-input');
            expect(mockFocus).toHaveBeenCalled();
        });

        it('should NOT trigger when input is active (e.g. typing in notes)', () => {
            // Mock active element as textarea
            const originalActiveElement = document.activeElement;
            Object.defineProperty(document, 'activeElement', {
                value: { tagName: 'TEXTAREA' },
                configurable: true
            });

            const event = createEvent('e');
            handleGlobalKeydown(event);
            expect(mockFocus).not.toHaveBeenCalled();

            // Cleanup
            Object.defineProperty(document, 'activeElement', {
                value: originalActiveElement,
                configurable: true
            });
        });
    });

    describe('Mode 2 (Safety Mode)', () => {
        beforeEach(() => {
            settingsStore.update(s => ({ ...s, hotkeyMode: 'mode2', hotkeyBindings: DEFAULT_HOTKEY_MAPS['mode2'] }));
        });

        it('should NOT trigger on simple key press', () => {
            const event = createEvent('e');
            handleGlobalKeydown(event);
            expect(mockFocus).not.toHaveBeenCalled();
        });

        it('should trigger on Alt + Key', () => {
            const event = createEvent('e', { alt: true });
            handleGlobalKeydown(event);
            expect(getElementById).toHaveBeenCalledWith('entry-price-input');
            expect(mockFocus).toHaveBeenCalled();
        });

        it('should trigger even if input is active (Safety Mode is global)', () => {
             // Mock active element as textarea
             const originalActiveElement = document.activeElement;
             Object.defineProperty(document, 'activeElement', {
                 value: { tagName: 'TEXTAREA' },
                 configurable: true
             });

             const event = createEvent('e', { alt: true });
             handleGlobalKeydown(event);
             expect(mockFocus).toHaveBeenCalled();

             // Cleanup
             Object.defineProperty(document, 'activeElement', {
                 value: originalActiveElement,
                 configurable: true
             });
        });
    });

    describe('Store Interactions', () => {
        it('should switch trade type to Short on S key', () => {
             settingsStore.update(s => ({ ...s, hotkeyMode: 'mode1', hotkeyBindings: DEFAULT_HOTKEY_MAPS['mode1'] }));
             const event = createEvent('s');
             handleGlobalKeydown(event);

             expect(get(tradeStore).tradeType).toBe('short');
        });

        it('should open journal on J key', () => {
            settingsStore.update(s => ({ ...s, hotkeyMode: 'mode1', hotkeyBindings: DEFAULT_HOTKEY_MAPS['mode1'] }));
            const event = createEvent('j');
            handleGlobalKeydown(event);

            expect(get(uiStore).showJournalModal).toBe(true);
       });
    });
});
