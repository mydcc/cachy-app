/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import { describe, it, expect, vi } from 'vitest';
import { POST } from './+server';

// Mock authentication to bypass security check during test
vi.mock('../../../lib/server/auth', () => ({
  checkAppAuth: vi.fn(() => null)
}));

describe('POST /api/rss-fetch', () => {
  it('should return 403 for an invalid URL that fails parsing', async () => {
    // Create a mock Request event
    const mockRequest = new Request('http://localhost/api/rss-fetch', {
      method: 'POST',
      body: JSON.stringify({ url: 'not-a-valid-url-format' })
    });

    const event = {
      request: mockRequest
    } as any;

    const response = await POST(event);

    expect(response.status).toBe(403);

    const data = await response.json();
    expect(data).toEqual({ error: 'Invalid or prohibited URL' });
  });
});
