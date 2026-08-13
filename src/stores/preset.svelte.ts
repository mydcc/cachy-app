/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */
import { untrack } from "svelte";

export interface PresetState {
  availablePresets: string[];
  selectedPreset: string;
}

class PresetManager {
  availablePresets = $state<string[]>([]);
  selectedPreset = $state<string>("");

  // Helper compatibility
  update(fn: (curr: PresetState) => PresetState) {
    const current: PresetState = {
      availablePresets: this.availablePresets,
      selectedPreset: this.selectedPreset,
    };
    const next = fn(current);
    this.availablePresets = next.availablePresets;
    this.selectedPreset = next.selectedPreset;
  }



  subscribe(fn: (value: PresetState) => void) {
    let localTimer: ReturnType<typeof setTimeout> | null = null;
    const getSnapshot = () => ({
      availablePresets: this.availablePresets,
      selectedPreset: this.selectedPreset,
    });
    fn(getSnapshot());
    const cleanup = $effect.root(() => {
      $effect(() => {
        const snap = getSnapshot(); // Track
        untrack(() => {
          if (localTimer) clearTimeout(localTimer);
          localTimer = setTimeout(() => {
            fn(snap);
            localTimer = null;
          }, 20);
        });
      });
    });
    return () => {
      cleanup();
      if (localTimer) {
        clearTimeout(localTimer);
        localTimer = null;
      }
    };
  }
}

export const presetState = new PresetManager();
