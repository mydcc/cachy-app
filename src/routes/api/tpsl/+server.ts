import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createHash, randomBytes } from 'crypto';

const BASE_URL = 'https://fapi.bitunix.com';

export const POST: RequestHandler = async ({ request }) => {
    // Wrap the entire parsing logic in try-catch to handle malformed JSON
    try {
        const body = await request.json();
        const { exchange, apiKey, apiSecret, action, params = {} } = body;

        if (!exchange || !apiKey || !apiSecret) {
            return json({ error: 'Missing credentials or exchange' }, { status: 400 });
        }

        if (exchange !== 'bitunix') {
            return json({ error: 'Only Bitunix is supported for TP/SL currently' }, { status: 400 });
        }

        let result = null;
        switch (action) {
            case 'pending':
                result = await fetchBitunixTpSl(apiKey, apiSecret, '/api/v1/futures/tp_sl/get_pending_tp_sl_order', params);
                break;
            case 'history':
                result = await fetchBitunixTpSl(apiKey, apiSecret, '/api/v1/futures/tp_sl/get_history_tp_sl_order', params);
                break;
            case 'cancel':
                result = await executeBitunixAction(apiKey, apiSecret, '/api/v1/futures/tp_sl/cancel_tp_sl_order', params);
                break;
            case 'modify':
                result = await executeBitunixAction(apiKey, apiSecret, '/api/v1/futures/tp_sl/modify_tp_sl_order', params);
                break;
            default:
                return json({ error: `Unknown action: ${action}` }, { status: 400 });
        }

        return json(result);

    } catch (e: any) {
        console.error(`Error processing TP/SL request:`, e);

        // Determine appropriate status code
        let status = 500;
        let message = e.message || 'Internal Server Error';

        if (message.includes('Bitunix API error')) {
            status = 502; // Bad Gateway (upstream error)
            // Or 400 if it's a client error from Bitunix that we want to pass through
            if (message.includes('code:')) {
                // If it has a specific code, it might be a logic error (e.g. invalid price)
                status = 400;
            }
        } else if (message.includes('JSON')) {
            status = 400; // Malformed JSON in request
        }

        return json({ error: message, stack: process.env.NODE_ENV === 'development' ? e.stack : undefined }, { status });
    }
};

// Helper for GET requests (like fetching lists)
async function fetchBitunixTpSl(apiKey: string, apiSecret: string, path: string, params: any = {}) {
    const nonce = randomBytes(16).toString('hex');
    const timestamp = Date.now().toString();

    // Sort params for signature
    // Remove undefined/null
    const cleanParams: Record<string, string> = {};
    Object.keys(params).forEach(k => {
        if (params[k] !== undefined && params[k] !== null && params[k] !== '') {
            cleanParams[k] = String(params[k]);
        }
    });

    const queryParamsStr = Object.keys(cleanParams).sort().map(key => key + cleanParams[key]).join('');
    const bodyStr = ""; // GET requests usually have empty body for signature in Bitunix if params are in query

    // Signature: nonce + timestamp + apiKey + queryParams + body
    const digestInput = nonce + timestamp + apiKey + queryParamsStr + bodyStr;
    const digest = createHash('sha256').update(digestInput).digest('hex');
    const signInput = digest + apiSecret;
    const signature = createHash('sha256').update(signInput).digest('hex');

    const queryString = new URLSearchParams(cleanParams).toString();
    // Only append ? if there are query params, otherwise some APIs (like Bitunix possibly) throw errors
    const url = queryString ? `${BASE_URL}${path}?${queryString}` : `${BASE_URL}${path}`;

    const response = await fetch(url, {
        method: 'GET',
        headers: {
            'api-key': apiKey,
            'timestamp': timestamp,
            'nonce': nonce,
            'sign': signature,
            'Content-Type': 'application/json'
        }
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Bitunix API error: ${response.status} ${text}`);
    }

    const res = await response.json();
    if (res.code !== 0 && res.code !== '0') {
        throw new Error(`Bitunix API error code: ${res.code} - ${res.msg || 'Unknown error'}`);
    }

    return res.data;
}

// Helper for POST requests (actions)
async function executeBitunixAction(apiKey: string, apiSecret: string, path: string, payload: any) {
    const nonce = randomBytes(16).toString('hex');
    const timestamp = Date.now().toString();

    // Clean payload
    const cleanPayload: any = {};
    Object.keys(payload).forEach(k => {
        if (payload[k] !== undefined && payload[k] !== null) {
            // Ensure we don't accidentally send empty strings if they should be filtered,
            // though for POST usually specific keys matter.
            // Bitunix signature requires exact match of body content.
            cleanPayload[k] = payload[k];
        }
    });

    const bodyStr = JSON.stringify(cleanPayload);

    // Signature for POST: nonce + timestamp + apiKey + queryParams (empty usually) + bodyStr
    // Note: We assume path does NOT contain query params.
    const digestInput = nonce + timestamp + apiKey + bodyStr;
    const digest = createHash('sha256').update(digestInput).digest('hex');
    const signInput = digest + apiSecret;
    const signature = createHash('sha256').update(signInput).digest('hex');

    const url = `${BASE_URL}${path}`;

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'api-key': apiKey,
            'timestamp': timestamp,
            'nonce': nonce,
            'sign': signature,
            'Content-Type': 'application/json'
        },
        body: bodyStr
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Bitunix API error: ${response.status} ${text}`);
    }

    const res = await response.json();
    if (res.code !== 0 && res.code !== '0') {
        throw new Error(`Bitunix API error code: ${res.code} - ${res.msg || 'Unknown error'}`);
    }

    return res.data;
}
