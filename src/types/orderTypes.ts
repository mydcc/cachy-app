export const OrderType = {
    LIMIT: "LIMIT",
    MARKET: "MARKET",
    STOP_LIMIT: "STOP_LIMIT",
    STOP_MARKET: "STOP_MARKET",
    TRAILING_STOP_MARKET: "TRAILING_STOP_MARKET",
    LIQUIDATION: "LIQUIDATION"
} as const;

export type OrderType = typeof OrderType[keyof typeof OrderType];

export const OrderSide = {
    BUY: "BUY",
    SELL: "SELL"
} as const;

export type OrderSide = typeof OrderSide[keyof typeof OrderSide];

export const OrderRole = {
    MAKER: "MAKER",
    TAKER: "TAKER"
} as const;

export type OrderRole = typeof OrderRole[keyof typeof OrderRole];
