// Mock SvelteKit modules BEFORE imports
import Module from 'module';
const originalRequire = Module.prototype.require;
// @ts-ignore
Module.prototype.require = function (id) {
    if (id === '$app/environment') return { browser: false, dev: true };
    return originalRequire.call(this, id);
};

import { apiService } from './src/services/apiService';

import { marketState } from './src/stores/market.svelte';
import { marketWatcher } from './src/services/marketWatcher';
import { normalizeSymbol } from './src/utils/symbolUtils';

// Mocking browser environment for stores
// @ts-ignore
global.window = {};

async function testPipeline() {
    console.log("=== STARTING PIPELINE DIAGNOSTIC ===");
    const symbol = "SOLUSDT";
    const timeframe = "1h";

    // 1. Test API Direct
    console.log(`\n[1] Testing API Fetch for ${symbol}...`);
    try {
        const klines = await apiService.fetchBitunixKlines(symbol, timeframe, 10);
        console.log(`API Result: Fetched ${klines.length} klines.`);
        if (klines.length > 0) {
            console.log("Sample Kline (Raw):", klines[0]);
        } else {
            console.error("API returned EMPTY array!");
        }
    } catch (e) {
        console.error("API Fetch Failed:", e);
    }

    // 2. Test MarketWatcher Registration (which should trigger fetch)
    console.log(`\n[2] Testing MarketWatcher Registration...`);
    const norm = normalizeSymbol(symbol, "bitunix");

    // Subscribe
    marketWatcher.register(symbol, `kline_${timeframe}`);

    // Wait for async fetch (simulating the 'Immediate Load')
    console.log("Waiting 2s for async IO...");
    await new Promise(r => setTimeout(r, 2000));

    // 3. Inspect Store
    console.log(`\n[3] Inspecting MarketState for key: ${norm}`);
    const data = marketState.data[norm];

    if (!data) {
        console.error("CRITICAL: No data object in store for symbol!");
    } else {
        console.log(`Last Updated: ${data.lastUpdated}`);
        const storedKlines = data.klines[timeframe];
        if (!storedKlines) {
            console.error(`CRITICAL: 'klines.${timeframe}' is undefined!`);
        } else {
            console.log(`Store contains ${storedKlines.length} klines.`);
            if (storedKlines.length > 0) {
                console.log("Sample Kline (Store):", storedKlines[0]);
            }
        }
    }
}

testPipeline();
