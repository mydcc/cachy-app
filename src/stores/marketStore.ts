import { writable } from 'svelte/store';
import { Decimal } from 'decimal.js';

export interface TradeData {
    time: number;
    price: Decimal;
    quantity: Decimal;
    side: 'buy' | 'sell';
    value: Decimal; // price * quantity
}

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
    kline?: {
        open: Decimal;
        high: Decimal;
        low: Decimal;
        close: Decimal;
        volume: Decimal;
        time: number;
    };
    trades?: TradeData[];
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
        updateTrades: (symbol: string, newTrades: { t: number, p: string, v: string, s: string }[]) => {
            update(store => {
                const current = store[symbol] || { symbol, lastPrice: null, indexPrice: null, fundingRate: null, nextFundingTime: null };
                const currentTrades = current.trades || [];

                const processedTrades: TradeData[] = newTrades.map(t => {
                    const price = new Decimal(t.p);
                    const quantity = new Decimal(t.v);
                    return {
                        time: t.t, // Assumes pre-parsed timestamp
                        price,
                        quantity,
                        side: t.s as 'buy' | 'sell',
                        value: price.times(quantity)
                    };
                });

                // Prepend new trades (newest first)
                let updatedTrades = [...processedTrades, ...currentTrades];

                // Keep buffer size limited (e.g. 100) to avoid memory issues
                if (updatedTrades.length > 100) {
                    updatedTrades = updatedTrades.slice(0, 100);
                }

                return {
                    ...store,
                    [symbol]: {
                        ...current,
                        trades: updatedTrades
                    }
                };
            });
        },
        updateTicker: (symbol: string, data: { lastPrice: string, high: string, low: string, vol: string, quoteVol: string, change: string, open: string }) => {
            update(store => {
                const current = store[symbol] || { symbol, lastPrice: null, indexPrice: null, fundingRate: null, nextFundingTime: null };

                // Calculate percentage change manually to be safe
                // (Last - Open) / Open * 100
                const last = new Decimal(data.lastPrice);
                const open = new Decimal(data.open);
                let pct = new Decimal(0);
                if (!open.isZero()) {
                    pct = last.minus(open).div(open).times(100);
                }

                return {
                    ...store,
                    [symbol]: {
                        ...current,
                        lastPrice: last,
                        highPrice: new Decimal(data.high),
                        lowPrice: new Decimal(data.low),
                        volume: new Decimal(data.vol),
                        quoteVolume: new Decimal(data.quoteVol),
                        priceChangePercent: pct
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
        updateKline: (symbol: string, data: { o: string, h: string, l: string, c: string, b: string, t: number }) => {
            update(store => {
                const current = store[symbol] || { symbol, lastPrice: null, indexPrice: null, fundingRate: null, nextFundingTime: null };
                return {
                    ...store,
                    [symbol]: {
                        ...current,
                        kline: {
                            open: new Decimal(data.o),
                            high: new Decimal(data.h),
                            low: new Decimal(data.l),
                            close: new Decimal(data.c),
                            volume: new Decimal(data.b),
                            time: data.t
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
