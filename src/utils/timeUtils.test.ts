/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
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
import { safeTfToMs } from './timeUtils';

describe('safeTfToMs', () => {
    it('should parse valid timeframes correctly', () => {
        expect(safeTfToMs('1m')).toBe(60000);
        expect(safeTfToMs('5m')).toBe(300000);
        expect(safeTfToMs('1h')).toBe(3600000);
        expect(safeTfToMs('4h')).toBe(14400000);
        expect(safeTfToMs('1d')).toBe(86400000);
        expect(safeTfToMs('1w')).toBe(604800000);
    });

    it('should return default for invalid formats', () => {
        expect(safeTfToMs('')).toBe(60000);
        expect(safeTfToMs('invalid')).toBe(60000);
        expect(safeTfToMs('1x')).toBe(60000); // Invalid unit
        expect(safeTfToMs('-1m')).toBe(60000); // Negative not matched by regex
    });

    it('should return default for non-string inputs', () => {
        expect(safeTfToMs(null as any)).toBe(60000);
        expect(safeTfToMs(undefined as any)).toBe(60000);
    });
});
