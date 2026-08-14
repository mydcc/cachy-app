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
    initialize(closes_arr: Float64Array, highs_arr: Float64Array, lows_arr: Float64Array, volumes_arr: Float64Array, _times: Float64Array, settings_json: string): void;
    constructor();
    shift(_o_str: string, h_str: string, l_str: string, c_str: string, v_str: string, _t_str: string): void;
    update(_o_str: string, h_str: string, l_str: string, c_str: string, v_str: string, _t_str: string): string;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_technicalscalculator_free: (a: number, b: number) => void;
    readonly technicalscalculator_initialize: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number, m: number) => void;
    readonly technicalscalculator_new: () => number;
    readonly technicalscalculator_shift: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number, m: number) => void;
    readonly technicalscalculator_update: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number, m: number) => [number, number];
    readonly __wbg_alertenginewasm_free: (a: number, b: number) => void;
    readonly alertenginewasm_add_alert: (a: number, b: number, c: number) => [number, number];
    readonly alertenginewasm_evaluate: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number];
    readonly alertenginewasm_new: () => number;
    readonly alertenginewasm_remove_alert: (a: number, b: number, c: number) => void;
    readonly alertenginewasm_set_alerts: (a: number, b: number, c: number) => [number, number];
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
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
