import { get } from 'svelte/store';
import { parseDecimal, formatDynamicDecimal, parseDateString, parseTimestamp } from '../utils/utils';
import { CONSTANTS } from '../lib/constants';
import { apiService } from './apiService';
import { modalManager } from './modalManager';
import { uiManager } from './uiManager';
import { calculator } from '../lib/calculator';
import { tradeStore, updateTradeStore, resetAllInputs, toggleAtrInputs } from '../stores/tradeStore';
import { resultsStore, initialResultsState } from '../stores/resultsStore';
import { presetStore, updatePresetStore } from '../stores/presetStore';
import { journalStore } from '../stores/journalStore';
import { uiStore } from '../stores/uiStore';
import { settingsStore } from '../stores/settingsStore';
import { marketStore, wsStatusStore } from '../stores/marketStore'; // Import marketStore and wsStatusStore
import { bitunixWs } from './bitunixWs'; // Import WS Service
import { syncService } from './syncService';
import { csvService } from './csvService';
import type { JournalEntry, TradeValues, IndividualTpResult, BaseMetrics } from '../stores/types';
import { Decimal } from 'decimal.js';
import { browser } from '$app/environment';
import { trackCustomEvent } from './trackingService';
import { onboardingService } from './onboardingService';

let priceUpdateIntervalId: any = null;
let currentSubscribedSymbol: string | null = null;
let marketStoreUnsubscribe: (() => void) | null = null;
let lastCalculationTime = 0;
const CALCULATION_THROTTLE_MS = 200; // Throttle UI updates to max 5 times per second

export const app = {
    calculator: calculator,
    uiManager: uiManager,


    init: () => {
        if (browser) {
            app.populatePresetLoader();
            app.calculateAndDisplay();
            app.setupPriceUpdates();
            app.setupRealtimeUpdates(); // Initialize WS updates
        }
    },

    setupRealtimeUpdates: () => {
        if (!browser) return;

        // Watch for symbol changes to manage WS subscriptions
        let symbolDebounceTimer: any = null;

        tradeStore.subscribe((state) => {
            const settings = get(settingsStore);
            if (settings.apiProvider !== 'bitunix') return;

            const newSymbol = state.symbol ? state.symbol.toUpperCase() : '';

            // Clear existing timer
            if (symbolDebounceTimer) clearTimeout(symbolDebounceTimer);

            symbolDebounceTimer = setTimeout(() => {
                if (newSymbol && newSymbol.length >= 3) {
                    if (currentSubscribedSymbol !== newSymbol) {
                        if (currentSubscribedSymbol) {
                            bitunixWs.unsubscribe(currentSubscribedSymbol, 'price');
                        }
                        bitunixWs.subscribe(newSymbol, 'price');
                        currentSubscribedSymbol = newSymbol;
                    }
                } else if (currentSubscribedSymbol) {
                    // Symbol cleared or invalid
                    bitunixWs.unsubscribe(currentSubscribedSymbol, 'price');
                    currentSubscribedSymbol = null;
                }
            }, 500); // 500ms debounce to prevent rapid sub/unsub during typing
        });

        // Watch for Market Data updates (from WS)
        if (marketStoreUnsubscribe) marketStoreUnsubscribe();
        marketStoreUnsubscribe = marketStore.subscribe((data) => {
            const state = get(tradeStore);
            const settings = get(settingsStore);

            // Only update if:
            // 1. We have a valid symbol
            // 2. Auto-update setting is ON
            // 3. We have WS data for this symbol
            if (state.symbol && settings.autoUpdatePriceInput) {
                const symbolKey = state.symbol.toUpperCase();
                // Check exact symbol or with P suffix logic or USDT suffix logic to be robust
                const marketData = data[symbolKey] || data[symbolKey.replace('P', '')] || data[symbolKey + 'USDT'];
                
                if (marketData && marketData.lastPrice) {
                    // Update Entry Price
                    const newPrice = marketData.lastPrice.toNumber();
                    // Avoid redundant updates/re-renders if price hasn't changed significantly or is same
                    if (state.entryPrice !== newPrice) {
                        updateTradeStore(s => ({ ...s, entryPrice: newPrice }));

                        // Throttle expensive calculations
                        const now = Date.now();
                        if (now - lastCalculationTime > CALCULATION_THROTTLE_MS) {
                            app.calculateAndDisplay();
                            lastCalculationTime = now;
                        }
                    }
                }
            }
        });
    },

    setupPriceUpdates: () => {
        if (!browser) return;

        // Watch settings and symbol changes to adjust interval
        settingsStore.subscribe(() => app.refreshPriceUpdateInterval());
        
        // Initial setup
        app.refreshPriceUpdateInterval();
    },

    refreshPriceUpdateInterval: () => {
        if (priceUpdateIntervalId) {
            clearInterval(priceUpdateIntervalId);
            priceUpdateIntervalId = null;
        }

        const settings = get(settingsStore);
        // Interval logic: we start the loop if marketDataInterval is set (it is always set in new types)
        // However, if we want to stop it completely, we'd need an "Off" option. Currently type is '1s'|'1m'|'10m'.
        // So we assume it always runs.

        let intervalMs = 60000;
        if (settings.marketDataInterval === '1s') intervalMs = 1000;
        else if (settings.marketDataInterval === '1m') intervalMs = 60000;
        else if (settings.marketDataInterval === '10m') intervalMs = 600000;

        priceUpdateIntervalId = setInterval(() => {
            const currentSymbol = get(tradeStore).symbol;
            const uiState = get(uiStore);

            if (currentSymbol && currentSymbol.length >= 3 && !uiState.isPriceFetching) {
                 // 1. Auto Update Price Input (REST Fallback)
                 if (settings.autoUpdatePriceInput) {
                     // If provider is Binance, we MUST use REST (no WS impl yet).
                     if (settings.apiProvider === 'binance') {
                        app.handleFetchPrice(true);
                     } else {
                         // Bitunix: Use REST only if WS is NOT connected to avoid race conditions/jitter
                         const wsStatus = get(wsStatusStore);
                         if (wsStatus !== 'connected') {
                            app.handleFetchPrice(true);
                         }
                     }
                 }

                 // 2. Auto Update ATR (Independent of price input setting, but depends on ATR mode)
                 if (get(tradeStore).useAtrSl && get(tradeStore).atrMode === 'auto') {
                     app.fetchAtr(true);
                 }
            }
        }, intervalMs);
    },

    calculateAndDisplay: () => {
        uiStore.hideError();
        const currentTradeState = get(tradeStore);
        const newResults = { ...initialResultsState };

        const getAndValidateInputs = (): { status: string; message?: string; fields?: string[]; data?: TradeValues } => {
            const values: TradeValues = {
                accountSize: parseDecimal(currentTradeState.accountSize),
                riskPercentage: parseDecimal(currentTradeState.riskPercentage),
                entryPrice: parseDecimal(currentTradeState.entryPrice),
                leverage: parseDecimal(currentTradeState.leverage || parseFloat(CONSTANTS.DEFAULT_LEVERAGE)),
                fees: parseDecimal(currentTradeState.fees || parseFloat(CONSTANTS.DEFAULT_FEES)),
                symbol: currentTradeState.symbol || '',
                useAtrSl: currentTradeState.useAtrSl,
                atrValue: parseDecimal(currentTradeState.atrValue),
                atrMultiplier: parseDecimal(currentTradeState.atrMultiplier || parseFloat(CONSTANTS.DEFAULT_ATR_MULTIPLIER)),
                stopLossPrice: parseDecimal(currentTradeState.stopLossPrice),
                targets: currentTradeState.targets.map(t => ({ price: parseDecimal(t.price), percent: parseDecimal(t.percent), isLocked: t.isLocked })),
                totalPercentSold: new Decimal(0)
            };

            const requiredFieldMap: { [key: string]: Decimal } = {
                accountSize: values.accountSize,
                riskPercentage: values.riskPercentage,
                entryPrice: values.entryPrice,
            };

            if (values.useAtrSl) {
                requiredFieldMap.atrValue = values.atrValue;
                requiredFieldMap.atrMultiplier = values.atrMultiplier;
            } else {
                requiredFieldMap.stopLossPrice = values.stopLossPrice;
            }

            const emptyFields = Object.keys(requiredFieldMap).filter(field => requiredFieldMap[field as keyof typeof requiredFieldMap].isZero());

            if (emptyFields.length > 0) {
                return { status: CONSTANTS.STATUS_INCOMPLETE };
            }

            if (!values.useAtrSl) {
                newResults.showAtrFormulaDisplay = false;
                newResults.atrFormulaText = '';
            } else if (values.entryPrice.gt(0) && values.atrValue.gt(0) && values.atrMultiplier.gt(0)) {
                const operator = currentTradeState.tradeType === CONSTANTS.TRADE_TYPE_LONG ? '-' : '+';
                values.stopLossPrice = currentTradeState.tradeType === CONSTANTS.TRADE_TYPE_LONG
                    ? values.entryPrice.minus(values.atrValue.times(values.atrMultiplier))
                    : values.entryPrice.plus(values.atrValue.times(values.atrMultiplier));

                newResults.showAtrFormulaDisplay = true;
                newResults.atrFormulaText = `SL = ${values.entryPrice.toFixed(4)} ${operator} (${values.atrValue} × ${values.atrMultiplier}) = ${values.stopLossPrice.toFixed(4)}`;
            } else if (values.atrValue.gt(0) && values.atrMultiplier.gt(0)) {
                return { status: CONSTANTS.STATUS_INCOMPLETE };
            }

            newResults.isAtrSlInvalid = values.useAtrSl && values.stopLossPrice.lte(0);

            if (values.stopLossPrice.lte(0) && !newResults.isAtrSlInvalid) {
                return { status: CONSTANTS.STATUS_INCOMPLETE };
            }

            if (currentTradeState.tradeType === CONSTANTS.TRADE_TYPE_LONG && values.entryPrice.lte(values.stopLossPrice)) {
                return { status: CONSTANTS.STATUS_INVALID, message: "Long: Stop-Loss muss unter dem Kaufpreis liegen.", fields: ['stopLossPrice', 'entryPrice'] };
            }
            if (currentTradeState.tradeType === CONSTANTS.TRADE_TYPE_SHORT && values.entryPrice.gte(values.stopLossPrice)) {
                return { status: CONSTANTS.STATUS_INVALID, message: "Short: Stop-Loss muss über dem Verkaufspreis liegen.", fields: ['stopLossPrice', 'entryPrice'] };
            }

            for (const tp of values.targets) {
                if (tp.price.gt(0)) {
                    if (currentTradeState.tradeType === CONSTANTS.TRADE_TYPE_LONG) {
                        if (tp.price.lte(values.stopLossPrice)) return { status: CONSTANTS.STATUS_INVALID, message: `Long: Take-Profit Ziel ${tp.price.toFixed(4)} muss über dem Stop-Loss liegen.`, fields: ['targets'] };
                        if (tp.price.lte(values.entryPrice)) return { status: CONSTANTS.STATUS_INVALID, message: `Long: Take-Profit Ziel ${tp.price.toFixed(4)} muss über dem Einstiegspreis liegen.`, fields: ['targets'] };
                    } else {
                        if (tp.price.gte(values.stopLossPrice)) return { status: CONSTANTS.STATUS_INVALID, message: `Short: Take-Profit Ziel ${tp.price.toFixed(4)} muss unter dem Stop-Loss liegen.`, fields: ['targets'] };
                        if (tp.price.gte(values.entryPrice)) return { status: CONSTANTS.STATUS_INVALID, message: `Short: Take-Profit Ziel ${tp.price.toFixed(4)} muss unter dem Einstiegspreis liegen.`, fields: ['targets'] };
                    }
                }
            }

            values.totalPercentSold = values.targets.reduce((sum: Decimal, t) => sum.plus(t.percent), new Decimal(0));
            if (values.totalPercentSold.gt(100)) {
                return { status: CONSTANTS.STATUS_INVALID, message: `Die Summe der Verkaufsprozente (${values.totalPercentSold.toFixed(0)}%) darf 100% nicht überschreiten.`, fields: [] };
            }

            return { status: CONSTANTS.STATUS_VALID, data: values };
        };

        const validationResult = getAndValidateInputs();

        if (newResults.isAtrSlInvalid) {
            resultsStore.set({
                ...initialResultsState,
                showAtrFormulaDisplay: newResults.showAtrFormulaDisplay,
                atrFormulaText: newResults.atrFormulaText,
                isAtrSlInvalid: true,
            });
            return;
        }

        if (validationResult.status === CONSTANTS.STATUS_INVALID) {
            trackCustomEvent('Calculation', 'Error', validationResult.message);
            uiStore.showError(validationResult.message || "");
            app.clearResults();
            return;
        }

        if (validationResult.status === CONSTANTS.STATUS_INCOMPLETE) {
            app.clearResults(true);
            return;
        }

        let values = validationResult.data as TradeValues;
        let baseMetrics: BaseMetrics | null;

        if (currentTradeState.isRiskAmountLocked) {
            const riskAmount = parseDecimal(currentTradeState.riskAmount);
            if (riskAmount.gt(0) && values.accountSize.gt(0)) {
                const newRiskPercentage = riskAmount.div(values.accountSize).times(100);
                updateTradeStore(state => ({ ...state, riskPercentage: newRiskPercentage.toNumber() }));
                values.riskPercentage = newRiskPercentage;
            }
            baseMetrics = calculator.calculateBaseMetrics(values, currentTradeState.tradeType);

        } else if (currentTradeState.isPositionSizeLocked && currentTradeState.lockedPositionSize && currentTradeState.lockedPositionSize.gt(0)) {
            const riskPerUnit = values.entryPrice.minus(values.stopLossPrice).abs();
            if (riskPerUnit.lte(0)) {
                uiStore.showError("Stop-Loss muss einen gültigen Abstand zum Einstiegspreis haben.");
                app.clearResults();
                return;
            }
            const riskAmount = riskPerUnit.times(currentTradeState.lockedPositionSize);
            const newRiskPercentage = values.accountSize.isZero() ? new Decimal(0) : riskAmount.div(values.accountSize).times(100);

            updateTradeStore(state => ({ ...state, riskPercentage: newRiskPercentage.toNumber(), riskAmount: riskAmount.toNumber() }));
            values.riskPercentage = newRiskPercentage;

            baseMetrics = calculator.calculateBaseMetrics(values, currentTradeState.tradeType);
            if (baseMetrics) baseMetrics.positionSize = currentTradeState.lockedPositionSize;

        } else {
            baseMetrics = calculator.calculateBaseMetrics(values, currentTradeState.tradeType);
            if (baseMetrics) {
                const finalMetrics = baseMetrics;
                updateTradeStore(state => ({ ...state, riskAmount: finalMetrics.riskAmount.toNumber() }));
            }
        }

        if (!baseMetrics || baseMetrics.positionSize.lte(0)) {
            app.clearResults();
            if (currentTradeState.isPositionSizeLocked) app.togglePositionSizeLock(false);
            return;
        }

        newResults.positionSize = formatDynamicDecimal(baseMetrics.positionSize, 4);
        newResults.requiredMargin = formatDynamicDecimal(baseMetrics.requiredMargin, 2);

        // Check if required margin exceeds account size
        if (values.accountSize.gt(0) && baseMetrics.requiredMargin.gt(values.accountSize)) {
            newResults.isMarginExceeded = true;
        } else {
            newResults.isMarginExceeded = false;
        }

        newResults.netLoss = `-${formatDynamicDecimal(baseMetrics.netLoss, 2)}`;
        newResults.liquidationPrice = values.leverage.gt(1) ? formatDynamicDecimal(baseMetrics.liquidationPrice) : 'N/A';
        newResults.breakEvenPrice = formatDynamicDecimal(baseMetrics.breakEvenPrice);
        newResults.entryFee = formatDynamicDecimal(baseMetrics.entryFee, 4);

        const calculatedTpDetails: IndividualTpResult[] = [];
        values.targets.forEach((tp, index) => {
            if (tp.price.gt(0) && tp.percent.gt(0)) {
                const details = calculator.calculateIndividualTp(tp.price, tp.percent, baseMetrics, values, index);
                if ((currentTradeState.tradeType === 'long' && tp.price.gt(values.entryPrice)) || (currentTradeState.tradeType === 'short' && tp.price.lt(values.entryPrice))) {
                   calculatedTpDetails.push(details);
                }
            }
        });
        newResults.calculatedTpDetails = calculatedTpDetails;

        const totalMetrics = calculator.calculateTotalMetrics(values.targets, baseMetrics, values, currentTradeState.tradeType);
        if (values.totalPercentSold.gt(0)) {
            newResults.totalRR = formatDynamicDecimal(totalMetrics.totalRR, 2);
            newResults.totalNetProfit = `+${formatDynamicDecimal(totalMetrics.totalNetProfit, 2)}`;
            newResults.totalPercentSold = `${formatDynamicDecimal(values.totalPercentSold, 0)}%`;
            newResults.riskAmountCurrency = `-${formatDynamicDecimal(totalMetrics.riskAmount, 2)}`;
            newResults.totalFees = formatDynamicDecimal(totalMetrics.totalFees, 2);
            newResults.maxPotentialProfit = `+${formatDynamicDecimal(totalMetrics.maxPotentialProfit, 2)}`;
            newResults.showTotalMetricsGroup = true;
        } else {
            newResults.showTotalMetricsGroup = false;
        }

        resultsStore.set(newResults);

        const activeTargets = values.targets.filter(t => t.price.gt(0) && t.percent.gt(0)).length;
        trackCustomEvent('Calculation', 'Success', currentTradeState.tradeType, activeTargets);
        onboardingService.trackFirstCalculation();

        updateTradeStore(state => ({
            ...state,
            currentTradeData: { ...values, ...baseMetrics, ...totalMetrics, tradeType: currentTradeState.tradeType, status: 'Open', calculatedTpDetails },
            stopLossPrice: values.stopLossPrice.toNumber()
        }));
    },

    clearResults: (showGuidance = false) => {
        resultsStore.set(initialResultsState);
        if (showGuidance) {
            uiStore.showError('dashboard.promptForData');
        } else {
            uiStore.hideError();
        }
    },

    getJournal: (): JournalEntry[] => {
        if (!browser) return [];
        // Optimisation: Read from store memory instead of parsing localStorage on every call
        // This dramatically reduces I/O blocking on main thread for large datasets
        const fromStore = get(journalStore);
        if (fromStore && fromStore.length > 0) {
            return fromStore;
        }

        // Fallback: Initial Load or Empty Store
        try {
            const d = localStorage.getItem(CONSTANTS.LOCAL_STORAGE_JOURNAL_KEY) || '[]';
            const parsedData = JSON.parse(d);
            if (!Array.isArray(parsedData)) return [];
            return parsedData.map(trade => {
                const newTrade = { ...trade };
                Object.keys(newTrade).forEach(key => {
                    if (['accountSize', 'riskPercentage', 'entryPrice', 'stopLossPrice', 'leverage', 'fees', 'atrValue', 'atrMultiplier', 'totalRR', 'totalNetProfit', 'netLoss', 'riskAmount', 'totalFees', 'maxPotentialProfit', 'positionSize', 'fundingFee', 'tradingFee', 'realizedPnl'].includes(key)) {
                        newTrade[key] = new Decimal(newTrade[key] || 0);
                    }
                });
                if (newTrade.targets && Array.isArray(newTrade.targets)) {
                    newTrade.targets = newTrade.targets.map((tp: { price: string | number; percent: string | number }) => ({ ...tp, price: new Decimal(tp.price || 0), percent: new Decimal(tp.percent || 0) }));
                }
                return newTrade as JournalEntry;
            });
        } catch {
            console.warn("Could not load journal from localStorage.");
            uiStore.showError("Journal konnte nicht geladen werden.");
            return [];
        }
    },
    saveJournal: (d: JournalEntry[]) => {
        if (!browser) return;
        try {
            localStorage.setItem(CONSTANTS.LOCAL_STORAGE_JOURNAL_KEY, JSON.stringify(d));
        } catch {
            uiStore.showError("Fehler beim Speichern des Journals. Der lokale Speicher ist möglicherweise voll oder blockiert.");
        }
    },
    addTrade: () => {
        const currentAppState = get(tradeStore);
        if (!currentAppState.currentTradeData || !currentAppState.currentTradeData.positionSize || currentAppState.currentTradeData.positionSize.lte(0)) { uiStore.showError("Kann keinen ungültigen Trade speichern."); return; }
        const journalData = app.getJournal();

        const newTrade: JournalEntry = {
            ...currentAppState.currentTradeData,
            notes: currentAppState.tradeNotes,
            tags: currentAppState.tags || [],
            id: Date.now(),
            date: new Date().toISOString(),
            entryDate: new Date().toISOString()
        } as JournalEntry;

        journalData.push(newTrade);
        app.saveJournal(journalData);
        journalStore.set(journalData);
        onboardingService.trackFirstJournalSave();
        uiStore.showFeedback('save');
    },
    updateTradeStatus: (id: number, newStatus: string) => {
        const journalData = app.getJournal();
        const tradeIndex = journalData.findIndex(t => t.id == id);
        if (tradeIndex !== -1) {
            journalData[tradeIndex].status = newStatus;
            app.saveJournal(journalData);
            journalStore.set(journalData);
            trackCustomEvent('Journal', 'UpdateStatus', newStatus);
        }
    },
    deleteTrade: (id: number) => {
        const d = app.getJournal().filter(t => t.id != id);
        app.saveJournal(d);
        journalStore.set(d);
    },
    async clearJournal() {
        const journal = app.getJournal();
        if (journal.length === 0) {
            uiStore.showError("Das Journal ist bereits leer.");
            return;
        }
        if (await modalManager.show("Journal leeren", "Möchten Sie wirklich das gesamte Journal unwiderruflich löschen?", "confirm")) {
            app.saveJournal([]);
            journalStore.set([]);
            uiStore.showFeedback('save', 2000);
        }
    },

    getInputsAsObject: () => {
        const currentAppState = get(tradeStore);
        return {
            accountSize: currentAppState.accountSize,
            riskPercentage: currentAppState.riskPercentage,
            leverage: currentAppState.leverage,
            fees: currentAppState.fees,
            tradeType: currentAppState.tradeType,
            useAtrSl: currentAppState.useAtrSl,
            atrMultiplier: currentAppState.atrMultiplier,
            symbol: currentAppState.symbol,
            targets: currentAppState.targets,
            tags: currentAppState.tags
        };
    },
    savePreset: async () => {
        if (!browser) return;
        const presetName = await modalManager.show("Preset speichern", "Geben Sie einen Namen für Ihr Preset ein:", "prompt");
        if (typeof presetName === 'string' && presetName) {
            try {
                const presets = JSON.parse(localStorage.getItem(CONSTANTS.LOCAL_STORAGE_PRESETS_KEY) || '{}');
                if (presets[presetName] && !(await modalManager.show("Überschreiben?", `Preset "${presetName}" existiert bereits. Möchten Sie es überschreiben?`, "confirm"))) return;
                presets[presetName] = app.getInputsAsObject();
                localStorage.setItem(CONSTANTS.LOCAL_STORAGE_PRESETS_KEY, JSON.stringify(presets));
                uiStore.showFeedback('save');
                app.populatePresetLoader();
                updatePresetStore(state => ({ ...state, selectedPreset: presetName }));
            } catch {
                uiStore.showError("Preset konnte nicht gespeichert werden. Der lokale Speicher ist möglicherweise voll oder blockiert.");
            }
        }
    },
    deletePreset: async () => {
        if (!browser) return;
        const presetName = get(presetStore).selectedPreset;
        if (!presetName) return;
        if (!(await modalManager.show("Preset löschen", `Preset "${presetName}" wirklich löschen?`, "confirm"))) return;
        try {
            const presets = JSON.parse(localStorage.getItem(CONSTANTS.LOCAL_STORAGE_PRESETS_KEY) || '{}');
            delete presets[presetName];
            localStorage.setItem(CONSTANTS.LOCAL_STORAGE_PRESETS_KEY, JSON.stringify(presets));
            app.populatePresetLoader();
            updatePresetStore(state => ({ ...state, selectedPreset: '' }));
        } catch { uiStore.showError("Preset konnte nicht gelöscht werden."); }
    },
    loadPreset: (presetName: string) => {
        if (!browser) return;
        if (!presetName) return;
        trackCustomEvent('Preset', 'Load', presetName);
        try {
            const presets = JSON.parse(localStorage.getItem(CONSTANTS.LOCAL_STORAGE_PRESETS_KEY) || '{}');
            const preset = presets[presetName];
            if (preset) {
                resetAllInputs();
                updateTradeStore(state => ({
                    ...state,
                    accountSize: preset.accountSize || null,
                    riskPercentage: preset.riskPercentage || null,
                    leverage: preset.leverage || parseFloat(CONSTANTS.DEFAULT_LEVERAGE),
                    fees: preset.fees || parseFloat(CONSTANTS.DEFAULT_FEES),
                    symbol: preset.symbol || '',
                    atrValue: preset.atrValue || null,
                    atrMultiplier: preset.atrMultiplier || parseFloat(CONSTANTS.DEFAULT_ATR_MULTIPLIER),
                    useAtrSl: preset.useAtrSl || false,
                    tradeType: preset.tradeType || CONSTANTS.TRADE_TYPE_LONG,
                    tags: preset.tags || [],
                    targets: preset.targets || [
                        { price: null, percent: 50, isLocked: false },
                        { price: null, percent: 25, isLocked: false },
                        { price: null, percent: 25, isLocked: false }
                    ],
                }));
                updatePresetStore(state => ({ ...state, selectedPreset: presetName }));
                toggleAtrInputs(preset.useAtrSl || false);
                return;
            }
        } catch (error) {
            console.error("Fehler beim Laden des Presets:", error);
            uiStore.showError("Preset konnte nicht geladen werden.");
        }
    },
    populatePresetLoader: () => {
        if (!browser) return;
        try {
            const presets = JSON.parse(localStorage.getItem(CONSTANTS.LOCAL_STORAGE_PRESETS_KEY) || '{}');
            const presetNames = Object.keys(presets);
            updatePresetStore(state => ({ ...state, availablePresets: presetNames }));
        } catch {
            console.warn("Could not populate presets from localStorage.");
            updatePresetStore(state => ({ ...state, availablePresets: [] }));
        }
    },
    exportToCSV: () => {
        if (!browser) return;
        csvService.exportToCSV();
    },
    syncBitunixHistory: async () => {
        await syncService.syncBitunixPositions();
    },
    importFromCSV: (file: File) => {
        if (!browser) return;
        csvService.importFromCSV(file);
    },

    handleFetchPrice: async (isAuto = false) => {
        const currentTradeState = get(tradeStore);
        const settings = get(settingsStore);
        const symbol = currentTradeState.symbol.toUpperCase().replace('/', '');
        if (!symbol) {
            if (!isAuto) uiStore.showError("Bitte geben Sie ein Symbol ein.");
            return;
        }
        
        // Don't show global spinner for auto-updates to avoid flashing
        if (!isAuto) uiStore.update(state => ({ ...state, isPriceFetching: true }));
        
        try {
            let price: Decimal;
            if (settings.apiProvider === 'binance') {
                price = await apiService.fetchBinancePrice(symbol);
            } else {
                price = await apiService.fetchBitunixPrice(symbol);
            }
            updateTradeStore(state => ({ ...state, entryPrice: price.toDP(4).toNumber() }));
            
            // Only show feedback on manual fetch
            if (!isAuto) uiStore.showFeedback('save', 700); // Use 'save' (checkmark) instead of 'copy'
            
            app.calculateAndDisplay();
        } catch (error) {
            // Suppress errors for auto-updates to avoid spamming the user
            if (!isAuto) {
                const message = error instanceof Error ? error.message : String(error);
                uiStore.showError(message);
            }
        } finally {
            if (!isAuto) uiStore.update(state => ({ ...state, isPriceFetching: false }));
        }
    },

    setAtrMode: (mode: 'manual' | 'auto') => {
        updateTradeStore(state => ({
            ...state,
            atrMode: mode,
            atrValue: mode === 'auto' ? null : state.atrValue
        }));
        // If switching to auto, fetch immediately
        if (mode === 'auto') {
            app.fetchAtr();
        }
        app.calculateAndDisplay();
    },

    setAtrTimeframe: (timeframe: string) => {
        updateTradeStore(state => ({
            ...state,
            atrTimeframe: timeframe
        }));
        if (get(tradeStore).atrMode === 'auto') {
            app.fetchAtr();
        }
    },

    fetchAtr: async (isAuto = false) => {
        const currentTradeState = get(tradeStore);
        const settings = get(settingsStore);
        const symbol = currentTradeState.symbol.toUpperCase().replace('/', '');
        if (!symbol) {
             if (!isAuto) uiStore.showError("Bitte geben Sie ein Symbol ein.");
            return;
        }
        
        if (!isAuto) uiStore.update(state => ({ ...state, isPriceFetching: true }));
        
        try {
            let klines;
            if (settings.apiProvider === 'binance') {
                klines = await apiService.fetchBinanceKlines(symbol, currentTradeState.atrTimeframe);
            } else {
                klines = await apiService.fetchBitunixKlines(symbol, currentTradeState.atrTimeframe);
            }

            const atr = calculator.calculateATR(klines);
            if (atr.lte(0)) {
                throw new Error("ATR konnte nicht berechnet werden. Prüfen Sie das Symbol oder den Zeitrahmen.");
            }
            updateTradeStore(state => ({ ...state, atrValue: atr.toDP(4).toNumber() }));
            app.calculateAndDisplay();
            
            if (!isAuto) uiStore.showFeedback('save', 700);
        } catch (error) {
             if (!isAuto) {
                const message = error instanceof Error ? error.message : String(error);
                uiStore.showError(message);
            }
        } finally {
            if (!isAuto) uiStore.update(state => ({ ...state, isPriceFetching: false }));
        }
    },

    selectSymbolSuggestion: (symbol: string) => {
        updateTradeStore(s => ({ ...s, symbol: symbol }));
        uiStore.update(s => ({ ...s, showSymbolSuggestions: false, symbolSuggestions: [] }));
        
        // Immediate fetch upon selection
        app.handleFetchPrice();
        if (get(tradeStore).useAtrSl && get(tradeStore).atrMode === 'auto') {
             app.fetchAtr();
        }
    },

    updateSymbolSuggestions: (query: string) => {
        const upperQuery = query.toUpperCase().replace('/', '');
        let filtered: string[] = [];
        if (upperQuery) {
            filtered = CONSTANTS.SUGGESTED_SYMBOLS.filter(s => s.startsWith(upperQuery));
        }
        uiStore.update(s => ({ ...s, symbolSuggestions: filtered, showSymbolSuggestions: filtered.length > 0 }));
    },
    togglePositionSizeLock: (forceState?: boolean) => {
        const currentTradeState = get(tradeStore);
        const currentResultsState = get(resultsStore);
        const shouldBeLocked = forceState !== undefined ? forceState : !currentTradeState.isPositionSizeLocked;

        if (shouldBeLocked && (!currentResultsState.positionSize || parseDecimal(currentResultsState.positionSize).lte(0))) {
            uiStore.showError("Positionsgröße kann nicht gesperrt werden, solange sie ungültig ist.");
            return;
        }

        updateTradeStore(state => ({
            ...state,
            isPositionSizeLocked: shouldBeLocked,
            lockedPositionSize: shouldBeLocked ? parseDecimal(currentResultsState.positionSize) : null,
            isRiskAmountLocked: false,
        }));

        app.calculateAndDisplay();
    },

    toggleRiskAmountLock: (forceState?: boolean) => {
        const currentTradeState = get(tradeStore);
        const shouldBeLocked = forceState !== undefined ? forceState : !currentTradeState.isRiskAmountLocked;

        if (shouldBeLocked && parseDecimal(currentTradeState.riskAmount).lte(0)) {
            uiStore.showError("Risikobetrag kann nicht gesperrt werden, solange er ungültig ist.");
            return;
        }

        updateTradeStore(state => ({
            ...state,
            isRiskAmountLocked: shouldBeLocked,
            isPositionSizeLocked: false,
            lockedPositionSize: null,
        }));

        app.calculateAndDisplay();
    },

    addTakeProfitRow: (price: number | null = null, percent: number | null = null, isLocked = false) => {
        updateTradeStore(state => ({
            ...state,
            targets: [...state.targets, { price, percent, isLocked }]
        }));
    },
    scanMultiAtr: async (symbol: string) => {
        const settings = get(settingsStore);
        // Use global favorites (ensure sorted or sort here)
        const timeframes = settings.favoriteTimeframes && settings.favoriteTimeframes.length > 0
            ? settings.favoriteTimeframes
            : ['5m', '15m', '1h', '4h'];

        const results: Record<string, number> = {};

        const fetchPromise = async (tf: string) => {
            try {
                let klines;
                if (settings.apiProvider === 'binance') {
                    klines = await apiService.fetchBinanceKlines(symbol, tf);
                } else {
                    klines = await apiService.fetchBitunixKlines(symbol, tf);
                }
                const atr = calculator.calculateATR(klines);
                if (atr.gt(0)) {
                    results[tf] = atr.toDP(4).toNumber();
                }
            } catch (e) {
                console.warn(`Failed to fetch ATR for ${tf}`, e);
            }
        };

        await Promise.all(timeframes.map(tf => fetchPromise(tf)));
        updateTradeStore(state => ({ ...state, multiAtrData: results }));
    },

    // New unified fetch function for Price + ATR + Analysis
    fetchAllAnalysisData: async (symbol: string, isAuto = false) => {
        if (!symbol || symbol.length < 3) return;

        // 1. Fetch Price (updateTradeStore handles UI)
        await app.handleFetchPrice(isAuto);

        // 2. Fetch Multi-ATR
        app.scanMultiAtr(symbol);

        // We will trigger ATR fetch for the ACTIVE timeframe:
        if (get(tradeStore).useAtrSl && get(tradeStore).atrMode === 'auto') {
             await app.fetchAtr(isAuto);
        }
    },

    adjustTpPercentages: (changedIndex: number | null) => {
        const currentAppState = get(tradeStore);
        if (changedIndex !== null && currentAppState.targets[changedIndex].isLocked) {
            return;
        }

        const targets = JSON.parse(JSON.stringify(currentAppState.targets));
        const ONE_HUNDRED = new Decimal(100);
        const ZERO = new Decimal(0);

        type DecimalTarget = { price: Decimal; percent: Decimal; isLocked: boolean; originalIndex: number };

        const decTargets: DecimalTarget[] = targets.map((t: { price: number | null; percent: number | null; isLocked: boolean }, i: number) => ({
            price: parseDecimal(t.price),
            percent: parseDecimal(t.percent),
            isLocked: t.isLocked,
            originalIndex: i
        }));

        const totalSum = decTargets.reduce((sum, t) => sum.plus(t.percent), ZERO);
        const diff = ONE_HUNDRED.minus(totalSum);

        if (diff.isZero()) return;

        const otherUnlocked = decTargets.filter(t => !t.isLocked && t.originalIndex !== changedIndex);

        if (otherUnlocked.length === 0) {
            if (changedIndex !== null) {
                decTargets[changedIndex].percent = decTargets[changedIndex].percent.plus(diff);
            }
        }
        else if (diff.gt(ZERO)) {
            const share = diff.div(otherUnlocked.length);
            otherUnlocked.forEach(t => {
                decTargets[t.originalIndex].percent = decTargets[t.originalIndex].percent.plus(share);
            });
        }
        else {
            let deficit = diff.abs();
            for (let i = otherUnlocked.length - 1; i >= 0; i--) {
                if (deficit.isZero()) break;
                const target = otherUnlocked[i];
                const originalTarget = decTargets[target.originalIndex];
                const reduction = Decimal.min(deficit, originalTarget.percent);

                originalTarget.percent = originalTarget.percent.minus(reduction);
                deficit = deficit.minus(reduction);
            }
        }

        let finalTargets = decTargets.map(t => ({
            ...t,
            percent: t.percent.toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
        }));

        let finalSum = finalTargets.reduce((sum, t) => sum.plus(t.percent), ZERO);
        let roundingDiff = ONE_HUNDRED.minus(finalSum);

        if (!roundingDiff.isZero()) {
            let targetToAdjust = finalTargets.find((t, i) => !t.isLocked && i !== changedIndex && t.percent.plus(roundingDiff).gte(0));
            if (!targetToAdjust) {
                targetToAdjust = finalTargets.find(t => !t.isLocked && t.percent.plus(roundingDiff).gte(0));
            }
            if (targetToAdjust) {
                targetToAdjust.percent = targetToAdjust.percent.plus(roundingDiff);
            }
        }

        updateTradeStore(state => ({ ...state, targets: finalTargets.map(t => ({price: t.price.toNumber(), percent: t.percent.toNumber(), isLocked: t.isLocked})) }));
    },
};
