import { get } from 'svelte/store';
import { settingsStore } from '../stores/settingsStore';
import { tradeStore, updateTradeStore, resetAllInputs } from '../stores/tradeStore';
import { favoritesStore } from '../stores/favoritesStore';
import { uiStore } from '../stores/uiStore';
import { app } from './app';
import { CONSTANTS } from '../lib/constants';
import { modalManager } from './modalManager';

// Define IDs for elements we need to focus
const IDs = {
    ENTRY_PRICE: 'entry-price-input',
    STOP_LOSS: 'stop-loss-price-input',
    SYMBOL: 'symbol-input',
    TP_PRICE_PREFIX: 'tp-price-',
    TP_ADD_BTN: 'add-tp-btn'
};

function isInputActive(): boolean {
    const activeElement = document.activeElement;
    if (!activeElement) return false;
    const tagName = activeElement.tagName.toLowerCase();
    return tagName === 'input' || tagName === 'textarea' || tagName === 'select';
}

function focusElement(id: string) {
    const el = document.getElementById(id);
    if (el) {
        el.focus();
        if (el instanceof HTMLInputElement) {
            el.select();
        }
    }
}

function loadFavorite(index: number) { // 1-based index
    const favorites = get(favoritesStore);
    if (favorites.length >= index) {
        const symbol = favorites[index - 1];
        if (symbol) {
            app.selectSymbolSuggestion(symbol);
        }
    }
}

function cycleTakeProfitFocus(reverse: boolean = false) {
    const state = get(tradeStore);
    const targets = state.targets;
    const count = targets.length;

    if (count === 0) return;

    const activeElement = document.activeElement;
    let currentIndex = -1;

    if (activeElement && activeElement.id.startsWith(IDs.TP_PRICE_PREFIX)) {
        currentIndex = parseInt(activeElement.id.replace(IDs.TP_PRICE_PREFIX, ''), 10);
    }

    let nextIndex;
    if (currentIndex === -1) {
        // Not in a TP field, go to first (or last if reverse)
        nextIndex = reverse ? count - 1 : 0;
    } else {
        if (reverse) {
            nextIndex = currentIndex - 1;
            if (nextIndex < 0) nextIndex = count - 1; // Wrap around
        } else {
            nextIndex = currentIndex + 1;
            if (nextIndex >= count) nextIndex = 0; // Wrap around
        }
    }

    focusElement(`${IDs.TP_PRICE_PREFIX}${nextIndex}`);
}

function removeLastTakeProfit() {
    const state = get(tradeStore);
    if (state.targets.length > 0) {
        const newTargets = state.targets.slice(0, -1);
        updateTradeStore(s => ({ ...s, targets: newTargets }));
        app.adjustTpPercentages(null);
    }
}

export function handleGlobalKeydown(event: KeyboardEvent) {
    const settings = get(settingsStore);
    const mode = settings.hotkeyMode;

    // Always handle Escape globally for modals
    if (event.key === 'Escape') {
        return;
    }

    const inputActive = isInputActive();

    // Mode 1: Direct Mode (Only when NO input is active)
    if (mode === 'mode1' && !inputActive) {
        handleDirectMode(event);
    }
    // Mode 2: Safety Mode (Alt Keys - Always active, mostly)
    else if (mode === 'mode2') {
        handleSafetyMode(event);
    }
    // Mode 3: Hybrid Mode (Mixed)
    else if (mode === 'mode3') {
        handleHybridMode(event, inputActive);
    }
}

function handleDirectMode(event: KeyboardEvent) {
    const key = event.key.toLowerCase();

    // Numbers 1-4
    if (['1', '2', '3', '4'].includes(key)) {
        event.preventDefault();
        loadFavorite(parseInt(key));
        return;
    }

    switch (key) {
        case 't':
            event.preventDefault();
            cycleTakeProfitFocus();
            break;
        case '+':
            event.preventDefault();
            app.addTakeProfitRow();
            break;
        case '-':
            event.preventDefault();
            removeLastTakeProfit();
            break;
        case 'e':
            event.preventDefault();
            focusElement(IDs.ENTRY_PRICE);
            break;
        case 's':
            event.preventDefault();
            focusElement(IDs.STOP_LOSS);
            break;
        case 'l':
            event.preventDefault();
            updateTradeStore(s => ({ ...s, tradeType: CONSTANTS.TRADE_TYPE_LONG }));
            break;
        case 'k': // K for Short (Kurz) because S is Stop Loss
            event.preventDefault();
            updateTradeStore(s => ({ ...s, tradeType: CONSTANTS.TRADE_TYPE_SHORT }));
            break;
        case 'j':
            event.preventDefault();
            uiStore.toggleJournalModal(true);
            break;
    }
}

function handleSafetyMode(event: KeyboardEvent) {
    if (!event.altKey) return;

    const key = event.key.toLowerCase();

    // Favorites Alt+1-4
    if (['1', '2', '3', '4'].includes(key)) {
        event.preventDefault();
        loadFavorite(parseInt(key));
        return;
    }

    switch (key) {
        case 't':
            event.preventDefault();
            if (event.shiftKey) {
                removeLastTakeProfit();
            } else {
                app.addTakeProfitRow();
            }
            break;
        case 'e':
            event.preventDefault();
            focusElement(IDs.ENTRY_PRICE);
            break;
        case 's':
            event.preventDefault();
            focusElement(IDs.STOP_LOSS);
            break;
        case 'l':
            event.preventDefault();
            updateTradeStore(s => ({ ...s, tradeType: CONSTANTS.TRADE_TYPE_LONG }));
            break;
        case 'k': // Agreed: Alt+K for Short in this mode
            event.preventDefault();
            updateTradeStore(s => ({ ...s, tradeType: CONSTANTS.TRADE_TYPE_SHORT }));
            break;
        case 'j':
             event.preventDefault();
             uiStore.toggleJournalModal(true);
             break;
         case 'r':
             event.preventDefault();
             resetAllInputs();
             break;
    }
}

function handleHybridMode(event: KeyboardEvent, inputActive: boolean) {
    const key = event.key.toLowerCase();

    // Non-conflicting keys (Favorites only when not typing)
    if (!inputActive && ['1', '2', '3', '4'].includes(key)) {
        event.preventDefault();
        loadFavorite(parseInt(key));
        return;
    }

    // T for Focus TP 1
    if (key === 't' && !inputActive) {
        event.preventDefault();
        if (event.shiftKey) {
            // Shift + T: Focus LAST TP
            const count = get(tradeStore).targets.length;
            if (count > 0) {
                focusElement(`${IDs.TP_PRICE_PREFIX}${count - 1}`);
            }
        } else {
            // T: Focus First TP
            focusElement(`${IDs.TP_PRICE_PREFIX}0`);
        }
        return;
    }

    const activeId = document.activeElement?.id || '';
    const isTpField = activeId.startsWith(IDs.TP_PRICE_PREFIX) || activeId.startsWith('tp-percent-');

    // If typing in Symbol or Notes, don't intercept + / -
    if (inputActive && !isTpField && activeId !== IDs.ENTRY_PRICE && activeId !== IDs.STOP_LOSS && activeId !== 'risk-amount-input') {
        // Allow typing in text areas
        return;
    }

    if (key === '+') {
        event.preventDefault();
        app.addTakeProfitRow();
    } else if (key === '-') {
        event.preventDefault();
        removeLastTakeProfit();
    }
}
