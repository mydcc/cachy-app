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
import { julesService } from './services/julesService';
import type { RequestEvent } from '@sveltejs/kit';

// Mock the dependencies
vi.mock('./services/julesService', () => ({
  julesService: {
    reportToJules: vi.fn(),
  },
}));

vi.mock('./locales/i18n', () => ({}));

describe('handleError (Client Hook)', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Spy on console methods to verify they are called and to prevent them from cluttering the test output
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // Clear mock data before each test
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Restore original console methods
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  it('should log the error to console, report to julesService, and return fallback message', async () => {
    // Arrange
    const mockError = new Error('Test application error');
    const mockEvent = {} as any; // Event is not used in the function body

    // Act
    const result = await handleError({ error: mockError, event: mockEvent, status: 500, message: '' });

    // Assert
    expect(consoleErrorSpy).toHaveBeenCalledWith('Client Hook Error:', mockError);
    expect(julesService.reportToJules).toHaveBeenCalledWith(mockError, 'AUTO');
    expect(result).toEqual({
      message: 'An unexpected error occurred. Jules has been notified.',
      code: 'UNKNOWN',
    });
    expect(consoleWarnSpy).not.toHaveBeenCalled();
  });

  it('should not crash and still return fallback message if julesService throws an error', async () => {
    // Arrange
    const mockError = new Error('Original error');
    const reportError = new Error('Jules reporting failed');
    const mockEvent = {} as any;

    // Make reportToJules throw
    (julesService.reportToJules as any).mockRejectedValueOnce(reportError);

    // Act
    const result = await handleError({ error: mockError, event: mockEvent, status: 500, message: '' });

    // Assert
    expect(consoleErrorSpy).toHaveBeenCalledWith('Client Hook Error:', mockError);
    expect(julesService.reportToJules).toHaveBeenCalledWith(mockError, 'AUTO');
    expect(consoleWarnSpy).toHaveBeenCalledWith('Failed to send error report to Jules:', reportError);

    // Crucially, it must still return the fallback message
    expect(result).toEqual({
      message: 'An unexpected error occurred. Jules has been notified.',
      code: 'UNKNOWN',
    });
  });
});
