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


import { z } from "zod";
import { Decimal } from "decimal.js";

// Helper for numeric strings or numbers to Decimal
const DecimalSchema = z.union([z.string(), z.number()])
    .transform((val) => new Decimal(val))
    .or(z.null().transform(() => new Decimal(0)))
    .or(z.undefined().transform(() => new Decimal(0)));

// Generic API Response Wrapper
export const ApiResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) => z.object({
    code: z.union([z.string(), z.number()]).transform(String),
    msg: z.string().optional(),
    error: z.string().optional(),
    data: dataSchema.optional().nullable()
});

// Position Schema (Bitunix & Generic)
export const PositionRawSchema = z.object({
    symbol: z.string(),
    // Allow flexibility in field names (Bitunix vs Bitget vs Others)
    // We map them to canonical fields later, but here we define what we expect from raw JSON
    side: z.string().optional(),
    positionSide: z.string().optional(),
    holdSide: z.string().optional(),

    // Amount fields
    qty: z.union([z.string(), z.number()]).optional(),
    size: z.union([z.string(), z.number()]).optional(),
    amount: z.union([z.string(), z.number()]).optional(),

    // Price fields
    avgOpenPrice: z.union([z.string(), z.number()]).optional(),
    entryPrice: z.union([z.string(), z.number()]).optional(),

    // PnL
    unrealizedPNL: z.union([z.string(), z.number()]).optional(),
    unrealizedPnl: z.union([z.string(), z.number()]).optional(),

    leverage: z.union([z.string(), z.number()]).optional(),
    marginMode: z.string().optional(),
    liquidationPrice: z.union([z.string(), z.number()]).optional(),
    liqPrice: z.union([z.string(), z.number()]).optional()
}).refine(data => {
    // Hardening: A position must have at least one quantity field to be valid.
    // Otherwise it's likely a malformed response or an empty object from a weird API state.
    return (data.qty !== undefined || data.size !== undefined || data.amount !== undefined);
}, {
    message: "Position object missing quantity field (qty, size, or amount)",
    path: ["qty"]
});

export const PositionListSchema = z.array(PositionRawSchema);

// Type inference
export type PositionRaw = z.infer<typeof PositionRawSchema>;
