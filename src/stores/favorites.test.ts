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
import { MAX_FAVORITE_SYMBOLS } from './settings.svelte';

vi.mock('$app/env', () => ({ browser: true }));

/**
 * Since BUG-0232 this store no longer owns a `cachy_favorites` key; it is a
 * view over `settingsState.favoriteSymbols`. So the thing worth asserting is
 * that a write lands in the settings store -- writing it through to
 * localStorage is the settings store's debounced job, covered by its own tests.
 */
async function settingsFavourites(): Promise<string[]> {
  const { settingsState } = await import('./settings.svelte');
  return settingsState.favoriteSymbols;
}

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

  it('should migrate a legacy cachy_favorites list on first load', async () => {
    localStorage.setItem("cachy_favorites", JSON.stringify(["DOGEUSDT", "ADAUSDT"]));
    const { favoritesState } = await import('./favorites.svelte');
    expect(favoritesState.items).toEqual(["DOGEUSDT", "ADAUSDT"]);
  });

  it('should add a new symbol and uppercase it', async () => {
    const { favoritesState } = await import('./favorites.svelte');
    favoritesState.items = []; // Clear defaults for this test

    favoritesState.toggleFavorite('xrpusdt');

    expect(favoritesState.items).toEqual(['XRPUSDT']);
    expect(await settingsFavourites()).toEqual(['XRPUSDT']);
  });

  it('BUG-0599: matches a favourite saved under the legacy suffix', async () => {
    // Favourites added while Bitget symbols carried the V1 `_UMCBL` suffix are
    // still in the settings list, while the symbols arriving from the UI no
    // longer carry it. A plain `includes` reports the existing favourite as
    // absent, and toggling would then append a second entry rather than remove
    // the first, leaving the original unreachable.
    const { favoritesState } = await import('./favorites.svelte');
    favoritesState.items = ['BTCUSDT_UMCBL', 'ETHUSDT'];

    expect(favoritesState.has('BTCUSDT')).toBe(true);
    expect(favoritesState.has('btcusdt')).toBe(true);
    expect(favoritesState.has('SOLUSDT')).toBe(false);
  });

  it('BUG-0599: toggles off a legacy-suffixed favourite instead of duplicating it', async () => {
    const { favoritesState } = await import('./favorites.svelte');
    favoritesState.items = ['BTCUSDT_UMCBL', 'ETHUSDT'];

    favoritesState.toggleFavorite('BTCUSDT');

    expect(favoritesState.items).toEqual(['ETHUSDT']);
  });

  it('should remove a symbol if already present', async () => {
    const { favoritesState } = await import('./favorites.svelte');
    favoritesState.items = ['BTCUSDT', 'ETHUSDT'];

    favoritesState.toggleFavorite('ethusdt');

    expect(favoritesState.items).toEqual(['BTCUSDT']);
    expect(await settingsFavourites()).toEqual(['BTCUSDT']);
  });

  it('should not add a symbol once MAX_FAVORITE_SYMBOLS is reached', async () => {
    const { favoritesState } = await import('./favorites.svelte');
    const full = Array.from({ length: MAX_FAVORITE_SYMBOLS }, (_, i) => `SYM${i}`);
    favoritesState.items = full;

    favoritesState.toggleFavorite('ONE_TOO_MANY');

    expect(favoritesState.items).toEqual(full);
  });

  it('should not add or remove if symbol is empty', async () => {
    const { favoritesState } = await import('./favorites.svelte');
    favoritesState.items = ['A', 'B'];

    favoritesState.toggleFavorite('');

    expect(favoritesState.items).toEqual(['A', 'B']);
  });

  it('should handle a broken legacy list gracefully during migration', async () => {
    localStorage.setItem("cachy_favorites", "{ broken json");
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { favoritesState } = await import('./favorites.svelte');
    // Falls back to the defaults rather than throwing at module import time.
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
