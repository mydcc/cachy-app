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

/**
 * Rune-compiled marketState mock for CandleChartView.component.test.ts.
 *
 * Plain `.test.ts` files are not compiled with Svelte 5 rune support, but the
 * component's reactivity contract (`$effect` reading
 * `marketState.data[symbol]?.lastUpdated` / `?.klines`) needs a real `$state`
 * proxy to be testable. This `.svelte.ts` module is that proxy — it keeps the
 * mock a genuine deep-reactive store instead of a plain object that would
 * silently pass every mutation through without notifying the component.
 */
import type { MarketData } from "../../../stores/market/types";

export const marketState = $state<{ data: Record<string, MarketData> }>({
    data: {},
});