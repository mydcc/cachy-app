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
 * What each exchange can actually do — a seam, not the real thing.
 *
 * FEAT-0021 needs this to hide order types the active exchange cannot place;
 * FEAT-0017 is the item that builds it properly, from declarations each
 * adapter makes about itself, and FEAT-0017 in turn waits on FEAT-0016's
 * adapter interface. Neither exists yet.
 *
 * So this file states the same facts by hand, in the shape FEAT-0017 will
 * serve them, and the UI reads it through the accessor below. When FEAT-0017
 * lands it replaces the table's *source*, not its consumers.
 *
 * The Bitget entry is deliberately narrow. Cachy has no verified wire format
 * for attached TP/SL or conditional orders there, and BUG-0001 is what
 * guessing an exchange's field names looks like in production. Claiming less
 * than an exchange can do costs a feature; claiming more fails after the user
 * has committed, which is the worse of the two.
 */

export type OrderEntryType = "market" | "limit" | "trigger";

export type TimeInForce = "GTC" | "IOC" | "FOK" | "POST_ONLY";

export interface ExchangeCapabilities {
    /** Entry types the UI may offer. */
    orderTypes: readonly OrderEntryType[];
    /**
     * Whether a stop and target can ride along with the entry in one request.
     * False means they have to be placed afterwards, which opens a window in
     * which the position exists unprotected — see `orderPlacementService`.
     */
    tpSlAtEntry: boolean;
    /** Time-in-force values accepted on a limit order; empty means none. */
    timeInForce: readonly TimeInForce[];
    /** Whether more than one take-profit level can be attached at entry. */
    multipleTakeProfits: boolean;
}

const CAPABILITIES: Record<string, ExchangeCapabilities> = {
    bitunix: {
        // Trigger orders are absent on purpose: the plan-order endpoint family
        // is missing from the doc crawl (see INTEGRATION_STATUS.md's TODO), so
        // Cachy has no verified request shape for one. It goes in when the
        // crawl covers it, not before.
        orderTypes: ["market", "limit"],
        tpSlAtEntry: true,
        timeInForce: ["GTC", "IOC", "FOK", "POST_ONLY"],
        // place_order carries exactly one tpPrice/slPrice pair. A ladder of
        // targets needs batch_order or the tpsl endpoints (FEAT-0070/0071).
        multipleTakeProfits: false,
    },
    bitget: {
        orderTypes: ["market", "limit"],
        tpSlAtEntry: false,
        timeInForce: [],
        multipleTakeProfits: false,
    },
};

const UNKNOWN_EXCHANGE: ExchangeCapabilities = {
    orderTypes: [],
    tpSlAtEntry: false,
    timeInForce: [],
    multipleTakeProfits: false,
};

/**
 * Capabilities of one exchange. An exchange this table has never heard of
 * gets nothing rather than a default set — an unknown venue is the one case
 * where assuming capability is guaranteed to be wrong.
 */
export function capabilitiesOf(exchange: string): ExchangeCapabilities {
    return CAPABILITIES[exchange] ?? UNKNOWN_EXCHANGE;
}

export function supportsOrderType(exchange: string, type: OrderEntryType): boolean {
    return capabilitiesOf(exchange).orderTypes.includes(type);
}

/**
 * Why a type is unavailable, as an i18n key — the UI shows this on hover
 * rather than silently omitting the control, so a trader looking for limit
 * orders learns they are missing instead of assuming they misread the panel.
 */
export function unsupportedReasonKey(exchange: string, type: OrderEntryType): string {
    if (capabilitiesOf(exchange) === UNKNOWN_EXCHANGE) {
        return "orderEntry.unsupported.unknownExchange";
    }
    if (type === "trigger") return "orderEntry.unsupported.trigger";
    return "orderEntry.unsupported.generic";
}
