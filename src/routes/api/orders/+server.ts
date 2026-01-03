import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createHmac, createHash, randomBytes } from 'crypto';

export const POST: RequestHandler = async ({ request }) => {
    const { exchange, apiKey, apiSecret, type } = await request.json();

    if (!exchange || !apiKey || !apiSecret) {
        return json({ error: 'Missing credentials or exchange' }, { status: 400 });
    }

    try {
        let data = [];
        if (exchange === 'bitunix') {
            if (type === 'pending') {
                data = await fetchBitunixPendingOrders(apiKey, apiSecret);
            } else if (type === 'history') {
                data = await fetchBitunixHistoryOrders(apiKey, apiSecret);
            }
        } else if (exchange === 'binance') {
             // Binance implementation can be added later or now if simple
             data = []; // Placeholder
        }

        return json({ orders: data });
    } catch (e: any) {
        console.error(`Error fetching ${type} orders from ${exchange}:`, e);
        return json({ error: e.message || `Failed to fetch ${type} orders` }, { status: 500 });
    }
};

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

    // Map to normalized format
    const list = res.data?.orderList || [];
    return list.map((o: any) => ({
        id: o.orderId,
        symbol: o.symbol,
        type: o.type, // LIMIT, MARKET
        side: o.side, // BUY, SELL
        price: parseFloat(o.price || '0'),
        amount: parseFloat(o.qty || '0'),
        filled: parseFloat(o.tradeQty || '0'),
        status: o.status,
        time: o.ctime
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

    const list = res.data?.orderList || [];
    return list.map((o: any) => ({
        id: o.orderId,
        symbol: o.symbol,
        type: o.type,
        side: o.side,
        price: parseFloat(o.price || '0'),
        amount: parseFloat(o.qty || '0'),
        filled: parseFloat(o.tradeQty || '0'),
        realizedPnL: parseFloat(o.realizedPNL || '0'),
        fee: parseFloat(o.fee || '0'),
        role: o.role, // Assuming 'MAKER' or 'TAKER' or similar string
        status: o.status,
        time: o.ctime
    }));
}
