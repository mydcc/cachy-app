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
 * What each exchange can actually do — FEAT-0017.
 *
 * This file used to *be* the answer: one hand-maintained table, a seam
 * standing in until FEAT-0016's adapter interface existed. It no longer holds
 * facts. Each venue now declares itself in its own module and this file only
 * gathers them, so widening Bitunix cannot silently widen Bitget — the
 * property `exchangeCapabilities.test.ts` pins.
 *
 * Why gather the declarations rather than read `adapter.capabilities` through
 * the registry, which is the more obvious shape: `orderGate` is a consumer,
 * and it imports nothing but `decimal.js` on purpose. Going through the
 * registry would put `apiService`, both WebSocket services, `tradeService` and
 * `settingsState` in the import graph of the one module whose docstring
 * promises no network and no store reads. The adapters read the same
 * declarations for their own `capabilities` property, so both paths agree by
 * construction rather than by convention.
 *
 * The types moved to `exchange/capabilityTypes.ts` and are re-exported here;
 * existing importers (`PlaceOrderPanel`, `orderPlacementService`,
 * `exchange/types.ts`) are unaffected.
 */

import { bitunixCapabilities } from "./exchange/bitunixCapabilities";
import { bitgetCapabilities } from "./exchange/bitgetCapabilities";
import type {
    ExchangeCapabilities,
    OrderEntryType,
    TimeInForce,
    MarginMode,
    PositionMode,
} from "./exchange/capabilityTypes";

export type {
    ExchangeCapabilities,
    OrderEntryType,
    TimeInForce,
    MarginMode,
    PositionMode,
};

const CAPABILITIES: Readonly<Record<string, ExchangeCapabilities>> = Object.freeze({
    bitunix: bitunixCapabilities,
    bitget: bitgetCapabilities,
});

/**
 * The answer for a venue nobody declared.
 *
 * Nothing rather than a default set: an unknown venue is the one case where
 * assuming capability is guaranteed to be wrong. Exported so the gate can
 * distinguish "this venue cannot do it" from "there is no such venue", which
 * are different messages to a trader.
 */
export const UNKNOWN_EXCHANGE: ExchangeCapabilities = Object.freeze({
    orderTypes: Object.freeze([] as const),
    tpSlAtEntry: false,
    timeInForce: Object.freeze([] as const),
    multipleTakeProfits: false,
    marginModes: Object.freeze([] as const),
    positionModes: Object.freeze([] as const),
    trailingStop: false,
    addToPosition: false,
});

/**
 * Capabilities of one exchange; `UNKNOWN_EXCHANGE` for a venue never declared.
 *
 * Routed through `isKnownExchange` rather than `CAPABILITIES[exchange] ?? …`:
 * the table is an object literal, so it inherits from `Object.prototype` and
 * `CAPABILITIES["constructor"]` yields a *function*, which `??` then happily
 * returns. The venue id comes from `settingsState.apiProvider`, which lives in
 * localStorage and is therefore user-writable — and the caller most exposed to
 * the result is `orderGate`, where `caps.orderTypes.includes(…)` on a function
 * would throw while submitting an order.
 */
export function capabilitiesOf(exchange: string): ExchangeCapabilities {
    return isKnownExchange(exchange) ? CAPABILITIES[exchange] : UNKNOWN_EXCHANGE;
}

/** Whether a venue declared itself at all. */
export function isKnownExchange(exchange: string): boolean {
    return Object.prototype.hasOwnProperty.call(CAPABILITIES, exchange);
}

export function supportsOrderType(exchange: string, type: OrderEntryType): boolean {
    return capabilitiesOf(exchange).orderTypes.includes(type);
}

/**
 * Whether a time-in-force may ride on a limit order here.
 *
 * A venue with an empty `timeInForce` accepts none, so every value is refused
 * — that is Bitget today, and it is why the UI hides the row rather than
 * offering four buttons that all fail.
 */
export function supportsTimeInForce(exchange: string, tif: TimeInForce): boolean {
    return capabilitiesOf(exchange).timeInForce.includes(tif);
}

export function supportsMarginMode(exchange: string, mode: MarginMode): boolean {
    return capabilitiesOf(exchange).marginModes.includes(mode);
}

export function supportsPositionMode(exchange: string, mode: PositionMode): boolean {
    return capabilitiesOf(exchange).positionModes.includes(mode);
}

/**
 * Why a type is unavailable, as an i18n key — the UI shows this on hover
 * rather than silently omitting the control, so a trader looking for limit
 * orders learns they are missing instead of assuming they misread the panel.
 */
export function unsupportedReasonKey(exchange: string, type: OrderEntryType): string {
    if (!isKnownExchange(exchange)) {
        return "orderEntry.unsupported.unknownExchange";
    }
    if (type === "trigger") return "orderEntry.unsupported.trigger";
    return "orderEntry.unsupported.generic";
}

/**
 * Why a time-in-force is unavailable. Separate from the order-type key
 * because the two have different remedies: an unsupported TIF means "place it
 * without one", an unsupported type means "use a different type".
 */
export function unsupportedTimeInForceReasonKey(exchange: string): string {
    if (!isKnownExchange(exchange)) {
        return "orderEntry.unsupported.unknownExchange";
    }
    return "orderEntry.unsupported.timeInForce";
}
