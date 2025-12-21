import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createHmac, createHash, randomBytes } from 'crypto';

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
    const baseUrl = 'https://fapi.bitunix.com';
    const path = '/api/v1/futures/account';
    
    // Params for the request
    const params: Record<string, string> = {
        marginCoin: 'USDT'
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
    // digestInput = nonce + timestamp + apiKey + queryParams + body
    // Body is empty for GET
    const body = ""; 
    const digestInput = nonce + timestamp + apiKey + queryParamsStr + body;

    // 4. Calculate Digest (SHA256)
    const digest = createHash('sha256').update(digestInput).digest('hex');

    // 5. Calculate Signature (SHA256 of digest + secret)
    const signInput = digest + apiSecret;
    const signature = createHash('sha256').update(signInput).digest('hex');

    // 6. Build Query String for URL (standard format key=value)
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

    // Parsing Logic
    const accountInfo = data.data;

    if (!accountInfo) {
        return 0;
    }

    // Case: It returns an array of assets (as per documentation)
    if (Array.isArray(accountInfo)) {
        const usdt = accountInfo.find((a: any) => a.marginCoin === 'USDT' || a.currency === 'USDT' || a.asset === 'USDT');
        if (usdt) {
            // Calculate total wallet balance = available + margin + frozen
            // If explicit marginBalance/equity is present, prioritize that.
            if (usdt.marginBalance) return parseFloat(usdt.marginBalance);
            if (usdt.equity) return parseFloat(usdt.equity);

            const available = parseFloat(usdt.available || '0');
            const margin = parseFloat(usdt.margin || '0');
            const frozen = parseFloat(usdt.frozen || '0');
            return available + margin + frozen;
        }
    }

    // Case: Direct property on the object (fallback)
    if (accountInfo.marginBalance) {
        return parseFloat(accountInfo.marginBalance);
    }

    // Fallback: available
    if (accountInfo.available) {
        return parseFloat(accountInfo.available);
    }

    // Fallback: equity
    if (accountInfo.equity) {
        return parseFloat(accountInfo.equity);
    }
    
    console.warn('Could not find balance in Bitunix response:', JSON.stringify(accountInfo));
    return 0;
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
    
    const usdtAsset = data.find((a: any) => a.asset === 'USDT');
    
    if (!usdtAsset) {
        return 0;
    }
    
    return parseFloat(usdtAsset.balance || '0');
}
