import { describe, vi, test } from 'vitest';
import { tradeService } from '../services/tradeService';
import { omsService } from '../services/omsService';
import { exchangeSignedFetch } from '../utils/exchange/browserSigning';
import type { OMSPosition } from '../services/omsTypes';
import { Decimal } from 'decimal.js';

// Fills the OMSPosition fields this benchmark doesn't vary (entryPrice,
// unrealizedPnl, leverage, marginMode) with inert defaults.
function mkPosition(symbol: string, side: OMSPosition["side"], lastUpdated: number): OMSPosition {
    return {
        symbol,
        side,
        amount: new Decimal('1'),
        entryPrice: new Decimal('0'),
        unrealizedPnl: new Decimal('0'),
        leverage: new Decimal('1'),
        marginMode: 'cross',
        lastUpdated
    };
}

vi.mock('../services/omsService', () => ({
    omsService: {
        getPositions: vi.fn(() => []),
        updatePosition: vi.fn(),
        removePosition: vi.fn()
    }
}));

vi.mock('../services/logger', () => ({
    logger: {
        log: vi.fn(),
        warn: vi.fn(),
        error: vi.fn()
    }
}));

vi.mock('../stores/settings.svelte', () => ({
    settingsState: {
        apiProvider: 'bitunix',
        activeAccountId: 'bitunix-main',
        accounts: [
            {
                id: 'bitunix-main',
                name: 'Main',
                exchange: 'bitunix',
                keys: { key: 'test-key-0123456789', secret: 'test-secret-0123456789' }
            }
        ],
        apiKeys: {
            bitunix: { key: 'test-key-0123456789', secret: 'test-secret-0123456789' }
        }
    }
}));

vi.mock('../utils/exchange/browserSigning', () => ({
    exchangeSignedFetch: vi.fn()
}));

// The OMS mirror must land somewhere `getPositions` actually returns: the
// benchmark keeps one array and the mocked `updatePosition` replaces entries
// in place, so the venue mirror refreshes the same cache the close reads.
let mirrorCache: OMSPosition[] = [];
function resetMirrorCache(positions: OMSPosition[]): void {
    mirrorCache = positions;
}

function mockMirrorWrites(): void {
    vi.mocked(omsService.getPositions).mockImplementation(() => mirrorCache);
    vi.mocked(omsService.updatePosition).mockImplementation((p: OMSPosition) => {
        const i = mirrorCache.findIndex((q) => q.symbol === p.symbol && q.side === p.side);
        if (i >= 0) mirrorCache[i] = p;
        else mirrorCache.push(p);
    });
}

// Reaches into tradeService's private request method to stub it out for the
// benchmark. `fetchOpenPositionsFromApi` used to be stubbed here directly;
// since the position-lifecycle extraction it is module-private, so the stub
// moved to the preserved seam — the `exchangeSignedFetch` transport, exactly
// like the restubbed `tradeService_errors` / `tradeService_addToPosition`
// suites. Patching the removed private would assign a dead property and the
// stub would silently stop intercepting (the bench would measure the live
// fetch path with test keys instead of the prefetch it claims).
type TradeServiceInternals = {
    signedRequest: (endpoint: string, payload: Record<string, unknown>) => Promise<unknown>;
};
const internals = tradeService as unknown as TradeServiceInternals;

describe('tradeService benchmark (Optimized)', () => {
    test('closeAllPositions with pre-fetch', async ({ bench }) => {
      await bench('closeAllPositions with pre-fetch', async () => {
        const origSignedReq = internals.signedRequest;
        try {
            // The prefetch: 50ms at the venue, answering five fresh pending
            // positions that the mirror writes into the cache (see
            // `mockMirrorWrites` above — `mapToOMSPosition` stamps
            // `lastUpdated`, so the close reads fresh state, not stale).
            vi.mocked(exchangeSignedFetch).mockImplementation(async () => {
                await new Promise(resolve => setTimeout(resolve, 50));
                const items = ['BTCUSDT', 'ETHUSDT', 'XRPUSDT', 'SOLUSDT', 'DOGEUSDT'].map(
                    (symbol, i) => ({
                        symbol,
                        side: i % 2 === 0 ? 'long' : 'short',
                        amount: '1',
                        entryPrice: '100',
                        leverage: '10'
                    })
                );
                // Envelope, not a bare list: `fetchOpenPositionsFromApi`
                // reads `data` off the parsed body, so a bare array would
                // mirror nothing and the bench would measure the stale path
                // while claiming a prefetch.
                return {
                    ok: true,
                    text: async () => JSON.stringify({ code: '0', data: items, msg: 'ok' })
                };
            });

            internals.signedRequest = vi.fn().mockResolvedValue({ code: 0 });

            // Force a stale environment for the original code path:
            resetMirrorCache([
                mkPosition('BTCUSDT', 'long', 0),
                mkPosition('ETHUSDT', 'short', 0),
                mkPosition('XRPUSDT', 'long', 0),
                mkPosition('SOLUSDT', 'short', 0),
                mkPosition('DOGEUSDT', 'long', 0)
            ]);
            mockMirrorWrites();

            await tradeService.closeAllPositions();
        } finally {
            internals.signedRequest = origSignedReq;
        }
      }).run();
    });
});
