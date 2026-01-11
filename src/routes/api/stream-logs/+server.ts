import { logger } from '$lib/server/logger';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ request }) => {
    // Setze Header für SSE
    const headers = {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
    };

    const stream = new ReadableStream({
        start(controller) {
            // Callback function to handle new logs
            const onLog = (logEntry: any) => {
                try {
                    const data = `data: ${JSON.stringify(logEntry)}\n\n`;
                    controller.enqueue(data);
                } catch (err) {
                    console.error('Error sending log to stream:', err);
                    controller.close();
                }
            };

            // Subscribe to the logger
            logger.on('log', onLog);

            // Send initial connection message
            const initMsg = JSON.stringify({
                timestamp: new Date().toISOString(),
                level: 'info',
                message: 'Connected to Cachy Server Logs'
            });
            controller.enqueue(`data: ${initMsg}\n\n`);

            // Cleanup when the connection closes
            request.signal.addEventListener('abort', () => {
                logger.off('log', onLog);
            });
        },
        cancel() {
            // Fallback cancel logic handled in abort listener usually,
            // but strict cleanup here is good practice if supported environment.
        }
    });

    return new Response(stream, { headers });
};
