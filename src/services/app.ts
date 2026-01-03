import { get } from 'svelte/store';
import { parseDecimal, formatDynamicDecimal } from '../utils/utils';
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
import { marketStore } from '../stores/marketStore'; // Import marketStore
import { bitunixWs } from './bitunixWs'; // Import WS Service
import type { JournalEntry, TradeValues, IndividualTpResult, BaseMetrics } from '../stores/types';
import { Decimal } from 'decimal.js';
import { browser } from '$app/environment';
import { trackCustomEvent } from './trackingService';
import { onboardingService } from './onboardingService';

interface CSVTradeEntry {
    'ID': string;
    'Datum': string;
    'Uhrzeit': string;
    'Symbol': string;
    'Typ': string;
    'Status': string;
    'Konto Guthaben': string;
    'Risiko %': string;
    'Hebel': string;
    'Gebuehren %': string;
    'Einstieg': string;
    'Stop Loss': string;
    'Gewichtetes R/R': string;
    'Gesamt Netto-Gewinn': string;
    'Risiko pro Trade (Waehrung)': string;
    'Gesamte Gebuehren': string;
    'Max. potenzieller Gewinn': string;
    'Notizen': string;
    'TP1 Preis'?: string;
    'TP1 %'?: string;
    'TP2 Preis'?: string;
    'TP2 %'?: string;
    'TP3 Preis'?: string;
    'TP3 %'?: string;
    'TP4 Preis'?: string;
    'TP4 %'?: string;
    'TP5 Preis'?: string;
    'TP5 %'?: string;
    [key: string]: string | undefined;
}

let priceUpdateIntervalId: any = null;
let currentSubscribedSymbol: string | null = null;
let marketStoreUnsubscribe: (() => void) | null = null;

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
        tradeStore.subscribe((state) => {
            const settings = get(settingsStore);
            if (settings.apiProvider !== 'bitunix') return;

            const newSymbol = state.symbol ? state.symbol.toUpperCase() : '';
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
                        app.calculateAndDisplay();
                    }
                }
            }
        });
    },

    setupPriceUpdates: () => {
        if (!browser) return;

        settingsStore.subscribe(() => app.refreshPriceUpdateInterval());
        tradeStore.subscribe((curr) => {
            // No strict symbol change check needed for interval management itself
        });
        
        app.refreshPriceUpdateInterval();
    },

    refreshPriceUpdateInterval: () => {
        if (priceUpdateIntervalId) {
            clearInterval(priceUpdateIntervalId);
            priceUpdateIntervalId = null;
        }

        const settings = get(settingsStore);

        let intervalMs = 60000;
        if (settings.marketDataInterval === '1s') intervalMs = 1000;
        else if (settings.marketDataInterval === '1m') intervalMs = 60000;
        else if (settings.marketDataInterval === '10m') intervalMs = 600000;

        priceUpdateIntervalId = setInterval(() => {
            const currentSymbol = get(tradeStore).symbol;
            const uiState = get(uiStore);

            if (currentSymbol && currentSymbol.length >= 3 && !uiState.isPriceFetching) {
                 // Fallback REST polling
                 // If using Bitunix and WS is connected, maybe we skip REST price update to save bandwidth?
                 // But for robustness (and Binance support), we keep it.
                 // Also, 'autoUpdatePriceInput' logic is handled here for non-WS or fallback.
                 
                 // If we have fresh WS data, maybe skip this REST call for price? 
                 // We can check if `bitunixWs` is connected.
                 // For now, let's keep it simple: run both. The store update handles deduplication somewhat.
                 // But to avoid overwriting WS data with potentially slightly stale REST data,
                 // we might want to prioritize WS.
                 
                 // 1. Auto Update Price Input (REST Fallback)
                 if (settings.autoUpdatePriceInput) {
                     // If provider is Binance, we MUST use REST (no WS impl yet).
                     // If Bitunix, we prefer WS.
                     if (settings.apiProvider === 'binance') {
                        app.handleFetchPrice(true);
                     } else {
                         // Bitunix: Check if WS is active?
                         // For now, allow REST as backup. It might cause slight jitter if rates differ.
                         // But usually REST and WS are close.
                         // Let's rely on handleFetchPrice.
                         // Optimization: If we just updated via WS < 1s ago, skip?
                         // Too complex for now.
                         app.handleFetchPrice(true);
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
        try {
            const d = localStorage.getItem(CONSTANTS.LOCAL_STORAGE_JOURNAL_KEY) || '[]';
            const parsedData = JSON.parse(d);
            if (!Array.isArray(parsedData)) return [];
            return parsedData.map(trade => {
                const newTrade = { ...trade };
                Object.keys(newTrade).forEach(key => {
                    if (['accountSize', 'riskPercentage', 'entryPrice', 'stopLossPrice', 'leverage', 'fees', 'atrValue', 'atrMultiplier', 'totalRR', 'totalNetProfit', 'netLoss', 'riskAmount', 'totalFees', 'maxPotentialProfit', 'positionSize'].includes(key)) {
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
        journalData.push({ ...currentAppState.currentTradeData, notes: currentAppState.tradeNotes, id: Date.now(), date: new Date().toISOString() } as JournalEntry);
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
        const journalData = get(journalStore);
        if (journalData.length === 0) { uiStore.showError("Journal ist leer."); return; }
        trackCustomEvent('Journal', 'Export', 'CSV', journalData.length);
        const headers = ['ID', 'Datum', 'Uhrzeit', 'Symbol', 'Typ', 'Status', 'Konto Guthaben', 'Risiko %', 'Hebel', 'Gebuehren %', 'Einstieg', 'Stop Loss', 'Gewichtetes R/R', 'Gesamt Netto-Gewinn', 'Risiko pro Trade (Waehrung)', 'Gesamte Gebuehren', 'Max. potenzieller Gewinn', 'Notizen',
        // New headers
        'Trade ID', 'Order ID', 'Funding Fee', 'Trading Fee', 'Realized PnL', 'Is Manual',
         ...Array.from({length: 5}, (_, i) => [`TP${i+1} Preis`, `TP${i+1} %`]).flat()];
        const rows = journalData.map(trade => {
            const date = new Date(trade.date);
            const notes = trade.notes ? `"${trade.notes.replace(/"/g, '""').replace(/\n/g, ' ')}"` : '';
            const tpData = Array.from({length: 5}, (_, i) => [ (trade.targets[i]?.price || new Decimal(0)).toFixed(4), (trade.targets[i]?.percent || new Decimal(0)).toFixed(2) ]).flat();
            return [ trade.id, date.toLocaleDateString('de-DE'), date.toLocaleTimeString('de-DE'), trade.symbol, trade.tradeType, trade.status,
                (trade.accountSize || new Decimal(0)).toFixed(2), (trade.riskPercentage || new Decimal(0)).toFixed(2), (trade.leverage || new Decimal(0)).toFixed(2), (trade.fees || new Decimal(0)).toFixed(2), (trade.entryPrice || new Decimal(0)).toFixed(4), (trade.stopLossPrice || new Decimal(0)).toFixed(4),
                (trade.totalRR || new Decimal(0)).toFixed(2), (trade.totalNetProfit || new Decimal(0)).toFixed(2), (trade.riskAmount || new Decimal(0)).toFixed(2), (trade.totalFees || new Decimal(0)).toFixed(2), (trade.maxPotentialProfit || new Decimal(0)).toFixed(2), notes,
                // New values
                trade.tradeId || '', trade.orderId || '', (trade.fundingFee || new Decimal(0)).toFixed(4), (trade.tradingFee || new Decimal(0)).toFixed(4), (trade.realizedPnl || new Decimal(0)).toFixed(4), trade.isManual !== false ? 'true' : 'false',
                ...tpData ].join(',');
        });
        const csvContent = "data:text/csv;charset=utf-8," + headers.join(",") + "\n" + rows.join("\n");
        const link = document.createElement("a");
        link.href = encodeURI(csvContent);
        link.download = "TradeJournal.csv";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    },
    syncBitunixHistory: async () => {
        const settings = get(settingsStore);
        if (!settings.isPro) return;
        if (!settings.apiKeys.bitunix.key || !settings.apiKeys.bitunix.secret) {
            uiStore.showError('settings.apiKeysRequired');
            return;
        }

        uiStore.update(s => ({ ...s, isPriceFetching: true })); 

        try {
            // 1. Fetch Trades
            const tradeResponse = await fetch('/api/sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    apiKey: settings.apiKeys.bitunix.key,
                    apiSecret: settings.apiKeys.bitunix.secret,
                    limit: 100
                })
            });
            const tradeResult = await tradeResponse.json();
            if (tradeResult.error) throw new Error(tradeResult.error);
            const trades = tradeResult.data;

            // 2. Fetch Orders (to get SL and Entry confirmation)
            const orderResponse = await fetch('/api/sync/orders', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    apiKey: settings.apiKeys.bitunix.key,
                    apiSecret: settings.apiKeys.bitunix.secret,
                    limit: 100
                })
            });
            
            let orders: any[] = [];
            try {
                const orderResult = await orderResponse.json();
                if (!orderResult.error && Array.isArray(orderResult.data)) {
                    orders = orderResult.data;
                }
            } catch (err) {
                console.warn("Failed to fetch orders:", err);
            }

            if (!Array.isArray(trades)) throw new Error("Invalid response format for trades");

            // --- Pre-process orders to create a Symbol -> Orders(SL) lookup ---
            const symbolSlMap: Record<string, Array<{ ctime: number, slPrice: Decimal }>> = {};

            orders.forEach((o: any) => {
                let sl = new Decimal(0);
                if (o.slPrice) sl = new Decimal(o.slPrice);
                else if (o.stopLossPrice) sl = new Decimal(o.stopLossPrice);
                else if (o.triggerPrice) sl = new Decimal(o.triggerPrice);

                // Note: o.ctime might not exist on all order objects, check 'createTime' or similar if needed.
                // Assuming standardized API response or fallback.
                let t = o.createTime || o.ctime || 0;
                if (typeof t === 'string') t = parseInt(t, 10);

                if (sl.gt(0) && o.symbol) {
                    if (!symbolSlMap[o.symbol]) symbolSlMap[o.symbol] = [];
                    symbolSlMap[o.symbol].push({ ctime: t, slPrice: sl });
                }
            });

            // Sort by time ascending
            Object.values(symbolSlMap).forEach(list => list.sort((a, b) => a.ctime - b.ctime));
            // ------------------------------------------------------------------

            let addedCount = 0;
            const currentJournal = get(journalStore);
            const existingTradeIds = new Set(currentJournal.map(j => String(j.tradeId || '')).filter(Boolean));

            const newEntries: JournalEntry[] = [];

            const findOrder = (orderId: string | number) => orders.find((o: any) => String(o.orderId) === String(orderId));

            for (const t of trades) {
                // Skip if already exists
                if (existingTradeIds.has(String(t.tradeId))) continue;
                
                const realizedPnl = new Decimal(t.realizedPNL || 0);
                const fee = new Decimal(t.fee || 0);

                if (realizedPnl.eq(0)) continue; 

                const tradeId = String(t.tradeId);
                const orderId = String(t.orderId);
                const symbol = t.symbol;

                let timestamp = t.ctime;
                if (typeof t.ctime === 'string' && /^\d+$/.test(t.ctime)) {
                    timestamp = parseInt(t.ctime, 10);
                }
                const date = new Date(timestamp);
                if (isNaN(date.getTime())) continue;

                const side = t.side; 
                
                let tradeType = 'long'; 
                if (side.toUpperCase() === 'SELL') tradeType = 'long';
                else tradeType = 'short';

                const relatedOrder = findOrder(orderId);

                let stopLoss = new Decimal(0);

                // Strategy 1: Direct link to order
                if (relatedOrder) {
                    if (relatedOrder.slPrice) stopLoss = new Decimal(relatedOrder.slPrice);
                    else if (relatedOrder.stopLossPrice) stopLoss = new Decimal(relatedOrder.stopLossPrice);
                    else if (relatedOrder.triggerPrice) stopLoss = new Decimal(relatedOrder.triggerPrice);
                }
                
                // Strategy 2: Fallback to last known SL for symbol
                if (stopLoss.lte(0)) {
                    const candidates = symbolSlMap[symbol];
                    if (candidates) {
                        const tradeTime = date.getTime();
                        // Find most recent order BEFORE tradeTime
                        for (let i = candidates.length - 1; i >= 0; i--) {
                            if (candidates[i].ctime < tradeTime) {
                                stopLoss = candidates[i].slPrice;
                                break;
                            }
                        }
                    }
                }

                const exitPrice = new Decimal(t.price);
                const qtyDecimal = new Decimal(t.qty || 0);

                const exitPrice = new Decimal(t.price);
                const qtyDecimal = new Decimal(t.qty || 0); 
                
                // Back-calculate Entry Price if possible
                // PnL = (Exit - Entry) * Qty  (Long)
                // PnL = (Entry - Exit) * Qty  (Short)
                let entryPrice = exitPrice;

                if (qtyDecimal.gt(0)) {
                    if (tradeType === 'long') {
                         // Entry = Exit - (PnL / Qty)
                         entryPrice = exitPrice.minus(realizedPnl.div(qtyDecimal));
                    } else {
                         // Entry = PnL / Qty + Exit
                         entryPrice = realizedPnl.div(qtyDecimal).plus(exitPrice);
                    }
                }

                // Calculate realized stats if SL exists
                let riskAmount = new Decimal(0);
                let totalRR = new Decimal(0);

                if (stopLoss.gt(0)) {
                    const riskPerUnit = entryPrice.minus(stopLoss).abs();
                    if (qtyDecimal.gt(0) && riskPerUnit.gt(0)) {
                        riskAmount = riskPerUnit.times(qtyDecimal);
                        
                        if (riskAmount.gt(0) && !realizedPnl.isZero()) {
                            totalRR = realizedPnl.div(riskAmount);
                        }
                    }
                }

                let status = 'Open';
                if (!realizedPnl.isZero()) {
                    status = realizedPnl.gt(0) ? 'Won' : 'Lost';
                }

                const entry: JournalEntry = {
                    id: parseInt(tradeId) || Date.now() + Math.random(),
                    date: date.toISOString(),
                    symbol: symbol,
                    tradeType: tradeType,
                    status: status,
                    
                    accountSize: new Decimal(0),
                    riskPercentage: new Decimal(0),
                    leverage: new Decimal(t.leverage || relatedOrder?.leverage || 0),
                    fees: new Decimal(0),
                    
                    entryPrice: entryPrice, 
                    stopLossPrice: stopLoss,
                    
                    totalRR: totalRR,
                    totalNetProfit: realizedPnl, 
                    riskAmount: riskAmount,
                    totalFees: fee,
                    maxPotentialProfit: new Decimal(0),
                    
                    notes: `Imported (Order: ${orderId})`,
                    targets: [],
                    calculatedTpDetails: [],
                    
                    tradeId: tradeId,
                    orderId: orderId,
                    fundingFee: new Decimal(0), 
                    tradingFee: fee,
                    realizedPnl: realizedPnl,
                    isManual: false
                };
                newEntries.push(entry);
                addedCount++;
            }

            if (addedCount > 0) {
                const updatedJournal = [...currentJournal, ...newEntries];
                updatedJournal.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
                
                journalStore.set(updatedJournal);
                app.saveJournal(updatedJournal);
                uiStore.showFeedback('save', 2000); 
                trackCustomEvent('Journal', 'Sync', 'Bitunix', addedCount);
            } else {
                 uiStore.showError("Keine neuen Trades gefunden.");
            }

        } catch (e: any) {
            console.error("Sync error:", e);
            uiStore.showError("Sync failed: " + e.message);
        } finally {
            uiStore.update(s => ({ ...s, isPriceFetching: false }));
        }
    },
    importFromCSV: (file: File) => {
        if (!browser) return;
        const reader = new FileReader();
        reader.onload = async (e) => {
            const text = e.target?.result as string;
            const lines = text.split('\n').filter(line => line.trim() !== '');
            if (lines.length < 2) {
                uiStore.showError("CSV ist leer oder hat nur eine Kopfzeile.");
                return;
            }

            const headers = lines[0].split(',').map(h => h.trim());
            const requiredHeaders = ['ID', 'Datum', 'Uhrzeit', 'Symbol', 'Typ', 'Status', 'Einstieg', 'Stop Loss'];
            const missingHeaders = requiredHeaders.filter(h => !headers.includes(h));

            if (missingHeaders.length > 0) {
                uiStore.showError(`CSV-Datei fehlen benötigte Spalten: ${missingHeaders.join(', ')}`);
                return;
            }

            const entries = lines.slice(1).map(line => {
                const values = line.split(',');
                const entry: CSVTradeEntry = headers.reduce((obj: Partial<CSVTradeEntry>, header, index) => {
                    obj[header as keyof CSVTradeEntry] = values[index] ? values[index].trim() : '';
                    return obj;
                }, {}) as CSVTradeEntry;

                try {
                    const targets = [];
                    for (let j = 1; j <= 5; j++) {
                        const priceKey = `TP${j} Preis`;
                        const percentKey = `TP${j} %`;
                        if (entry[priceKey] && entry[percentKey]) {
                            targets.push({
                                price: parseDecimal(entry[priceKey] as string),
                                percent: parseDecimal(entry[percentKey] as string),
                                isLocked: false
                            });
                        }
                    }

                    const typedEntry = entry as CSVTradeEntry;
                    const importedTrade: JournalEntry = {
                        id: parseInt(typedEntry.ID, 10),
                        date: new Date(`${typedEntry.Datum} ${typedEntry.Uhrzeit}`).toISOString(),
                        symbol: typedEntry.Symbol,
                        tradeType: typedEntry.Typ.toLowerCase(),
                        status: typedEntry.Status,
                        accountSize: parseDecimal(typedEntry['Konto Guthaben'] || '0'),
                        riskPercentage: parseDecimal(typedEntry['Risiko %'] || '0'),
                        leverage: parseDecimal(typedEntry.Hebel || '1'),
                        fees: parseDecimal(typedEntry['Gebuehren %'] || '0.1'),
                        entryPrice: parseDecimal(typedEntry.Einstieg),
                        stopLossPrice: parseDecimal(typedEntry['Stop Loss']),
                        totalRR: parseDecimal(typedEntry['Gewichtetes R/R'] || '0'),
                        totalNetProfit: parseDecimal(typedEntry['Gesamt Netto-Gewinn'] || '0'),
                        riskAmount: parseDecimal(typedEntry['Risiko pro Trade (Waehrung)'] || '0'),
                        totalFees: parseDecimal(typedEntry['Gesamte Gebuehren'] || '0'),
                        maxPotentialProfit: parseDecimal(typedEntry['Max. potenzieller Gewinn'] || '0'),
                        notes: typedEntry.Notizen ? typedEntry.Notizen.replace(/""/g, '"').slice(1, -1) : '',
                        targets: targets,
                        // New fields
                        tradeId: typedEntry['Trade ID'] || undefined,
                        orderId: typedEntry['Order ID'] || undefined,
                        fundingFee: parseDecimal(typedEntry['Funding Fee'] || '0'),
                        tradingFee: parseDecimal(typedEntry['Trading Fee'] || '0'),
                        realizedPnl: parseDecimal(typedEntry['Realized PnL'] || '0'),
                        isManual: typedEntry['Is Manual'] ? typedEntry['Is Manual'] === 'true' : true,
                        calculatedTpDetails: [] // Assuming not exported/imported usually or calculated
                    };
                    return importedTrade;
                } catch (err: unknown) {
                    console.warn("Fehler beim Verarbeiten einer Zeile:", entry, err);
                    return null;
                }
            }).filter((entry): entry is JournalEntry => entry !== null);

            if (entries.length > 0) {
                const currentJournal = get(journalStore);
                const combined = [...currentJournal, ...entries];
                const unique = Array.from(new Map(combined.map(trade => [trade.id, trade])).values());

                if (await modalManager.show("Import bestätigen", `Sie sind dabei, ${entries.length} Trades zu importieren. Bestehende Trades mit derselben ID werden überschrieben. Fortfahren?`, "confirm")) {
                    journalStore.set(unique);
                    trackCustomEvent('Journal', 'Import', 'CSV', entries.length);
                    uiStore.showFeedback('save', 2000);
                }
            } else {
                uiStore.showError("Keine gültigen Einträge in der CSV-Datei gefunden.");
            }
        };
        reader.readAsText(file);
    },

    handleFetchPrice: async (isAuto = false) => {
        const currentTradeState = get(tradeStore);
        const settings = get(settingsStore);
        const symbol = currentTradeState.symbol.toUpperCase().replace('/', '');
        if (!symbol) {
            if (!isAuto) uiStore.showError("Bitte geben Sie ein Symbol ein.");
            return;
        }
        
        if (!isAuto) uiStore.update(state => ({ ...state, isPriceFetching: true }));
        
        try {
            // Parallel fetch: Price + Account Info (Leverage/Fees)
            const promises: any[] = [];

            // 1. Fetch Price
            if (settings.apiProvider === 'binance') {
                promises.push(apiService.fetchBinancePrice(symbol));
            } else {
                promises.push(apiService.fetchBitunixPrice(symbol));
            }

            // 2. Fetch Account Info (only if not auto-updating just price, OR if we want to sync settings regularly)
            // Let's do it on manual fetch or initial load mostly.
            // If keys exist.
            const apiKeys = settings.apiKeys[settings.apiProvider];
            if (apiKeys.key && apiKeys.secret && !isAuto) {
                promises.push(apiService.fetchAccountInfo(symbol, settings.apiProvider, apiKeys));
            } else {
                promises.push(Promise.resolve(null));
            }

            const [price, accountInfo] = await Promise.all(promises);

            const updates: any = { entryPrice: price.toDP(4).toNumber() };

            if (accountInfo) {
                updates.remoteLeverage = accountInfo.leverage;
                updates.remoteMarginMode = accountInfo.marginMode;
                updates.remoteMakerFee = accountInfo.makerFee;
                updates.remoteTakerFee = accountInfo.takerFee;

                // Auto-fill inputs if settings say so, or just update store for the UI to show "sync" status.
                // We default to overwriting inputs if they are not matching?
                // Actually, the requirement was "Live Sync with Override".
                // If we get new data, we populate the inputs.

                if (accountInfo.leverage) {
                    updates.leverage = accountInfo.leverage;
                }

                if (settings.feePreference === 'maker' && accountInfo.makerFee !== undefined) {
                    updates.fees = accountInfo.makerFee;
                } else if (settings.feePreference === 'taker' && accountInfo.takerFee !== undefined) {
                    updates.fees = accountInfo.takerFee;
                }
            }

            updateTradeStore(state => ({ ...state, ...updates }));
            
            if (!isAuto) uiStore.showFeedback('copy', 700);
            
            app.calculateAndDisplay();
        } catch (error) {
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
            
            if (!isAuto) uiStore.showFeedback('copy', 700);
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
