export const HOTKEY_ACTIONS = {
    LOAD_FAVORITE_1: 'LOAD_FAVORITE_1',
    LOAD_FAVORITE_2: 'LOAD_FAVORITE_2',
    LOAD_FAVORITE_3: 'LOAD_FAVORITE_3',
    LOAD_FAVORITE_4: 'LOAD_FAVORITE_4',
    FOCUS_NEXT_TP: 'FOCUS_NEXT_TP',
    FOCUS_PREV_TP: 'FOCUS_PREV_TP', // Not currently used, but good for completeness
    ADD_TP: 'ADD_TP',
    REMOVE_LAST_TP: 'REMOVE_LAST_TP',
    FOCUS_ENTRY: 'FOCUS_ENTRY',
    FOCUS_SL: 'FOCUS_SL',
    SET_LONG: 'SET_LONG',
    SET_SHORT: 'SET_SHORT',
    OPEN_JOURNAL: 'OPEN_JOURNAL',
    RESET_INPUTS: 'RESET_INPUTS',
    FOCUS_FIRST_TP: 'FOCUS_FIRST_TP',
    FOCUS_LAST_TP: 'FOCUS_LAST_TP'
} as const;

export type HotkeyAction = keyof typeof HOTKEY_ACTIONS;

export type HotkeyMode = 'mode1' | 'mode2' | 'mode3';

export type KeyBinding = {
    key: string;
    altKey?: boolean;
    ctrlKey?: boolean;
    shiftKey?: boolean;
    metaKey?: boolean; // Command on Mac
    requiresInputInactive?: boolean; // For single letter hotkeys (e.g. 't')
};

export type HotkeyMap = Record<HotkeyAction, KeyBinding>;

export const DEFAULT_HOTKEY_MAPS: Record<string, HotkeyMap> = {
    mode1: {
        LOAD_FAVORITE_1: { key: '1', requiresInputInactive: true },
        LOAD_FAVORITE_2: { key: '2', requiresInputInactive: true },
        LOAD_FAVORITE_3: { key: '3', requiresInputInactive: true },
        LOAD_FAVORITE_4: { key: '4', requiresInputInactive: true },
        FOCUS_NEXT_TP: { key: 't', requiresInputInactive: true },
        FOCUS_PREV_TP: { key: '', requiresInputInactive: true }, // Not bound in mode 1
        ADD_TP: { key: '+', requiresInputInactive: true },
        REMOVE_LAST_TP: { key: '-', requiresInputInactive: true },
        FOCUS_ENTRY: { key: 'e', requiresInputInactive: true },
        FOCUS_SL: { key: 'o', requiresInputInactive: true },
        SET_LONG: { key: 'l', requiresInputInactive: true },
        SET_SHORT: { key: 's', requiresInputInactive: true },
        OPEN_JOURNAL: { key: 'j', requiresInputInactive: true },
        RESET_INPUTS: { key: '' }, // Not bound
        FOCUS_FIRST_TP: { key: '' }, // Not bound
        FOCUS_LAST_TP: { key: '' }, // Not bound
    },
    mode2: {
        LOAD_FAVORITE_1: { key: '1', altKey: true },
        LOAD_FAVORITE_2: { key: '2', altKey: true },
        LOAD_FAVORITE_3: { key: '3', altKey: true },
        LOAD_FAVORITE_4: { key: '4', altKey: true },
        FOCUS_NEXT_TP: { key: '' }, // Not bound directly, see Hybrid/Direct
        FOCUS_PREV_TP: { key: '' },
        ADD_TP: { key: 't', altKey: true },
        REMOVE_LAST_TP: { key: 't', altKey: true, shiftKey: true },
        FOCUS_ENTRY: { key: 'e', altKey: true },
        FOCUS_SL: { key: 'o', altKey: true },
        SET_LONG: { key: 'l', altKey: true },
        SET_SHORT: { key: 's', altKey: true },
        OPEN_JOURNAL: { key: 'j', altKey: true },
        RESET_INPUTS: { key: 'r', altKey: true },
        FOCUS_FIRST_TP: { key: '' },
        FOCUS_LAST_TP: { key: '' },
    },
    mode3: {
        LOAD_FAVORITE_1: { key: '1', requiresInputInactive: true },
        LOAD_FAVORITE_2: { key: '2', requiresInputInactive: true },
        LOAD_FAVORITE_3: { key: '3', requiresInputInactive: true },
        LOAD_FAVORITE_4: { key: '4', requiresInputInactive: true },
        FOCUS_NEXT_TP: { key: '' },
        FOCUS_PREV_TP: { key: '' },
        ADD_TP: { key: '+', requiresInputInactive: false }, // Allowed while typing unless in number field
        REMOVE_LAST_TP: { key: '-', requiresInputInactive: false },
        FOCUS_ENTRY: { key: '' }, // Uses global or specific
        FOCUS_SL: { key: '' },
        SET_LONG: { key: '' },
        SET_SHORT: { key: '' },
        OPEN_JOURNAL: { key: '' },
        RESET_INPUTS: { key: '' },
        FOCUS_FIRST_TP: { key: 't', requiresInputInactive: true },
        FOCUS_LAST_TP: { key: 't', shiftKey: true, requiresInputInactive: true },
    }
};
