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

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { handleError } from './hooks.client';

vi.mock('./locales/i18n', () => ({}));

describe('handleError (Client Hook)', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Spy on console methods to verify they are called and to prevent them from cluttering the test output
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Clear mock data before each test
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Restore original console methods
    consoleErrorSpy.mockRestore();
  });

  it('should log the error to console and return fallback message', async () => {
    // Arrange
    const mockError = new Error('Test application error');
    const mockEvent = {} as any; // Event is not used in the function body

    // Act
    const result = await handleError({ error: mockError, event: mockEvent, status: 500, message: '' });

    // Assert
    expect(consoleErrorSpy).toHaveBeenCalledWith('Client Hook Error:', mockError);
    expect(result).toEqual({
      message: 'An unexpected error occurred.',
      code: 'UNKNOWN',
    });
  });
});
