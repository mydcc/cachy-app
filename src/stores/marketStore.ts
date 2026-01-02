import { writable } from 'svelte/store';
import { Decimal } from 'decimal.js';

export interface MarketData {
    symbol: string;
    lastPrice: Decimal | null;
    indexPrice: Decimal | null;
    fundingRate: Decimal | null;
    nextFundingTime: number | null; // Unix timestamp in ms
    depth?: {
        bids: [string, string][]; // [price, qty]
        asks: [string, string][];
    }
}

export type WSStatus = 'disconnected' | 'connecting' | 'connected' | 'error' | 'reconnecting';

function createMarketStore() {
    const { subscribe, update, set } = writable<Record<string, MarketData>>({});

    return {
        subscribe,
        updatePrice: (symbol: string, data: { price: string, indexPrice: string, fundingRate: string, nextFundingTime: string }) => {
            update(store => {
                const current = store[symbol] || { symbol, lastPrice: null, indexPrice: null, fundingRate: null, nextFundingTime: null };

                // Bitunix timestamps often come as strings, ensure conversion if needed
                let nft = 0;
                if (data.nextFundingTime) {
                     // Bitunix doc example says "2024-12-04T12:00:00Z" OR sometimes unix timestamp?
                     // The push data example showed: "nft": "2024-12-04T12:00:00Z"
                     // Wait, the doc Push Parameters table says "Milliseconds format of timestamp Unix, e.g. 1597026383085"
                     // BUT the example JSON showed an ISO string. "nft": "2024-12-04T12:00:00Z"
                     // We should handle both robustly.
                     if (/^\d+$/.test(data.nextFundingTime)) {
                         nft = parseInt(data.nextFundingTime, 10);
                     } else {
                         nft = new Date(data.nextFundingTime).getTime();
                     }
                }

                return {
                    ...store,
                    [symbol]: {
                        ...current,
                        lastPrice: new Decimal(data.price),
                        indexPrice: new Decimal(data.indexPrice),
                        fundingRate: new Decimal(data.fundingRate),
                        nextFundingTime: nft
                    }
                };
            });
        },
        updateDepth: (symbol: string, data: { bids: any[], asks: any[] }) => {
             update(store => {
                const current = store[symbol] || { symbol, lastPrice: null, indexPrice: null, fundingRate: null, nextFundingTime: null };
                return {
                    ...store,
                    [symbol]: {
                        ...current,
                        depth: {
                            bids: data.bids,
                            asks: data.asks
                        }
                    }
                };
            });
        },
        reset: () => set({})
    };
}

export const marketStore = createMarketStore();
export const wsStatusStore = writable<WSStatus>('disconnected');
