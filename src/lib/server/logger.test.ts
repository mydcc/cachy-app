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


import { describe, it, expect } from 'vitest';
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
    const db = "postgres://user:supersecret@localhost:5432/db";

    const logPromise = captureLog();
    logger.debug('Fetching URL', url);
    const entry = await logPromise;
    expect(entry.data).toContain('apiKey=***REDACTED***');
    expect(entry.data).toContain('&lang=en');

    const logPromise2 = captureLog();
    logger.debug('DB Connection', db);
    const entry2 = await logPromise2;
    expect(entry2.data).toBe("postgres://user:***REDACTED***@localhost:5432/db");
  });

  it('should sanitize Authorization headers', async () => {
    const header = "Authorization: Bearer my-secret-token-123";
    const logPromise = captureLog();
    logger.info('Request', header);
    const entry = await logPromise;
    expect(entry.data).toBe("Authorization: Bearer ***REDACTED***");
  });

  it('should sanitize quoted values with spaces', async () => {
    const str = 'password="my secret phrase"';
    const logPromise = captureLog();
    logger.info('Config', str);
    const entry = await logPromise;
    expect(entry.data).toBe('password="***REDACTED***"');
  });

  it('should sanitize broken JSON strings', async () => {
    const str = '{ "broken": "json", "password": "secret"';
    const logPromise = captureLog();
    logger.info('Log', str);
    const entry = await logPromise;
    expect(entry.data).toBe('{ "broken": "json", "password": "***REDACTED***"');
  });

  it('should sanitize Private Keys in PEM format', async () => {
    const privKey = `-----BEGIN RSA PRIVATE KEY-----
MIIEpQIBAAKCAQEA...
...
-----END RSA PRIVATE KEY-----
`;

    const logPromise = captureLog();
    logger.info('Key', privKey);
    const entry = await logPromise;
    expect(entry.data).toContain('-----BEGIN RSA PRIVATE KEY-----');
    expect(entry.data).toContain('***REDACTED***');
    expect(entry.data).toContain('-----END RSA PRIVATE KEY-----');
    expect(entry.data).not.toContain('MIIEpQIBAAKCAQEA');
  });

  it('should NOT sanitize safe keys (False Positives)', async () => {
    const safeData = {
      max_tokens: 1000,
      total_tokens: 5000,
      author: 'John Doe',
      authority: 'Admin'
    };

    const logPromise = captureLog();
    logger.info('Safe', safeData);
    const entry = await logPromise;

    expect(entry.data.max_tokens).toBe(1000);
    expect(entry.data.total_tokens).toBe(5000);
    expect(entry.data.author).toBe('John Doe');
    expect(entry.data.authority).toBe('Admin');
  });

  it('should NOT sanitize quoted safe keys in strings', async () => {
    const str = '"max_tokens": 1000, "author": "John"';
    const logPromise = captureLog();
    logger.info('Safe String', str);
    const entry = await logPromise;
    expect(entry.data).toBe(str);
  });

  it('should sanitize passphrase', async () => {
    const sensitiveData = {
      username: 'trader',
      passphrase: 'supersecretpassphrase'
    };

    const logPromise = captureLog();
    logger.info('API Login', sensitiveData);
    const entry = await logPromise;

    expect(entry.data.username).toBe('trader');
    expect(entry.data.passphrase).toBe('***REDACTED***');
  });
});
