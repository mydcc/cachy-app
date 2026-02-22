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

// @vitest-environment happy-dom
import { bench, describe, vi, beforeAll } from 'vitest';
import { Decimal } from 'decimal.js';

vi.mock('$app/environment', () => ({ browser: true }));

const mockStore = new Map();
const mockDB = {
  transaction: (storeName, mode) => ({
    objectStore: (name) => ({
      get: (key) => {
        const req: any = {};
        const val = mockStore.get(key);
        setTimeout(() => {
             req.result = val;
             if (req.onsuccess) req.onsuccess({ target: req });
        }, 0);
        return req;
      },
      put: (val) => {
        const req: any = {};
        mockStore.set(val.id, val);
        setTimeout(() => {
             if (req.onsuccess) req.onsuccess({ target: req });
        }, 0);
        return req;
      },
      getAll: (query) => {
         const req: any = {};
         const results = [];
         if (query && (query.lower !== undefined || query.upper !== undefined)) {
             const lower = query.lower;
             const upper = query.upper;
             for (const [k, v] of mockStore.entries()) {
                 if ((lower === undefined || k >= lower) && (upper === undefined || k <= upper)) {
                     results.push(v);
                 }
             }
             results.sort((a, b) => a.id.localeCompare(b.id));
         } else {
             for (const v of mockStore.values()) results.push(v);
         }
         setTimeout(() => {
             req.result = results;
             if (req.onsuccess) req.onsuccess({ target: req });
         }, 0);
         return req;
      }
    })
  }),
  objectStoreNames: { contains: () => true },
  createObjectStore: () => {},
  deleteObjectStore: () => {}
};

// Mock IDBKeyRange
globalThis.IDBKeyRange = {
    bound: (lower, upper) => ({ lower, upper }),
    lowerBound: (lower) => ({ lower }),
    upperBound: (upper) => ({ upper })
} as any;

// @ts-ignore
window.indexedDB = {
    open: () => {
        const req: any = {};
        setTimeout(() => {
            req.result = mockDB;
            if (req.onsuccess) req.onsuccess({ target: req });
        }, 0);
        return req;
    }
};

Object.defineProperty(window, 'indexedDB', { value: window.indexedDB, writable: true });
Object.defineProperty(window, 'localStorage', {
    value: {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {},
        clear: () => {},
        key: () => null,
        get length() { return 0; }
    },
    writable: true
});

function generateKlines(count: number, startTs: number) {
    return Array.from({ length: count }, (_, i) => ({
        time: startTs + i * 60000,
        open: new Decimal(100 + i),
        high: new Decimal(105 + i),
        low: new Decimal(95 + i),
        close: new Decimal(102 + i),
        volume: new Decimal(1000)
    }));
}

describe('StorageService', () => {
    let storageService;
    const symbol = 'BTCUSDT';
    const tf = '1m';
    let newKline;

    beforeAll(async () => {
         const mod = await import('../../src/services/storageService');
         storageService = mod.storageService;

         const initialKlines = generateKlines(50000, 1000000);
         // Setup: Populate 50k items
         await storageService.saveKlines(symbol, tf, initialKlines);

         newKline = generateKlines(1, 1000000 + 50000 * 60000);
    });

    bench('append_1_candle_to_50000', async () => {
        if (!storageService) throw new Error("Service not loaded");
        await storageService.saveKlines(symbol, tf, newKline);
    }, { time: 500 });
});
