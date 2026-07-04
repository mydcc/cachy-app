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

import { describe, it, expect, vi } from 'vitest';
import { checkAppAuth } from '../src/lib/server/auth';

// Mock SvelteKit modules
vi.mock('$env/dynamic/private', () => ({
  env: {
    APP_ACCESS_TOKEN: undefined
  }
}));

vi.mock('@sveltejs/kit', () => ({
  json: vi.fn((data, init) => ({
    status: init?.status || 200,
    json: async () => data
  }))
}));

describe('checkAppAuth fail-closed validation', () => {
  it('should DENY access when APP_ACCESS_TOKEN is missing', () => {
    const request = new Request('http://localhost/api/test', {
      headers: {}
    });

    const result = checkAppAuth(request);

    expect(result).not.toBeNull();
    expect(result?.status).toBe(401);
  });
});
