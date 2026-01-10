import { sequence } from '@sveltejs/kit/hooks';
import type { Handle } from '@sveltejs/kit';
import { CONSTANTS } from './lib/constants';
import { logger } from '$lib/server/logger';

// --- Global Console Interceptor for CachyLog ---
// Redirects all server-side console logs to the centralized logger and SSE stream
if (!(global as any)._isConsolePatched) {
    (global as any)._isConsolePatched = true;

    const originalLog = console.log;
    const originalWarn = console.warn;
    const originalError = console.error;

    console.log = (...args: any[]) => {
        const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
        // Prevent infinite loop if logger calls console.log (it shouldn't, but safety first)
        // We use a specific prefix if we wanted to detect our own logs, but logger.ts is clean.
        logger.info(msg);
        originalLog.apply(console, args);
    };

    console.warn = (...args: any[]) => {
        const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
        logger.warn(msg);
        originalWarn.apply(console, args);
    };

    console.error = (...args: any[]) => {
        const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
        logger.error(msg);
        originalError.apply(console, args);
    };

    logger.info('Global console patched for CachyLog');
}

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
