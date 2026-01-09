import { writable } from 'svelte/store';
import { Decimal } from 'decimal.js';
import { parseTimestamp } from '../utils/utils';

export interface Position {
    positionId: string;
    symbol: string;
    side: 'long' | 'short';
    size: Decimal;
    entryPrice: Decimal;
    leverage: Decimal;
    unrealizedPnl: Decimal;
    margin: Decimal;
    marginMode: string;
    liquidationPrice: Decimal;
    markPrice: Decimal;
    breakEvenPrice: Decimal;
}

export interface OpenOrder {
    orderId: string;
    symbol: string;
    side: 'buy' | 'sell';
    type: 'limit' | 'market';
    price: Decimal;
    amount: Decimal;
    filled: Decimal;
    status: string;
    timestamp: number;
}

export interface Asset {
    currency: string;
    available: Decimal;
    margin: Decimal;
    frozen: Decimal;
    total: Decimal;
}

export interface AccountState {
    positions: Position[];
    openOrders: OpenOrder[];
    assets: Asset[];
}

const initialState: AccountState = {
    positions: [],
    openOrders: [],
    assets: []
};

function createAccountStore() {
    const { subscribe, set, update } = writable<AccountState>(initialState);

    return {
        subscribe,
        set,
        update, // Expose update
        reset: () => set(initialState),

        // WS Actions
        updatePositionFromWs: (data: any) => {
             update(store => {
                const currentPositions = [...store.positions];
                const index = currentPositions.findIndex(p => String(p.positionId) === String(data.positionId));
                
                if (data.event === 'CLOSE') {
                    if (index !== -1) {
                        currentPositions.splice(index, 1);
                    }
                } else {
                    // OPEN or UPDATE
                    const newPos: Position = {
                        positionId: data.positionId,
                        symbol: data.symbol,
                        side: data.side ? data.side.toLowerCase() : 'long', 
                        size: new Decimal(data.qty || 0),
                        entryPrice: new Decimal(data.averagePrice || data.avgOpenPrice || 0), 
                        leverage: new Decimal(data.leverage || 0),
                        unrealizedPnl: new Decimal(data.unrealizedPNL || 0),
                        margin: new Decimal(data.margin || 0),
                        marginMode: data.marginMode ? data.marginMode.toLowerCase() : 'cross',
                        liquidationPrice: new Decimal(data.liqPrice || data.liquidationPrice || 0),
                        markPrice: new Decimal(data.markPrice || 0),
                        breakEvenPrice: new Decimal(0)
                    };

                    if (index !== -1) {
                        // Merge with existing to preserve missing fields
                        const existing = currentPositions[index];
                        if (newPos.entryPrice.isZero()) newPos.entryPrice = existing.entryPrice;
                        if (newPos.liquidationPrice.isZero()) newPos.liquidationPrice = existing.liquidationPrice;
                        if (newPos.markPrice.isZero()) newPos.markPrice = existing.markPrice;

                        newPos.breakEvenPrice = existing.breakEvenPrice;
                        if (!data.side) newPos.side = existing.side;
                        
                        currentPositions[index] = newPos;
                    } else {
                        currentPositions.push(newPos);
                    }
                }
                return { ...store, positions: currentPositions };
            });
        },
        updateOrderFromWs: (data: any) => {
            update(store => {
                const currentOrders = [...store.openOrders];
                const index = currentOrders.findIndex(o => String(o.orderId) === String(data.orderId));
                
                const isClosed = ['FILLED', 'CANCELED', 'PART_FILLED_CANCELED'].includes(data.orderStatus);
                
                if (isClosed) {
                    if (index !== -1) {
                        currentOrders.splice(index, 1);
                    }
                } else {
                    // Update or Create
                    const newOrder: OpenOrder = {
                        orderId: data.orderId,
                        symbol: data.symbol,
                        side: data.side ? data.side.toLowerCase() : 'buy',
                        type: data.type ? data.type.toLowerCase() : 'limit',
                        price: new Decimal(data.price || 0),
                        amount: new Decimal(data.qty || 0),
                        filled: new Decimal(data.dealAmount || 0),
                        status: data.orderStatus,
                        timestamp: parseTimestamp(data.ctime) || Date.now()
                    };

                    if (index !== -1) {
                        currentOrders[index] = newOrder;
                    } else {
                        currentOrders.push(newOrder);
                    }
                }
                return { ...store, openOrders: currentOrders };
            });
        },
        updateBalanceFromWs: (data: any) => {
             update(store => {
                 if (data.coin === 'USDT') {
                     const currentAssets = [...store.assets];
                     const idx = currentAssets.findIndex(a => a.currency === 'USDT');
                     
                     const newAsset = {
                         currency: 'USDT',
                         available: new Decimal(data.available || 0),
                         margin: new Decimal(data.margin || 0),
                         frozen: new Decimal(data.frozen || 0),
                         total: new Decimal(data.available || 0).plus(new Decimal(data.margin || 0)).plus(new Decimal(data.frozen || 0))
                     };

                     if (idx !== -1) {
                         currentAssets[idx] = newAsset;
                     } else {
                         currentAssets.push(newAsset);
                     }
                     
                     return { ...store, assets: currentAssets };
                 }
                 return store;
             });
        }
    };
}

export const accountStore = createAccountStore();
