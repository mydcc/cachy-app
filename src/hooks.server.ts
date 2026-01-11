console.log('Server hooks are running...');

import { sequence } from '@sveltejs/kit/hooks';
import type { Handle } from '@sveltejs/kit';
import { CONSTANTS } from './lib/constants';

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

export const handle = sequence(themeHandler);
