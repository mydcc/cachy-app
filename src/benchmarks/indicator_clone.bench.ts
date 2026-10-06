/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import { describe, test } from 'vitest';
import { indicatorState } from '../stores/indicator.svelte';

describe('Indicator State Cloning', () => {
  const state = indicatorState.toJSON();

  test('toJSON()', async ({ bench }) => {
    await bench('toJSON()', () => {
      indicatorState.toJSON();
    }).run();
  });

  test('JSON.stringify(state)', async ({ bench }) => {
    await bench('JSON.stringify(state)', () => {
      JSON.stringify(state);
    }).run();
  });

  test('structuredClone(state)', async ({ bench }) => {
    await bench('structuredClone(state)', () => {
      structuredClone(state);
    }).run();
  });
});
