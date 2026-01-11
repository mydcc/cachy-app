import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createHash, randomBytes } from 'crypto';

export const POST: RequestHandler = async ({ request }) => {
    const { apiKey, apiSecret, limit } = await request.json();

    if (!apiKey || !apiSecret) {
        return json({ error: 'Missing credentials' }, { status: 400 });
    }

    try {
        const positions = await fetchAllHistoryPositions(apiKey, apiSecret, limit);
        return json({ data: positions });
    } catch (e: any) {
        // Log only the message to prevent leaking sensitive data (e.g. headers/keys in error objects)
        console.error(`Error fetching history positions from Bitunix:`, e.message || 'Unknown error');
        return json({ error: e.message || 'Failed to fetch history positions' }, { status: 500 });
    }
};

async function fetchAllHistoryPositions(apiKey: string, apiSecret: string, requestedLimit: number = 50): Promise<any[]> {
    const baseUrl = 'https://fapi.bitunix.com';
    const path = '/api/v1/futures/position/get_history_positions';

    // Safety cap for recursion/loops
    const MAX_PAGES = 10;
    const PER_PAGE = 100;

    const allPositions: any[] = [];
    const seenIds = new Set<string>(); // Deduplication
    let currentEndTime: number | undefined = undefined;

    // Always fetch at least 100 to be safe/efficient if we are paging anyway
    const targetCount = requestedLimit;

    for (let i = 0; i < MAX_PAGES; i++) {
        const batch = await fetchBitunixHistoryPage(apiKey, apiSecret, baseUrl, path, PER_PAGE, currentEndTime);

        if (!batch || batch.length === 0) {
            break;
        }

        let newItemsCount = 0;
        for (const item of batch) {
            // Use unique identifier: id or positionId
            const id = String(item.id || item.positionId || item.orderId || Math.random());
            if (!seenIds.has(id)) {
                seenIds.add(id);
                allPositions.push(item);
                newItemsCount++;
            }
        }

        // Check if we have enough
        if (allPositions.length >= targetCount) {
            break;
        }

        // If no new items were added (all duplicates), we are done or stuck
        if (newItemsCount === 0) {
            break;
        }

        // Pagination logic: Bitunix history usually sorted descending by time.
        // We find the oldest timestamp in the batch to set as endTime for the next batch.
        // We look for `ctime`, `updateTime`, or `mtime`.
        const lastItem = batch[batch.length - 1];
        if (!lastItem) break;

        // Find the timestamp field
        const timeVal = lastItem.ctime || lastItem.updateTime || lastItem.mtime || lastItem.createTime;

        if (timeVal) {
             const parsedTime = parseInt(String(timeVal), 10);
             if (!isNaN(parsedTime) && parsedTime > 0) {
                 // Prevent infinite loop if timestamp doesn't change
                 if (currentEndTime !== undefined && parsedTime >= currentEndTime) {
                     break;
                 }
                 currentEndTime = parsedTime;
             } else {
                 break;
             }
        } else {
            break;
        }
    }

    // Return exactly what was requested (or less if not enough data), preserving order
    return allPositions.slice(0, requestedLimit);
}

async function fetchBitunixHistoryPage(
    apiKey: string,
    apiSecret: string,
    baseUrl: string,
    path: string,
    limit: number,
    endTime?: number
): Promise<any[]> {
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
        throw new Error(`Bitunix API error: ${response.status} ${text}`);
    }

    const data = await response.json();

    if (data.code !== 0 && data.code !== '0') {
         throw new Error(`Bitunix API error code: ${data.code} - ${data.msg || 'Unknown error'}`);
    }

    return data.data?.positionList || [];
}
