import { writable } from 'svelte/store';

export interface Position {
    symbol: string;
    side: string; // 'LONG' or 'SHORT'
    leverage: number;
    size: number;
    entryPrice: number;
    unrealizedPnL: number;
    marginMode: string;
    margin: number;
}

export interface AccountInfo {
    available: number;
    margin: number;
    totalUnrealizedPnL: number;
    marginCoin: string;
}

export interface Order {
    orderId: string;
    symbol: string;
    side: string;
    type: string;
    price: number;
    qty: number;
    status: string;
    time: number;
}

function createAccountStore() {
    const { subscribe, set, update } = writable({
        positions: [] as Position[],
        openOrders: [] as Order[],
        historyOrders: [] as Order[],
        accountInfo: {
            available: 0,
            margin: 0,
            totalUnrealizedPnL: 0,
            marginCoin: 'USDT'
        } as AccountInfo,
        lastUpdated: 0
    });

    return {
        subscribe,
        setPositions: (positions: Position[]) => update(s => ({ ...s, positions, lastUpdated: Date.now() })),
        setOpenOrders: (openOrders: Order[]) => update(s => ({ ...s, openOrders, lastUpdated: Date.now() })),
        setHistoryOrders: (historyOrders: Order[]) => update(s => ({ ...s, historyOrders, lastUpdated: Date.now() })),
        setAccountInfo: (accountInfo: AccountInfo) => update(s => ({ ...s, accountInfo, lastUpdated: Date.now() })),
        updatePosition: (updatedPosition: Position) => update(s => {
            const index = s.positions.findIndex(p => p.symbol === updatedPosition.symbol && p.side === updatedPosition.side);
            if (index !== -1) {
                const newPositions = [...s.positions];
                newPositions[index] = updatedPosition;
                return { ...s, positions: newPositions, lastUpdated: Date.now() };
            } else {
                return { ...s, positions: [...s.positions, updatedPosition], lastUpdated: Date.now() };
            }
        }),
        removePosition: (symbol: string, side: string) => update(s => ({
             ...s,
             positions: s.positions.filter(p => !(p.symbol === symbol && p.side === side)),
             lastUpdated: Date.now()
        })),
        reset: () => set({
            positions: [],
            openOrders: [],
            historyOrders: [],
            accountInfo: { available: 0, margin: 0, totalUnrealizedPnL: 0, marginCoin: 'USDT' },
            lastUpdated: Date.now()
        })
    };
}

export const accountStore = createAccountStore();
