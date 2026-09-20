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
  buildBitunixCancelAllBody,
  buildBitunixCancelOrderBody,
  buildBitunixCloseAllPositionsBody,
  buildBitunixClosePositionPayload,
  buildBitunixFlashCloseBody,
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
 * body: the three actions `/api/orders` reaches Bitunix with as a signed GET —
 * `pending`, `history`, `order-detail` — are signed over their query, and a
 * caller that arrives here with one of them has picked the wrong shape.
 *
 * The write actions arrive here as bodies, as they did before the cutover. The
 * four Bitunix ones — `cancel-order` (`trade/cancel_orders`), `cancel-all`
 * (`cancel_all_orders`), `close-all-positions` (`close_all_position`) and
 * `flash-close-position` (`flash_close_position`), all documented as `POST` with
 * the parameters in the body in `docs/bitunix-api/07_trade.md` — are built by
 * `bitunixBodies` and reach Bitunix verbatim. Bitget wires only
 * `place-order`/`close-position` and `cancel-order`, so the remaining three are
 * a venue boundary on that side and throw `VALIDATION_ERROR`.
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
      // Same zero-close guard as the Bitunix branch above: a close that
      // carries no quantity is not a close.
      if (!safeAmount || new Decimal(safeAmount).lte(0)) {
        throw new Error(ORDER_ERRORS.INVALID_AMOUNT);
      }
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
      // Bitunix serves the cancel as a body-signed POST (`trade/cancel_orders`
      // with `{ symbol, orderList }` — `docs/bitunix-api/07_trade.md`, the live
      // `cancelBitunixOrder`, and `orders_cancel_path.test.ts` all agree).
      return venue === "bitunix"
        ? buildBitunixCancelOrderBody(payload)
        : buildBitgetCancelOrderBody(payload);

    case "cancel-all":
    case "close-all-positions":
    case "flash-close-position":
      // Bitunix serves all three from a body-signed POST. Bitget wires none of
      // them (`executeOrder` answers `null`), and its path table has no row
      // either, so the signer refuses a Bitget envelope for these before the
      // route is reached — this throw is the backstop, not the message.
      if (venue !== "bitunix") throw new Error(ORDER_ERRORS.VALIDATION_ERROR);
      if (payload.type === "cancel-all") return buildBitunixCancelAllBody(payload);
      if (payload.type === "close-all-positions") {
        return buildBitunixCloseAllPositionsBody(payload);
      }
      return buildBitunixFlashCloseBody(payload);

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
