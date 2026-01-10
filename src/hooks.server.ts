import { sequence } from '@sveltejs/kit/hooks';
import type { Handle } from '@sveltejs/kit';
import { CONSTANTS } from './lib/constants';
import { logger } from '$lib/server/logger';

const loggingHandler: Handle = async ({ event, resolve }) => {
    const start = Date.now();
    const { method, url } = event.request;
    const path = url.pathname;

    // Ignoriere den Log-Stream selbst, um Endlos-Schleifen zu vermeiden
    if (path.includes('/api/stream-logs')) {
        return resolve(event);
    }

    // Log Request Eingang
    // Wir loggen keine Bodies hier, da das Lesen des Streams ihn verbrauchen könnte (SvelteKit spezifisch)
    logger.info(`[REQ] ${method} ${path}`);

    try {
        const response = await resolve(event);
        const duration = Date.now() - start;

        // Log Response mit Status und Dauer
        if (response.status >= 400) {
            logger.error(`[RES] ${method} ${path} -> ${response.status} (${duration}ms)`);
        } else {
            logger.info(`[RES] ${method} ${path} -> ${response.status} (${duration}ms)`);
        }

        return response;
    } catch (err: any) {
        const duration = Date.now() - start;
        logger.error(`[ERR] ${method} ${path} failed (${duration}ms): ${err.message}`);
        throw err;
    }
};

const themeHandler: Handle = async ({ event, resolve }) => {
    const theme = event.cookies.get(CONSTANTS.LOCAL_STORAGE_THEME_KEY) || 'dark';

    const response = await resolve(event, {
        transformPageChunk: ({ html }) => {
            // Replace the <body> tag with the theme class
            let bodyClass = '';
            if (theme !== 'dark') {
                bodyClass = `theme-${theme}`;
            }
            // Use a regex to find the <body> tag and inject the class
            return html.replace(
                /<body(.*?)>/,
                `<body class="${bodyClass}"$1>`
            );
        }
    });

    return response;
};

export const handle = sequence(loggingHandler, themeHandler);
