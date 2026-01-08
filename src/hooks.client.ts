import './locales/i18n';
import type { HandleClientError } from '@sveltejs/kit';

export const handleError: HandleClientError = async ({ error, event }) => {
    // Log the error to the console (default behavior)
    console.error('Client Hook Error:', error);
};
