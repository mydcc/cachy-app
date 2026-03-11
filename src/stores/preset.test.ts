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
        // Reset state before each test
        presetState.availablePresets = [];
        presetState.selectedPreset = '';
    });

    afterEach(() => {
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
        flushSync();
        presetState.selectedPreset = 'p1';
        flushSync();
        presetState.availablePresets = ['p1', 'p2'];
        flushSync();

        // Let the internal setTimeout(20ms) finish
        await new Promise(r => setTimeout(r, 50));

        // Should be called exactly once more with the final state
        expect(subscriber).toHaveBeenCalledTimes(2);
        expect(subscriber).toHaveBeenCalledWith({
            availablePresets: ['p1', 'p2'],
            selectedPreset: 'p1'
        });

        unsubscribe();
    });

    it('should not notify subscribers after unsubscribing', async () => {
        const subscriber = vi.fn();
        const unsubscribe = presetState.subscribe(subscriber);

        expect(subscriber).toHaveBeenCalledTimes(1);

        unsubscribe();

        // Mutate state
        presetState.availablePresets = ['p1'];
        flushSync();

        await new Promise(r => setTimeout(r, 50));

        // Should still be 1
        expect(subscriber).toHaveBeenCalledTimes(1);
    });
});
