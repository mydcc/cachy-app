// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SettingsManager } from './settings.svelte';

// Mock the `$app/environment` module's `browser` export.
vi.mock('$app/environment', () => ({
  browser: true
}));

describe('SettingsManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  })

  it('removes the storage event listener on destroy', () => {
    const addEventListenerSpy = vi.spyOn(window, 'addEventListener');
    const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');

    const settings = new SettingsManager();

    expect(addEventListenerSpy).toHaveBeenCalledWith('storage', expect.any(Function));

    const handler = addEventListenerSpy.mock.calls.find(call => call[0] === 'storage')?.[1] as EventListener;
    expect(handler).toBeDefined();

    settings.destroy();

    expect(removeEventListenerSpy).toHaveBeenCalledWith('storage', handler);
  });
});
