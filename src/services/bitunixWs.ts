import { writable, get } from 'svelte/store';
import { marketStore, wsStatusStore } from '../stores/marketStore';
import { accountStore } from '../stores/accountStore';
import { settingsStore } from '../stores/settingsStore';
import { CONSTANTS } from '../lib/constants';
import CryptoJS from 'crypto-js';

const WS_PUBLIC_URL = CONSTANTS.BITUNIX_WS_PUBLIC_URL || 'wss://fapi.bitunix.com/public/';
const WS_PRIVATE_URL = CONSTANTS.BITUNIX_WS_PRIVATE_URL || 'wss://fapi.bitunix.com/private/';

const PING_INTERVAL = 5000; // 5 seconds (more aggressive ping)
const WATCHDOG_TIMEOUT = 10000; // 10 seconds (detect silent disconnects faster)
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

    private watchdogTimerPublic: any = null;
    private watchdogTimerPrivate: any = null;

    private publicSubscriptions: Set<string> = new Set();
    
    private reconnectTimerPublic: any = null;
    private reconnectTimerPrivate: any = null;

    private isReconnectingPublic = false;
    private isReconnectingPrivate = false;
    
    private isAuthenticated = false;

    constructor() {
        if (typeof window !== 'undefined') {
            window.addEventListener('online', () => {
                console.log('Browser online detected. Reconnecting WebSockets...');
                this.connect();
            });
            window.addEventListener('offline', () => {
                console.warn('Browser offline detected. Terminating WebSockets...');
                wsStatusStore.set('disconnected');
                this.cleanup('public');
                this.cleanup('private');
                if (this.wsPublic) this.wsPublic.close();
                if (this.wsPrivate) this.wsPrivate.close();
            });
        }
    }

    connect() {
        this.connectPublic();
        this.connectPrivate();
    }

    private connectPublic() {
        if (this.wsPublic) {
             if (this.wsPublic.readyState === WebSocket.OPEN || this.wsPublic.readyState === WebSocket.CONNECTING) {
                 return;
             }
        }

        wsStatusStore.set('connecting');
        console.log('Connecting to Bitunix Public WebSocket...');

        try {
            this.wsPublic = new WebSocket(WS_PUBLIC_URL);
        } catch (e) {
            console.error('Failed to create Public WS:', e);
            this.scheduleReconnect('public');
            return;
        }

        this.wsPublic.onopen = () => {
            console.log('Bitunix Public WebSocket connected.');
            wsStatusStore.set('connected');
            this.isReconnectingPublic = false;

            if (this.wsPublic) {
                this.startHeartbeat(this.wsPublic, 'public');
                // Initialize watchdog immediately on connection
                this.resetWatchdog('public', this.wsPublic);
            }
            this.resubscribePublic();
        };

        this.wsPublic.onmessage = (event) => {
            try {
                // Reset watchdog on ANY activity
                if (this.wsPublic) this.resetWatchdog('public', this.wsPublic);

                const message = JSON.parse(event.data);
                this.handleMessage(message, 'public');
            } catch (e) {
                console.error('Error parsing Public WS message:', e);
            }
        };

        this.wsPublic.onclose = () => {
            console.log('Bitunix Public WebSocket closed.');
            this.cleanup('public');
            this.scheduleReconnect('public');
        };

        this.wsPublic.onerror = (error) => {
            console.error('Bitunix Public WebSocket error:', error);
        };
    }

    private connectPrivate() {
        const settings = get(settingsStore);
        const apiKey = settings.apiKeys?.bitunix?.key;
        const apiSecret = settings.apiKeys?.bitunix?.secret;

        if (!apiKey || !apiSecret) {
            console.log("Skipping Bitunix Private WS: No API keys found.");
            return;
        }

        if (this.wsPrivate) {
             if (this.wsPrivate.readyState === WebSocket.OPEN || this.wsPrivate.readyState === WebSocket.CONNECTING) {
                 return;
             }
        }

        console.log('Connecting to Bitunix Private WebSocket...');

        try {
            this.wsPrivate = new WebSocket(WS_PRIVATE_URL);
        } catch (e) {
            console.error('Failed to create Private WS:', e);
            this.scheduleReconnect('private');
            return;
        }

        this.wsPrivate.onopen = () => {
            console.log('Bitunix Private WebSocket connected.');
            this.isReconnectingPrivate = false;
            if (this.wsPrivate) {
                this.startHeartbeat(this.wsPrivate, 'private');
                this.resetWatchdog('private', this.wsPrivate);
            }
            this.login(apiKey, apiSecret);
        };

        this.wsPrivate.onmessage = (event) => {
             try {
                if (this.wsPrivate) this.resetWatchdog('private', this.wsPrivate);

                const message = JSON.parse(event.data);
                this.handleMessage(message, 'private');
            } catch (e) {
                console.error('Error parsing Private WS message:', e);
            }
        };

        this.wsPrivate.onclose = () => {
             console.log('Bitunix Private WebSocket closed.');
             this.isAuthenticated = false;
             this.cleanup('private');
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
            wsStatusStore.set('disconnected');
            if (this.reconnectTimerPublic) clearTimeout(this.reconnectTimerPublic);
            this.reconnectTimerPublic = setTimeout(() => {
                this.isReconnectingPublic = false;
                this.connectPublic();
            }, RECONNECT_DELAY);
        } else {
            if (this.isReconnectingPrivate) return;
            this.isReconnectingPrivate = true;
            if (this.reconnectTimerPrivate) clearTimeout(this.reconnectTimerPrivate);
            this.reconnectTimerPrivate = setTimeout(() => {
                this.isReconnectingPrivate = false;
                this.connectPrivate();
            }, RECONNECT_DELAY);
        }
    }

    private startHeartbeat(ws: WebSocket, type: 'public' | 'private') {
        // Clear existing ping timer if any (though usually handled by cleanup)
        if (type === 'public') {
            if (this.pingTimerPublic) clearInterval(this.pingTimerPublic);
        } else {
            if (this.pingTimerPrivate) clearInterval(this.pingTimerPrivate);
        }

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

    private resetWatchdog(type: 'public' | 'private', ws: WebSocket) {
        if (type === 'public') {
            if (this.watchdogTimerPublic) clearTimeout(this.watchdogTimerPublic);
            this.watchdogTimerPublic = setTimeout(() => {
                console.warn('Bitunix Public WS Watchdog Timeout. Terminating.');
                ws.close(); // Force close to trigger onclose -> reconnect
            }, WATCHDOG_TIMEOUT);
        } else {
            if (this.watchdogTimerPrivate) clearTimeout(this.watchdogTimerPrivate);
            this.watchdogTimerPrivate = setTimeout(() => {
                console.warn('Bitunix Private WS Watchdog Timeout. Terminating.');
                ws.close();
            }, WATCHDOG_TIMEOUT);
        }
    }

    private stopHeartbeat(type: 'public' | 'private') {
        if (type === 'public') {
             if (this.pingTimerPublic) {
                clearInterval(this.pingTimerPublic);
                this.pingTimerPublic = null;
            }
            if (this.watchdogTimerPublic) {
                clearTimeout(this.watchdogTimerPublic);
                this.watchdogTimerPublic = null;
            }
        } else {
            if (this.pingTimerPrivate) {
                clearInterval(this.pingTimerPrivate);
                this.pingTimerPrivate = null;
            }
            if (this.watchdogTimerPrivate) {
                clearTimeout(this.watchdogTimerPrivate);
                this.watchdogTimerPrivate = null;
            }
        }
    }

    private cleanup(type: 'public' | 'private') {
        this.stopHeartbeat(type);
        if (type === 'public') {
             this.wsPublic = null;
        } else {
             this.wsPrivate = null;
        }
    }

    private login(apiKey: string, apiSecret: string) {
        try {
            if (!this.wsPrivate || this.wsPrivate.readyState !== WebSocket.OPEN) return;

            if (!CryptoJS || !CryptoJS.SHA256) {
                console.error("CryptoJS is not available for Bitunix login signature.");
                return;
            }

            const nonce = Math.random().toString(36).substring(2, 15);
            const timestamp = Math.floor(Date.now() / 1000);

            const first = CryptoJS.SHA256(nonce + timestamp + apiKey).toString(CryptoJS.enc.Hex);
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
        } catch (error) {
            console.error("Error during Bitunix login construction/sending:", error);
        }
    }

    private handleMessage(message: any, type: 'public' | 'private') {
        try {
            // Watchdog reset is handled in onmessage handler to catch ALL events

            if (message && message.event === 'login') {
                if (message.code === 0 || message.msg === 'success') {
                    console.log('Bitunix Login Successful.');
                    this.isAuthenticated = true;
                    this.subscribePrivate();
                } else {
                    console.error('Bitunix Login Failed:', message);
                }
                return;
            }

            if (!message) return;
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
            } else if (message.ch && (message.ch.startsWith('market_kline_') || message.ch === 'mark_kline_1day')) {
                // Handle both generic kline channels and the specific mark_kline_1day
                const symbol = message.symbol;
                const data = message.data;
                if (symbol && data) {
                    marketStore.updateKline(symbol, {
                        o: data.o,
                        h: data.h,
                        l: data.l,
                        c: data.c,
                        b: data.b || data.v // volume might be b (base vol) or v? Bitunix usually uses b for base volume in ticker, check kline
                    });
                }
            }

            // Private Channels
            else if (message.ch === 'position') {
                const data = message.data;
                if (data) {
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
        } catch (err) {
            console.error(`Error handling ${type} message:`, err, "Message:", message);
        }
    }

    subscribe(symbol: string, channel: string) {
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

    unsubscribe(symbol: string, channel: string) {
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
