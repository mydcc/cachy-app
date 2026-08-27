/* tslint:disable */
/* eslint-disable */

export class AlertEngineWasm {
    free(): void;
    [Symbol.dispose](): void;
    add_alert(alert_json: string): void;
    evaluate(symbol: string, current_price_str: string, timestamp: number): any;
    constructor();
    remove_alert(id: string): void;
    set_alerts(alerts_json: string): void;
}

export class TechnicalsCalculator {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Seed the calculator with price history.
     *
     * Prices and volumes cross the boundary as decimal strings, not `f64`:
     * widening a `f64` to `Decimal` on this side cannot recover precision that
     * was already lost on the way in, which is the whole point of BUG-0182.
     * `_times` stays numeric — it is a millisecond timestamp, not a financial
     * value, and is currently unused.
     */
    initialize(closes_arr: string[], highs_arr: string[], lows_arr: string[], volumes_arr: string[], times: Float64Array, settings_json: string): void;
    constructor();
    shift(_o_str: string, h_str: string, l_str: string, c_str: string, v_str: string, _t_str: string): void;
    update(_o_str: string, h_str: string, l_str: string, c_str: string, v_str: string, _t_str: string): string;
}

/**
 * Called once by wasm-bindgen when the module instantiates.
 *
 * Installs the console error panic hook so that a trap inside WASM shows up
 * in the browser console with a Rust backtrace instead of disappearing as an
 * anonymous `RuntimeError`. Without this, a malformed candle string could
 * kill the calculator silently and leave the consumer guessing (BUG-0314).
 */
export function wasm_start(): void;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_alertenginewasm_free: (a: number, b: number) => void;
    readonly __wbg_technicalscalculator_free: (a: number, b: number) => void;
    readonly alertenginewasm_add_alert: (a: number, b: number, c: number, d: number) => void;
    readonly alertenginewasm_evaluate: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => void;
    readonly alertenginewasm_new: () => number;
    readonly alertenginewasm_remove_alert: (a: number, b: number, c: number) => void;
    readonly alertenginewasm_set_alerts: (a: number, b: number, c: number, d: number) => void;
    readonly technicalscalculator_initialize: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number, m: number) => void;
    readonly technicalscalculator_new: () => number;
    readonly technicalscalculator_shift: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number, m: number) => void;
    readonly technicalscalculator_update: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number, m: number, n: number) => void;
    readonly wasm_start: () => void;
    readonly __wbindgen_export: (a: number, b: number) => number;
    readonly __wbindgen_export2: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_export3: (a: number, b: number, c: number) => void;
    readonly __wbindgen_add_to_stack_pointer: (a: number) => number;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
