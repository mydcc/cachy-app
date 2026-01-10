import { writable, get } from 'svelte/store';
import { marketStore, wsStatusStore } from '../stores/marketStore';
import { accountStore } from '../stores/accountStore';
import { settingsStore } from '../stores/settingsStore';
import { CONSTANTS } from '../lib/constants';
import CryptoJS from 'crypto-js';

const WS_PUBLIC_URL = CONSTANTS.BITUNIX_WS_PUBLIC_URL || 'wss://fapi.bitunix.com/public/';
const WS_PRIVATE_URL = CONSTANTS.BITUNIX_WS_PRIVATE_URL || 'wss://fapi.bitunix.com/private/';

const PING_INTERVAL = 20000; // 20 seconds (standard interval)
const WATCHDOG_TIMEOUT = 30000; // 30 seconds (safe buffer above ping interval)
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

    private lastWatchdogResetPublic = 0;
    private lastWatchdogResetPrivate = 0;
    private readonly WATCHDOG_THROTTLE_MS = 2000; // Reset watchdog max every 2 seconds

    private publicSubscriptions: Set<string> = new Set();
    
    private reconnectTimerPublic: any = null;
    private reconnectTimerPrivate: any = null;

    private isReconnectingPublic = false;
    private isReconnectingPrivate = false;

    private awaitingPongPublic = false;
    private awaitingPongPrivate = false;

    private connectionTimeoutPublic: any = null;
    private connectionTimeoutPrivate: any = null;
    private readonly CONNECTION_TIMEOUT_MS = 10000; // 10 seconds
    
    private isAuthenticated = false;

    private handleOnline = () => {
        this.connect();
    };

    private handleOffline = () => {
        wsStatusStore.set('disconnected');
        this.cleanup('public');
        this.cleanup('private');
        if (this.wsPublic) this.wsPublic.close();
        if (this.wsPrivate) this.wsPrivate.close();
    };

    constructor() {
        if (typeof window !== 'undefined') {
            window.addEventListener('online', this.handleOnline);
            window.addEventListener('offline', this.handleOffline);
        }
    }

    destroy() {
        if (typeof window !== 'undefined') {
            window.removeEventListener('online', this.handleOnline);
            window.removeEventListener('offline', this.handleOffline);
        }

        // Clear all timers including connection and reconnection timers
        if (this.connectionTimeoutPublic) clearTimeout(this.connectionTimeoutPublic);
        if (this.connectionTimeoutPrivate) clearTimeout(this.connectionTimeoutPrivate);
        if (this.reconnectTimerPublic) clearTimeout(this.reconnectTimerPublic);
        if (this.reconnectTimerPrivate) clearTimeout(this.reconnectTimerPrivate);

        this.cleanup('public');
        this.cleanup('private');
        if (this.wsPublic) this.wsPublic.close();
        if (this.wsPrivate) this.wsPrivate.close();
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

        let ws: WebSocket;
        try {
            ws = new WebSocket(WS_PUBLIC_URL);
            this.wsPublic = ws;

            // Set connection timeout to detect hanging initial connections
            if (this.connectionTimeoutPublic) clearTimeout(this.connectionTimeoutPublic);
            this.connectionTimeoutPublic = setTimeout(() => {
                if (ws.readyState !== WebSocket.OPEN) {
                    console.warn('Bitunix Public WS Connection Timeout. Closing to trigger retry.');
                    ws.close();
                }
            }, this.CONNECTION_TIMEOUT_MS);

        } catch (e) {
            console.error('Failed to create Public WS:', e);
            this.scheduleReconnect('public');
            return;
        }

        ws.onopen = () => {
            if (this.connectionTimeoutPublic) clearTimeout(this.connectionTimeoutPublic);

            // Only proceed if this is still the active socket
            if (this.wsPublic !== ws) return;

            wsStatusStore.set('connected');
            this.isReconnectingPublic = false;

            this.startHeartbeat(ws, 'public');
            // Initialize watchdog immediately on connection
            this.resetWatchdog('public', ws);
            this.resubscribePublic();
        };

        ws.onmessage = (event) => {
            // Check if this socket is still active
            if (this.wsPublic !== ws) return;

            try {
                // Reset watchdog on ANY activity (throttled)
                const now = Date.now();
                if (now - this.lastWatchdogResetPublic > this.WATCHDOG_THROTTLE_MS) {
                    this.resetWatchdog('public', ws);
                    this.lastWatchdogResetPublic = now;
                }

                const message = JSON.parse(event.data);
                this.handleMessage(message, 'public');
            } catch (e) {
                console.error('Error parsing Public WS message:', e);
            }
        };

        ws.onclose = () => {
            if (this.wsPublic === ws) {
                this.cleanup('public');
                this.scheduleReconnect('public');
            }
        };

        ws.onerror = (error) => {
            console.error('Bitunix Public WebSocket error:', error);
        };
    }

    private connectPrivate() {
        const settings = get(settingsStore);
        const apiKey = settings.apiKeys?.bitunix?.key;
        const apiSecret = settings.apiKeys?.bitunix?.secret;

        if (!apiKey || !apiSecret) {
            return;
        }

        if (this.wsPrivate) {
             if (this.wsPrivate.readyState === WebSocket.OPEN || this.wsPrivate.readyState === WebSocket.CONNECTING) {
                 return;
             }
        }

        let ws: WebSocket;
        try {
            ws = new WebSocket(WS_PRIVATE_URL);
            this.wsPrivate = ws;

            // Set connection timeout
            if (this.connectionTimeoutPrivate) clearTimeout(this.connectionTimeoutPrivate);
            this.connectionTimeoutPrivate = setTimeout(() => {
                if (ws.readyState !== WebSocket.OPEN) {
                    console.warn('Bitunix Private WS Connection Timeout. Closing to trigger retry.');
                    ws.close();
                }
            }, this.CONNECTION_TIMEOUT_MS);

        } catch (e) {
            console.error('Failed to create Private WS:', e);
            this.scheduleReconnect('private');
            return;
        }

        ws.onopen = () => {
            if (this.connectionTimeoutPrivate) clearTimeout(this.connectionTimeoutPrivate);
            if (this.wsPrivate !== ws) return;

            this.isReconnectingPrivate = false;
            this.startHeartbeat(ws, 'private');
            this.resetWatchdog('private', ws);
            this.login(apiKey, apiSecret);
        };

        ws.onmessage = (event) => {
             // Check if this socket is still active
             if (this.wsPrivate !== ws) return;

             try {
                // Reset watchdog on ANY activity (throttled)
                const now = Date.now();
                if (now - this.lastWatchdogResetPrivate > this.WATCHDOG_THROTTLE_MS) {
                    this.resetWatchdog('private', ws);
                    this.lastWatchdogResetPrivate = now;
                }

                const message = JSON.parse(event.data);
                this.handleMessage(message, 'private');
            } catch (e) {
                console.error('Error parsing Private WS message:', e);
            }
        };

        ws.onclose = () => {
             if (this.wsPrivate === ws) {
                 this.isAuthenticated = false;
                 this.cleanup('private');
                 this.scheduleReconnect('private');
             }
        };
        
        ws.onerror = (error) => {
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
            this.awaitingPongPublic = false;
        } else {
            if (this.pingTimerPrivate) clearInterval(this.pingTimerPrivate);
            this.awaitingPongPrivate = false;
        }

        const timer = setInterval(() => {
            if (ws && ws.readyState === WebSocket.OPEN) {
                // Check if previous ping was answered
                if (type === 'public' && this.awaitingPongPublic) {
                    console.warn('Bitunix Public WS: Pong timeout. Reconnecting...');
                    ws.close(); // Force reconnect
                    return;
                }
                if (type === 'private' && this.awaitingPongPrivate) {
                    console.warn('Bitunix Private WS: Pong timeout. Reconnecting...');
                    ws.close();
                    return;
                }

                if (type === 'public') this.awaitingPongPublic = true;
                else this.awaitingPongPrivate = true;

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
            // Ensure we are operating on the current socket
            if (ws !== this.wsPublic) return;

            this.watchdogTimerPublic = setTimeout(() => {
                console.warn('Bitunix Public WS Watchdog Timeout. Terminating.');
                if (this.wsPublic && this.wsPublic.readyState === WebSocket.OPEN) {
                    this.wsPublic.close(); // Force close to trigger onclose -> reconnect
                }
            }, WATCHDOG_TIMEOUT);
        } else {
            if (this.watchdogTimerPrivate) clearTimeout(this.watchdogTimerPrivate);
            if (ws !== this.wsPrivate) return;

            this.watchdogTimerPrivate = setTimeout(() => {
                console.warn('Bitunix Private WS Watchdog Timeout. Terminating.');
                if (this.wsPrivate && this.wsPrivate.readyState === WebSocket.OPEN) {
                    this.wsPrivate.close();
                }
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
                    this.isAuthenticated = true;
                    this.subscribePrivate();
                } else {
                    console.error('Bitunix Login Failed:', message);
                }
                return;
            }

            if (!message) return;

            // Check for Pong BEFORE checking for Ping, because Bitunix sends op:'ping' in the Pong response!
            if (message.op === 'pong' || message.pong) {
                if (type === 'public') this.awaitingPongPublic = false;
                else this.awaitingPongPrivate = false;
                return;
            }

            if (message.op === 'ping') return;

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
                        b: data.b || data.v, // volume might be b (base vol) or v? Bitunix usually uses b for base volume in ticker, check kline
                        // Use data.id (often timestamp in Bitunix) or data.ts as fallbacks.
                        // Only use Date.now() as a last resort to prevent infinite candle generation if timestamp is missing.
                        t: data.t || data.id || data.ts || Date.now()
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
