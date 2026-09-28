/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */


import { describe, it, expect, vi, beforeEach } from 'vitest';
import { tradeService } from './tradeService';
import { omsService } from './omsService';
import { OrderRefusedError } from './orderGate';

// Mock omsService
vi.mock('./omsService', () => ({
    omsService: {
        getPositions: vi.fn(),
        addOptimisticOrder: vi.fn(),
        removeOrder: vi.fn(),
        updateOrder: vi.fn(),
        getOrder: vi.fn()
    }
}));

// Mock logger to suppress errors during test
vi.mock('./logger', () => ({
    logger: {
        log: vi.fn(),
        warn: vi.fn(),
        error: vi.fn()
    }
}));

// Mock settingsState
vi.mock('../stores/settings.svelte', () => ({
    settingsState: {
        apiProvider: 'bitunix',
        accounts: [
      { id: "bitunix", name: "Bitunix", exchange: "bitunix", keys: { key: 'test-key-0123456789', secret: 'test-secret-0123456789' } },
    ],
        activeAccountId: "bitunix"
    }
}));


// Mock marketState
vi.mock('../stores/market.svelte', async () => {
    // Import Decimal dynamically to avoid hoisting issues
    const { default: Decimal } = await import('decimal.js');
    return {
        marketState: {
            data: {
                'BTCUSDT': { lastPrice: new Decimal(50000) }
            },
            updateSymbolKlines: vi.fn(),
            updateSymbol: vi.fn()
        }
    };
});


// FEAT-0011: every state-mutating call carries an order-gate pass as its
// fourth argument, and `signedRequest` refuses one that arrives without it.
// That the pass is genuine, single-use and bound to this account is covered
// in orderGate.test.ts; here it only has to be present.
const GATE_PASS = expect.anything();

describe('TradeService Flash Close Vulnerability', () => {
    beforeEach(() => {
        vi.resetAllMocks();
    });

    it('should PROCEED with flash close even if cancelAllOrders fails (Hardened behavior)', async () => {
        // Import Decimal here for test setup
        const { default: Decimal } = await import('decimal.js');

        // 1. Setup Position
        const mockPosition = {
            symbol: 'BTCUSDT',
            side: 'long',
            amount: new Decimal(1.5),
            lastUpdated: Date.now()
        };
        vi.mocked(omsService.getPositions).mockReturnValue([mockPosition]);

        // 2. Mock cancelAllOrders to FAIL
        // We need to spy on the instance method. Since tradeService is an instance, we can spy on it.
        const cancelSpy = vi.spyOn(tradeService, 'cancelAllOrders').mockRejectedValue(new Error('Network Error'));

        // 3. Mock signedRequest (the close order) to SUCCEED
        const requestSpy = vi.spyOn(tradeService, 'signedRequest').mockResolvedValue({ code: '0', msg: 'Success' });

        // 4. Execute & Assert
        // Expectation: It SHOULD SUCCEED now (resolve)
        await expect(tradeService.flashClosePosition('BTCUSDT', 'long')).resolves.toEqual({ success: true, data: { code: '0', msg: 'Success' } });

        // Verify cancel was called, carrying the flash close's own
        // authorisation (FEAT-0024): `cancel-all` confirms by default, so
        // without this the gate refuses a cleanup the user already agreed to
        // and the position closes with its stops still resting.
        expect(cancelSpy).toHaveBeenCalledWith('BTCUSDT', true, {
            action: 'flash-close-position',
            confirmedAt: undefined,
        });

        // Verify close order WAS called (despite abort). Closing a long:
        // side matches the position (BUY), not inverted — see
        // buildCloseOrderFields (BUG-0062/BUG-0063).
        expect(requestSpy).toHaveBeenCalledWith(
            '/api/orders',
            expect.objectContaining({ side: 'BUY', tradeSide: 'CLOSE', orderType: 'MARKET', reduceOnly: true }),
            GATE_PASS,
            undefined,
            undefined
        );
    });
});

/*
 * BUG-0586 — BUG-0331 reopened by BUG-0551.
 *
 * BUG-0331 moved the gate's verification above `cancelAllOrders`, because that
 * cancel is a real, successful write that strips the position's TP/SL. Its
 * comment names the hazard exactly: a refusal *after* it leaves the trader
 * holding an open position with its protection gone, at the moment they were
 * trying to get out.
 *
 * BUG-0551 then added a refusal source that `verifyOrThrow` does not cover —
 * the dispatch-guard session check, which runs inside the transport after
 * WebCrypto. That is strictly later than the cancel, so a session that moved
 * re-created the exact state BUG-0331 was closed for.
 *
 * The rollback made it worse: an `OrderRefusedError` is neither a
 * `BitunixApiError` nor carries a 400/401/403, so the failure was classified
 * *indeterminate* and the optimistic order was kept as `_isUnconfirmed` — a
 * close in the order list that provably never left the device.
 */
describe('BUG-0586 — a flash close refused by the session guard', () => {
    let cancelSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(async () => {
        vi.resetAllMocks();
        const { default: Decimal } = await import('decimal.js');
        vi.mocked(omsService.getPositions).mockReturnValue([
            {
                symbol: 'BTCUSDT',
                side: 'long',
                amount: new Decimal(1.5),
                lastUpdated: Date.now(),
            },
        ]);
        cancelSpy = vi.spyOn(tradeService, 'cancelAllOrders').mockResolvedValue({ code: '0', msg: 'Success' });
    });

    it('leaves no unconfirmed close behind for a request that never left', async () => {
        // The dispatch guard refuses here, after the cancel above already
        // stripped the position's protection. A refusal is raised *before* the
        // bytes leave — the gate's checks and the guard's `beforeAttempt` hook
        // both run ahead of `fetch` — so this is not an unknown outcome to be
        // reconciled later. Classifying it as indeterminate parked the close in
        // the OMS as `_isUnconfirmed`, which reads as "a close is out there we
        // cannot see" for a request that provably did not go out.
        vi.spyOn(tradeService, 'signedRequest').mockRejectedValue(
            new OrderRefusedError({
                field: 'mode',
                messageKey: 'orderGate.sessionChanged',
                reason: 'stale',
                values: { expected: 'live', actual: 'paper' },
            }),
        );

        // `getOrder` has to answer, or this test passes for the wrong reason:
        // the indeterminate branch re-reads the optimistic order and only
        // updates it if it is still there, so an undefined mock would skip
        // `updateOrder` entirely and the assertion below would hold whether or
        // not the fix is present. With the order present, a regression that
        // routes a refusal back through the indeterminate branch does call
        // `updateOrder` with `_isUnconfirmed`, and this goes red.
        vi.mocked(omsService.getOrder).mockReturnValue({
            id: 'optimistic-1',
            status: 'pending',
        } as never);

        // `flashClosePosition` reports failure as a resolved `{ success: false }`
        // rather than a rejection, so the contract under test is the OMS state
        // it leaves behind, not the throw.
        await expect(tradeService.flashClosePosition('BTCUSDT', 'long')).resolves.toMatchObject({
            success: false,
        });

        expect(omsService.removeOrder).toHaveBeenCalled();
        expect(omsService.updateOrder).not.toHaveBeenCalledWith(
            expect.objectContaining({ _isUnconfirmed: true }),
        );
    });

    it('still parks a genuine timeout as unconfirmed', async () => {
        // The control. A timeout really is unknown — the bytes may have left —
        // so `_isUnconfirmed` is the honest state for it. Widening the terminal
        // class to refusals must not swallow this branch.
        //
        // `getOrder` has to answer: the indeterminate path re-reads the
        // optimistic order and only updates it if it is still there, so an
        // undefined mock would make this pass for the wrong reason.
        vi.mocked(omsService.getOrder).mockReturnValue({
            id: 'optimistic-1',
            status: 'pending',
        } as never);
        vi.spyOn(tradeService, 'signedRequest').mockRejectedValue(new Error('Network Error'));

        await expect(tradeService.flashClosePosition('BTCUSDT', 'long')).resolves.toMatchObject({
            success: false,
        });

        expect(omsService.updateOrder).toHaveBeenCalledWith(
            expect.objectContaining({ _isUnconfirmed: true }),
        );
    });

    it('still cancels protection and closes when nothing is refused', async () => {
        vi.spyOn(tradeService, 'signedRequest').mockResolvedValue({ code: '0', msg: 'Success' });

        await expect(tradeService.flashClosePosition('BTCUSDT', 'long')).resolves.toEqual({
            success: true,
            data: { code: '0', msg: 'Success' },
        });

        expect(cancelSpy).toHaveBeenCalled();
    });
});
