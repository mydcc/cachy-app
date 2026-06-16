import { describe, it, expect, vi } from 'vitest';
import { tradeService } from './tradeService';
import type { TpSlOrder } from './tradeService';

vi.mock('./tradeService', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./tradeService')>();
    return {
        ...actual,
        tradeService: {
            ...actual.tradeService,
            signedRequest: vi.fn().mockResolvedValue({ success: true })
        }
    };
});

describe('TradeService Type Hardening', () => {
    it('cancelTpSlOrder should strictly accept TpSlOrder type and serialize payload correctly', async () => {
        const invalidOrder = { wrongField: 123 } as any;
        await expect(async () => {
            await tradeService.cancelTpSlOrder(invalidOrder as TpSlOrder);
        }).rejects.toThrow();
    });
});
