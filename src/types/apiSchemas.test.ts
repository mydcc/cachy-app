import { describe, it, expect } from 'vitest';
import { sanitizeErrorMessage } from './apiSchemas';

describe('sanitizeErrorMessage', () => {
  it('should redact simple key=value pairs', () => {
    const message = 'Error: apiKey=1234567890abcdef failed';
    const sanitized = sanitizeErrorMessage(message, 100);
    expect(sanitized).toBe('Error: apiKey=*** failed');
  });

  it('should redact key: value pairs', () => {
    const message = 'Error: apiSecret: secret_key_value failed';
    const sanitized = sanitizeErrorMessage(message, 100);
    expect(sanitized).toBe('Error: apiSecret: *** failed');
  });

  it('should redact JSON formatted strings', () => {
    const message = '{"error":"Something wrong","apiKey":"1234567890abcdef"}';
    const sanitized = sanitizeErrorMessage(message, 100);
    expect(sanitized).toBe('{"error":"Something wrong","apiKey":"***"}');
  });

  it('should redact JSON with spaces', () => {
    const message = '{ "apiKey" : "12345" }';
    const sanitized = sanitizeErrorMessage(message, 100);
    expect(sanitized).toBe('{ "apiKey" : "***" }');
  });

  it('should redact query parameters', () => {
    const message = 'QueryParams: ?apiKey=12345&secret=abcde';
    const sanitized = sanitizeErrorMessage(message, 100);
    expect(sanitized).toContain('apiKey=***');
    expect(sanitized).toContain('secret=***');
    expect(sanitized).not.toContain('12345');
    expect(sanitized).not.toContain('abcde');
  });

  it('should handle mixed quotes', () => {
    const message = "Mixed quotes: 'apiKey': \"12345\"";
    const sanitized = sanitizeErrorMessage(message, 100);
    expect(sanitized).toBe("Mixed quotes: 'apiKey': \"***\"");
  });

  it('should handle unquoted keys/values (if applicable)', () => {
    const message = 'No quotes: apiKey: 12345';
    const sanitized = sanitizeErrorMessage(message, 100);
    expect(sanitized).toBe('No quotes: apiKey: ***');
  });

  it('should handle other sensitive keys', () => {
    const keys = ['token', 'password', 'passphrase', 'api_key'];
    keys.forEach(key => {
      const msg = `${key}=secret123`;
      const sanitized = sanitizeErrorMessage(msg, 100);
      expect(sanitized).toBe(`${key}=***`);
    });
  });

  it('should limit length correctly', () => {
    const longMessage = 'A'.repeat(200);
    const sanitized = sanitizeErrorMessage(longMessage, 50);
    expect(sanitized.length).toBeLessThanOrEqual(53); // 50 + "..."
    expect(sanitized.endsWith('...')).toBe(true);
  });

  it('should not limit length if maxLength is 0', () => {
    const longMessage = 'A'.repeat(200);
    const sanitized = sanitizeErrorMessage(longMessage, 0);
    expect(sanitized.length).toBe(200);
    expect(sanitized.endsWith('...')).toBe(false);
  });

  it('should preserve non-sensitive parts', () => {
    const msg = 'User id=123, apiKey=secret';
    const sanitized = sanitizeErrorMessage(msg, 100);
    expect(sanitized).toContain('User id=123');
    expect(sanitized).toContain('apiKey=***');
  });
});
