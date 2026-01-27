
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
});

export const PositionListSchema = z.array(PositionRawSchema);

// Type inference
export type PositionRaw = z.infer<typeof PositionRawSchema>;
