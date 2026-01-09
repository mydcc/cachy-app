import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createHash, randomBytes } from 'crypto';

export const POST: RequestHandler = async ({ request }) => {
    const { apiKey, apiSecret, limit } = await request.json();

    if (!apiKey || !apiSecret) {
        return json({ error: 'Missing credentials' }, { status: 400 });
    }

    try {
        let allOrders: any[] = [];

        // 1. Fetch Regular Orders
        try {
            const regularOrders = await fetchAllPages(apiKey, apiSecret, '/api/v1/futures/trade/get_history_orders');
            allOrders = allOrders.concat(regularOrders);
        } catch (err: any) {
            console.error('Error fetching regular orders:', err);
            // If regular orders fail, we still try others, but if ALL fail, we might want to throw.
        }

        // 2. Fetch TP/SL Orders (Specific Endpoint for Stop Losses)
        // Documentation: /api/v1/futures/tpsl/get_history_orders
        try {
            const tpslOrders = await fetchAllPages(apiKey, apiSecret, '/api/v1/futures/tpsl/get_history_orders');
            allOrders = allOrders.concat(tpslOrders);
        } catch (err: any) {
            console.warn('Error fetching TP/SL orders:', err.message);
        }

        // 3. Fetch Plan Orders (Legacy/Alternative Trigger Orders)
        try {
            const planOrders = await fetchAllPages(apiKey, apiSecret, '/api/v1/futures/plan/get_history_plan_orders');
            allOrders = allOrders.concat(planOrders);
        } catch (err: any) {
            console.warn('Error fetching plan orders:', err.message);
        }

        return json({ data: allOrders });
    } catch (e: any) {
        console.error(`Error fetching orders from Bitunix:`, e);
        return json({ error: e.message || 'Failed to fetch orders' }, { status: 500 });
    }
};

async function fetchAllPages(apiKey: string, apiSecret: string, path: string): Promise<any[]> {
    const maxPages = 100; // Increased from 20 to support deeper history (approx 10k orders)
    let accumulated: any[] = [];
    let currentEndTime: number | undefined = undefined;

    for (let i = 0; i < maxPages; i++) {
        const batch = await fetchBitunixData(apiKey, apiSecret, path, 100, currentEndTime);

        if (!batch || batch.length === 0) {
            break;
        }

        accumulated = accumulated.concat(batch);

        // Pagination logic: use the creation time of the last item
        const lastItem = batch[batch.length - 1];

        // Safety check if lastItem is null or undefined
        if (!lastItem) break;

        // Standardize time field: ctime, createTime, updateTime
        const timeField = lastItem.ctime || lastItem.createTime || lastItem.updateTime;

        // Ensure we have a valid time field before parsing
        if (timeField !== undefined && timeField !== null) {
            const parsedTime = parseInt(String(timeField), 10);

            if (!isNaN(parsedTime) && parsedTime > 0) {
                currentEndTime = parsedTime;
            } else {
                break; // Invalid timestamp, stop paging
            }
        } else {
            break; // No time field, stop paging
        }
    }
    return accumulated;
}

async function fetchBitunixData(apiKey: string, apiSecret: string, path: string, limit: number = 100, endTime?: number): Promise<any[]> {
    const baseUrl = 'https://fapi.bitunix.com';
    
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

    // 2. Sort and Concatenate Query Params
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
        throw new Error(`Bitunix API error [${path}]: ${response.status} ${text}`);
    }

    const data = await response.json();
    
    if (data.code !== 0 && data.code !== '0') {
         throw new Error(`Bitunix API error code [${path}]: ${data.code} - ${data.msg || 'Unknown error'}`);
    }

    // Robustly find the list in the response
    const resultData = data.data;
    if (Array.isArray(resultData)) return resultData;
    if (resultData && typeof resultData === 'object') {
        // Try common keys
        if (Array.isArray(resultData.orderList)) return resultData.orderList;
        if (Array.isArray(resultData.planOrderList)) return resultData.planOrderList;
        if (Array.isArray(resultData.rows)) return resultData.rows;
        if (Array.isArray(resultData.list)) return resultData.list;
    }

    return [];
}
