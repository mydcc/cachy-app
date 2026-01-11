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
                    // Prepare partial data, defaulting only if this is a NEW position
                    const existing = index !== -1 ? currentPositions[index] : null;

                    // Safety: If it's a new position, we need a side. If missing, we warn and default to long (unlikely for OPEN events)
                    // If it's an update, we use existing side if data.side is missing.
                    let side = data.side ? data.side.toLowerCase() : (existing ? existing.side : 'long');

                    const newPos: Position = {
                        positionId: data.positionId,
                        symbol: data.symbol,
                        side: side,
                        size: new Decimal(data.qty || 0),
                        entryPrice: new Decimal(data.averagePrice || data.avgOpenPrice || data.entryPrice || 0),
                        leverage: new Decimal(data.leverage || 0),
                        unrealizedPnl: new Decimal(data.unrealizedPNL || 0),
                        margin: new Decimal(data.margin || 0),
                        marginMode: data.marginMode ? data.marginMode.toLowerCase() : 'cross',
                        liquidationPrice: new Decimal(data.liquidationPrice || data.liqPrice || 0),
                        markPrice: new Decimal(data.markPrice || 0),
                        breakEvenPrice: new Decimal(data.breakEvenPrice || 0)
                    };

                    if (existing) {
                        // Merge with existing to preserve missing fields
                        if (newPos.entryPrice.isZero()) newPos.entryPrice = existing.entryPrice;

                        // Preserve calculation fields if not in payload (and payload was 0/missing)
                        if (newPos.liquidationPrice.isZero()) newPos.liquidationPrice = existing.liquidationPrice;
                        if (newPos.markPrice.isZero()) newPos.markPrice = existing.markPrice;
                        if (newPos.breakEvenPrice.isZero()) newPos.breakEvenPrice = existing.breakEvenPrice;
                        
                        // Preserve structural fields if not in payload
                        if (!data.marginMode) newPos.marginMode = existing.marginMode;
                        if (!data.leverage) newPos.leverage = existing.leverage;

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
