import { writable, get } from 'svelte/store';
import { marketStore, wsStatusStore } from '../stores/marketStore';
import { accountStore } from '../stores/accountStore';
import { settingsStore } from '../stores/settingsStore';
import { CONSTANTS } from '../lib/constants';
import CryptoJS from 'crypto-js';

const WS_PUBLIC_URL = CONSTANTS.BITUNIX_WS_PUBLIC_URL || 'wss://fapi.bitunix.com/public/';
const WS_PRIVATE_URL = CONSTANTS.BITUNIX_WS_PRIVATE_URL || 'wss://fapi.bitunix.com/private/';

const PING_INTERVAL = 15000; // 15 seconds
const RECONNECT_DELAY = 3000; // 3 seconds

interface Subscription {
    symbol: string;
    channel: string;
}

class BitunixWebSocketService {
    private wsPublic: WebSocket | null = null;
    private wsPrivate: WebSocket | null = null;
    
    private pingTimerPublic: any = null;
    private pingTimerPrivate: any = null;

    private publicSubscriptions: Set<string> = new Set();
    
    private reconnectTimerPublic: any = null;
    private reconnectTimerPrivate: any = null;

    private isReconnectingPublic = false;
    private isReconnectingPrivate = false;
    
    private isAuthenticated = false;

    constructor() {}

    connect() {
        this.connectPublic();
        this.connectPrivate();
    }

    private connectPublic() {
        if (this.reconnectTimerPublic) {
            clearTimeout(this.reconnectTimerPublic);
            this.reconnectTimerPublic = null;
        }

        if (this.wsPublic && (this.wsPublic.readyState === WebSocket.OPEN || this.wsPublic.readyState === WebSocket.CONNECTING)) {
            return;
        }

        wsStatusStore.set('connecting');
        console.log('Connecting to Bitunix Public WebSocket...');
        this.wsPublic = new WebSocket(WS_PUBLIC_URL);

        this.wsPublic.onopen = () => {
            console.log('Bitunix Public WebSocket connected.');
            wsStatusStore.set('connected');
            this.isReconnectingPublic = false;
            if (this.reconnectTimerPublic) {
                 clearTimeout(this.reconnectTimerPublic);
                 this.reconnectTimerPublic = null;
            }
            if (this.wsPublic) {
                this.startHeartbeat(this.wsPublic, 'public');
            }
            this.resubscribePublic();
        };

        this.wsPublic.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                this.handleMessage(message);
            } catch (e) {
                console.error('Error parsing Public WS message:', e);
            }
        };

        this.wsPublic.onclose = () => {
            console.log('Bitunix Public WebSocket closed.');
            this.stopHeartbeat('public');
            this.scheduleReconnect('public');
        };

        this.wsPublic.onerror = (error) => {
            console.error('Bitunix Public WebSocket error:', error);
        };
    }

    private connectPrivate() {
        const settings = get(settingsStore);
        // Assuming apiKeys structure.
        const apiKey = settings.apiKeys?.bitunix?.key;
        const apiSecret = settings.apiKeys?.bitunix?.secret;

        if (!apiKey || !apiSecret) {
            console.log("Skipping Bitunix Private WS: No API keys.");
            return;
        }

        if (this.reconnectTimerPrivate) {
            clearTimeout(this.reconnectTimerPrivate);
            this.reconnectTimerPrivate = null;
        }

        if (this.wsPrivate && (this.wsPrivate.readyState === WebSocket.OPEN || this.wsPrivate.readyState === WebSocket.CONNECTING)) {
            return;
        }

        console.log('Connecting to Bitunix Private WebSocket...');
        this.wsPrivate = new WebSocket(WS_PRIVATE_URL);

        this.wsPrivate.onopen = () => {
            console.log('Bitunix Private WebSocket connected.');
            this.isReconnectingPrivate = false;
             if (this.reconnectTimerPrivate) {
                 clearTimeout(this.reconnectTimerPrivate);
                 this.reconnectTimerPrivate = null;
            }
            if (this.wsPrivate) {
                this.startHeartbeat(this.wsPrivate, 'private');
            }
            this.login(apiKey, apiSecret);
        };

        this.wsPrivate.onmessage = (event) => {
             try {
                const message = JSON.parse(event.data);
                this.handleMessage(message);
            } catch (e) {
                console.error('Error parsing Private WS message:', e);
            }
        };

        this.wsPrivate.onclose = () => {
             console.log('Bitunix Private WebSocket closed.');
             this.isAuthenticated = false;
             this.stopHeartbeat('private');
             this.scheduleReconnect('private');
        };
        
        this.wsPrivate.onerror = (error) => {
            console.error('Bitunix Private WebSocket error:', error);
        };
    }

    private scheduleReconnect(type: 'public' | 'private') {
        if (type === 'public') {
            if (this.isReconnectingPublic) return;
            this.isReconnectingPublic = true;
            if (this.reconnectTimerPublic) clearTimeout(this.reconnectTimerPublic);
            this.reconnectTimerPublic = setTimeout(() => this.connectPublic(), RECONNECT_DELAY);
        } else {
            if (this.isReconnectingPrivate) return;
            this.isReconnectingPrivate = true;
            if (this.reconnectTimerPrivate) clearTimeout(this.reconnectTimerPrivate);
            this.reconnectTimerPrivate = setTimeout(() => this.connectPrivate(), RECONNECT_DELAY);
        }
    }

    private startHeartbeat(ws: WebSocket, type: 'public' | 'private') {
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
        
        if (type === 'public') this.pingTimerPublic = timer;
        else this.pingTimerPrivate = timer;
    }

    private stopHeartbeat(type: 'public' | 'private') {
        if (type === 'public') {
             if (this.pingTimerPublic) {
                clearInterval(this.pingTimerPublic);
                this.pingTimerPublic = null;
            }
        } else {
            if (this.pingTimerPrivate) {
                clearInterval(this.pingTimerPrivate);
                this.pingTimerPrivate = null;
            }
        }
    }

    private login(apiKey: string, apiSecret: string) {
        if (!this.wsPrivate || this.wsPrivate.readyState !== WebSocket.OPEN) return;

        const nonce = Math.random().toString(36).substring(2, 15);
        const timestamp = Math.floor(Date.now() / 1000);
        
        // SHA256(nonce + timestamp + apiKey)
        const first = CryptoJS.SHA256(nonce + timestamp + apiKey).toString(CryptoJS.enc.Hex);
        // SHA256(first + apiSecret)
        const sign = CryptoJS.SHA256(first + apiSecret).toString(CryptoJS.enc.Hex);

        const payload = {
            op: 'login',
            args: [{
                apiKey,
                timestamp,
                nonce,
                sign
            }]
        };
        
        console.log('Sending Login to Bitunix...');
        this.wsPrivate.send(JSON.stringify(payload));
    }

    private handleMessage(message: any) {
        if (message.event === 'login') {
            if (message.code === 0 || message.msg === 'success') {
                console.log('Bitunix Login Successful.');
                this.isAuthenticated = true;
                this.subscribePrivate();
            } else {
                console.error('Bitunix Login Failed:', message);
            }
            return;
        }

        if (message.op === 'ping') return;
        if (message.op === 'pong' || message.pong) return;

        // Handle Data Push
        // Public Channels
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
        } else if (message.ch === 'ticker') {
            const symbol = message.symbol;
            const data = message.data;
            if (symbol && data) {
                marketStore.updateTicker(symbol, {
                    lastPrice: data.la,
                    high: data.h,
                    low: data.l,
                    vol: data.b,
                    quoteVol: data.q,
                    change: data.r,
                    open: data.o
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

        // Private Channels
        else if (message.ch === 'position') {
            const data = message.data;
            if (data) {
                // If it is an array (Snapshot), iterate
                if (Array.isArray(data)) {
                     data.forEach(item => accountStore.updatePositionFromWs(item));
                } else {
                     accountStore.updatePositionFromWs(data);
                }
            }
        } else if (message.ch === 'order') {
            const data = message.data;
            if (data) {
                if (Array.isArray(data)) {
                    data.forEach(item => accountStore.updateOrderFromWs(item));
                } else {
                    accountStore.updateOrderFromWs(data);
                }
            }
        } else if (message.ch === 'wallet') {
            const data = message.data;
            if (data) {
                if (Array.isArray(data)) {
                    data.forEach(item => accountStore.updateBalanceFromWs(item));
                } else {
                     accountStore.updateBalanceFromWs(data);
                }
            }
        }
    }

    subscribe(symbol: string, channel: 'price' | 'depth_book5' | 'ticker') {
        if (!symbol) return;
        const normalizedSymbol = symbol.toUpperCase();
        const subKey = `${channel}:${normalizedSymbol}`;

        if (this.publicSubscriptions.has(subKey)) return;

        this.publicSubscriptions.add(subKey);

        if (this.wsPublic && this.wsPublic.readyState === WebSocket.OPEN) {
            this.sendSubscribe(this.wsPublic, normalizedSymbol, channel);
        } else {
            this.connectPublic();
        }
    }

    unsubscribe(symbol: string, channel: 'price' | 'depth_book5' | 'ticker') {
        const normalizedSymbol = symbol.toUpperCase();
        const subKey = `${channel}:${normalizedSymbol}`;
        
        if (this.publicSubscriptions.has(subKey)) {
            this.publicSubscriptions.delete(subKey);
            if (this.wsPublic && this.wsPublic.readyState === WebSocket.OPEN) {
                this.sendUnsubscribe(this.wsPublic, normalizedSymbol, channel);
            }
        }
    }

    private subscribePrivate() {
        if (!this.isAuthenticated || !this.wsPrivate) return;
        
        const channels = ['position', 'order', 'wallet'];
        const args = channels.map(ch => ({ ch }));
        
        const payload = {
            op: 'subscribe',
            args: args
        };
        this.wsPrivate.send(JSON.stringify(payload));
    }

    private sendSubscribe(ws: WebSocket, symbol: string, channel: string) {
        const payload = {
            op: 'subscribe',
            args: [{ symbol, ch: channel }]
        };
        ws.send(JSON.stringify(payload));
    }

    private sendUnsubscribe(ws: WebSocket, symbol: string, channel: string) {
        const payload = {
            op: 'unsubscribe',
            args: [{ symbol, ch: channel }]
        };
        ws.send(JSON.stringify(payload));
    }

    private resubscribePublic() {
        this.publicSubscriptions.forEach(subKey => {
            const [channel, symbol] = subKey.split(':');
            if (this.wsPublic && this.wsPublic.readyState === WebSocket.OPEN) {
                this.sendSubscribe(this.wsPublic, symbol, channel);
            }
        });
    }
}

export const bitunixWs = new BitunixWebSocketService();
