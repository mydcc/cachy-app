/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

/**
 * Order payload validation, Decimal serialization, and the account half of a
 * gate intent — extracted from tradeService.ts (FEAT-0342).
 *
 * These three were private members of the service, which made them read as
 * part of the transport rather than as the rules they are. The account half is
 * supplied by the caller: a service must not reach into stores
 * (eslint.architecture.boundaries.js), and the caller is the layer that owns
 * them.
 */

import { Decimal } from "decimal.js";
import { logger } from "../logger";
import { mismatch, OrderRefusedError, type DisplayedState, type OrderIntent } from "../orderGate";
import { OrderRequestSchema } from "../../types/orderSchemas";
import { BitunixApiError } from "./tradeErrors";

/**
 * An intent as a call site states it: everything except the account fields,
 * which `completeIntent` fills in from the account half it is given.
 */
export type PartialIntent = Omit<OrderIntent, "displayed"> & {
    displayed: Omit<DisplayedState, "provider" | "accountFingerprint" | "paperMode">;
};

/**
 * The account half of the displayed state — the exchange and key the UI
 * currently shows as active. Every intent needs it; nothing else about
 * an intent is shared, so the rest is built per call site.
 */
export type AccountHalf = Pick<
    DisplayedState,
    "provider" | "accountFingerprint" | "accountId" | "paperMode"
>;

/**
 * Validates an order payload before it is signed (FEAT-0405 A5).
 *
 * The route validates the body it receives and rebuilds the signed bytes
 * from *that* parse, so this is the only way both sides can arrive at the
 * same string. Throws rather than falling back to the raw payload: a
 * payload the route would refuse is not one to sign, and a silent fallback
 * would surface as a divergence in the middle of a trade.
 */
export function parseOrderPayload(payload: unknown): Record<string, unknown> {
    const parsed = OrderRequestSchema.safeParse(payload);
    if (!parsed.success) {
        const details = parsed.error.issues
            .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
            .join(", ");
        throw new BitunixApiError("VALIDATION_ERROR", "apiErrors.generic", details);
    }
    return parsed.data as Record<string, unknown>;
}

// Helper to safely serialize Decimals to strings
export function serializePayload(
    payload: unknown,
    depth = 0,
    seen = new WeakSet<object>(),
): unknown {
    if (depth > 20) {
        logger.warn("market", "[TradeService] Serialization depth limit exceeded");
        return "[Serialization Limit]";
    }

    if (!payload) return payload;
    if (payload instanceof Decimal) return payload.toString();

    // Handle generic objects that might be Decimals if constructor name is mangled or instance check fails
    if (Decimal.isDecimal(payload)) {
        return payload.toString();
    }

    if (typeof payload === "object" && payload !== null) {
        if (seen.has(payload)) return "[Circular]";
        seen.add(payload);
    }

    if (Array.isArray(payload)) {
        return payload.map((item) => serializePayload(item, depth + 1, seen));
    }

    if (typeof payload === "object") {
        const newObj: Record<string, unknown> = {};
        for (const key in payload) {
            if (Object.prototype.hasOwnProperty.call(payload, key)) {
                newObj[key] = serializePayload(
                    (payload as Record<string, unknown>)[key],
                    depth + 1,
                    seen,
                );
            }
        }
        return newObj;
    }

    return payload;
}

/**
 * Fills in the account fields every intent shares, so a caller states only
 * what is specific to its order.
 *
 * Extracted in BUG-0331 because the flash-close path now verifies an
 * intent before it acts and then submits the same one. Building it twice
 * would mean the check and the submission could disagree — which is the
 * exact class of bug the gate exists to catch.
 */
export function completeIntent(intent: PartialIntent, account: AccountHalf): OrderIntent {
    // A caller may *state* which account it believed was active — that is
    // how the account chip will supply a second, independent root once
    // every order surface renders one. What a caller may not do is blank
    // it.
    //
    // `...intent.displayed` spreads over the store-derived block, and
    // `accountId` is not in `PartialIntent`'s omit list, so a call site
    // passing `accountId: maybeUndefined` used to overwrite the real id
    // with `undefined` — and `assertGatePass` skips the comparison
    // entirely when the pass carries none. An ordinary-looking assignment
    // could therefore switch off a money-critical check with nothing
    // going red anywhere.
    //
    // So: a supplied id that disagrees with the store is a refusal, and
    // the id that reaches the pass is always the store's.
    const supplied = intent.displayed.accountId;
    if (supplied !== undefined && supplied !== account.accountId) {
        throw new OrderRefusedError(mismatch("account", supplied, account.accountId ?? "—"));
    }

    return {
        ...intent,
        displayed: {
            ...account,
            ...intent.displayed,
            accountId: account.accountId,
        },
    };
}
