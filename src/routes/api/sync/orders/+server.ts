import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createHash, randomBytes } from 'crypto';

export const POST: RequestHandler = async ({ request }) => {
    const { apiKey, apiSecret, limit } = await request.json();

    if (!apiKey || !apiSecret) {
        return json({ error: 'Missing credentials' }, { status: 400 });
    }

    try {
        // Fetch up to 500 orders (5 pages of 100) to increase chances of finding the relevant order
        const maxPages = 5;
        let allOrders: any[] = [];
        let currentEndTime: number | undefined = undefined;

        for (let i = 0; i < maxPages; i++) {
            const batch = await fetchBitunixOrders(apiKey, apiSecret, 100, currentEndTime);
            
            if (!batch || batch.length === 0) {
                break;
            }

            allOrders = allOrders.concat(batch);
            
            // Prepare for next page: use the ctime of the last order as endTime
            // The API sorts desc, so the last one is the oldest.
            const lastOrder = batch[batch.length - 1];
            if (lastOrder && lastOrder.ctime) {
                currentEndTime = parseInt(lastOrder.ctime, 10);
            } else {
                break; // Should not happen if data is valid, but safe break
            }
        }

        return json({ data: allOrders });
    } catch (e: any) {
        console.error(`Error fetching orders from Bitunix:`, e);
        return json({ error: e.message || 'Failed to fetch orders' }, { status: 500 });
    }
};

async function fetchBitunixOrders(apiKey: string, apiSecret: string, limit: number = 100, endTime?: number): Promise<any[]> {
    const baseUrl = 'https://fapi.bitunix.com';
    const path = '/api/v1/futures/trade/get_history_orders';
    
    // Params for the request
    const params: Record<string, string> = {
        limit: limit.toString()
    };
    if (endTime) {
        params.endTime = endTime.toString();
    }

    // 1. Generate Nonce and Timestamp
    const nonce = randomBytes(16).toString('hex');
    const timestamp = Date.now().toString();

    // 2. Sort and Concatenate Query Params (keyvaluekeyvalue...)
    const queryParamsStr = Object.keys(params)
        .sort()
        .map(key => key + params[key])
        .join('');

    // 3. Construct Digest Input
    // digestInput = nonce + timestamp + apiKey + queryParams + body
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

    return data.data?.orderList || [];
}
