import { writable } from "svelte/store";

interface JulesState {
    isVisible: boolean;
    message: string;
    isLoading: boolean;
}

const initialState: JulesState = {
    isVisible: false,
    message: "",
    isLoading: false,
};

function createJulesStore() {
    const { subscribe, update, set } = writable<JulesState>(initialState);

    return {
        subscribe,
        showReport: (message: string) =>
            update((state) => ({ ...state, isVisible: true, message, isLoading: false })),
        hideReport: () =>
            update((state) => ({ ...state, isVisible: false, message: "" })),
        setLoading: (isLoading: boolean) =>
            update((state) => ({ ...state, isLoading })),
        reset: () => set(initialState),
    };
}

export const julesStore = createJulesStore();
