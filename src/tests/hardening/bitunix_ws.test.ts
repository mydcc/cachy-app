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


import { describe, it, expect } from "vitest";

// Legacy Type Guards (Moved from service for testing)
const isSafe = (v: any) => {
  if (typeof v === 'string') return true;
  if (typeof v === 'number') return !isNaN(v) && isFinite(v);
  return false;
};

function isPriceData(d: any): d is { fr?: any; nft?: any; lastPrice?: any; lp?: any; la?: any; ip?: any; } {
  if (!d || typeof d !== 'object' || Array.isArray(d)) return false;

  if (d.lastPrice !== undefined && !isSafe(d.lastPrice)) return false;
  if (d.lp !== undefined && !isSafe(d.lp)) return false;
  if (d.la !== undefined && !isSafe(d.la)) return false;
  if (d.ip !== undefined && !isSafe(d.ip)) return false;
  if (d.fr !== undefined && !isSafe(d.fr)) return false;

  const hasSafePrice = (d.lastPrice !== undefined && isSafe(d.lastPrice)) ||
                       (d.lp !== undefined && isSafe(d.lp)) ||
                       (d.la !== undefined && isSafe(d.la)) ||
                       (d.ip !== undefined && isSafe(d.ip));

  const hasSafeFunding = (d.fr !== undefined && isSafe(d.fr));

  return hasSafePrice || hasSafeFunding;
}

function isTickerData(d: any): d is {
  volume?: any; v?: any; lastPrice?: any; close?: any;
  high?: any; low?: any; quoteVolume?: any;
  h?: any; l?: any; q?: any;
} {
  if (!d || typeof d !== 'object' || Array.isArray(d)) return false;

  if (d.lastPrice !== undefined && !isSafe(d.lastPrice)) return false;
  if (d.close !== undefined && !isSafe(d.close)) return false;
  if (d.volume !== undefined && !isSafe(d.volume)) return false;

  if (d.v !== undefined && !isSafe(d.v)) return false;
  if (d.q !== undefined && !isSafe(d.q)) return false;
  if (d.h !== undefined && !isSafe(d.h)) return false;
  if (d.l !== undefined && !isSafe(d.l)) return false;

  return (d.volume !== undefined || d.v !== undefined || d.lastPrice !== undefined || d.close !== undefined);
}

function isDepthData(d: any): d is { b: any[]; a: any[] } {
  return d && Array.isArray(d.b) && Array.isArray(d.a);
}

describe("Bitunix WebSocket Fast Path Guards", () => {
    describe("isPriceData", () => {
        it("should accept valid price data", () => {
            expect(isPriceData({ lastPrice: 100 })).toBe(true);
            expect(isPriceData({ lastPrice: "100" })).toBe(true);
            expect(isPriceData({ lp: 100 })).toBe(true);
            expect(isPriceData({ ip: "50" })).toBe(true);
        });

        it("should reject null or undefined", () => {
            expect(isPriceData(null)).toBe(false);
            expect(isPriceData(undefined)).toBe(false);
        });

        it("should reject malicious payloads", () => {
            // Current implementation allows objects!
            // We expect these to fail AFTER hardening.
            // For now, let's document what we WANT.

            // lastPrice is an object?
            expect(isPriceData({ lastPrice: {} })).toBe(false);

            // lastPrice is null?
            expect(isPriceData({ lastPrice: null })).toBe(false);

            // lastPrice is array?
            expect(isPriceData({ lastPrice: [] })).toBe(false);

            // Mixed valid/invalid: Valid funding rate but invalid price
            expect(isPriceData({ lastPrice: {}, fr: "0.01" })).toBe(false);
        });
    });

    describe("isTickerData", () => {
        it("should accept valid ticker data", () => {
            expect(isTickerData({ lastPrice: 100, volume: 50 })).toBe(true);
            expect(isTickerData({ v: "50", close: "100" })).toBe(true);
        });

        it("should reject invalid types", () => {
            expect(isTickerData({ lastPrice: {} })).toBe(false);
            expect(isTickerData({ volume: [] })).toBe(false);
        });

        it('should reject ticker with object values for "v"', () => {
            const unsafe = { v: { malicious: true }, lastPrice: "100" };
            expect(isTickerData(unsafe)).toBe(false);
        });
    });

    describe("isDepthData", () => {
        it("should accept valid depth data", () => {
            expect(isDepthData({ b: [], a: [] })).toBe(true);
            expect(isDepthData({ b: [[1, 1]], a: [[2, 2]] })).toBe(true);
        });

        it("should reject invalid depth data", () => {
            expect(isDepthData({})).toBe(false);
            expect(isDepthData({ b: null, a: [] })).toBe(false);
            expect(isDepthData({ b: [], a: {} })).toBe(false);
        });
    });
});
