/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

// @vitest-environment jsdom

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { flushSync } from 'svelte';

vi.mock('$app/environment', () => ({ browser: true }));

describe('favoritesState', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  it('should initialize with default items when localStorage is empty', async () => {
    const { favoritesState } = await import('./favorites.svelte');
    expect(favoritesState.items).toEqual(["BTCUSDT", "ETHUSDT", "SOLUSDT", "LINKUSDT"]);
  });

  it('should load items from localStorage if available', async () => {
    localStorage.setItem("cachy_favorites", JSON.stringify(["DOGEUSDT", "ADAUSDT"]));
    const { favoritesState } = await import('./favorites.svelte');
    expect(favoritesState.items).toEqual(["DOGEUSDT", "ADAUSDT"]);
  });

  it('should add a new symbol and uppercase it', async () => {
    const { favoritesState } = await import('./favorites.svelte');
    favoritesState.items = []; // Clear defaults for this test

    favoritesState.toggleFavorite('xrpusdt');

    expect(favoritesState.items).toEqual(['XRPUSDT']);
    expect(JSON.parse(localStorage.getItem("cachy_favorites")!)).toEqual(['XRPUSDT']);
  });

  it('should remove a symbol if already present', async () => {
    const { favoritesState } = await import('./favorites.svelte');
    favoritesState.items = ['BTCUSDT', 'ETHUSDT'];

    favoritesState.toggleFavorite('ethusdt');

    expect(favoritesState.items).toEqual(['BTCUSDT']);
    expect(JSON.parse(localStorage.getItem("cachy_favorites")!)).toEqual(['BTCUSDT']);
  });

  it('should not add a symbol if MAX_FAVORITES (4) is reached', async () => {
    const { favoritesState } = await import('./favorites.svelte');
    favoritesState.items = ['A', 'B', 'C', 'D'];

    favoritesState.toggleFavorite('E');

    expect(favoritesState.items).toEqual(['A', 'B', 'C', 'D']);
  });

  it('should not add or remove if symbol is empty', async () => {
    const { favoritesState } = await import('./favorites.svelte');
    favoritesState.items = ['A', 'B'];

    favoritesState.toggleFavorite('');

    expect(favoritesState.items).toEqual(['A', 'B']);
  });

  it('should handle broken localStorage gracefully during load', async () => {
    localStorage.setItem("cachy_favorites", "{ broken json");
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { favoritesState } = await import('./favorites.svelte');
    // Should fallback to default because it fails to parse
    expect(favoritesState.items).toEqual(["BTCUSDT", "ETHUSDT", "SOLUSDT", "LINKUSDT"]);
    expect(consoleSpy).toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  it('should trigger subscribe callback on updates', async () => {
    vi.useFakeTimers();
    const { favoritesState } = await import('./favorites.svelte');
    favoritesState.items = [];

    const callback = vi.fn();
    const cleanup = favoritesState.subscribe(callback);

    // Initial call
    expect(callback).toHaveBeenCalledWith([]);
    expect(callback).toHaveBeenCalledTimes(1);

    // Trigger update
    favoritesState.items = ['XRPUSDT'];

    // In Svelte 5 testing of store subscribe, advancing timers without tick
    // sometimes misses the batched update. Using vitest timers requires
    // flushing microtasks.
    await vi.runAllTimersAsync();

    expect(callback).toHaveBeenCalledWith(['XRPUSDT']);
    expect(callback).toHaveBeenCalledTimes(2);

    cleanup();
    vi.useRealTimers();
  });
});
