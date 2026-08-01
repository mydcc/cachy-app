// @vitest-environment happy-dom
import { bench, describe, vi, beforeAll } from 'vitest';
import { Decimal } from 'decimal.js';

vi.mock('$app/environment', () => ({ browser: true }));

/** What storageService actually stores: a keyed record it can sort by id. */
interface StoredRecord {
  id: string;
  [field: string]: unknown;
}

/** The slice of IDBRequest this mock implements. */
interface MockRequest<T> {
  result?: T;
  onsuccess?: (event?: { target: MockRequest<T> }) => void;
  onerror?: () => void;
}

const mockStore = new Map<string, StoredRecord>();
const mockDB = {
  transaction: () => ({
    objectStore: () => ({
      get: (key: string) => {
        const req: MockRequest<StoredRecord | undefined> = {};
        const val = mockStore.get(key);
        setTimeout(() => {
             req.result = val;
             if (req.onsuccess) req.onsuccess({ target: req });
        }, 0);
        return req;
      },
      put: (val: StoredRecord) => {
        const req: MockRequest<undefined> = {};
        mockStore.set(val.id, val);
        setTimeout(() => {
             if (req.onsuccess) req.onsuccess({ target: req });
        }, 0);
        return req;
      },
      getAll: (query?: { lower?: string; upper?: string }) => {
         const req: MockRequest<StoredRecord[]> = {};
         const results: StoredRecord[] = [];
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
    bound: (lower: IDBValidKey, upper: IDBValidKey) => ({ lower, upper }),
    lowerBound: (lower: IDBValidKey) => ({ lower }),
    upperBound: (upper: IDBValidKey) => ({ upper })
} as unknown as typeof IDBKeyRange;

window.indexedDB = {
    open: () => {
        const req: MockRequest<typeof mockDB> = {};
        setTimeout(() => {
            req.result = mockDB;
            if (req.onsuccess) req.onsuccess({ target: req });
        }, 0);
        return req;
    }
} as unknown as IDBFactory;

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
    let storageService: typeof import('../../src/services/storageService')['storageService'] | undefined;
    const symbol = 'BTCUSDT';
    const tf = '1m';
    let newKline: ReturnType<typeof generateKlines>;

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
