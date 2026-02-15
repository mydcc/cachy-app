
import { describe, it, expect } from 'vitest';
import { safeJsonParse } from './safeJson';

describe('safeJsonParse', () => {
  it('should parse standard JSON correctly', () => {
    const json = '{"a": 1, "b": "text"}';
    expect(safeJsonParse(json)).toEqual({ a: 1, b: "text" });
  });

  it('should convert large integers to strings', () => {
    // 19 digits (Bitunix Order ID)
    const largeInt = '1234567890123456789';
    const json = `{"id": ${largeInt}}`;

    const parsed = safeJsonParse(json);
    expect(parsed.id).toBe(largeInt);
    expect(typeof parsed.id).toBe('string');
  });

  it('should handle large integers in nested objects', () => {
    const largeInt = '9876543210987654321';
    const json = `{"data": {"orderId": ${largeInt}}}`;

    const parsed = safeJsonParse(json);
    expect(parsed.data.orderId).toBe(largeInt);
  });

  it('should handle large integers in arrays', () => {
    const largeInt = '1122334455667788990';
    const json = `[${largeInt}, 123]`;

    const parsed = safeJsonParse(json);
    expect(parsed[0]).toBe(largeInt);
    expect(parsed[1]).toBe(123);
  });

  it('should NOT convert small integers', () => {
    const smallInt = '12345678901234'; // 14 digits
    const json = `{"id": ${smallInt}}`;

    const parsed = safeJsonParse(json);
    expect(parsed.id).toBe(12345678901234);
    expect(typeof parsed.id).toBe('number');
  });
});
