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

// 1. Hoisted variables for capturing callbacks and logger mocks
const {
  mockLogger,
  mockCallbacks
} = vi.hoisted(() => ({
  mockLogger: {
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
  mockCallbacks: {
    onConnect: undefined as any,
    onDisconnect: undefined as any,
    onApplied: undefined as any,
    onInsert: undefined as any,
  }
}));

// 2. Mock logger
vi.mock('./logger', () => ({
  logger: mockLogger,
}));

// 3. Mock SpacetimeDB
vi.mock('../lib/spacetimedb', () => {
  const subscriptionBuilder = {
    onApplied: vi.fn((cb) => {
      mockCallbacks.onApplied = cb;
      return { subscribeToAllTables: vi.fn() };
    })
  };

  const builder = {
    withUri: vi.fn().mockReturnThis(),
    withModuleName: vi.fn().mockReturnThis(),
    withToken: vi.fn().mockReturnThis(),
    onConnect: vi.fn(function(this: any, cb) {
      mockCallbacks.onConnect = cb;
      return this;
    }),
    onDisconnect: vi.fn(function(this: any, cb) {
      mockCallbacks.onDisconnect = cb;
      return this;
    }),
    build: vi.fn(() => ({
      subscriptionBuilder: vi.fn(() => subscriptionBuilder)
    }))
  };

  return {
    DbConnection: {
      builder: vi.fn(() => builder)
    },
    tables: {
      globalMessage: {
        onInsert: vi.fn((cb) => {
          mockCallbacks.onInsert = cb;
        })
      }
    },
    reducers: {
      sendMessage: vi.fn()
    },
    GlobalMessageType: {}
  };
});

// Import service AFTER mocks
import { cloudService } from './cloudService';

describe('CloudService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset singleton state
    (cloudService as any).connected = false;
    (cloudService as any).messages = [];
    (cloudService as any).conn = null;

    // Reset callback holders
    mockCallbacks.onConnect = undefined;
    mockCallbacks.onDisconnect = undefined;
    mockCallbacks.onApplied = undefined;
    mockCallbacks.onInsert = undefined;
  });

  it('should use logger service instead of console', async () => {
    const host = 'http://localhost:3000';

    await cloudService.connect(host);

    // 1. Verify connection log
    expect(mockLogger.log).toHaveBeenCalledWith('network', 'Connecting to SpacetimeDB...', host);

    // 2. Simulate connection success
    expect(mockCallbacks.onConnect).toBeDefined();
    const ctx = { id: 1 };
    mockCallbacks.onConnect(ctx);

    expect(mockLogger.log).toHaveBeenCalledWith('network', 'Connected to SpacetimeDB!', ctx);

    // 3. Simulate subscription applied
    // The onConnect callback should have triggered subscription builder
    // Note: The original code calls subscriptionBuilder() inside the onConnect callback.
    // Our mock needs to ensure that call happens.
    // The mock for builder.build() returns an object with subscriptionBuilder() method.
    // The code: const sub = this.conn?.subscriptionBuilder();
    // My mock: build: vi.fn(() => ({ subscriptionBuilder: ... }))
    // So this.conn is the object returned by build().

    expect(mockCallbacks.onApplied).toBeDefined();
    const appliedCtx = { table: 'all' };
    mockCallbacks.onApplied(appliedCtx);

    expect(mockLogger.debug).toHaveBeenCalledWith('network', 'Subscription applied', appliedCtx);

    // 4. Simulate message received
    expect(mockCallbacks.onInsert).toBeDefined();
    const msg = { text: 'hello' };
    mockCallbacks.onInsert(ctx, msg);

    expect(mockLogger.debug).toHaveBeenCalledWith('network', 'New Message Received:', msg);

    // 5. Simulate disconnect
    expect(mockCallbacks.onDisconnect).toBeDefined();
    mockCallbacks.onDisconnect(ctx);

    expect(mockLogger.log).toHaveBeenCalledWith('network', 'Disconnected from SpacetimeDB', ctx);
  });
});
