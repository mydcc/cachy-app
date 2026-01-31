import { bench, describe } from 'vitest';
import { indicatorState } from '../stores/indicator.svelte';

describe('Indicator State Cloning', () => {
  const state = indicatorState.toJSON();

  bench('toJSON()', () => {
    indicatorState.toJSON();
  });

  bench('JSON.stringify(state)', () => {
    JSON.stringify(state);
  });

  bench('structuredClone(state)', () => {
    structuredClone(state);
  });
});
