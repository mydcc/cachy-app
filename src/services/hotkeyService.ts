import { get } from 'svelte/store';
import { settingsStore } from '../stores/settingsStore';
import { tradeStore, updateTradeStore, resetAllInputs } from '../stores/tradeStore';
import { favoritesStore } from '../stores/favoritesStore';
import { uiStore } from '../stores/uiStore';
import { app } from './app';
import { CONSTANTS } from '../lib/constants';
import { modalManager } from './modalManager';
import { type HotkeyAction, HOTKEY_ACTIONS, type KeyBinding } from './hotkeyConfig';

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

    // Always handle Escape globally for modals (handled in +page.svelte usually, but good practice to allow here if needed)
    if (event.key === 'Escape') {
        return;
    }

    // Don't trigger hotkeys if modifiers are pressed that aren't part of our system (like Ctrl+R for reload)
    // Actually, we want to allow browser defaults unless we explicitly override them.
    // So we check our map.

    const inputActive = isInputActive();
    const bindings = settings.hotkeyBindings;

    // console.log('Handling Keydown:', event.key, 'Bindings present:', !!bindings); // DEBUG

    if (!bindings) return;

    // Iterate through all actions to find a match
    // NOTE: This could be optimized by using a lookup map (Key -> Action),
    // but since we have dynamic bindings and modifiers, iteration is safer and negligible performance-wise (N < 20).

    for (const actionKey in bindings) {
        const action = actionKey as HotkeyAction;
        const binding = bindings[action];

        if (!binding || !binding.key) continue;

        // console.log(`Checking ${action}:`, binding.key, 'vs', event.key); // DEBUG

        // Check key match (case insensitive)
        if (event.key.toLowerCase() !== binding.key.toLowerCase()) continue;

        // Check modifiers
        // Note: event.altKey is boolean, binding.altKey might be undefined (falsy)
        if (!!binding.altKey !== event.altKey) continue;
        if (!!binding.ctrlKey !== event.ctrlKey) continue;
        if (!!binding.shiftKey !== event.shiftKey) continue;
        if (!!binding.metaKey !== event.metaKey) continue;

        // Check Input Context
        if (binding.requiresInputInactive && inputActive) {
            // console.log('Skipping due to active input'); // DEBUG
            continue;
        }

        // MATCH FOUND -> Execute Action
        event.preventDefault();
        // console.log('Executing action:', action); // DEBUG
        executeAction(action);
        return;
    }
}

function executeAction(action: HotkeyAction) {
    switch (action) {
        case HOTKEY_ACTIONS.LOAD_FAVORITE_1: loadFavorite(1); break;
        case HOTKEY_ACTIONS.LOAD_FAVORITE_2: loadFavorite(2); break;
        case HOTKEY_ACTIONS.LOAD_FAVORITE_3: loadFavorite(3); break;
        case HOTKEY_ACTIONS.LOAD_FAVORITE_4: loadFavorite(4); break;

        case HOTKEY_ACTIONS.FOCUS_NEXT_TP: cycleTakeProfitFocus(); break;
        case HOTKEY_ACTIONS.FOCUS_FIRST_TP:
            const countFirst = get(tradeStore).targets.length;
            if (countFirst > 0) focusElement(`${IDs.TP_PRICE_PREFIX}0`);
            break;
        case HOTKEY_ACTIONS.FOCUS_LAST_TP:
             const countLast = get(tradeStore).targets.length;
             if (countLast > 0) focusElement(`${IDs.TP_PRICE_PREFIX}${countLast - 1}`);
             break;

        case HOTKEY_ACTIONS.ADD_TP: app.addTakeProfitRow(); break;
        case HOTKEY_ACTIONS.REMOVE_LAST_TP: removeLastTakeProfit(); break;

        case HOTKEY_ACTIONS.FOCUS_ENTRY: focusElement(IDs.ENTRY_PRICE); break;
        case HOTKEY_ACTIONS.FOCUS_SL: focusElement(IDs.STOP_LOSS); break;

        case HOTKEY_ACTIONS.SET_LONG: updateTradeStore(s => ({ ...s, tradeType: CONSTANTS.TRADE_TYPE_LONG })); break;
        case HOTKEY_ACTIONS.SET_SHORT: updateTradeStore(s => ({ ...s, tradeType: CONSTANTS.TRADE_TYPE_SHORT })); break;

        case HOTKEY_ACTIONS.OPEN_JOURNAL: uiStore.toggleJournalModal(true); break;
        case HOTKEY_ACTIONS.RESET_INPUTS: resetAllInputs(); break;
    }
}
