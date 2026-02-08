/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

/**
 * WASM Technicals Loader
 * Loads the WebAssembly module for high-performance calculations.
 */

let wasmInstance: any = null;
let wasmMemory: WebAssembly.Memory | null = null;
let wasmExports: any = null;

export const WASM_SUPPORTED_INDICATORS = [
    'ema', 'rsi', 'macd', 'bb', 'atr', 'stochastic', 'cci', 'adx', 'supertrend',
    'momentum', 'williamsr', 'volumema', 'pivots', 'parabolicsar', 'choppiness', 'vwap', 'mfi'
];

// Text Encoder/Decoder for UTF-8 string handling
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

// Helper: Pass string from JS to WASM
function passStringToWasm(str: string): [number, number] {
    if (!wasmExports || !wasmMemory) throw new Error('WASM not initialized');
    
    const bytes = textEncoder.encode(str);
    const len = bytes.length;
    const ptr = wasmExports.__wbindgen_malloc(len, 1);
    const mem = new Uint8Array(wasmMemory.buffer);
    mem.set(bytes, ptr);
    return [ptr, len];
}

// Helper: Read string from WASM memory
function getStringFromWasm(ptr: number, len: number): string {
    if (!wasmMemory) throw new Error('WASM not initialized');
    const mem = new Uint8Array(wasmMemory.buffer);
    const bytes = mem.slice(ptr, ptr + len);
    return textDecoder.decode(bytes);
}

// Minimal wasm-bindgen imports (only what's actually needed)
function createImports(memory: WebAssembly.Memory) {
    return {
        __wbindgen_placeholder__: {
            __wbindgen_describe: () => {},
            __wbg___wbindgen_throw_be289d5034ed271b: (ptr: number, len: number) => {
                const msg = getStringFromWasm(ptr, len);
                throw new Error(msg);
            },
        },
        __wbindgen_externref_xform__: {
            __wbindgen_externref_table_grow: (delta: number) => delta,
            __wbindgen_externref_table_set_null: (idx: number) => {},
        }
    };
}

export async function loadWasm() {
    if (wasmInstance) return wasmInstance;

    try {
        // Check if WASM is supported
        if (typeof WebAssembly === 'undefined') {
            console.warn('[WASM] WebAssembly not supported in this browser');
            return null;
        }

        // Create shared memory (1MB initial, 16MB max)
        wasmMemory = new WebAssembly.Memory({ 
            initial: 16,  // 16 pages = 1MB
            maximum: 256  // 256 pages = 16MB
        });

        const imports = createImports(wasmMemory);

        // Fetch and instantiate WASM module
        const wasmPath = '/wasm/technicals_wasm.wasm';
        
        let wasmModule: WebAssembly.WebAssemblyInstantiatedSource;
        
        if (typeof WebAssembly.instantiateStreaming === 'function') {
            // Modern browsers: streaming compilation
            const response = await fetch(wasmPath);
            if (!response.ok) {
                throw new Error(`Failed to fetch WASM: ${response.status} ${response.statusText}`);
            }
            wasmModule = await WebAssembly.instantiateStreaming(response, imports);
        } else {
            // Fallback for older browsers
            const response = await fetch(wasmPath);
            const buffer = await response.arrayBuffer();
            wasmModule = await WebAssembly.instantiate(buffer, imports);
        }

        wasmExports = wasmModule.instance.exports as any;

        // Create wrapper object that matches expected interface
        wasmInstance = {
            memory: wasmMemory,
            TechnicalsCalculator: class {
                private ptr: number;

                constructor() {
                    // Call WASM constructor
                    this.ptr = wasmExports.technicalscalculator_new();
                }

                initialize(
                    closes: Float64Array,
                    highs: Float64Array,
                    lows: Float64Array,
                    volumes: Float64Array,
                    times: Float64Array,
                    settingsJson: string
                ) {
                    // Convert arrays to WASM slices
                    const len = closes.length;
                    
                    // Allocate and copy arrays
                    const closesPtr = wasmExports.__wbindgen_malloc(len * 8, 8);
                    const highsPtr = wasmExports.__wbindgen_malloc(len * 8, 8);
                    const lowsPtr = wasmExports.__wbindgen_malloc(len * 8, 8);
                    const volumesPtr = wasmExports.__wbindgen_malloc(len * 8, 8);
                    const timesPtr = wasmExports.__wbindgen_malloc(len * 8, 8);

                    const mem = new Float64Array(wasmMemory!.buffer);
                    mem.set(closes, closesPtr / 8);
                    mem.set(highs, highsPtr / 8);
                    mem.set(lows, lowsPtr / 8);
                    mem.set(volumes, volumesPtr / 8);
                    mem.set(times, timesPtr / 8);

                    // Pass settings string
                    const [settingsPtr, settingsLen] = passStringToWasm(settingsJson);

                    // Call WASM initialize
                    // Signature: initialize(&mut self, closes: &[f64], highs: &[f64], lows: &[f64], volumes: &[f64], times: &[f64], settings_json: &str)
                    wasmExports.technicalscalculator_initialize(
                        this.ptr,
                        closesPtr, len,
                        highsPtr, len,
                        lowsPtr, len,
                        volumesPtr, len,
                        timesPtr, len,
                        settingsPtr, settingsLen
                    );

                    // Free temporary allocations
                    wasmExports.__wbindgen_free(closesPtr, len * 8, 8);
                    wasmExports.__wbindgen_free(highsPtr, len * 8, 8);
                    wasmExports.__wbindgen_free(lowsPtr, len * 8, 8);
                    wasmExports.__wbindgen_free(volumesPtr, len * 8, 8);
                    wasmExports.__wbindgen_free(timesPtr, len * 8, 8);
                    wasmExports.__wbindgen_free(settingsPtr, settingsLen, 1);
                }

                update(open: number, high: number, low: number, close: number, volume: number, time: number): string {
                    // Call WASM update
                    // Signature: update(&self, o: f64, h: f64, l: f64, c: f64, v: f64, t: f64) -> String
                    const retPtr = wasmExports.technicalscalculator_update(this.ptr, open, high, low, close, volume, time);
                    
                    // wasm-bindgen returns strings as [ptr, len] pair
                    const mem = new Uint32Array(wasmMemory!.buffer);
                    const strPtr = mem[retPtr / 4];
                    const strLen = mem[retPtr / 4 + 1];
                    
                    const result = getStringFromWasm(strPtr, strLen);
                    
                    // Free result string
                    wasmExports.__wbindgen_free(strPtr, strLen, 1);
                    
                    return result;
                }

                shift(open: number, high: number, low: number, close: number, volume: number, time: number) {
                    // Call WASM shift
                    // Signature: shift(&mut self, o: f64, h: f64, l: f64, c: f64, v: f64, t: f64)
                    wasmExports.technicalscalculator_shift(this.ptr, open, high, low, close, volume, time);
                }

                free() {
                    if (this.ptr !== 0) {
                        wasmExports.__wbg_technicalscalculator_free(this.ptr);
                        this.ptr = 0;
                    }
                }
            }
        };

        console.log('[WASM] Technicals module loaded successfully');
        return wasmInstance;

    } catch (e) {
        console.error('[WASM] Failed to load module:', e);
        return null;
    }
}

export function isWasmAvailable() {
    return !!wasmInstance;
}
