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

interface Connection {
    effectiveType: string;
    saveData: boolean;
    rtt: number;
    addEventListener: (type: string, listener: any) => void;
}

describe('NetworkMonitor', () => {
  let mockConnection: Connection;

  beforeEach(() => {
    mockConnection = {
      effectiveType: '4g',
      saveData: false,
      rtt: 50,
      addEventListener: vi.fn(),
    };

    // Use stubGlobal to mock navigator cleanly
    vi.stubGlobal('navigator', {
      connection: mockConnection,
      userAgent: 'test-agent',
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('should initialize and attach event listener', () => {
    const monitor = new NetworkMonitor();
    expect(mockConnection.addEventListener).toHaveBeenCalledWith('change', expect.any(Function));
  });

  it('should detect low end connection correctly', () => {
    const monitor = new NetworkMonitor();

    // Default 4g
    expect(monitor.isLowEndConnection).toBe(false);

    // 3g is NOT considered low-end in implementation (only 2g/slow-2g)
    mockConnection.effectiveType = '3g';
    expect(monitor.isLowEndConnection).toBe(false);

    // 2g
    mockConnection.effectiveType = '2g';
    expect(monitor.isLowEndConnection).toBe(true);

    // slow-2g
    mockConnection.effectiveType = 'slow-2g';
    expect(monitor.isLowEndConnection).toBe(true);

    // saveData
    mockConnection.effectiveType = '4g';
    mockConnection.saveData = true;
    expect(monitor.isLowEndConnection).toBe(true);
  });

  it('should return correct throttle multiplier', () => {
    const monitor = new NetworkMonitor();

    // Normal 4g -> 1.0
    mockConnection.effectiveType = '4g';
    mockConnection.saveData = false;
    expect(monitor.getThrottleMultiplier()).toBe(1.0);

    // 3g -> 1.5
    mockConnection.effectiveType = '3g';
    expect(monitor.getThrottleMultiplier()).toBe(1.5);

    // 2g -> 3.0
    mockConnection.effectiveType = '2g';
    expect(monitor.getThrottleMultiplier()).toBe(3.0);

    // slow-2g -> 4.0
    mockConnection.effectiveType = 'slow-2g';
    expect(monitor.getThrottleMultiplier()).toBe(4.0);

    // saveData -> 2.0 (overrides 4g)
    mockConnection.effectiveType = '4g';
    mockConnection.saveData = true;
    expect(monitor.getThrottleMultiplier()).toBe(2.0);

    // 3g AND saveData -> 1.5 (connection type takes precedence based on implementation order)
    mockConnection.effectiveType = '3g';
    mockConnection.saveData = true;
    expect(monitor.getThrottleMultiplier()).toBe(1.5);
  });

  it('should return estimated RTT', () => {
    const monitor = new NetworkMonitor();
    expect(monitor.estimatedRtt).toBe(50);

    mockConnection.rtt = 200;
    expect(monitor.estimatedRtt).toBe(200);
  });

  it('should handle missing navigator.connection gracefully', () => {
     // Setup navigator without connection
     vi.stubGlobal('navigator', {
        userAgent: 'test-agent'
        // connection is missing
     });

     const monitor = new NetworkMonitor();

     // Should not crash and return defaults
     expect(monitor.isLowEndConnection).toBe(false);
     expect(monitor.getThrottleMultiplier()).toBe(1.0);
     expect(monitor.estimatedRtt).toBe(0);
  });
});
