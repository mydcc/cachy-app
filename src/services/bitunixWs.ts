import { writable, get } from 'svelte/store';
import { marketStore, wsStatusStore } from '../stores/marketStore';

const WS_URL = 'wss://fapi.bitunix.com/public/';
const PING_INTERVAL = 15000; // 15 seconds
const RECONNECT_DELAY = 3000; // 3 seconds

interface Subscription {
    symbol: string;
    channel: string;
}

class BitunixWebSocketService {
    private ws: WebSocket | null = null;
    private pingTimer: any = null;
    private subscriptions: Set<string> = new Set();
    private reconnectTimer: any = null;
    private isReconnecting = false;

    constructor() {}

    connect() {
        if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
            return;
        }

        wsStatusStore.set('connecting');
        console.log('Connecting to Bitunix WebSocket...');
        this.ws = new WebSocket(WS_URL);

        this.ws.onopen = () => {
            console.log('Bitunix WebSocket connected.');
            wsStatusStore.set('connected');
            this.isReconnecting = false;
            this.startHeartbeat();
            this.resubscribe();
        };

        this.ws.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                this.handleMessage(message);
            } catch (e) {
                console.error('Error parsing WS message:', e);
            }
        };

        this.ws.onclose = () => {
            console.log('Bitunix WebSocket closed.');
            wsStatusStore.set('disconnected');
            this.stopHeartbeat();
            this.scheduleReconnect();
        };

        this.ws.onerror = (error) => {
            console.error('Bitunix WebSocket error:', error);
            wsStatusStore.set('error');
            // onError will usually trigger onClose, so we handle reconnect there
        };
    }

    private scheduleReconnect() {
        if (this.isReconnecting) return;
        this.isReconnecting = true;

        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
        this.reconnectTimer = setTimeout(() => {
            this.connect();
        }, RECONNECT_DELAY);
    }

    private startHeartbeat() {
        this.stopHeartbeat();
        this.pingTimer = setInterval(() => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                const pingPayload = {
                    op: 'ping',
                    ping: Math.floor(Date.now() / 1000)
                };
                this.ws.send(JSON.stringify(pingPayload));
            }
        }, PING_INTERVAL);
    }

    private stopHeartbeat() {
        if (this.pingTimer) {
            clearInterval(this.pingTimer);
            this.pingTimer = null;
        }
    }

    private handleMessage(message: any) {
        if (message.op === 'ping') {
            // Server might send ping, we should pong back? Or is it response to our ping?
            // Bitunix docs say: request {op:ping}, response {op:ping, pong:..., ping:...}
            return;
        }

        if (message.op === 'pong' || message.pong) {
            // Pong received
            return;
        }

        // Handle Data Push
        if (message.ch === 'price') {
            const symbol = message.symbol;
            const data = message.data;
            if (symbol && data) {
                marketStore.updatePrice(symbol, {
                    price: data.mp,
                    indexPrice: data.ip,
                    fundingRate: data.fr,
                    nextFundingTime: data.nft
                });
            }
        } else if (message.ch === 'depth_book5') {
            const symbol = message.symbol;
            const data = message.data; // { b: [[price, qty], ...], a: [[price, qty], ...] }
            if (symbol && data) {
                marketStore.updateDepth(symbol, {
                    bids: data.b,
                    asks: data.a
                });
            }
        }
    }

    subscribe(symbol: string, channel: 'price' | 'depth_book5') {
        if (!symbol) return;
        const normalizedSymbol = symbol.toUpperCase(); // Ensure uppercase
        const subKey = `${channel}:${normalizedSymbol}`;

        if (this.subscriptions.has(subKey)) return;

        this.subscriptions.add(subKey);

        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.sendSubscribe(normalizedSymbol, channel);
        } else {
            // Connection might not be ready, connect if needed
            this.connect();
        }
    }

    unsubscribe(symbol: string, channel: 'price' | 'depth_book5') {
        const normalizedSymbol = symbol.toUpperCase();
        const subKey = `${channel}:${normalizedSymbol}`;

        if (this.subscriptions.has(subKey)) {
            this.subscriptions.delete(subKey);
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.sendUnsubscribe(normalizedSymbol, channel);
            }
        }
    }

    private sendSubscribe(symbol: string, channel: string) {
        const payload = {
            op: 'subscribe',
            args: [{ symbol, ch: channel }]
        };
        this.ws?.send(JSON.stringify(payload));
    }

    private sendUnsubscribe(symbol: string, channel: string) {
        const payload = {
            op: 'unsubscribe',
            args: [{ symbol, ch: channel }]
        };
        this.ws?.send(JSON.stringify(payload));
    }

    private resubscribe() {
        // Re-send all active subscriptions on reconnect
        this.subscriptions.forEach(subKey => {
            const [channel, symbol] = subKey.split(':');
            this.sendSubscribe(symbol, channel);
        });
    }
}

export const bitunixWs = new BitunixWebSocketService();
