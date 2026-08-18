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
 * FEAT-0229 — what a venue cannot do, refused before it travels.
 *
 * The rule is pre-trade control: a request whose rejection is already known
 * does not leave the client. Not sending it is not merely tidier — it removes
 * the window in which the order's state is unknown, and it keeps the venue's
 * reject ratio (which real venues price) clean.
 *
 * Kept free of runtime imports on purpose: `utils/errorUtils.ts` translates
 * this error, and `errorUtils` is imported by `apiService`, which the adapters
 * import. A value import here would close that circle.
 */

import type { ExchangeId, TradingSupport } from "./types";

/** The feature that is missing, named as it is in `ExchangeAdapter.supports`. */
export type UnsupportedFeature = keyof TradingSupport;

/**
 * Thrown when a venue is asked for a verb its adapter declares it cannot do.
 *
 * Only writes throw. A read on the same venue resolves empty, because "there
 * is nothing here" is a true answer and carries no risk — whereas a write
 * that resolves quietly would let a trader believe a stop moved when it did
 * not, which is the worst outcome this file has to prevent.
 */
export class ExchangeUnsupportedError extends Error {
    /**
     * i18n key for the message the trader sees. Resolved by
     * `getDisplayMessage`, which every call site already routes errors
     * through; `{exchange}` is interpolated from `exchange` below.
     */
    public readonly translationKey: string;

    constructor(
        public readonly exchange: ExchangeId,
        public readonly feature: UnsupportedFeature,
        /** The adapter method that refused, for the log — never shown to the user. */
        public readonly verb: string,
    ) {
        super(`${exchange} does not support ${feature} (${verb})`);
        this.name = "ExchangeUnsupportedError";
        this.translationKey = `exchange.unsupported.${feature}`;
    }
}

/** Narrowing helper, so call sites do not import the class just to test for it. */
export function isExchangeUnsupportedError(e: unknown): e is ExchangeUnsupportedError {
    return e instanceof ExchangeUnsupportedError;
}
