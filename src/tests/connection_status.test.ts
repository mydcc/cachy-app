
// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock dependencies BEFORE imports
vi.mock('$app/environment', () => ({ browser: true, dev: true }));
vi.mock('../services/logger', () => ({
  logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() }
}));
vi.mock('../stores/settings.svelte', () => ({
  settingsState: {
    capabilities: { marketData: true },
    apiKeys: { bitunix: { key: 'test', secret: 'test' } },
    apiProvider: 'bitunix',
    enableNetworkLogs: false
  }
}));
vi.mock('../services/connectionManager', () => ({
  connectionManager: { onProviderConnected: vi.fn(), onProviderDisconnected: vi.fn() }
}));

import { marketState } from '../stores/market.svelte';
import { bitunixWs } from '../services/bitunixWs';
import { connectionManager } from '../services/connectionManager';
import { logger } from '../services/logger';

let createdSockets: any[] = [];

class MockWebSocket {
  url: string;
  readyState = 0;
  onopen: any = null;
  onmessage: any = null;
  onclose: any = null;
  onerror: any = null;
  send = vi.fn();
  close = vi.fn();

  constructor(url: string) {
    this.url = url;
    createdSockets.push(this);
  }

  static OPEN = 1;
  static CONNECTING = 0;
  static CLOSING = 2;
  static CLOSED = 3;
}

vi.stubGlobal('WebSocket', MockWebSocket);

describe('Connection Status Logic', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    marketState.connectionStatus = 'disconnected';
    bitunixWs.destroy();
    vi.clearAllMocks();
    createdSockets = [];
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function getPublicSocket() {
      return createdSockets.find(s => s.url && s.url.includes('/public'));
  }

  it('should update marketState to "connected" when public socket opens', () => {
    bitunixWs.connect(true);

    expect(marketState.connectionStatus).toBe('connecting');
    const ws = getPublicSocket();
    expect(ws).toBeTruthy();

    // Trigger Open
    ws.readyState = 1;
    if (ws.onopen) {
      ws.onopen(new Event('open'));
    }

    expect(marketState.connectionStatus).toBe('connected');
    expect(connectionManager.onProviderConnected).toHaveBeenCalledWith('bitunix');
  });

  it('should update marketState to "reconnecting" on socket close', () => {
    bitunixWs.connect(true);
    const ws = getPublicSocket();
    ws.readyState = 1;
    if (ws.onopen) ws.onopen(new Event('open'));

    // Trigger Close
    ws.readyState = 3;
    if (ws.onclose) ws.onclose(new CloseEvent('close'));

    expect(marketState.connectionStatus).toBe('reconnecting');
  });

  it('should update marketState to "disconnected" if offline', () => {
    bitunixWs.connect(true);
    const ws = getPublicSocket();
    ws.readyState = 1;
    if (ws.onopen) ws.onopen(new Event('open'));

    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    window.dispatchEvent(new Event('offline'));

    expect(marketState.connectionStatus).toBe('disconnected');
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
  });
});
