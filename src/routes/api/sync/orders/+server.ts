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
        const startTime = Date.now();
        const TIMEOUT_MS = 50000; // 50s timeout safety for serverless functions

        let isPartial = false;

        // Helper to check timeout
        const checkTimeout = () => {
            if (Date.now() - startTime > TIMEOUT_MS) {
                console.warn('Sync orders timeout reached. Returning partial data.');
                isPartial = true;
                return true;
            }
            return false;
        };

        // Parallel execution for better performance
        const tasks = [
            fetchAllPages(apiKey, apiSecret, '/api/v1/futures/trade/get_history_orders', checkTimeout),
            fetchAllPages(apiKey, apiSecret, '/api/v1/futures/tpsl/get_history_orders', checkTimeout),
            fetchAllPages(apiKey, apiSecret, '/api/v1/futures/plan/get_history_plan_orders', checkTimeout)
        ];

        const results = await Promise.allSettled(tasks);

        // Process Regular Orders
        if (results[0].status === 'fulfilled') {
            allOrders = allOrders.concat(results[0].value);
        } else {
            console.error('Error fetching regular orders:', results[0].reason?.message || 'Unknown error');
        }

        // Process TP/SL Orders
        if (results[1].status === 'fulfilled') {
             allOrders = allOrders.concat(results[1].value);
        } else {
             console.warn('Error fetching TP/SL orders:', results[1].reason?.message || 'Unknown error');
        }

        // Process Plan Orders
        if (results[2].status === 'fulfilled') {
             allOrders = allOrders.concat(results[2].value);
        } else {
             console.warn('Error fetching plan orders:', results[2].reason?.message || 'Unknown error');
        }

        return json({ data: allOrders, isPartial });
    } catch (e: any) {
        // Log only the message to prevent leaking sensitive data (e.g. headers/keys in error objects)
        console.error(`Error fetching orders from Bitunix:`, e.message || 'Unknown error');
        return json({ error: e.message || 'Failed to fetch orders' }, { status: 500 });
    }
};

async function fetchAllPages(
    apiKey: string,
    apiSecret: string,
    path: string,
    checkTimeout: () => boolean
): Promise<any[]> {
    const maxPages = 50; // Reduced from 100 to prevent long waits, 50 * 100 = 5000 orders should be enough for recent history
    let accumulated: any[] = [];
    let currentEndTime: number | undefined = undefined;

    for (let i = 0; i < maxPages; i++) {
        if (checkTimeout()) break;

        // Fetch batch
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
                // Subtract 1ms (or 1s) to prevent overlap if the API is inclusive
                // Bitunix usually uses milliseconds. Safe to subtract 1.
                currentEndTime = parsedTime - 1;
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
            'Content-Type': 'application/json',
            'User-Agent': 'CachyApp/1.0'
        }
    });

    if (!response.ok) {
        const text = await response.text();
        // Try to parse JSON error from text
        try {
            const jsonError = JSON.parse(text);
            if (jsonError.msg) {
                 throw new Error(jsonError.msg); // Pass upstream message
            }
        } catch (e) {
            // ignore
        }
        throw new Error(`Bitunix API error [${path}]: ${response.status} ${text}`);
    }

    const data = await response.json();
    
    if (data.code !== 0 && data.code !== '0') {
         throw new Error(data.msg || `Bitunix API error code [${path}]: ${data.code}`);
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
