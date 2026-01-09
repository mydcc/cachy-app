import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { handleGlobalKeydown } from './hotkeyService';
import { settingsStore } from '../stores/settingsStore';
import { tradeStore } from '../stores/tradeStore';
import { uiStore } from '../stores/uiStore';
import { CONSTANTS } from '../lib/constants';
import { get } from 'svelte/store';

describe('hotkeyService', () => {
    let preventDefaultSpy: any;
    let focusSpy: any;

    beforeEach(() => {
        preventDefaultSpy = vi.fn();
        focusSpy = vi.spyOn(document.body, 'focus');

        // Reset stores to default state
        settingsStore.set({
            hotkeyMode: 'mode1', // Default to Direct Mode for testing
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
            disclaimerAccepted: true
        });

        tradeStore.set({
            tradeType: 'long',
            targets: [],
            tags: [], // Added missing tags
            accountSize: 1000,
            riskPercentage: 1,
            entryPrice: 100,
            stopLossPrice: 90,
            leverage: 1,
            fees: 0.1,
            exitFees: 0.1, // Added exitFees
            feeMode: 'taker_taker', // Added feeMode
            symbol: 'BTCUSDT',
            atrValue: 1,
            atrMultiplier: 1,
            useAtrSl: false,
            atrMode: 'manual',
            atrTimeframe: '1h',
            analysisTimeframe: '1h',
            riskAmount: 10,
            isRiskAmountLocked: false,
            isPositionSizeLocked: false,
            lockedPositionSize: null, // Added lockedPositionSize
            tradeNotes: '',
            journalSearchQuery: '',
            journalFilterStatus: 'all', // Added missing property
            currentTradeData: null, // Added missing property
            remoteLeverage: undefined,
            remoteMarginMode: undefined,
            remoteMakerFee: undefined,
            remoteTakerFee: undefined,
            multiAtrData: {}
        });

        uiStore.set({
            currentTheme: 'dark',
            showJournalModal: false,
            isPriceFetching: false,
            showSettingsModal: false,
            showChangelogModal: false,
            showGuideModal: false,
            showPrivacyModal: false, // Added missing property
            showSaveFeedback: false,
            showCopyFeedback: false,
            showErrorMessage: false, // Added missing property
            errorMessage: '',
            symbolSuggestions: [],
            showSymbolSuggestions: false,
            isLoading: false,
            loadingMessage: ''
        });

        // Mock document.getElementById
        document.getElementById = vi.fn((id) => {
             return {
                 focus: vi.fn(),
                 select: vi.fn()
             } as any;
        });

        // Mock document.activeElement
        Object.defineProperty(document, 'activeElement', {
            value: document.body,
            writable: true
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    const triggerKeydown = (key: string, altKey = false, shiftKey = false) => {
        const event = new KeyboardEvent('keydown', { key, altKey, shiftKey });
        Object.defineProperty(event, 'preventDefault', { value: preventDefaultSpy });
        handleGlobalKeydown(event);
    };

    describe('Mode 1: Direct Mode', () => {
        beforeEach(() => {
            settingsStore.update(s => ({ ...s, hotkeyMode: 'mode1' }));
        });

        it('should switch to Short on "s"', () => {
            triggerKeydown('s');
            expect(preventDefaultSpy).toHaveBeenCalled();
            const ts = get(tradeStore);
            expect(ts.tradeType).toBe(CONSTANTS.TRADE_TYPE_SHORT);
        });

        it('should focus Stop Loss on "o"', () => {
            triggerKeydown('o');
            expect(preventDefaultSpy).toHaveBeenCalled();
            expect(document.getElementById).toHaveBeenCalledWith('stop-loss-price-input');
        });

        it('should switch to Long on "l"', () => {
             // Set short first
             tradeStore.update(s => ({ ...s, tradeType: 'short' }));
             triggerKeydown('l');
             expect(preventDefaultSpy).toHaveBeenCalled();
             const ts = get(tradeStore);
             expect(ts.tradeType).toBe(CONSTANTS.TRADE_TYPE_LONG);
        });

        it('should open Journal on "j"', () => {
             triggerKeydown('j');
             expect(preventDefaultSpy).toHaveBeenCalled();
             const ui = get(uiStore);
             expect(ui.showJournalModal).toBe(true);
        });
    });

    describe('Mode 2: Safety Mode', () => {
        beforeEach(() => {
            settingsStore.update(s => ({ ...s, hotkeyMode: 'mode2' }));
        });

        it('should NOT action on plain "s"', () => {
            triggerKeydown('s');
            expect(preventDefaultSpy).not.toHaveBeenCalled();
        });

        it('should switch to Short on "Alt + s"', () => {
            triggerKeydown('s', true); // Alt=true
            expect(preventDefaultSpy).toHaveBeenCalled();
            const ts = get(tradeStore);
            expect(ts.tradeType).toBe(CONSTANTS.TRADE_TYPE_SHORT);
        });

        it('should focus Stop Loss on "Alt + o"', () => {
            triggerKeydown('o', true);
            expect(preventDefaultSpy).toHaveBeenCalled();
            expect(document.getElementById).toHaveBeenCalledWith('stop-loss-price-input');
        });
    });
});
