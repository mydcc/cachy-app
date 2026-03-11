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

import { describe, it, expect } from 'vitest';
import { getChannelsForRequirement, DATA_REQUIREMENTS, REQUIREMENT_TO_CHANNELS } from './dataRequirements';

describe('dataRequirements', () => {
  describe('getChannelsForRequirement', () => {
    it('should return correct channels for standard requirements', () => {
      // Test using keys directly from REQUIREMENT_TO_CHANNELS to avoid brittleness
      const requirements = Object.keys(REQUIREMENT_TO_CHANNELS);
      expect(requirements.length).toBeGreaterThan(0);

      requirements.forEach(req => {
        expect(getChannelsForRequirement(req)).toEqual(REQUIREMENT_TO_CHANNELS[req]);
      });
    });

    it('should return the requirement itself for kline requirements', () => {
      expect(getChannelsForRequirement('kline_1h')).toEqual(['kline_1h']);
      expect(getChannelsForRequirement('kline_5m')).toEqual(['kline_5m']);
      expect(getChannelsForRequirement('kline_1d')).toEqual(['kline_1d']);
    });

    it('should return an empty array for unknown requirements', () => {
      expect(getChannelsForRequirement('non_existent')).toEqual([]);
      expect(getChannelsForRequirement('')).toEqual([]);
    });
  });

  describe('DATA_REQUIREMENTS and REQUIREMENT_TO_CHANNELS consistency', () => {
    it('should have a mapping for every requirement used in DATA_REQUIREMENTS', () => {
      const allRequirementsUsed = new Set<string>();

      Object.values(DATA_REQUIREMENTS).forEach(requirements => {
        requirements.forEach(req => allRequirementsUsed.add(req));
      });

      allRequirementsUsed.forEach(req => {
        // Either it's a kline requirement or it must be in REQUIREMENT_TO_CHANNELS
        if (!req.startsWith('kline_')) {
          expect(REQUIREMENT_TO_CHANNELS[req], `Missing mapping for ${req}`).toBeDefined();
          expect(Array.isArray(REQUIREMENT_TO_CHANNELS[req])).toBe(true);
          expect(REQUIREMENT_TO_CHANNELS[req].length).toBeGreaterThan(0);
        }
      });
    });
  });
});
