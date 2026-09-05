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

/*
 * Chart pattern content lives in chartPatterns.<id> locale entries (the
 * data file only carries ids). This test pins DE/EN parity per pattern id:
 * same fields, same characteristics length, no empty strings. Optional
 * fields (advancedConsiderations, performanceStats) must exist in EN
 * exactly when they exist in DE.
 */

import { describe, it, expect } from 'vitest';
import { CHART_PATTERNS } from './chartPatterns';
import de from '../locales/locales/de.json';
import en from '../locales/locales/en.json';

type Entry = Record<string, unknown>;

const dePatterns = (de.chartPatterns ?? {}) as Record<string, Entry>;
const enPatterns = (en.chartPatterns ?? {}) as Record<string, Entry>;

const REQUIRED = ['name', 'category', 'description', 'trading'] as const;
const OPTIONAL = ['advancedConsiderations', 'performanceStats'] as const;

function nonEmpty(value: unknown): value is string {
    return typeof value === 'string' && value.trim().length > 0;
}

describe('Chart pattern locale parity', () => {
    it('every pattern id has matching DE/EN entries with the same shape', () => {
        expect(CHART_PATTERNS.length).toBeGreaterThan(0);
        for (const p of CHART_PATTERNS) {
            const d = dePatterns[p.id];
            const e = enPatterns[p.id];
            expect(d, `missing DE chartPatterns entry for ${p.id}`).toBeDefined();
            expect(e, `missing EN chartPatterns entry for ${p.id}`).toBeDefined();
            if (!d || !e) continue;

            for (const field of REQUIRED) {
                expect(nonEmpty(d[field]), `empty DE ${p.id}.${field}`).toBe(true);
                expect(nonEmpty(e[field]), `empty EN ${p.id}.${field}`).toBe(true);
            }

            const dChars = d['characteristics'];
            const eChars = e['characteristics'];
            expect(Array.isArray(dChars), `DE ${p.id}.characteristics not an array`).toBe(true);
            expect(Array.isArray(eChars), `EN ${p.id}.characteristics not an array`).toBe(true);
            if (Array.isArray(dChars) && Array.isArray(eChars)) {
                expect(eChars.length, `characteristics length mismatch for ${p.id}`).toBe(dChars.length);
                for (const item of [...dChars, ...eChars]) {
                    expect(nonEmpty(item), `empty characteristics item for ${p.id}`).toBe(true);
                }
            }

            for (const field of OPTIONAL) {
                expect(field in e, `optional field presence mismatch for ${p.id}.${field}`).toBe(field in d);
                if (field in e) {
                    expect(nonEmpty(e[field]), `empty EN ${p.id}.${field}`).toBe(true);
                }
            }
        }
    });
});
