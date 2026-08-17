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

/*
 * Which adapter is in force — the one place that reads `settingsState
 * .apiProvider` on behalf of the UI.
 *
 * Before FEAT-0016 that read was scattered: components called
 * `bitunixWs.subscribeTrade` unconditionally, `fetchMarketSnapshot("bitunix")`
 * with the venue spelled into the call site, `fetchBitunixKlines` from a
 * store. Every one of those was correct only as long as Bitunix happened to be
 * the active exchange.
 */

import { settingsState } from "../../stores/settings.svelte";
import { bitunixAdapter } from "./bitunixAdapter";
import { bitgetAdapter } from "./bitgetAdapter";
import type { ExchangeAdapter, ExchangeId } from "./types";

const ADAPTERS: Record<ExchangeId, ExchangeAdapter> = {
    bitunix: bitunixAdapter,
    bitget: bitgetAdapter,
};

/** Every adapter, for the conformance suite (FEAT-0018) to iterate. */
export const exchangeAdapters: readonly ExchangeAdapter[] = Object.freeze([
    bitunixAdapter,
    bitgetAdapter,
]);

/**
 * The adapter for one venue.
 *
 * An id the registry has never heard of falls back to Bitunix and says so in
 * the log, matching what the call sites did before FEAT-0016 (`settingsState
 * .apiProvider || "bitunix"`). Throwing here would turn a bad settings value
 * into a blank trading screen; the venue-level guards inside each WS service
 * and proxy route still refuse to act on a provider that is not active.
 */
export function getExchangeAdapter(id: string): ExchangeAdapter {
    return ADAPTERS[id as ExchangeId] ?? bitunixAdapter;
}

/**
 * The adapter for the exchange the user currently has selected.
 *
 * Call it at use time, not at module load: `apiProvider` changes at runtime
 * (settings, and the offline banner's fallback), and a captured adapter would
 * keep talking to the previous venue.
 */
export function activeExchange(): ExchangeAdapter {
    return getExchangeAdapter(settingsState.apiProvider || "bitunix");
}
