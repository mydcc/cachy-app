import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, unmount } from 'svelte';
import MarketOverview from '../../components/shared/MarketOverview.svelte';
import { marketWatcher } from '../../services/marketWatcher';
import { tradeState } from '../../stores/trade.svelte';
import { settingsState } from '../../stores/settings.svelte';

// Mock dependencies
vi.mock('../../services/marketWatcher', () => ({
  marketWatcher: {
    ensureHistory: vi.fn(),
    register: vi.fn(),
    unregister: vi.fn(),
    requests: new Map(),
    pendingRequests: new Map(),
    historyLocks: new Set(),
  }
}));

// Mock other stores
vi.mock('../../stores/ui.svelte', () => ({
  uiState: {
    activeLayer: 'default',
  }
}));

vi.mock('../../locales/i18n', () => ({
  _: {
    subscribe: (fn: any) => {
        fn((key: string) => key);
        return () => {};
    }
  }
}));

// Mock IntersectionObserver
const observeMock = vi.fn();
const disconnectMock = vi.fn();

class IntersectionObserverMock {
    constructor(callback: any) {
        (global as any).__intersectionObserverCallback = callback;
    }
    observe = observeMock;
    disconnect = disconnectMock;
    unobserve = vi.fn();
}

global.IntersectionObserver = IntersectionObserverMock as any;

describe('MarketOverview Performance', () => {
  let container: HTMLElement;
  let component: any;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    vi.clearAllMocks();
    (global as any).__intersectionObserverCallback = null;

    // Setup store defaults
    tradeState.symbol = 'BTCUSDT';
    settingsState.apiProvider = 'bitunix';
  });

  afterEach(() => {
    if (component) {
      unmount(component);
    }
    document.body.innerHTML = '';
  });

  it('does NOT trigger ensureHistory on mount when invisible', async () => {
    // Mount the component as a favorite tile
    component = mount(MarketOverview, {
        target: container,
        props: {
            isFavoriteTile: true,
            customSymbol: 'BTCUSDT'
        }
    });

    // Wait for effects to run
    await new Promise(r => setTimeout(r, 0));

    // Verify ensureHistory was NOT called
    expect(marketWatcher.ensureHistory).not.toHaveBeenCalled();
    // Verify observer was set up
    expect(observeMock).toHaveBeenCalled();
  });

  it('triggers ensureHistory ONLY when visible', async () => {
    component = mount(MarketOverview, {
        target: container,
        props: {
            isFavoriteTile: true,
            customSymbol: 'BTCUSDT'
        }
    });

    await new Promise(r => setTimeout(r, 0));
    expect(marketWatcher.ensureHistory).not.toHaveBeenCalled();

    // Trigger Intersection
    const callback = (global as any).__intersectionObserverCallback;
    expect(callback).toBeDefined();

    // Simulate isIntersecting = true
    callback([{ isIntersecting: true }]);

    // Wait for effects
    await new Promise(r => setTimeout(r, 0));

    // Now it should be called
    expect(marketWatcher.ensureHistory).toHaveBeenCalledWith('BTCUSDT', '1h');

    // And observer should be disconnected
    expect(disconnectMock).toHaveBeenCalled();
  });
});
