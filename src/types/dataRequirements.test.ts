// @vitest-environment node
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
import { DATA_REQUIREMENTS } from './dataRequirements';
import { exchangeAdapters } from '../services/exchange';

/*
 * FEAT-0227 moved the requirement → channel-name mapping out of this file and
 * onto each adapter, because the names were Bitunix's (`depth_book5`, `price`)
 * and Bitget was being handed them too. The mapping's own tests moved with it,
 * to `services/exchange/channelVocabulary.test.ts`, where they now run against
 * every adapter rather than one venue's table.
 *
 * What is tested here is what stayed: the venue-neutral declaration of which
 * requirements a component has.
 */

describe('DATA_REQUIREMENTS', () => {
    it('declares a non-empty requirement list for every component', () => {
        const entries = Object.entries(DATA_REQUIREMENTS);
        expect(entries.length).toBeGreaterThan(0);

        for (const [component, requirements] of entries) {
            expect(Array.isArray(requirements), `${component} must declare an array`).toBe(true);
            expect(requirements.length, `${component} declares no requirements`).toBeGreaterThan(0);
        }
    });

    /*
     * `positions` and `orders` are private channels. Both services subscribe
     * to them from their own login flow rather than through the registry, so
     * no adapter maps them and a component declaring them is relying on that
     * login flow — not on a public subscription. Listing them here keeps the
     * check below honest about which names are expected to resolve.
     */
    const PRIVATE_REQUIREMENTS = new Set(['positions', 'orders']);

    it('uses only public requirement names some adapter can resolve', () => {
        const allRequirements = new Set<string>();
        Object.values(DATA_REQUIREMENTS).forEach((requirements) => {
            requirements.forEach((req) => allRequirements.add(req));
        });

        for (const requirement of allRequirements) {
            // Klines are timeframe-specific and pass through on every venue.
            if (requirement.startsWith('kline_')) continue;
            if (PRIVATE_REQUIREMENTS.has(requirement)) continue;

            const resolvable = exchangeAdapters.some(
                (adapter) => adapter.marketData.channelsForRequirement(requirement).length > 0,
            );
            expect(
                resolvable,
                `No adapter maps the requirement '${requirement}' to a channel — a component declaring it would subscribe to nothing on every venue`,
            ).toBe(true);
        }
    });

    it('declares no duplicate requirement within one component', () => {
        for (const [component, requirements] of Object.entries(DATA_REQUIREMENTS)) {
            expect(
                new Set(requirements).size,
                `${component} declares the same requirement twice`,
            ).toBe(requirements.length);
        }
    });
});
