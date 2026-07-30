// @vitest-environment jsdom
/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { presetState } from './preset.svelte';
import { flushSync } from 'svelte';

describe('PresetManager', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        // Reset state before each test
        presetState.availablePresets = [];
        presetState.selectedPreset = '';
    });

    afterEach(() => {
        vi.runOnlyPendingTimers();
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it('should have initial state', () => {
        expect(presetState.availablePresets).toEqual([]);
        expect(presetState.selectedPreset).toEqual('');
    });

    it('should update state using update method', () => {
        presetState.update((curr) => ({
            availablePresets: ['preset1', 'preset2'],
            selectedPreset: 'preset1'
        }));

        expect(presetState.availablePresets).toEqual(['preset1', 'preset2']);
        expect(presetState.selectedPreset).toEqual('preset1');
    });

    it('should call subscriber immediately with initial state', () => {
        const subscriber = vi.fn();
        const unsubscribe = presetState.subscribe(subscriber);

        expect(subscriber).toHaveBeenCalledTimes(1);
        expect(subscriber).toHaveBeenCalledWith({
            availablePresets: [],
            selectedPreset: ''
        });

        unsubscribe();
    });

    it('should debounce state changes and notify subscribers after 20ms', async () => {
        const subscriber = vi.fn();
        const unsubscribe = presetState.subscribe(subscriber);

        // Initial call
        expect(subscriber).toHaveBeenCalledTimes(1);

        // Mutate state multiple times rapidly
        presetState.availablePresets = ['p1'];
        presetState.selectedPreset = 'p1';
        presetState.availablePresets = ['p1', 'p2'];

        // The debounce lives in an $effect inside $effect.root. flushSync() does
        // not run effects in a detached root, so the previous version of this
        // test never got as far as scheduling the 20ms timer — notifyTimer stayed
        // null and the synchronous advanceTimersByTime had nothing to fire.
        //
        // The async timer helpers flush microtasks between ticks, which lets
        // Svelte's scheduler run the effect first. favorites.test.ts already
        // documents this ("advancing timers without tick sometimes misses the
        // batched update"); this follows the same pattern.
        await vi.advanceTimersByTimeAsync(25);

        // Should be called exactly once more with the final state
        expect(subscriber).toHaveBeenCalledTimes(2);
        expect(subscriber).toHaveBeenCalledWith({
            availablePresets: ['p1', 'p2'],
            selectedPreset: 'p1'
        });

        unsubscribe();
    });

    it('should not notify subscribers after unsubscribing', () => {
        const subscriber = vi.fn();
        const unsubscribe = presetState.subscribe(subscriber);

        expect(subscriber).toHaveBeenCalledTimes(1);

        unsubscribe();

        // Mutate state
        presetState.availablePresets = ['p1'];
        flushSync();

        vi.advanceTimersByTime(25);

        // Should still be 1
        expect(subscriber).toHaveBeenCalledTimes(1);
    });

    it('should not notify subscribers when unsubscribing with a pending timer', () => {
        const subscriber = vi.fn();
        const unsubscribe = presetState.subscribe(subscriber);

        expect(subscriber).toHaveBeenCalledTimes(1);

        // Mutate state to schedule a debounced notification
        presetState.availablePresets = ['p1'];
        flushSync();

        // Unsubscribe while the timer is still pending
        unsubscribe();

        // Advance past the debounce window
        vi.advanceTimersByTime(25);

        // Should still be 1 — the pending timer must have been cleared
        expect(subscriber).toHaveBeenCalledTimes(1);
    });
});
