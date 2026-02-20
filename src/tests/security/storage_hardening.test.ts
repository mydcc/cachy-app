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

// Mock $app/environment
vi.mock('$app/environment', () => ({
  browser: true,
  dev: false,
  building: false,
  version: 'test'
}));

// Mock cryptoService - use resolved path matching the real import or alias
// The file is in src/services/cryptoService.ts
// SettingsManager imports from "../services/cryptoService" (relative)
// Test is in src/tests/security
// Relative from test: "../../services/cryptoService"

const getOrGenerateDeviceKey = vi.fn();

// Use relative path matching the test file location
vi.mock('../../services/cryptoService', () => ({
  cryptoService: {
    getOrGenerateDeviceKey: (...args) => getOrGenerateDeviceKey(...args),
    encrypt: vi.fn(async () => ({ ciphertext: 'abc', iv: '123', salt: '456', method: 'AES-GCM' })),
    decrypt: vi.fn(async () => 'decrypted-value'),
    unlockSession: vi.fn(async () => true),
    isUnlocked: vi.fn(() => true),
  }
}));

// Mock browser environment
vi.stubGlobal('localStorage', {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
});

import { SettingsManager } from '../../stores/settings.svelte';

describe('Storage Hardening Security', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should restore sensitive keys using Device Key on load', async () => {
        getOrGenerateDeviceKey.mockResolvedValue('mock-device-key');

        // This test simulates loading settings and ensures it tries to get the device key
        new SettingsManager();

        // Wait a tick for async load
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(getOrGenerateDeviceKey).toHaveBeenCalled();
    });
});
