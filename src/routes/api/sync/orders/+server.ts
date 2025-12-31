import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createHash } from 'crypto';

export const POST: RequestHandler = async ({ request, fetch }) => {
    try {
        const { apiKey, apiSecret, limit = 100 } = await request.json();

        if (!apiKey || !apiSecret) {
            return json({ error: 'API key and secret are required' }, { status: 400 });
        }

        const baseUrl = 'https://fapi.bitunix.com';
        const endpoint = '/api/v1/futures/order/get_history_orders';
        const timestamp = Date.now().toString();
        const nonce = Math.floor(Math.random() * 1000000000).toString();

        // 1. Sort params alphabetically
        const params: Record<string, string> = {
            api_key: apiKey,
            timestamp: timestamp,
            nonce: nonce,
            limit: limit.toString(),
        };

        const sortedKeys = Object.keys(params).sort();
        const queryParams = sortedKeys.map(key => `${key}=${params[key]}`).join('&');

        // 2. Sign
        const signature = createHash('sha256').update(queryParams + apiSecret).digest('hex');

        // 3. Request
        const response = await fetch(`${baseUrl}${endpoint}?${queryParams}&sign=${signature}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            }
        });

        if (!response.ok) {
            const errText = await response.text();
            return json({ error: `Bitunix API Error: ${response.status} ${errText}` }, { status: response.status });
        }

        const data = await response.json();
        if (data.code !== 0) {
            return json({ error: `Bitunix API Error: ${data.msg || 'Unknown error'}` }, { status: 400 });
        }

        return json({ data: data.data });

    } catch (error) {
        console.error('Sync orders error:', error);
        return json({ error: 'Internal Server Error' }, { status: 500 });
    }
};
