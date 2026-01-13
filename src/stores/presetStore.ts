import { writable } from "svelte/store";

export interface PresetState {
  availablePresets: string[];
  selectedPreset: string;
}

const initialPresetState: PresetState = {
  availablePresets: [],
  selectedPreset: "",
};

export const presetStore = writable<PresetState>(initialPresetState);

export const updatePresetStore = (
  updater: (state: PresetState) => PresetState
) => {
  presetStore.update(updater);
};
