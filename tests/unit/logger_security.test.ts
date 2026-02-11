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
