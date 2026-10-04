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

// Centralized Error Messages for i18n/consistency
export const ORDER_ERRORS = {
  INVALID_JSON: "bitunixErrors.INVALID_JSON",
  VALIDATION_ERROR: "bitunixErrors.VALIDATION_ERROR",
  PASSPHRASE_REQUIRED: "bitunixErrors.PASSPHRASE_REQUIRED",
  INVALID_AMOUNT: "bitunixErrors.INVALID_AMOUNT",
  INVALID_QTY: "bitunixErrors.INVALID_QTY",
  PRICE_REQUIRED: "bitunixErrors.PRICE_REQUIRED",
  INVALID_PRICE: "bitunixErrors.INVALID_PRICE",
  INVALID_TRIGGER: "bitunixErrors.INVALID_TRIGGER",
  BITUNIX_API_ERROR: "bitunixErrors.BITUNIX_API_ERROR",
  BITGET_API_ERROR: "bitunixErrors.BITGET_API_ERROR",
};

/**
 * An Error carrying the exchange's own failure detail alongside the message.
 *
 * Both fields are attached at throw sites inside the venue modules and read
 * again in the order route's catch, which is the whole reason `any` was
 * there — naming the shape once removes it from six places.
 */
export interface ExchangeError extends Error {
  code?: string;
  details?: string;
  /**
   * HTTP status the venue answered with. Read by `upstreamErrorStatus`, so a
   * venue rejection does not collapse into a blanket 500 on its way to the
   * client.
   */
  status?: number;
  /**
   * The venue's own business code, e.g. Bitget's `"30032"`. Deliberately not
   * `code`: that field carries a Cachy translation key the UI resolves, and
   * overwriting it with vendor prose would leave the German UI untranslatable.
   */
  venueCode?: string;
  /**
   * The venue's message, verbatim. Diagnostic only — never shown as UI copy
   * without going through the locale files.
   */
  venueMessage?: string;
  /**
   * HTTP status the venue actually answered with, kept for diagnosis only.
   *
   * Deliberately not what the client is told: Bitget pairs a business error
   * with a 4xx *and* reports some on a 200, so relaying this would answer a
   * browser with 400 for a request Cachy got wrong — or with 200 for a refusal.
   */
  venueHttpStatus?: number;
}

export function cleanPayload<T extends object>(payload: T): T {
  // One cast to an index-signature view, rather than one per access.
  const cleaned = { ...payload } as Record<string, unknown>;
  Object.keys(cleaned).forEach((key) => {
    if (cleaned[key] === undefined) {
      delete cleaned[key];
    }
  });
  return cleaned as T;
}
