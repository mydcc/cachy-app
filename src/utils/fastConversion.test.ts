import { describe, it, expect } from 'vitest';
import { toNumFast } from './fastConversion';
import { Decimal } from 'decimal.js';

describe('toNumFast', () => {
    // 1. Numbers
    it('handles primitive numbers', () => {
        expect(toNumFast(123)).toEqual(123);
        expect(toNumFast(-0.5)).toEqual(-0.5);
        expect(toNumFast(0)).toEqual(0);
        expect(toNumFast(Infinity)).toEqual(Infinity);
        expect(toNumFast(-Infinity)).toEqual(-Infinity);
    });

    // 2. Strings
    it('handles numeric strings', () => {
        expect(toNumFast("123")).toEqual(123);
        expect(toNumFast("-123.45")).toEqual(-123.45);
        expect(toNumFast("0")).toEqual(0);
        expect(toNumFast("1.5e+2")).toEqual(150);
    });

    it('handles non-numeric strings', () => {
        expect(toNumFast("abc")).toEqual(0);
        expect(toNumFast("123abc")).toEqual(123); // parseFloat behavior
        expect(toNumFast("")).toEqual(0);
        expect(toNumFast(" ")).toEqual(0);
    });

    // 3. Decimal Instances
    it('handles Decimal instances', () => {
        expect(toNumFast(new Decimal(123.456))).toEqual(123.456);
        expect(toNumFast(new Decimal(0))).toEqual(0);
        expect(toNumFast(new Decimal("-1.5e3"))).toEqual(-1500);
    });

    // 4. Objects with .toNumber()
    it('handles objects with .toNumber method', () => {
        const customObj = {
            toNumber: () => 42
        };
        expect(toNumFast(customObj)).toEqual(42);
    });

    // 5. Serialized Decimal
    it('handles serialized Decimal objects', () => {
        // Simulate JSON.parse(JSON.stringify(new Decimal(123)))
        const original = new Decimal(123.456);
        const serializedDecimal = JSON.parse(JSON.stringify(original));
        expect(toNumFast(serializedDecimal)).toEqual(123.456);

        // Manually constructed to ensure it matches the expected structure
        // Decimal.js structure usually has s (sign), e (exponent), d (digits)
        // If the implementation checks specifically for s and e, we need to provide them.
        const manualSerialized = { s: 1, e: 2, d: [123456] };
        // 1.23456e+2 = 123.456
        expect(toNumFast(manualSerialized)).toEqual(123.456);

        const simpleMock = { s: 1, e: 0, d: [0] };
        expect(toNumFast(simpleMock)).toEqual(0);
    });

    // 6. Fallback / Edge Cases
    it('returns 0 for null, undefined, and other types', () => {
        expect(toNumFast(null)).toEqual(0);
        expect(toNumFast(undefined)).toEqual(0);
        expect(toNumFast(true)).toEqual(0);
        expect(toNumFast(false)).toEqual(0);
        expect(toNumFast([])).toEqual(0);
        expect(toNumFast([1, 2])).toEqual(0); // Arrays are objects, but don't match Decimal checks
        expect(toNumFast({})).toEqual(0);
        expect(toNumFast({ foo: "bar" })).toEqual(0);
    });
});
