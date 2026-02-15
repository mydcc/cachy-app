import { it, describe, beforeAll, vi, expect } from 'vitest';
import { Decimal } from 'decimal.js';
import type { Kline } from './technicalsTypes';

// --- Mock IndexedDB Implementation ---
const storeMap = new Map<string, any>();

const mockStore = {
    get: (key: string) => {
        const req: any = {};
        setTimeout(() => {
            req.result = storeMap.get(key);
            if (req.onsuccess) req.onsuccess();
        }, 1);
        return req;
    },
    put: (val: any) => {
        const req: any = {};
        setTimeout(() => {
            storeMap.set(val.id, val);
            if (req.onsuccess) req.onsuccess();
        }, 1);
        return req;
    },
    getAll: (range: any) => {
        const req: any = {};
        setTimeout(() => {
             // Return sorted values
             const values = Array.from(storeMap.values()).sort((a, b) => a.id.localeCompare(b.id));
             req.result = values;
             if (req.onsuccess) req.onsuccess();
        }, 1);
        return req;
    },
    clear: () => {
         storeMap.clear();
    }
};

const mockTx = {
    objectStore: (name: string) => mockStore
};

const mockDB = {
    objectStoreNames: {
        contains: () => true
    },
    createObjectStore: () => {},
    transaction: () => mockTx,
    deleteObjectStore: () => {}
};

const mockIDB = {
    open: (name: string, version: number) => {
        const req: any = {};
        setTimeout(() => {
            req.result = mockDB;
            if (req.onsuccess) req.onsuccess({ target: req });
        }, 1);
        return req;
    }
};

global.indexedDB = mockIDB as any;
global.IDBKeyRange = { bound: (l, h) => ({ lower: l, upper: h }) } as any;

// Mock Window
// We must ensure 'indexedDB' in window works
global.window = { indexedDB: mockIDB } as any;

// Mock Navigator
Object.defineProperty(global, 'navigator', {
    value: { storage: { estimate: async () => ({ usage: 0, quota: 100 }) } },
    writable: true,
    configurable: true
});

// Mock browser environment
vi.mock('$app/environment', () => ({ browser: true, dev: true, building: false, version: 'test' }));

// Mock Logger
vi.mock('./logger', () => ({
    logger: {
        log: vi.fn(),
        warn: vi.fn(),
        error: vi.fn((...args) => console.error('LOGGER ERROR', ...args)),
    }
}));

// --- Test ---

let storageService: any;

function generateKlines(count: number, startTimestamp: number): Kline[] {
    const klines: Kline[] = [];
    for (let i = 0; i < count; i++) {
        klines.push({
            time: startTimestamp + i * 60000,
            open: new Decimal(100 + i),
            high: new Decimal(105 + i),
            low: new Decimal(95 + i),
            close: new Decimal(102 + i),
            volume: new Decimal(1000 + i)
        });
    }
    return klines;
}

describe('StorageService Optimization', () => {
    const symbol = 'BTCUSDT';
    const tf = '1m';

    beforeAll(async () => {
        const mod = await import('./storageService');
        storageService = mod.storageService;
        // Force support since we mocked everything
        (storageService as any).isSupported = true;
        await storageService.clearAll();
    });

    it('saves new data correctly', async () => {
        const klines = generateKlines(1000, 1600000000000);
        await storageService.saveKlines(symbol, tf, klines);

        const stored = await storageService.getKlines(symbol, tf);
        expect(stored.length).toBe(1000);
        expect(stored[0].time).toBe(1600000000000);
    });

    it('updates existing data efficiently without duplicates', async () => {
        const klines = generateKlines(1000, 1600000000000);
        await storageService.saveKlines(symbol, tf, klines);

        const storedBefore = await storageService.getKlines(symbol, tf);
        const lastCandle = storedBefore[storedBefore.length - 1];

        const updateCandle: Kline[] = [{
            time: lastCandle.time,
            open: new Decimal(999),
            high: new Decimal(999),
            low: new Decimal(999),
            close: new Decimal(999),
            volume: new Decimal(999)
        }];

        await storageService.saveKlines(symbol, tf, updateCandle);

        const storedAfter = await storageService.getKlines(symbol, tf);

        expect(storedAfter.length).toBe(1000);
        expect(storedAfter[999].close.toNumber()).toBe(999);
    });

    it('handles new chunks correctly', async () => {
         const futureTime = 1600000000000 + 60000000 * 5;
         const newChunkCandle = generateKlines(1, futureTime);

         await storageService.saveKlines(symbol, tf, newChunkCandle);

         const stored = await storageService.getKlines(symbol, tf);
         expect(stored.length).toBe(1001);
         expect(stored[stored.length - 1].time).toBe(futureTime);
    });
});
