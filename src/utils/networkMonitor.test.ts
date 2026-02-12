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

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NetworkMonitor } from './networkMonitor';

// Mock dependencies
vi.mock('$app/environment', () => ({
  browser: true
}));

describe('NetworkMonitor', () => {
  let originalNavigator: any;

  beforeEach(() => {
    // Save original navigator
    // In jsdom environment, navigator is on global/window
    originalNavigator = global.navigator;

    // Create a mock connection object
    const mockConnection = {
      effectiveType: '4g',
      saveData: false,
      rtt: 50,
      addEventListener: vi.fn(),
    };

    // Mock navigator with connection property
    Object.defineProperty(global, 'navigator', {
      value: {
        connection: mockConnection,
        userAgent: 'test-agent',
      },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    // Restore original navigator
    if (originalNavigator !== undefined) {
        Object.defineProperty(global, 'navigator', {
            value: originalNavigator,
            writable: true,
            configurable: true
        });
    }
    vi.clearAllMocks();
  });

  it('should initialize and attach event listener', () => {
    const monitor = new NetworkMonitor();
    expect((global.navigator as any).connection.addEventListener).toHaveBeenCalledWith('change', expect.any(Function));
  });

  it('should detect low end connection correctly', () => {
    const monitor = new NetworkMonitor();

    // Default 4g
    expect(monitor.isLowEndConnection).toBe(false);

    // 2g
    (global.navigator as any).connection.effectiveType = '2g';
    expect(monitor.isLowEndConnection).toBe(true);

    // slow-2g
    (global.navigator as any).connection.effectiveType = 'slow-2g';
    expect(monitor.isLowEndConnection).toBe(true);

    // saveData
    (global.navigator as any).connection.effectiveType = '4g';
    (global.navigator as any).connection.saveData = true;
    expect(monitor.isLowEndConnection).toBe(true);
  });

  it('should return correct throttle multiplier', () => {
    const monitor = new NetworkMonitor();

    // Normal 4g -> 1.0
    (global.navigator as any).connection.effectiveType = '4g';
    (global.navigator as any).connection.saveData = false;
    expect(monitor.getThrottleMultiplier()).toBe(1.0);

    // 3g -> 1.5
    (global.navigator as any).connection.effectiveType = '3g';
    expect(monitor.getThrottleMultiplier()).toBe(1.5);

    // 2g -> 3.0
    (global.navigator as any).connection.effectiveType = '2g';
    expect(monitor.getThrottleMultiplier()).toBe(3.0);

    // slow-2g -> 4.0
    (global.navigator as any).connection.effectiveType = 'slow-2g';
    expect(monitor.getThrottleMultiplier()).toBe(4.0);

    // saveData -> 2.0 (overrides 4g)
    (global.navigator as any).connection.effectiveType = '4g';
    (global.navigator as any).connection.saveData = true;
    expect(monitor.getThrottleMultiplier()).toBe(2.0);

    // 3g AND saveData -> 1.5 (connection type takes precedence based on implementation)
    (global.navigator as any).connection.effectiveType = '3g';
    (global.navigator as any).connection.saveData = true;
    expect(monitor.getThrottleMultiplier()).toBe(1.5);
  });

  it('should return estimated RTT', () => {
    const monitor = new NetworkMonitor();
    expect(monitor.estimatedRtt).toBe(50);

    (global.navigator as any).connection.rtt = 200;
    expect(monitor.estimatedRtt).toBe(200);
  });

  it('should handle missing navigator.connection gracefully', () => {
     // Setup navigator without connection
     Object.defineProperty(global, 'navigator', {
        value: { userAgent: 'test-agent' },
        writable: true,
        configurable: true
     });

     const monitor = new NetworkMonitor();

     // Should not crash and return defaults
     expect(monitor.isLowEndConnection).toBe(false);
     expect(monitor.getThrottleMultiplier()).toBe(1.0);
     expect(monitor.estimatedRtt).toBe(0);
  });
});
