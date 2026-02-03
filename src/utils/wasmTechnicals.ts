
/*
 * Copyright (C) 2026 MYDCT
 *
 * WASM Technicals Loader
 * Loads the WebAssembly module for high-performance calculations.
 */

// This expects the WASM module to be available in the build output or public folder.
// Since we are not using a full wasm-pack bundler plugin in this environment,
// we will fetch the .wasm file and instantiate it.

let wasmInstance: any = null;

export const WASM_SUPPORTED_INDICATORS = [
    'ema', 'rsi', 'macd', 'bb', 'atr', 'stochastic', 'cci', 'adx', 'supertrend',
    'momentum', 'williamsr', 'volumema', 'pivots', 'parabolicsar', 'choppiness', 'vwap', 'mfi'
];

export async function loadWasm() {
  if (wasmInstance) return wasmInstance;

  try {
    // In a real setup, we would import init from "pkg/technicals_wasm.js"
    // Here we simulate the interface.
    // For now, we return null to signal "WASM Not Available" so the worker falls back to JS.
    // This allows us to merge the WASM infrastructure without breaking the app if the .wasm file isn't served yet.
    console.log("WASM loading not yet fully integrated with Vite build pipeline.");
    return null;
  } catch (e) {
    console.error("Failed to load WASM", e);
    return null;
  }
}

export function isWasmAvailable() {
    return !!wasmInstance;
}
