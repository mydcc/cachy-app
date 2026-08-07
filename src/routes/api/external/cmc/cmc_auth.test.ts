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
import { GET } from './+server';
import { checkClientToken } from '../../../../lib/server/clientToken';
import { json } from '@sveltejs/kit';

vi.mock('../../../../lib/server/clientToken', () => ({
  checkClientToken: vi.fn(),
}));

const getClientAddress = () => '127.0.0.1';

describe('CMC Proxy Security', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return 401 when checkClientToken fails', async () => {
    const authError = json({ error: 'Unauthorized' }, { status: 401 });
    vi.mocked(checkClientToken).mockReturnValue(authError);

    const request = {
      headers: new Headers(),
    } as unknown as Request;

    const url = new URL('http://localhost/api/external/cmc?endpoint=/v1/global-metrics/quotes/latest');

    const response = await GET({ url, request, getClientAddress } as unknown as Parameters<typeof GET>[0]);

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBe('Unauthorized');
    expect(checkClientToken).toHaveBeenCalledWith(request, '127.0.0.1');
  });

  it('should proceed when checkClientToken succeeds', async () => {
    vi.mocked(checkClientToken).mockReturnValue(null);

    // Mock global fetch
    const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: 'test' })
    });
    global.fetch = fetchMock;

    const request = {
      headers: new Headers({ 'x-cmc-api-key': 'test-key' }),
    } as unknown as Request;

    const url = new URL('http://localhost/api/external/cmc?endpoint=/v1/global-metrics/quotes/latest');

    const response = await GET({ url, request, getClientAddress } as unknown as Parameters<typeof GET>[0]);

    expect(response.status).toBe(200);
    expect(checkClientToken).toHaveBeenCalledWith(request, '127.0.0.1');
  });
});
