import { get } from 'svelte/store';
import { writable } from 'svelte/store';
import { browser } from '$app/environment';

export interface ModalState {
    title: string;
    message: string;
    type: 'alert' | 'confirm' | 'prompt';
    defaultValue?: string;
    isOpen: boolean;
    resolve: ((value: boolean | string) => void) | null;
}

const modalState = writable<ModalState>({
    title: '',
    message: '',
    type: 'alert',
    defaultValue: '',
    isOpen: false,
    resolve: null,
});

export const modalManager = {
    show(title: string, message: string, type: 'alert' | 'confirm' | 'prompt', defaultValue: string = ''): Promise<boolean | string> {
        return new Promise((resolve) => {
            if (!browser) { // Only show modal in browser environment
                console.warn("Modal cannot be shown in SSR environment.");
                resolve(false); // Or handle as appropriate for your app
                return;
            }

            modalState.set({
                title,
                message,
                type,
                defaultValue,
                isOpen: true,
                resolve,
            });
        });
    },
    _handleModalConfirm(result: boolean | string) {
        const currentModalState = get(modalState);
        if (currentModalState.resolve) {
            currentModalState.resolve(result);
        }
        modalState.set({ ...currentModalState, isOpen: false, resolve: null });
    },
    subscribe: modalState.subscribe,
};