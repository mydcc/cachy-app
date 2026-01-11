import { json } from '@sveltejs/kit';
import { logger } from '$lib/server/logger';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async () => {
    logger.info('Test Log: This is an INFO message from the server.');
    logger.warn('Test Log: This is a WARNING message from the server.', { riskLevel: 'medium' });
    logger.error('Test Log: This is an ERROR message from the server.', { errorId: 123, stack: 'mock stack trace' });

    // Auch ein normales console.log testen, falls wir den Interceptor aktivieren
    console.log('Test Log: This is a standard console.log from the server.');

    return json({ success: true, message: 'Logs generated' });
};
