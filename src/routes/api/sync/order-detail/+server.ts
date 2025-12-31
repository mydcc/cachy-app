import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createHash, randomBytes } from 'crypto';

export const POST: RequestHandler = async ({ request }) => {
    const { apiKey, apiSecret, orderId } = await request.json();

    if (!apiKey || !apiSecret || !orderId) {
        return json({ error: 'Missing credentials or orderId' }, { status: 400 });
    }

    try {
        const order = await fetchBitunixOrderDetail(apiKey, apiSecret, orderId);
        return json({ data: order });
    } catch (e: any) {
        console.error(`Error fetching order detail from Bitunix for ${orderId}:`, e);
        return json({ error: e.message || 'Failed to fetch order detail' }, { status: 500 });
    }
};

async function fetchBitunixOrderDetail(apiKey: string, apiSecret: string, orderId: string): Promise<any> {
    const baseUrl = 'https://fapi.bitunix.com';
    const path = '/api/v1/futures/trade/get_order_detail';
    
    // Params for the request
    const params: Record<string, string> = {
        orderId: orderId
    };

    // 1. Generate Nonce and Timestamp
    const nonce = randomBytes(16).toString('hex');
    const timestamp = Date.now().toString();

    // 2. Sort and Concatenate Query Params (keyvaluekeyvalue...)
    const queryParamsStr = Object.keys(params)
        .sort()
        .map(key => key + params[key])
        .join('');

    // 3. Construct Digest Input
    const body = ""; 
    const digestInput = nonce + timestamp + apiKey + queryParamsStr + body;

    // 4. Calculate Digest (SHA256)
    const digest = createHash('sha256').update(digestInput).digest('hex');

    // 5. Calculate Signature (SHA256 of digest + secret)
    const signInput = digest + apiSecret;
    const signature = createHash('sha256').update(signInput).digest('hex');

    // 6. Build Query String for URL
    const queryString = new URLSearchParams(params).toString();

    const response = await fetch(`${baseUrl}${path}?${queryString}`, {
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

    const data = await response.json();
    
    if (data.code !== 0 && data.code !== '0') {
         throw new Error(`Bitunix API error code: ${data.code} - ${data.msg || 'Unknown error'}`);
    }

    return data.data;
}
