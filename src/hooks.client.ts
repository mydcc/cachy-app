import './locales/i18n';
import type { HandleClientError } from '@sveltejs/kit';
import { julesService } from './services/julesService';

export const handleError: HandleClientError = async ({ error, event }) => {
    // Log the error to the console (default behavior)
    console.error('Client Hook Error:', error);

    // Automatically report critical errors to Jules
    // We wrap this in a try-catch to ensure the error handler itself doesn't crash
    try {
        await julesService.reportToJules(error, 'AUTO');
    } catch (reportErr) {
        console.warn('Failed to send error report to Jules:', reportErr);
    }

    return {
        message: 'An unexpected error occurred. Jules has been notified.',
        code: 'UNKNOWN'
    };
};
