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
import { POST } from './+server';

// Set env var for Auth fallback
process.env.APP_ACCESS_TOKEN = 'test-token-123';

// Mock OpenAI
vi.mock('openai', () => {
    return {
        default: class {
            chat = {
                completions: {
                    create: vi.fn().mockRejectedValue(new Error('Test Error'))
                }
            }
        }
    };
});

describe('POST /api/sentiment error handling', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        process.env.APP_ACCESS_TOKEN = 'test-token-123';
    });

    const headers = new Map([['x-app-access-token', 'test-token-123']]);

    const validBody = {
        headlines: ['Bitcoin is up'],
        provider: 'openai',
        apiKey: 'test-key'
    };

    it('should return 500 and error message when a standard Error is thrown', async () => {
        const request = {
            json: async () => validBody,
            headers,
        } as any;

        const response = await POST({ request } as any);
        expect(response.status).toBe(500);
        const body = await response.json();
        expect(body.error).toBe('Test Error');
    });
});
