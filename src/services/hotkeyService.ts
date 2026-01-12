import { get } from 'svelte/store';
import { settingsStore } from '../stores/settingsStore';
import { tradeStore, updateTradeStore, resetAllInputs } from '../stores/tradeStore';
import { favoritesStore } from '../stores/favoritesStore';
import { uiStore } from '../stores/uiStore';
import { app } from './app';
import { CONSTANTS } from '../lib/constants';

// --- Types & Constants ---

export type HotkeyCategory = 'Favorites' | 'Trade Setup' | 'UI & Navigation' | 'Market Data' | 'System';

export interface HotkeyAction {
    id: string;
    label: string;
    category: HotkeyCategory;
    defaultKey: string; // Default for 'custom' mode initialization (using Safety Mode style defaults)
    action: () => void;
}

// Define IDs for elements we need to focus
const IDs = {
    ENTRY_PRICE: 'entry-price-input',
    STOP_LOSS: 'stop-loss-price-input',
    SYMBOL: 'symbol-input',
    TP_PRICE_PREFIX: 'tp-price-',
    TP_ADD_BTN: 'add-tp-btn'
};

// --- Helper Functions ---

function isInputActive(): boolean {
    const activeElement = document.activeElement;
    if (!activeElement) return false;
    const tagName = activeElement.tagName.toLowerCase();
    // Allow hotkeys in read-only inputs? Usually no, unless modifier used.
    // For now, strict check.
    return (tagName === 'input' || tagName === 'textarea' || tagName === 'select') && (activeElement as HTMLElement).isContentEditable !== false;
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
        nextIndex = reverse ? count - 1 : 0;
    } else {
        if (reverse) {
            nextIndex = currentIndex - 1;
            if (nextIndex < 0) nextIndex = count - 1;
        } else {
            nextIndex = currentIndex + 1;
            if (nextIndex >= count) nextIndex = 0;
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

// --- Action Definitions ---

export const HOTKEY_ACTIONS: HotkeyAction[] = [
    // --- Favorites ---
    { id: 'FAV_1', label: 'Load Favorite 1', category: 'Favorites', defaultKey: 'Alt+1', action: () => loadFavorite(1) },
    { id: 'FAV_2', label: 'Load Favorite 2', category: 'Favorites', defaultKey: 'Alt+2', action: () => loadFavorite(2) },
    { id: 'FAV_3', label: 'Load Favorite 3', category: 'Favorites', defaultKey: 'Alt+3', action: () => loadFavorite(3) },
    { id: 'FAV_4', label: 'Load Favorite 4', category: 'Favorites', defaultKey: 'Alt+4', action: () => loadFavorite(4) },

    // --- Trade Setup ---
    { id: 'FOCUS_ENTRY', label: 'Focus Entry Price', category: 'Trade Setup', defaultKey: 'Alt+E', action: () => focusElement(IDs.ENTRY_PRICE) },
    { id: 'FOCUS_SL', label: 'Focus Stop Loss', category: 'Trade Setup', defaultKey: 'Alt+O', action: () => focusElement(IDs.STOP_LOSS) },
    { id: 'FOCUS_TP_NEXT', label: 'Focus Next TP', category: 'Trade Setup', defaultKey: 'Alt+T', action: () => cycleTakeProfitFocus(false) },
    { id: 'FOCUS_TP_PREV', label: 'Focus Previous TP', category: 'Trade Setup', defaultKey: 'Alt+Shift+T', action: () => cycleTakeProfitFocus(true) },
    { id: 'ADD_TP', label: 'Add TP Target', category: 'Trade Setup', defaultKey: 'Alt+Plus', action: () => app.addTakeProfitRow() },
    { id: 'REMOVE_TP', label: 'Remove TP Target', category: 'Trade Setup', defaultKey: 'Alt+Minus', action: () => removeLastTakeProfit() },
    { id: 'SET_LONG', label: 'Set Direction Long', category: 'Trade Setup', defaultKey: 'Alt+L', action: () => updateTradeStore(s => ({ ...s, tradeType: CONSTANTS.TRADE_TYPE_LONG })) },
    { id: 'SET_SHORT', label: 'Set Direction Short', category: 'Trade Setup', defaultKey: 'Alt+S', action: () => updateTradeStore(s => ({ ...s, tradeType: CONSTANTS.TRADE_TYPE_SHORT })) },
    { id: 'RESET_INPUTS', label: 'Reset Trade Inputs', category: 'Trade Setup', defaultKey: 'Alt+R', action: () => resetAllInputs() },

    // --- UI & Navigation ---
    { id: 'OPEN_JOURNAL', label: 'Toggle Journal', category: 'UI & Navigation', defaultKey: 'Alt+J', action: () => uiStore.toggleJournalModal() },
    { id: 'TOGGLE_SETTINGS', label: 'Open Settings', category: 'UI & Navigation', defaultKey: 'Alt+,', action: () => uiStore.toggleSettingsModal(true) },
    { id: 'TOGGLE_SIDEBAR', label: 'Toggle Sidebars', category: 'UI & Navigation', defaultKey: 'Alt+B', action: () => settingsStore.update(s => ({ ...s, showSidebars: !s.showSidebars })) },
    { id: 'TOGGLE_TECHNICALS', label: 'Toggle Technicals Panel', category: 'UI & Navigation', defaultKey: 'Alt+K', action: () => settingsStore.update(s => ({ ...s, showTechnicals: !s.showTechnicals })) },

    // --- Market Data ---
    { id: 'FETCH_PRICE', label: 'Fetch Price', category: 'Market Data', defaultKey: 'Alt+P', action: () => app.fetchPrice(get(tradeStore).symbol) },
];

// --- Key Matching Logic ---

/**
 * Normalizes a key event or string into a standard "Modifiers+Key" format.
 * Examples: "Alt+T", "Ctrl+Shift+K", "Enter", "1".
 * Order: Ctrl -> Alt -> Shift -> Key
 */
export function normalizeKeyCombo(event: KeyboardEvent): string {
    const parts = [];
    if (event.ctrlKey) parts.push('Ctrl');
    if (event.altKey) parts.push('Alt');
    if (event.shiftKey) parts.push('Shift');

    let key = event.key;

    // Normalize special keys
    if (key === ' ') key = 'Space';
    if (key === '+') key = 'Plus'; // Avoid confusion with separator
    if (key === '-') key = 'Minus';

    // Ignore modifier keys themselves as the "main" key
    if (['Control', 'Alt', 'Shift', 'Meta'].includes(key)) {
        return parts.join('+'); // Incomplete combo, just return modifiers
    }

    parts.push(key.length === 1 ? key.toUpperCase() : key);
    return parts.join('+');
}

/**
 * Checks if a triggered event matches a stored combo string.
 */
function isMatch(event: KeyboardEvent, combo: string): boolean {
    const eventCombo = normalizeKeyCombo(event);
    return eventCombo === combo;
}

// --- Main Handler ---

export function handleGlobalKeydown(event: KeyboardEvent) {
    const settings = get(settingsStore);
    const mode = settings.hotkeyMode;

    // Always handle Escape globally
    if (event.key === 'Escape') {
        // Handled by modal manager or other listeners mostly,
        // but we can ensure modals close here if needed?
        // uiStore.closeAllModals(); // Optional, but let's leave existing logic
        return;
    }

    const inputActive = isInputActive();

    // If we are in 'Custom' mode, use the generic engine
    if (mode === 'custom') {
        const customMap = settings.customHotkeys || {};

        for (const action of HOTKEY_ACTIONS) {
            const mappedKey = customMap[action.id] || action.defaultKey; // Fallback to default if not customized yet

            if (isMatch(event, mappedKey)) {
                // Input Protection:
                // If input is active, ONLY allow hotkeys with modifiers (Alt, Ctrl) or Function keys (F1-F12).
                // Single letter hotkeys (e.g. 'T') must be ignored while typing.
                const hasModifier = event.altKey || event.ctrlKey;
                const isFunctionKey = event.key.startsWith('F') && event.key.length > 1;

                if (inputActive && !hasModifier && !isFunctionKey) {
                    continue; // Skip this action, let the user type
                }

                event.preventDefault();
                event.stopPropagation();
                action.action();
                return; // Execute only one action
            }
        }
        return;
    }

    // --- Legacy Modes Support (Preserved for existing users) ---
    // Mode 1: Direct Mode (Only when NO input is active)
    if (mode === 'mode1' && !inputActive) {
        handleDirectMode(event);
    }
    // Mode 2: Safety Mode (Alt Keys - Always active)
    else if (mode === 'mode2') {
        handleSafetyMode(event);
    }
    // Mode 3: Hybrid Mode (Mixed)
    else if (mode === 'mode3') {
        handleHybridMode(event, inputActive);
    }
}

// --- Legacy Handlers (Unchanged Logic) ---

function handleDirectMode(event: KeyboardEvent) {
    const key = event.key.toLowerCase();
    if (['1', '2', '3', '4'].includes(key)) { event.preventDefault(); loadFavorite(parseInt(key)); return; }
    switch (key) {
        case 't': event.preventDefault(); cycleTakeProfitFocus(); break;
        case '+': event.preventDefault(); app.addTakeProfitRow(); break;
        case '-': event.preventDefault(); removeLastTakeProfit(); break;
        case 'e': event.preventDefault(); focusElement(IDs.ENTRY_PRICE); break;
        case 'o': event.preventDefault(); focusElement(IDs.STOP_LOSS); break;
        case 'l': event.preventDefault(); updateTradeStore(s => ({ ...s, tradeType: CONSTANTS.TRADE_TYPE_LONG })); break;
        case 's': event.preventDefault(); updateTradeStore(s => ({ ...s, tradeType: CONSTANTS.TRADE_TYPE_SHORT })); break;
        case 'j': event.preventDefault(); uiStore.toggleJournalModal(true); break;
    }
}

function handleSafetyMode(event: KeyboardEvent) {
    if (!event.altKey) return;
    const key = event.key.toLowerCase();
    if (['1', '2', '3', '4'].includes(key)) { event.preventDefault(); loadFavorite(parseInt(key)); return; }
    switch (key) {
        case 't': event.preventDefault(); event.shiftKey ? removeLastTakeProfit() : app.addTakeProfitRow(); break; // Note: Original logic was weird here, keeping it as is? No wait, original was: if shift remove else add.
        case 'e': event.preventDefault(); focusElement(IDs.ENTRY_PRICE); break;
        case 'o': event.preventDefault(); focusElement(IDs.STOP_LOSS); break;
        case 'l': event.preventDefault(); updateTradeStore(s => ({ ...s, tradeType: CONSTANTS.TRADE_TYPE_LONG })); break;
        case 's': event.preventDefault(); updateTradeStore(s => ({ ...s, tradeType: CONSTANTS.TRADE_TYPE_SHORT })); break;
        case 'j': event.preventDefault(); uiStore.toggleJournalModal(true); break;
        case 'r': event.preventDefault(); resetAllInputs(); break;
    }
}

function handleHybridMode(event: KeyboardEvent, inputActive: boolean) {
    const key = event.key.toLowerCase();
    if (!inputActive && ['1', '2', '3', '4'].includes(key)) { event.preventDefault(); loadFavorite(parseInt(key)); return; }
    if (key === 't' && !inputActive) {
        event.preventDefault();
        if (event.shiftKey) { focusElement(`${IDs.TP_PRICE_PREFIX}${get(tradeStore).targets.length - 1}`); }
        else { focusElement(`${IDs.TP_PRICE_PREFIX}0`); }
        return;
    }
    const activeId = document.activeElement?.id || '';
    const isTpField = activeId.startsWith(IDs.TP_PRICE_PREFIX) || activeId.startsWith('tp-percent-');
    if (inputActive && !isTpField && activeId !== IDs.ENTRY_PRICE && activeId !== IDs.STOP_LOSS && activeId !== 'risk-amount-input') { return; }
    if (key === '+') { event.preventDefault(); app.addTakeProfitRow(); }
    else if (key === '-') { event.preventDefault(); removeLastTakeProfit(); }
}
