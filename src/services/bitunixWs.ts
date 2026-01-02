import { writable, get } from 'svelte/store';
import { marketStore, wsStatusStore } from '../stores/marketStore';
import { accountStore, type Position } from '../stores/accountStore';
import CryptoJS from 'crypto-js';

const WS_URL = 'wss://fapi.bitunix.com/public/'; // Public URL (can handle login for private ch?)
// Documentation says:
// Public: wss://fapi.bitunix.com/public/
// Private: wss://fapi.bitunix.com/private/
// It's better to use separate connections or switch URL if needed.
// However, the "Login" op documentation is under "WebSocket -> Prepare -> WebSocket", and usually exchanges allow login on the same connection or require a specific endpoint.
// The doc mentions "Websocket Domain wss://fapi.bitunix.com/private/ Main Domain, Private channel".
// It is safer to use the PRIVATE endpoint if we intend to use private channels.
// But we also need public data (price, depth).
// Typically, private endpoints also support public channels, or we need two connections.
// Let's try to use the public endpoint for everything first, but if it fails, we might need two connections.
// Actually, reading the doc again:
// "Websocket Domain wss://fapi.bitunix.com/public/ Main Domain, Public channel"
// "Websocket Domain wss://fapi.bitunix.com/private/ Main Domain, Private channel"
// This strongly suggests we need a separate connection for private data.

const PUBLIC_WS_URL = 'wss://fapi.bitunix.com/public/';
const PRIVATE_WS_URL = 'wss://fapi.bitunix.com/private/';
const PING_INTERVAL = 15000; // 15 seconds
const RECONNECT_DELAY = 3000; // 3 seconds

interface Subscription {
    symbol?: string;
    channel: string;
    isPrivate?: boolean;
}

class BitunixWebSocketService {
    private publicWs: WebSocket | null = null;
    private privateWs: WebSocket | null = null;

    private publicPingTimer: any = null;
    private privatePingTimer: any = null;

    private subscriptions: Map<string, Subscription> = new Map();
    
    private isReconnectingPublic = false;
    private isReconnectingPrivate = false;
    private publicReconnectTimer: any = null;
    private privateReconnectTimer: any = null;

    private apiKey: string | null = null;
    private apiSecret: string | null = null;
    private isAuthenticated = false;

    constructor() {}

    init(apiKey?: string, apiSecret?: string) {
        if (apiKey && apiSecret) {
            this.apiKey = apiKey;
            this.apiSecret = apiSecret;
        }
        this.connectPublic();
        if (this.apiKey && this.apiSecret) {
            this.connectPrivate();
        }
    }

    setCredentials(apiKey: string, apiSecret: string) {
        this.apiKey = apiKey;
        this.apiSecret = apiSecret;
        if (!this.privateWs || this.privateWs.readyState === WebSocket.CLOSED) {
            this.connectPrivate();
        } else if (this.privateWs.readyState === WebSocket.OPEN && !this.isAuthenticated) {
            this.authenticate();
        }
    }

    private connectPublic() {
        if (this.publicWs && (this.publicWs.readyState === WebSocket.OPEN || this.publicWs.readyState === WebSocket.CONNECTING)) {
            return;
        }

        console.log('Connecting to Bitunix Public WebSocket...');
        this.publicWs = new WebSocket(PUBLIC_WS_URL);

        this.publicWs.onopen = () => {
            console.log('Bitunix Public WebSocket connected.');
            wsStatusStore.set('connected'); // Simplified status
            this.isReconnectingPublic = false;
            this.startHeartbeat(this.publicWs, 'public');
            this.resubscribePublic();
        };

        this.publicWs.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                this.handleMessage(message, false);
            } catch (e) {
                console.error('Error parsing Public WS message:', e);
            }
        };

        this.publicWs.onclose = () => {
            console.log('Bitunix Public WebSocket closed.');
            wsStatusStore.set('disconnected');
            this.stopHeartbeat('public');
            this.scheduleReconnect('public');
        };

        this.publicWs.onerror = (error) => {
            console.error('Bitunix Public WebSocket error:', error);
            wsStatusStore.set('error');
        };
    }

    private connectPrivate() {
        if (!this.apiKey || !this.apiSecret) return;
        if (this.privateWs && (this.privateWs.readyState === WebSocket.OPEN || this.privateWs.readyState === WebSocket.CONNECTING)) {
            return;
        }

        console.log('Connecting to Bitunix Private WebSocket...');
        this.privateWs = new WebSocket(PRIVATE_WS_URL);

        this.privateWs.onopen = () => {
            console.log('Bitunix Private WebSocket connected.');
            this.isReconnectingPrivate = false;
            this.startHeartbeat(this.privateWs, 'private');
            this.authenticate();
        };

        this.privateWs.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                this.handleMessage(message, true);
            } catch (e) {
                console.error('Error parsing Private WS message:', e);
            }
        };

        this.privateWs.onclose = () => {
            console.log('Bitunix Private WebSocket closed.');
            this.isAuthenticated = false;
            this.stopHeartbeat('private');
            this.scheduleReconnect('private');
        };

        this.privateWs.onerror = (error) => {
            console.error('Bitunix Private WebSocket error:', error);
        };
    }

    private scheduleReconnect(type: 'public' | 'private') {
        if (type === 'public') {
            if (this.isReconnectingPublic) return;
            this.isReconnectingPublic = true;
            if (this.publicReconnectTimer) clearTimeout(this.publicReconnectTimer);
            this.publicReconnectTimer = setTimeout(() => this.connectPublic(), RECONNECT_DELAY);
        } else {
            if (this.isReconnectingPrivate) return;
            this.isReconnectingPrivate = true;
            if (this.privateReconnectTimer) clearTimeout(this.privateReconnectTimer);
            this.privateReconnectTimer = setTimeout(() => this.connectPrivate(), RECONNECT_DELAY);
        }
    }

    private startHeartbeat(ws: WebSocket | null, type: 'public' | 'private') {
        this.stopHeartbeat(type);
        const timer = setInterval(() => {
            if (ws && ws.readyState === WebSocket.OPEN) {
                const pingPayload = {
                    op: 'ping',
                    ping: Math.floor(Date.now() / 1000)
                };
                ws.send(JSON.stringify(pingPayload));
            }
        }, PING_INTERVAL);
        
        if (type === 'public') this.publicPingTimer = timer;
        else this.privatePingTimer = timer;
    }

    private stopHeartbeat(type: 'public' | 'private') {
        if (type === 'public' && this.publicPingTimer) {
            clearInterval(this.publicPingTimer);
            this.publicPingTimer = null;
        } else if (type === 'private' && this.privatePingTimer) {
            clearInterval(this.privatePingTimer);
            this.privatePingTimer = null;
        }
    }

    private authenticate() {
        if (!this.privateWs || this.privateWs.readyState !== WebSocket.OPEN || !this.apiKey || !this.apiSecret) return;

        const timestamp = Math.floor(Date.now() / 1000); // Seconds
        const nonce = Math.random().toString(36).substring(2, 15);
        
        // Sign generation: 
        // 1. sign = sha256(nonce + timestamp + apiKey)
        // 2. sign = sha256(sign + secretKey)
        
        const firstHash = CryptoJS.SHA256(nonce + timestamp + this.apiKey).toString(CryptoJS.enc.Hex);
        const signature = CryptoJS.SHA256(firstHash + this.apiSecret).toString(CryptoJS.enc.Hex);

        const loginPayload = {
            op: 'login',
            args: [{
                apiKey: this.apiKey,
                timestamp: timestamp,
                nonce: nonce,
                sign: signature
            }]
        };

        this.privateWs.send(JSON.stringify(loginPayload));
    }

    private handleMessage(message: any, isPrivate: boolean) {
        if (message.op === 'ping') return;
        if (message.op === 'pong' || message.pong) return;

        if (isPrivate) {
            if (message.event === 'login') {
                if (message.code === '0' || message.msg === 'success') { // Check success criteria
                    console.log('Bitunix Authenticated successfully');
                    this.isAuthenticated = true;
                    this.resubscribePrivate();
                } else {
                    console.error('Bitunix Authentication failed', message);
                }
            }

            // Handle Private Data Push
            if (message.ch === 'position') {
                // message.data can be a single object or list? Docs say "Subscription data".
                // Usually for position it pushes the updated position.
                const data = message.data;
                if (data) {
                    // Update accountStore
                    // The data structure from "Push Parameters" matches our Position interface mostly
                    // data: { event: 'OPEN/UPDATE/CLOSE', positionId, symbol, side, ... }
                    
                    // We need to map it to Position interface
                    const pos: Position = {
                        symbol: data.symbol,
                        side: data.side,
                        leverage: Number(data.leverage),
                        size: Number(data.qty),
                        entryPrice: Number(data.avgOpenPrice || data.entryPrice || data.openPrice || 0), // check exact field
                        unrealizedPnL: Number(data.unrealizedPNL),
                        marginMode: data.marginMode,
                        margin: Number(data.margin)
                    };
                    
                    // Logic to update/remove based on size or event
                    // If size is 0, it's closed
                    if (Number(data.qty) === 0 || data.event === 'CLOSE') {
                        accountStore.removePosition(pos.symbol, pos.side);
                    } else {
                        accountStore.updatePosition(pos);
                    }
                }
            }
        } else {
            // Handle Public Data Push
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
                const data = message.data;
                if (symbol && data) {
                    marketStore.updateDepth(symbol, {
                        bids: data.b,
                        asks: data.a
                    });
                }
            }
        }
    }

    subscribe(symbol: string, channel: 'price' | 'depth_book5') {
        if (!symbol) return;
        const normalizedSymbol = symbol.toUpperCase();
        const subKey = `public:${channel}:${normalizedSymbol}`;

        if (this.subscriptions.has(subKey)) return;

        this.subscriptions.set(subKey, { symbol: normalizedSymbol, channel, isPrivate: false });

        if (this.publicWs && this.publicWs.readyState === WebSocket.OPEN) {
            this.sendSubscribePublic(normalizedSymbol, channel);
        } else {
            this.connectPublic();
        }
    }
    
    subscribePrivate(channel: 'position') {
         const subKey = `private:${channel}`;
         if (this.subscriptions.has(subKey)) return;
         
         this.subscriptions.set(subKey, { channel, isPrivate: true });
         
         if (this.privateWs && this.privateWs.readyState === WebSocket.OPEN && this.isAuthenticated) {
             this.sendSubscribePrivate(channel);
         } else {
             this.connectPrivate();
         }
    }

    unsubscribe(symbol: string, channel: 'price' | 'depth_book5') {
        const normalizedSymbol = symbol.toUpperCase();
        const subKey = `public:${channel}:${normalizedSymbol}`;
        
        if (this.subscriptions.has(subKey)) {
            this.subscriptions.delete(subKey);
            if (this.publicWs && this.publicWs.readyState === WebSocket.OPEN) {
                this.sendUnsubscribePublic(normalizedSymbol, channel);
            }
        }
    }

    private sendSubscribePublic(symbol: string, channel: string) {
        const payload = {
            op: 'subscribe',
            args: [{ symbol, ch: channel }]
        };
        this.publicWs?.send(JSON.stringify(payload));
    }
    
    private sendSubscribePrivate(channel: string) {
        const payload = {
            op: 'subscribe',
            args: [{ ch: channel }]
        };
        this.privateWs?.send(JSON.stringify(payload));
    }

    private sendUnsubscribePublic(symbol: string, channel: string) {
        const payload = {
            op: 'unsubscribe',
            args: [{ symbol, ch: channel }]
        };
        this.publicWs?.send(JSON.stringify(payload));
    }

    private resubscribePublic() {
        this.subscriptions.forEach((sub, key) => {
            if (!sub.isPrivate && sub.symbol) {
                this.sendSubscribePublic(sub.symbol, sub.channel);
            }
        });
    }

    private resubscribePrivate() {
        this.subscriptions.forEach((sub, key) => {
            if (sub.isPrivate) {
                this.sendSubscribePrivate(sub.channel);
            }
        });
    }
}

export const bitunixWs = new BitunixWebSocketService();
