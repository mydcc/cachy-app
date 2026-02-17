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

/*
 * Copyright (C) 2026 MYDCT
 *
 * Logger Security Tests
 */

import { describe, it, expect, vi } from 'vitest';
import { logger } from '../../src/lib/server/logger';

describe('ServerLogger Security', () => {
    it('should redact sensitive information from log message', () => {
        const spy = vi.spyOn(logger, 'emit');

        // Simulate a sensitive log message (e.g. from console.log)
        const sensitiveKey = "sk_live_12345secret";
        const message = `User config: {"apiKey":"${sensitiveKey}"}`;

        logger.info(message);

        // Verify that emit was called
        expect(spy).toHaveBeenCalled();

        // Get the arguments of the first call
        const [event, entry] = spy.mock.calls[0];

        expect(event).toBe('log');

        // The message should be redacted
        expect(entry.message).toContain('***REDACTED***');
        expect(entry.message).not.toContain(sensitiveKey);

        spy.mockRestore();
    });

    it('should redact sensitive information from data object', () => {
        const spy = vi.spyOn(logger, 'emit');
        const sensitiveData = { apiKey: "sk_live_98765secret" };

        logger.info("User login", sensitiveData);

        const [event, entry] = spy.mock.calls[0];

        // The data object should be redacted (this was already working)
        expect(entry.data.apiKey).toBe('***REDACTED***');

        spy.mockRestore();
    });
});
