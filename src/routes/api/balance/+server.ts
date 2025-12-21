import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createHmac } from 'crypto';

export const POST: RequestHandler = async ({ request }) => {
    const { exchange, apiKey, apiSecret } = await request.json();

    if (!exchange || !apiKey || !apiSecret) {
        return json({ error: 'Missing credentials or exchange' }, { status: 400 });
    }

    try {
        let balance = 0;

        if (exchange === 'bitunix') {
            balance = await fetchBitunixBalance(apiKey, apiSecret);
        } else if (exchange === 'binance') {
            balance = await fetchBinanceBalance(apiKey, apiSecret);
        } else {
            return json({ error: 'Unsupported exchange' }, { status: 400 });
        }

        return json({ balance });
    } catch (e: any) {
        console.error(`Error fetching balance from ${exchange}:`, e);
        return json({ error: e.message || 'Failed to fetch balance' }, { status: 500 });
    }
};

async function fetchBitunixBalance(apiKey: string, apiSecret: string): Promise<number> {
    const baseUrl = 'https://api.bitunix.com';
    const path = '/api/v1/futures/assets';
    const timestamp = Date.now().toString();

    // Bitunix Signature: HMAC-SHA256(timestamp + query_string + body, secret)
    // For this GET request, there is no query string or body.
    const signString = timestamp;
    const signature = createHmac('sha256', apiSecret).update(signString).digest('hex');

    const response = await fetch(`${baseUrl}${path}`, {
        method: 'GET',
        headers: {
            'api-key': apiKey,
            'timestamp': timestamp,
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

    // Response structure usually: { code: 0, msg: 'success', data: [ { currency: 'USDT', available: '...' }, ... ] }
    // I need to find the structure. Assuming standard 'data' array.

    const assets = data.data || [];
    const usdtAsset = assets.find((a: any) => a.currency === 'USDT');

    if (!usdtAsset) {
        return 0; // No USDT found or empty wallet
    }

    // Usually 'available' or 'marginBalance'. User asked for "Account Size", which usually means total equity or available balance.
    // Let's assume 'marginBalance' (equity) or 'available'.
    // Usually for trading calculation, 'available' is safer, but 'equity' (marginBalance) is the actual account size.
    // Let's use marginBalance if available, otherwise available.
    // Bitunix docs say: available, marginBalance, positionMargin, etc.
    // I'll pick marginBalance as it represents total account value.

    return parseFloat(usdtAsset.marginBalance || usdtAsset.available || '0');
}

async function fetchBinanceBalance(apiKey: string, apiSecret: string): Promise<number> {
    const baseUrl = 'https://fapi.binance.com';
    const path = '/fapi/v2/balance';
    const timestamp = Date.now();

    let queryString = `timestamp=${timestamp}`;
    const signature = createHmac('sha256', apiSecret).update(queryString).digest('hex');
    queryString += `&signature=${signature}`;

    const response = await fetch(`${baseUrl}${path}?${queryString}`, {
        method: 'GET',
        headers: {
            'X-MBX-APIKEY': apiKey
        }
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Binance API error: ${response.status} ${text}`);
    }

    const data = await response.json();
    // Binance returns an array of assets
    // [ { "accountAlias": "...", "asset": "USDT", "balance": "0.0", "crossWalletBalance": "0.0", "crossUnPnl": "0.0", "availableBalance": "0.0", "maxWithdrawAmount": "0.0" } ]

    const usdtAsset = data.find((a: any) => a.asset === 'USDT');

    if (!usdtAsset) {
        return 0;
    }

    // For futures calculator, usually we want 'balance' (Wallet Balance) or 'crossWalletBalance'.
    // 'balance' is total wallet balance. 'availableBalance' is what can be used for new orders.
    // 'Account Size' in calculator usually implies the total capital available to risk.
    // I'll use 'balance' (Wallet Balance).

    return parseFloat(usdtAsset.balance || '0');
}
