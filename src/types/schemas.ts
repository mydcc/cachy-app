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
 * Copyright (C) 2026 MYDCT
 *
 * Hardening Schemas for Data Validation
 */

import { z } from "zod";
import { Decimal } from "decimal.js";
import { logger } from "../services/logger";

/**
 * Custom Zod transformer for safe Decimal parsing.
 * Handles string, number, null, and undefined gracefully.
 * Falls back to Decimal(0) and logs errors instead of throwing.
 */
export const StrictDecimal = z
    .union([z.string(), z.number(), z.null(), z.undefined()])
    .transform((val, ctx) => {
        if (val === null || val === undefined) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "Value is null or undefined, expected valid numeric value",
            });
            return z.NEVER;
        }

        try {
            const strVal = String(val);
            if (strVal.trim() === "") {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: "Empty string is not a valid numeric value",
                });
                return z.NEVER;
            }

            const d = new Decimal(strVal);
            if (d.isNaN() || !d.isFinite()) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: `Invalid decimal value: ${val}`,
                });
                return z.NEVER;
            }
            return d;
        } catch (e) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: `Failed to parse decimal: ${val}`,
            });
            return z.NEVER;
        }
    });

/**
 * Common balance properties with strict validation
 */
export const BalanceResponseSchema = z.object({
    available: StrictDecimal,
    margin: StrictDecimal,
    crossUnrealizedPNL: StrictDecimal,
});

/**
 * Standard ticker with price validation
 */
export const TickerSchema = z.object({
    symbol: z.string(),
    lastPrice: StrictDecimal.refine((val) => val.gt(0), {
        message: "lastPrice must be > 0",
    }),
    volume: StrictDecimal,
});
