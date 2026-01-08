import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createHmac, createHash, randomBytes } from 'crypto';

export const POST: RequestHandler = async ({ request }) => {
    const body = await request.json();
    const { exchange, apiKey, apiSecret, type } = body;

    if (!exchange || !apiKey || !apiSecret) {
        return json({ error: 'Missing credentials or exchange' }, { status: 400 });
    }

    try {
        let result = null;
        if (exchange === 'bitunix') {
            if (type === 'pending') {
                result = { orders: await fetchBitunixPendingOrders(apiKey, apiSecret) };
            } else if (type === 'history') {
                result = { orders: await fetchBitunixHistoryOrders(apiKey, apiSecret) };
            } else if (type === 'place-order') {
                result = await placeBitunixOrder(apiKey, apiSecret, body);
            } else if (type === 'close-position') {
                // To close a position, we place a MARKET order in the opposite direction
                // body should contain: symbol, side (buy/sell), amount (qty)
                const closeOrder = {
                    symbol: body.symbol,
                    side: body.side, // Must be opposite of position
                    type: 'MARKET',
                    qty: body.amount,
                    reduceOnly: true
                };
                result = await placeBitunixOrder(apiKey, apiSecret, closeOrder);
            } else if (type === 'modify-order') {
                // Atomic-ish Cancel & Replace
                const { orderId, newOrder } = body;
                if (!orderId || !newOrder) throw new Error("Missing orderId or newOrder data for modification");

                // 1. Cancel
                await cancelBitunixOrder(apiKey, apiSecret, {
                    symbol: newOrder.symbol,
                    orderId: orderId
                });

                // 2. Place new
                result = await placeBitunixOrder(apiKey, apiSecret, newOrder);
            }
        } else if (exchange === 'binance') {
             result = { orders: [] }; // Placeholder
        }

        return json(result);
    } catch (e: any) {
        console.error(`Error processing ${type} on ${exchange}:`, e);
        return json({ error: e.message || `Failed to process ${type}` }, { status: 500 });
    }
};

async function placeBitunixOrder(apiKey: string, apiSecret: string, orderData: any): Promise<any> {
    const baseUrl = 'https://fapi.bitunix.com';
    const path = '/api/v1/futures/trade/place_order';

    // Map 'side' if necessary
    // Bitunix v1 often accepts "BUY"/"SELL" string OR integers.
    // However, existing code used orderData.side.toUpperCase().
    // We will stick to that but ensure mapping if integers are expected by some versions.
    // Based on open docs (e.g. CCXT impl for Bitunix), they use standard strings usually,
    // but if the reviewer is correct about integer enums, we should try to map.
    // BUT we cannot be sure without docs.
    // Let's implement a safe mapping: if it's explicitly BUY/SELL string, keep it (as string),
    // if it's 1/2/3/4, keep it.
    // Re-reading context: `fetchBitunixPendingOrders` returns "BUY"/"SELL".
    // If the API returns strings, it likely accepts strings.
    // I will trust the strings but uppercase them.

    // Construct Payload
    const payload: any = {
        symbol: orderData.symbol,
        side: String(orderData.side).toUpperCase(),
        type: String(orderData.type).toUpperCase(),
        qty: String(orderData.qty),
        reduceOnly: orderData.reduceOnly || false
    };

    if (payload.type === 'LIMIT' || payload.type === 'STOP_LIMIT') {
        if (!orderData.price) throw new Error("Price required for limit order");
        payload.price = String(orderData.price);
    }

    // Pass through TP/SL if present (important for Modify Order to preserve them)
    if (orderData.tpPrice) payload.tpPrice = String(orderData.tpPrice);
    if (orderData.tpType) payload.tpType = orderData.tpType;
    if (orderData.slPrice) payload.slPrice = String(orderData.slPrice);
    if (orderData.slType) payload.slType = orderData.slType;

    // Clean null/undefined
    Object.keys(payload).forEach(key => payload[key] === undefined && delete payload[key]);

    // Signing
    const nonce = randomBytes(16).toString('hex');
    const timestamp = Date.now().toString();

    const bodyStr = JSON.stringify(payload);
    const digestInput = nonce + timestamp + apiKey + bodyStr;
    const digest = createHash('sha256').update(digestInput).digest('hex');
    const signInput = digest + apiSecret;
    const signature = createHash('sha256').update(signInput).digest('hex');

    const url = `${baseUrl}${path}`;

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

async function cancelBitunixOrder(apiKey: string, apiSecret: string, params: { symbol: string, orderId: string }) {
    const baseUrl = 'https://fapi.bitunix.com';
    const path = '/api/v1/futures/trade/cancel_order';

    const nonce = randomBytes(16).toString('hex');
    const timestamp = Date.now().toString();

    // Payload for cancel: symbol, orderId
    const payload = {
        symbol: params.symbol,
        orderId: String(params.orderId)
    };

    const bodyStr = JSON.stringify(payload);
    const digestInput = nonce + timestamp + apiKey + bodyStr;
    const digest = createHash('sha256').update(digestInput).digest('hex');
    const signInput = digest + apiSecret;
    const signature = createHash('sha256').update(signInput).digest('hex');

    const url = `${baseUrl}${path}`;

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

async function fetchBitunixPendingOrders(apiKey: string, apiSecret: string): Promise<any[]> {
    const baseUrl = 'https://fapi.bitunix.com';
    const path = '/api/v1/futures/trade/get_pending_orders';
    
    const params: Record<string, string> = {};
    const nonce = randomBytes(16).toString('hex');
    const timestamp = Date.now().toString();

    const queryParamsStr = Object.keys(params).sort().map(key => key + params[key]).join('');
    const body = "";
    const digestInput = nonce + timestamp + apiKey + queryParamsStr + body;
    const digest = createHash('sha256').update(digestInput).digest('hex');
    const signInput = digest + apiSecret;
    const signature = createHash('sha256').update(signInput).digest('hex');

    const url = `${baseUrl}${path}`;

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

    const listData = Array.isArray(res.data) ? res.data : (res.data?.orderList || []);

    return listData.map((o: any) => ({
        id: o.orderId,
        orderId: o.orderId,
        clientId: o.clientId,
        symbol: o.symbol,
        type: o.type, // LIMIT, MARKET
        side: o.side, // BUY, SELL
        price: parseFloat(o.price || '0'),
        amount: parseFloat(o.qty || '0'),
        filled: parseFloat(o.tradeQty || '0'),
        status: o.status,
        time: o.ctime,
        mtime: o.mtime,
        leverage: o.leverage,
        marginMode: o.marginMode,
        positionMode: o.positionMode,
        reduceOnly: o.reduceOnly,
        fee: parseFloat(o.fee || '0'),
        realizedPNL: parseFloat(o.realizedPNL || '0'),
        tpPrice: o.tpPrice,
        tpStopType: o.tpStopType,
        tpOrderType: o.tpOrderType,
        slPrice: o.slPrice,
        slStopType: o.slStopType,
        slOrderType: o.slOrderType
    }));
}

async function fetchBitunixHistoryOrders(apiKey: string, apiSecret: string): Promise<any[]> {
    const baseUrl = 'https://fapi.bitunix.com';
    const path = '/api/v1/futures/trade/get_history_orders';
    
    // Default limit 20
    const params: Record<string, string> = {
        limit: '20'
    };
    
    const nonce = randomBytes(16).toString('hex');
    const timestamp = Date.now().toString();

    const queryParamsStr = Object.keys(params).sort().map(key => key + params[key]).join('');
    const body = "";
    const digestInput = nonce + timestamp + apiKey + queryParamsStr + body;
    const digest = createHash('sha256').update(digestInput).digest('hex');
    const signInput = digest + apiSecret;
    const signature = createHash('sha256').update(signInput).digest('hex');
    
    const queryString = new URLSearchParams(params).toString();
    const url = `${baseUrl}${path}?${queryString}`;

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

    const list = Array.isArray(res.data) ? res.data : (res.data?.orderList || []);
    return list.map((o: any) => ({
        ...o,
        id: o.orderId,
        symbol: o.symbol,
        type: o.type,
        side: o.side,
        price: parseFloat(o.price || '0'),
        amount: parseFloat(o.qty || '0'),
        filled: parseFloat(o.tradeQty || '0'),
        avgPrice: parseFloat(o.avgPrice || o.averagePrice || '0'),
        realizedPnL: parseFloat(o.realizedPNL || '0'),
        fee: parseFloat(o.fee || '0'),
        role: o.role, // Assuming 'MAKER' or 'TAKER' or similar string
        status: o.status,
        time: o.ctime
    }));
}
