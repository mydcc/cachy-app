import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock @sveltejs/kit
vi.mock('@sveltejs/kit', () => ({
    json: (data: any, init?: any) => ({
        body: JSON.stringify(data),
        status: init?.status || 200,
        headers: init?.headers
    })
}));

// We need to import the handler.
import { GET } from '../src/routes/api/klines/+server';

describe('API Klines Error Handling', () => {
    beforeEach(() => {
        vi.stubGlobal('fetch', vi.fn());
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('should return 404 SYMBOL_NOT_FOUND when upstream returns code 2', async () => {
        const mockUrl = new URL('http://localhost/api/klines?symbol=UNKNOWN&provider=bitunix');

        vi.mocked(fetch).mockResolvedValue({
            ok: true,
            text: () => Promise.resolve(JSON.stringify({ code: 2, msg: "system error" }))
        } as Response);

        const response: any = await GET({ url: mockUrl } as any);

        expect(response.status).toBe(404);
        const body = JSON.parse(response.body);

        expect(body.error).toBe("Symbol not found");
        expect(body.code).toBe("SYMBOL_NOT_FOUND");
    });
});
