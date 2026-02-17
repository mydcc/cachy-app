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

// Mock browser env
vi.mock('$app/environment', () => ({ browser: false }));

// Mock dependencies
vi.mock('./settings.svelte', () => ({
  settingsState: { minChatProfitFactor: 2 }
}));
vi.mock('./journal.svelte', () => ({ journalState: {} }));
vi.mock('../lib/calculator', () => ({ calculator: {} }));
vi.mock('../lib/windows/WindowManager.svelte', () => ({ windowManager: {} }));

// Import the module under test
import { chatState } from './chat.svelte';

describe('ChatManager', () => {
  beforeEach(() => {
    // chatState is a singleton. Reset internal state via casting to avoid type errors
    // Since we can't easily re-instantiate, we mutate the instance.
    (chatState as any).messages = [];
    (chatState as any).latestSeenTimestamp = 0;
    (chatState as any).clientId = "test-client-id";
  });

  it('filters incoming messages based on profit factor (minPF=2)', () => {
    const current: any[] = [];
    const incoming: any[] = [
      { id: '1', text: 'Low PF', timestamp: 100, profitFactor: 1 },
      { id: '2', text: 'High PF', timestamp: 101, profitFactor: 3 },
      { id: '3', text: 'No PF', timestamp: 102 } // undefined PF -> 0
    ];

    // Access private method via cast
    const merged = (chatState as any).mergeMessages(current, incoming);

    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe('2');
    expect(merged[0].profitFactor).toBe(3);
  });

  it('updates latestSeenTimestamp correctly even if filtered', () => {
    const current: any[] = [];
    const incoming: any[] = [
      { id: '1', text: 'New', timestamp: 200, profitFactor: 1 } // filtered out (PF < 2)
    ];

    // Set initial state
    (chatState as any).latestSeenTimestamp = 100;

    const merged = (chatState as any).mergeMessages(current, incoming);

    // Verify it was filtered
    expect(merged).toHaveLength(0);

    // Verify timestamp was updated based on incoming max
    expect((chatState as any).latestSeenTimestamp).toBe(200);
  });

  it('handles empty incoming array gracefully', () => {
      const current: any[] = [{ id: 'old', timestamp: 50, profitFactor: 5 }];
      const incoming: any[] = [];

      (chatState as any).latestSeenTimestamp = 50;

      const merged = (chatState as any).mergeMessages(current, incoming);

      expect(merged).toHaveLength(1);
      expect(merged[0].id).toBe('old');
      expect((chatState as any).latestSeenTimestamp).toBe(50); // Should not change if no incoming
  });

  it('handles mixed valid and invalid messages', () => {
      const current: any[] = [];
      const incoming: any[] = [
          { id: '1', text: 'Valid', timestamp: 300, profitFactor: 5 },
          { id: '2', text: 'Invalid', timestamp: 305, profitFactor: 0.5 }
      ];

      (chatState as any).latestSeenTimestamp = 290;

      const merged = (chatState as any).mergeMessages(current, incoming);

      expect(merged).toHaveLength(1);
      expect(merged[0].id).toBe('1');
      expect((chatState as any).latestSeenTimestamp).toBe(305); // Max of incoming, even if filtered
  });

  // New Tests for Exemptions
  it('exempts system messages from profit factor filter', () => {
    const current: any[] = [];
    const incoming: any[] = [
        { id: 'sys1', text: 'System Msg', timestamp: 400, sender: 'system' } // undefined PF
    ];

    const merged = (chatState as any).mergeMessages(current, incoming);

    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe('sys1');
  });

  it('exempts own messages from profit factor filter (by clientId)', () => {
    const current: any[] = [];
    const incoming: any[] = [
        { id: 'me1', text: 'My Low PF Msg', timestamp: 500, profitFactor: 0.1, clientId: 'test-client-id' }
    ];

    const merged = (chatState as any).mergeMessages(current, incoming);

    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe('me1');
  });

   it('exempts own messages from profit factor filter (by senderId)', () => {
    const current: any[] = [];
    const incoming: any[] = [
        { id: 'me2', text: 'My Low PF Msg', timestamp: 600, profitFactor: 0.1, senderId: 'me' }
    ];

    const merged = (chatState as any).mergeMessages(current, incoming);

    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe('me2');
  });
});
