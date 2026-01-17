import { writable } from "svelte/store";
import { Decimal } from "decimal.js";
import { browser } from "$app/environment";

export interface MarketData {
  symbol: string;
  lastPrice: Decimal | null;
  indexPrice: Decimal | null;
  fundingRate: Decimal | null;
  nextFundingTime: number | null; // Unix timestamp in ms
  depth?: {
    bids: [string, string][]; // [price, qty]
    asks: [string, string][];
  };
  highPrice?: Decimal | null;
  lowPrice?: Decimal | null;
  volume?: Decimal | null;
  quoteVolume?: Decimal | null;
  priceChangePercent?: Decimal | null;
  klines: Record<
    string,
    {
      open: Decimal;
      high: Decimal;
      low: Decimal;
      close: Decimal;
      volume: Decimal;
      time: number;
    }
  >;
}

export type WSStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "error"
  | "reconnecting";

// LRU Cache Configuration
const MAX_CACHE_SIZE = 120;
const TTL_MS = 10 * 60 * 1000; // 10 minutes

interface CacheMetadata {
  lastAccessed: number;
  createdAt: number;
}

const cacheMetadata = new Map<string, CacheMetadata>();
let cleanupIntervalId: any = null;

// Helper: Touch symbol to update LRU
function touchSymbol(symbol: string) {
  const now = Date.now();
  const existing = cacheMetadata.get(symbol);
  cacheMetadata.set(symbol, {
    lastAccessed: now,
    createdAt: existing?.createdAt || now,
  });
}

// Helper: Evict LRU symbol
function evictLRU(currentStore: Record<string, MarketData>): string | null {
  if (cacheMetadata.size === 0) return null;

  // Find oldest by lastAccessed
  let oldest: string | null = null;
  let oldestTime = Infinity;

  cacheMetadata.forEach((meta, symbol) => {
    if (meta.lastAccessed < oldestTime) {
      oldestTime = meta.lastAccessed;
      oldest = symbol;
    }
  });

  if (oldest) {
    cacheMetadata.delete(oldest);
    return oldest;
  }
  return null;
}

// Helper: Cleanup stale symbols
function cleanupStaleSymbols(
  currentStore: Record<string, MarketData>,
): string[] {
  const now = Date.now();
  const stale: string[] = [];

  cacheMetadata.forEach((meta, symbol) => {
    if (now - meta.lastAccessed > TTL_MS) {
      stale.push(symbol);
    }
  });

  stale.forEach((symbol) => cacheMetadata.delete(symbol));
  return stale;
}

// Helper: Enforce cache size limit
function enforceCacheLimit(
  currentStore: Record<string, MarketData>,
): Record<string, MarketData> {
  let store = { ...currentStore };

  while (Object.keys(store).length > MAX_CACHE_SIZE) {
    const toEvict = evictLRU(store);
    if (!toEvict) break;
    delete store[toEvict];
  }

  return store;
}

function createMarketStore() {
  const { subscribe, update, set } = writable<Record<string, MarketData>>({});

  return {
    subscribe,
    updatePrice: (
      symbol: string,
      data: {
        price: string;
        indexPrice: string;
        fundingRate: string;
        nextFundingTime: string;
      },
    ) => {
      touchSymbol(symbol); // Update LRU
      update((store) => {
        const current = store[symbol] || {
          symbol,
          lastPrice: null,
          indexPrice: null,
          fundingRate: null,
          nextFundingTime: null,
          klines: {},
        };

        // Bitunix timestamps often come as strings, ensure conversion if needed
        let nft = 0;
        if (data.nextFundingTime) {
          if (/^\d+$/.test(data.nextFundingTime)) {
            nft = parseInt(data.nextFundingTime, 10);
          } else {
            nft = new Date(data.nextFundingTime).getTime();
          }
        }

        const updated = {
          ...store,
          [symbol]: {
            ...current,
            lastPrice: new Decimal(data.price),
            indexPrice: new Decimal(data.indexPrice),
            fundingRate: new Decimal(data.fundingRate),
            nextFundingTime: nft,
          },
        };

        return enforceCacheLimit(updated);
      });
    },
    updateTicker: (
      symbol: string,
      data: {
        lastPrice: string;
        high: string;
        low: string;
        vol: string;
        quoteVol: string;
        change: string;
        open: string;
      },
    ) => {
      touchSymbol(symbol); // Update LRU
      update((store) => {
        const current = store[symbol] || {
          symbol,
          lastPrice: null,
          indexPrice: null,
          fundingRate: null,
          nextFundingTime: null,
          klines: {},
        };

        const last = new Decimal(data.lastPrice);
        const open = new Decimal(data.open);
        let pct = new Decimal(0);
        if (!open.isZero()) {
          pct = last.minus(open).div(open).times(100);
        }

        const updated = {
          ...store,
          [symbol]: {
            ...current,
            lastPrice: last,
            highPrice: new Decimal(data.high),
            lowPrice: new Decimal(data.low),
            volume: new Decimal(data.vol),
            quoteVolume: new Decimal(data.quoteVol),
            priceChangePercent: pct,
          },
        };

        return enforceCacheLimit(updated);
      });
    },
    updateDepth: (symbol: string, data: { bids: any[]; asks: any[] }) => {
      touchSymbol(symbol); // Update LRU
      update((store) => {
        const current = store[symbol] || {
          symbol,
          lastPrice: null,
          indexPrice: null,
          fundingRate: null,
          nextFundingTime: null,
          klines: {},
        };
        const updated = {
          ...store,
          [symbol]: {
            ...current,
            depth: {
              bids: data.bids,
              asks: data.asks,
            },
          },
        };

        return enforceCacheLimit(updated);
      });
    },
    updateKline: (
      symbol: string,
      timeframe: string,
      data: {
        o: string;
        h: string;
        l: string;
        c: string;
        b: string;
        t: number;
      },
    ) => {
      touchSymbol(symbol); // Update LRU
      update((store) => {
        const current = store[symbol] || {
          symbol,
          lastPrice: null,
          indexPrice: null,
          fundingRate: null,
          nextFundingTime: null,
          klines: {},
        };
        const updated = {
          ...store,
          [symbol]: {
            ...current,
            klines: {
              ...current.klines,
              [timeframe]: {
                open: new Decimal(data.o),
                high: new Decimal(data.h),
                low: new Decimal(data.l),
                close: new Decimal(data.c),
                volume: new Decimal(data.b),
                time: data.t,
              },
            },
          },
        };

        return enforceCacheLimit(updated);
      });
    },
    reset: () => {
      cacheMetadata.clear();
      set({});
    },
    // Manual cleanup for stale symbols
    cleanup: () => {
      update((store) => {
        const stale = cleanupStaleSymbols(store);
        const cleaned = { ...store };
        stale.forEach((symbol) => delete cleaned[symbol]);
        return cleaned;
      });
    },
  };
}

export const marketStore = createMarketStore();
export const wsStatusStore = writable<WSStatus>("disconnected");

// Start background cleanup task (runs every 60 seconds)
if (browser) {
  cleanupIntervalId = setInterval(() => {
    marketStore.cleanup();
  }, 60 * 1000);
}
