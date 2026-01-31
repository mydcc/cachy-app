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


import { describe, it, expect, vi, afterEach } from 'vitest';
import { logger } from './logger';

describe('ServerLogger', () => {
  // Helper to capture log events
  const captureLog = () => {
    return new Promise<any>((resolve) => {
      logger.once('log', (entry) => {
        resolve(entry);
      });
    });
  };

  it('should sanitize sensitive keys in objects', async () => {
    const sensitiveData = {
      user: 'alice',
      password: 'supersecretpassword',
      apiKey: '12345-abcde',
      meta: {
        apiSecret: 'secret-key'
      }
    };

    const logPromise = captureLog();
    logger.info('User login', sensitiveData);
    const entry = await logPromise;

    expect(entry.data.user).toBe('alice');
    expect(entry.data.password).toBe('***REDACTED***');
    expect(entry.data.apiKey).toBe('***REDACTED***');
    expect(entry.data.meta.apiSecret).toBe('***REDACTED***');
  });

  it('should sanitize JSON strings containing sensitive keys', async () => {
    const sensitiveData = JSON.stringify({
      token: 'jwt-token-value',
      other: 'value'
    });

    const logPromise = captureLog();
    logger.info('API Request', sensitiveData);
    const entry = await logPromise;

    // The logger parses JSON strings and sanitizes the object inside, then stringifies it back?
    // Let's check the implementation:
    // try { const parsed = JSON.parse(data); return JSON.stringify(this.sanitize(parsed)); }

    const parsedData = JSON.parse(entry.data);
    expect(parsedData.token).toBe('***REDACTED***');
    expect(parsedData.other).toBe('value');
  });

  it('should sanitize plain strings with sensitive patterns', async () => {
    const plainString = "Login failed for user=bob with password=secret123";

    const logPromise = captureLog();
    logger.warn('Auth Error', plainString);
    const entry = await logPromise;

    expect(entry.data).toContain('password=***REDACTED***');
  });

  it('should sanitize complex strings like URLs or connection strings', async () => {
    const url = "https://api.example.com/v1?apiKey=abcdef123456&lang=en";

    const logPromise = captureLog();
    logger.debug('Fetching URL', url);
    const entry = await logPromise;

    expect(entry.data).toContain('apiKey=***REDACTED***');
    expect(entry.data).toContain('&lang=en');
  });
});
