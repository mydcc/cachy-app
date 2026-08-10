/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { deriveChoppinessState } from "./technicalsTypes";

describe("deriveChoppinessState", () => {
    it("puts the value under .value, unchanged", () => {
        expect(deriveChoppinessState(45).value).toBe(45);
        expect(deriveChoppinessState(70).value).toBe(70);
    });

    it("classifies above the 61.8 threshold as Range", () => {
        expect(deriveChoppinessState(70).state).toBe("Range");
    });

    it("classifies below the 38.2 threshold as Trend", () => {
        expect(deriveChoppinessState(20).state).toBe("Trend");
    });

    it("classifies the mid band as Range (current wasmCalculator behavior, preserved as-is)", () => {
        expect(deriveChoppinessState(50).state).toBe("Range");
    });
});

describe("BUG-0005 — GPU/WASM Choppiness parity", () => {
    // This is a source-level regression test rather than an end-to-end one:
    // WebGpuCalculator needs a real navigator.gpu device to run its compute
    // pipeline, which isn't available in the test environment (the rest of
    // the codebase mocks WebGpuCalculator wholesale for the same reason, see
    // engineBenchmark.test.ts). What we can and must pin down is that both
    // acceleration paths write Choppiness through the one shared function —
    // that's what makes the two paths structurally unable to drift apart
    // again, which is the actual defect this bug was about.
    const read = (relPath: string): string =>
        readFileSync(fileURLToPath(new URL(relPath, import.meta.url)), "utf-8");

    it("wasmCalculator writes Choppiness via the shared deriveChoppinessState helper", () => {
        const src = read("./wasmCalculator.ts");
        expect(src).toMatch(/data\.advanced\.choppiness\s*=\s*deriveChoppinessState\(/);
    });

    it("webGpuCalculator writes Choppiness via the shared deriveChoppinessState helper, at the same result.advanced.choppiness location", () => {
        const src = read("./webGpuCalculator.ts");
        expect(src).toMatch(/result\.advanced\.choppiness\s*=\s*deriveChoppinessState\(/);
        // The bug: this used to go through injectResult(..., 'volatility'),
        // writing an undeclared result.volatility.CHOP the UI never reads.
        expect(src).not.toMatch(/injectResult\([^)]*'CHOP'/);
    });
});
