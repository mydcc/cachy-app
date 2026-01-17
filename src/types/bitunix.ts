export interface BitunixResponse<T> {
  code: number | string;
  msg: string;
  data: T;
}

export interface BitunixOrder {
  orderId: string;
  clientId?: string;
  symbol: string;
  type: string; // LIMIT, MARKET, etc.
  side: string; // BUY, SELL
  price?: string;
  qty?: string;
  amount?: string; // Sometimes used interchangeably
  tradeQty?: string; // Filled qty
  status?: string; // NEW, FILLED, CANCELED
  ctime?: number; // Create time
  mtime?: number; // Modify time
  leverage?: string;
  marginMode?: string;
  positionMode?: string;
  reduceOnly?: boolean;
  fee?: string;
  realizedPNL?: string;
  tpPrice?: string;
  tpStopType?: string;
  tpOrderType?: string;
  slPrice?: string;
  slStopType?: string;
  slOrderType?: string;
  avgPrice?: string;
  averagePrice?: string;
  role?: string; // MAKER, TAKER
}

export interface BitunixOrderListWrapper {
  orderList: BitunixOrder[];
  [key: string]: any; // Allow other pagination fields
}

// Normalized Internal Order Interface
export interface NormalizedOrder {
  id: string;
  orderId: string;
  clientId?: string;
  symbol: string;
  type: string;
  side: string;
  price: number;
  amount: number;
  filled: number;
  status: string;
  time: number;
  mtime?: number;
  leverage?: string;
  marginMode?: string;
  positionMode?: string;
  reduceOnly?: boolean;
  fee: number;
  realizedPNL: number;
  tpPrice?: string;
  tpStopType?: string;
  tpOrderType?: string;
  slPrice?: string;
  slStopType?: string;
  slOrderType?: string;
  avgPrice?: number;
  role?: string;
}

export interface BitunixOrderPayload {
  symbol: string;
  side: string;
  type: string;
  qty: string | number;
  price?: string | number;
  reduceOnly?: boolean;
  leverage?: string | number;
  [key: string]: any;
}

// WebSocket Types
export interface BitunixWSMessage {
  op?: string;
  code?: number | string;
  msg?: string;
  ch?: string; // Channel
  symbol?: string;
  data?: any; // Generic data payload depending on channel
  pong?: number;
  event?: string; // e.g. "login"
}

export interface BitunixPriceData {
  mp: string; // Market Price
  ip: string; // Index Price
  fr: string; // Funding Rate
  nft: number | string; // Next Funding Time
}

export interface BitunixTickerData {
  la: string; // Last
  h: string; // High
  l: string; // Low
  b: string; // Vol
  q: string; // Quote Vol
  r: string; // Change
  o: string; // Open
}
