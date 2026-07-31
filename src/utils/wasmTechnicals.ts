/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

/*
 * Copyright (C) 2026 MYDCT
 *
 * Hardened WASM Loader for Technical Indicators
 * Uses static assets for maximum compatibility with ACE.
 */

// The glue module's real shape depends on what emscripten generated; the
// only member this file itself calls is the default init function.
interface WasmTechnicalsGlueModule {
    default: (wasmBinaryPath: string) => Promise<unknown>;
}

let wasmModule: WasmTechnicalsGlueModule | null = null;
let loadingPromise: Promise<WasmTechnicalsGlueModule> | null = null;

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

            
            // Use standard dynamic import for the glue code
            const mod = await import(/* @vite-ignore */ wasmJsPath);
            
            // Initialize with the binary path
            await mod.default(wasmBinaryPath);
            
            wasmModule = mod;
            return mod;
        } catch (e) {
            console.error(`[WASM] ACE Engine Load Failed:`, e instanceof Error ? e.message : String(e));
            loadingPromise = null;
            throw e;
        }
    })();

    return loadingPromise;
}

export function isWasmAvailable() {
    return !!wasmModule;
}