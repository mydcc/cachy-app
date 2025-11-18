import { writable } from 'svelte/store';

// Define the type for the settings
export type ApiProvider = 'Bitunix' | 'Binance';

export interface Settings {
    apiProvider: ApiProvider;
}

// Function to create a persistent store
function createPersistentStore<T>(key: string, startValue: T) {
    const { subscribe, set, update } = writable<T>(startValue);

    // Check if running in a browser environment before accessing localStorage
    if (typeof window !== 'undefined') {
        const savedValue = localStorage.getItem(key);
        if (savedValue) {
            try {
                set(JSON.parse(savedValue));
            } catch (e) {
                console.error('Error parsing settings from localStorage', e);
            }
        }

        subscribe(current => {
            localStorage.setItem(key, JSON.stringify(current));
        });
    }


    return {
        subscribe,
        set,
        update
    };
}

const initialSettings: Settings = {
    apiProvider: 'Bitunix'
};

export const settingsStore = createPersistentStore<Settings>('cachy-settings', initialSettings);

// Function to update the API provider
export function setApiProvider(provider: ApiProvider) {
    settingsStore.update(settings => {
        return { ...settings, apiProvider: provider };
    });
}
