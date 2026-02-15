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
    // chatState is a singleton. Reset internal state via casting
    (chatState as any).messages = [];
    (chatState as any).latestSeenTimestamp = 0;
  });

  it('filters incoming messages based on profit factor (minPF=2)', () => {
    const current: any[] = [];
    const incoming: any[] = [
      { id: '1', text: 'Low PF', timestamp: 100, profitFactor: 1 },
      { id: '2', text: 'High PF', timestamp: 101, profitFactor: 3 },
      { id: '3', text: 'No PF', timestamp: 102 } // undefined PF -> 0
    ];

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

    (chatState as any).latestSeenTimestamp = 100;

    const merged = (chatState as any).mergeMessages(current, incoming);

    expect(merged).toHaveLength(0);
    expect((chatState as any).latestSeenTimestamp).toBe(200);
  });

  it('handles empty incoming array gracefully', () => {
      const current: any[] = [{ id: 'old', timestamp: 50, profitFactor: 5 }];
      const incoming: any[] = [];

      (chatState as any).latestSeenTimestamp = 50;

      const merged = (chatState as any).mergeMessages(current, incoming);

      expect(merged).toHaveLength(1);
      expect(merged[0].id).toBe('old');
      expect((chatState as any).latestSeenTimestamp).toBe(50);
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
      expect((chatState as any).latestSeenTimestamp).toBe(305);
  });
});
