/*
 * Copyright (C) 2026 MYDCT
 *
 * Hardened WASM Loader for Technical Indicators
 * Uses static assets for maximum compatibility with ACE.
 */

let wasmModule: any = null;
let loadingPromise: Promise<any> | null = null;

export const WASM_SUPPORTED_INDICATORS = [
    'ema', 'rsi', 'macd', 'bb', 'atr', 'stochastic', 'cci', 'adx', 'supertrend',
    'momentum', 'williamsr', 'volumema', 'pivots', 'parabolicsar', 'choppiness', 'vwap', 'mfi'
];

export async function loadWasm() {
    if (wasmModule) return wasmModule;
    if (loadingPromise) return loadingPromise;

    loadingPromise = (async () => {
        try {
            // RELIABLE PATHS: Files are now in /static/wasm/
            // SvelteKit serves /static content at the root path /
            const wasmJsPath = '/wasm/technicals_wasm.js';
            // Align with scripts/build_wasm.sh output
            const wasmBinaryPath = '/wasm/technicals_wasm.wasm';

            console.log(`[WASM] Loading engine from ${wasmJsPath}...`);
            
            // Use standard dynamic import for the glue code
            const mod = await import(/* @vite-ignore */ wasmJsPath);
            
            // Initialize with the binary path
            await mod.default(wasmBinaryPath);
            
            wasmModule = mod;
            console.log(`[WASM] ACE Engine initialized successfully.`);
            return wasmModule;
        } catch (e: any) {
            console.error(`[WASM] ACE Engine Load Failed:`, e.message);
            loadingPromise = null;
            throw e;
        }
    })();

    return loadingPromise;
}

export function isWasmAvailable() {
    return !!wasmModule;
}