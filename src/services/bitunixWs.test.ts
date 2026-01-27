import { describe, it, expect, vi, beforeEach } from 'vitest';
import { bitunixWs } from './bitunixWs';
import { omsService } from './omsService';

// Mock dependencies
vi.mock('./omsService', () => ({
  omsService: {
    updatePosition: vi.fn(),
    updateOrder: vi.fn(),
  }
}));

vi.mock('../stores/market.svelte', () => ({
  marketState: {
    updateSymbol: vi.fn(),
    updateDepth: vi.fn(),
    updateSymbolKlines: vi.fn(),
    updateTelemetry: vi.fn(),
    connectionStatus: 'connected',
  }
}));

vi.mock('../stores/account.svelte', () => ({
  accountState: {
    updatePositionFromWs: vi.fn(),
    updateOrderFromWs: vi.fn(),
    updateBalanceFromWs: vi.fn(),
  }
}));

vi.mock('../stores/settings.svelte', () => ({
  settingsState: {
    enableNetworkLogs: false,
    apiKeys: {},
    capabilities: { marketData: true },
    apiProvider: 'bitunix',
  }
}));

vi.mock('./connectionManager', () => ({
  connectionManager: {
    onProviderConnected: vi.fn(),
    onProviderDisconnected: vi.fn(),
  }
}));

vi.mock('./mdaService', () => ({
  mdaService: {
    normalizeTicker: vi.fn(),
    normalizeKlines: vi.fn(),
  }
}));

// Access private method via any
const service = bitunixWs as any;

describe('BitunixWebSocketService Sync', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should sync position updates to omsService', () => {
        const msg = {
            ch: 'position',
            data: {
                symbol: 'BTCUSDT',
                side: 'LONG',
                qty: '1.5',
                averagePrice: '50000',
                unrealizedPNL: '100',
                leverage: '10',
                marginMode: 'cross'
            }
        };

        // Call handleMessage with private type to bypass strict validation checks for public messages if any
        service.handleMessage(msg, 'private');

        expect(omsService.updatePosition).toHaveBeenCalled();
    });

    it('should sync order updates to omsService', () => {
        const msg = {
            ch: 'order',
            data: {
                orderId: '123',
                symbol: 'BTCUSDT',
                side: 'BUY',
                type: 'LIMIT',
                orderStatus: 'NEW',
                price: '50000',
                qty: '1',
                dealAmount: '0',
                ctime: 1234567890
            }
        };

        service.handleMessage(msg, 'private');

        expect(omsService.updateOrder).toHaveBeenCalled();
    });
});
