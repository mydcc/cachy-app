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
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

/**
 * The single construction point for venue-signed request bodies (FEAT-0405
 * AC4, ADR-0013).
 *
 * Both signers — the server's `generateBitunixSignature` /
 * `generateBitgetSignature` and the browser's `signBitunixRequest` /
 * `signBitgetRequest` — treat a string body as the bytes to sign, verbatim.
 * Handing them this function's output rather than an object is what makes the
 * client and the server sign the *same* bytes: there is one serialisation, not
 * two that must be kept in step.
 *
 * The alternative — letting each side `JSON.stringify` its own object — fails
 * silently. Property order, `undefined` handling and number formatting all
 * differ between the two paths, and the first symptom is a venue rejection in
 * the middle of a trade, not a type error.
 *
 * Browser-safe, like the two builders it dispatches to.
 */
import { Decimal } from "decimal.js";
import type { AccountSettingsPayload } from "../../types/accountSettingsSchemas";
import type { OrderRequestPayload } from "../../types/orderSchemas";
import { formatApiNum } from "../utils";
import {
  buildBitgetCancelOrderBody,
  buildBitgetClosePositionPayload,
  buildBitgetOrderPayload,
  buildBitgetPlaceOrderBody,
} from "./bitgetBodies";
import {
  buildBitunixAccountSettingBody,
  buildBitunixClosePositionPayload,
  buildBitunixModifyOrderBody,
  buildBitunixOrderPayload,
  buildBitunixPlaceOrderBody,
} from "./bitunixBodies";
import { ORDER_ERRORS } from "./orderErrors";
import type { Venue } from "./restSigningPlan";

/**
 * Serialises the request one venue call will carry.
 *
 * Throws rather than returning `null` for a venue/action pair that has no
 * body: the actions that reach the venue as a signed GET (history, pending,
 * order-detail, cancel-all, close-all-positions, flash-close-position) are
 * signed over their query, and a caller that reaches this function with one of
 * them has picked the wrong shape.
 */
export function buildVenueBody(
  venue: Venue,
  payload: OrderRequestPayload | AccountSettingsPayload,
): string {
  return JSON.stringify(venueBody(venue, payload));
}

function venueBody(
  venue: Venue,
  payload: OrderRequestPayload | AccountSettingsPayload,
): Record<string, unknown> {
  switch (payload.type) {
    case "place-order":
      return venue === "bitunix"
        ? buildBitunixPlaceOrderBody(buildBitunixOrderPayload(payload))
        : buildBitgetPlaceOrderBody(buildBitgetOrderPayload(payload));

    case "close-position": {
      const safeAmount = formatApiNum(payload.amount);
      if (venue === "bitunix") {
        // Bitunix rejects a zero close, so it is caught here rather than
        // travelling as a request the exchange answers with an error.
        if (!safeAmount || new Decimal(safeAmount).lte(0)) {
          throw new Error(ORDER_ERRORS.INVALID_AMOUNT);
        }
        return buildBitunixPlaceOrderBody(
          buildBitunixClosePositionPayload({
            symbol: payload.symbol,
            side: payload.side,
            qty: safeAmount,
          }),
        );
      }
      if (!safeAmount) throw new Error(ORDER_ERRORS.INVALID_AMOUNT);
      return buildBitgetPlaceOrderBody(
        buildBitgetClosePositionPayload({
          symbol: payload.symbol,
          side: payload.side,
          amount: safeAmount,
          marginCoin: payload.marginCoin,
        }),
      );
    }

    case "modify-order":
      // Bitget has no verified modify request format (BUG-0001 is the standing
      // reminder not to guess one), so this is a venue boundary, not a gap.
      if (venue !== "bitunix") throw new Error(ORDER_ERRORS.VALIDATION_ERROR);
      return buildBitunixModifyOrderBody(payload);

    case "cancel-order":
      // The reverse asymmetry: Bitunix signs the cancel as a query.
      if (venue !== "bitget") throw new Error(ORDER_ERRORS.VALIDATION_ERROR);
      return buildBitgetCancelOrderBody(payload);

    case "change-leverage":
    case "change-margin-mode":
    case "change-position-mode":
    case "adjust-position-margin":
      // Bitget implements none of the family (see `executeAccountSetting`).
      if (venue !== "bitunix") throw new Error(ORDER_ERRORS.VALIDATION_ERROR);
      return buildBitunixAccountSettingBody(payload);

    default:
      throw new Error(ORDER_ERRORS.VALIDATION_ERROR);
  }
}
