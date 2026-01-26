import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
    const status = {
        status: 'ok',
        timestamp: Date.now(),
        version: '0.94.3',
        environment: process.env.NODE_ENV || 'development'
    };

    return json(status);
};
