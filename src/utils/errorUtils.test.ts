
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

import { describe, it, expect } from 'vitest';
import { mapApiErrorToLabel } from './errorUtils';

describe('errorUtils', () => {
  it('should map explicit bitunix codes to keys', () => {
    expect(mapApiErrorToLabel({ code: '10001' })).toBe('bitunixErrors.10001');
    expect(mapApiErrorToLabel({ code: 10002 })).toBe('bitunixErrors.10002');
  });

  it('should fallback to regex for known patterns', () => {
    expect(mapApiErrorToLabel({ message: 'Invalid API Key' })).toBe('settings.errors.invalidApiKey');
    expect(mapApiErrorToLabel({ message: 'IP not allowed' })).toBe('settings.errors.ipNotAllowed');
    expect(mapApiErrorToLabel({ message: 'Invalid Signature' })).toBe('settings.errors.invalidSignature');
  });

  it('should prioritize code over regex if code is valid', () => {
    expect(mapApiErrorToLabel({ code: '10003', message: 'Something about api key' })).toBe('bitunixErrors.10003');
  });

  it('should return null for unknown errors', () => {
    expect(mapApiErrorToLabel({ message: 'Random error' })).toBeNull();
    expect(mapApiErrorToLabel({ code: 999999 })).toBeNull();
  });

  it('should handle null/undefined input', () => {
    expect(mapApiErrorToLabel(null)).toBeNull();
    expect(mapApiErrorToLabel(undefined)).toBeNull();
  });
});
