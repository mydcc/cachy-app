/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

/*
 * FEAT-0068 — the account-settings write family, validated once.
 *
 * These four actions change exchange state without placing an order:
 * leverage, margin mode and position mode per account/symbol, plus the
 * isolated-margin top-up or withdrawal on an open position. They are a
 * separate contract from `orderSchemas.ts` on purpose — none of them is an
 * order, none goes through the FEAT-0011 order gate, and mixing them into
 * the order union would let an account action inherit an order's validation
 * by accident.
 *
 * Field names and the `ISOLATION`/`CROSS` and `ONE_WAY`/`HEDGE` spellings
 * are Bitunix's own (docs/bitunix-api/02_account.md); the route maps nothing,
 * the venue module does.
 */

import { z } from "zod";
import { Decimal } from "decimal.js";
import { BaseRequestSchema } from "./orderSchemas";

/**
 * A signed margin delta: positive adds margin, negative withdraws it. Zero is
 * rejected because it is never what the trader meant, and the exchange would
 * answer success for a no-op.
 *
 * Serialized with `toFixed` rather than `toString` for the same reason
 * `orderSchemas` does it: exchanges reject scientific notation, which
 * `Decimal.toString()` emits below 1e-7.
 */
const MarginDelta = z
  .union([z.number(), z.string()])
  .refine(
    (val) => {
      try {
        const d = new Decimal(val);
        return d.isFinite() && !d.isNaN() && !d.isZero();
      } catch {
        return false;
      }
    },
    { message: "Must be a non-zero number" },
  )
  .transform((val) => {
    const d = new Decimal(val);
    return d.toFixed(d.decimalPlaces() ?? 0);
  });

export const ChangeLeverageSchema = BaseRequestSchema.extend({
  type: z.literal("change-leverage"),
  symbol: z.string().min(1),
  marginCoin: z.string().min(1).optional().default("USDT"),
  // Bitunix takes an int here. The pair's own min/max is checked in the
  // client against `marketState.symbolMeta` — the route cannot know it
  // without a second upstream call, so this bound is only the absurdity
  // filter that keeps a typo from travelling.
  leverage: z.coerce.number().int().min(1).max(500),
});

export const ChangeMarginModeSchema = BaseRequestSchema.extend({
  type: z.literal("change-margin-mode"),
  symbol: z.string().min(1),
  marginCoin: z.string().min(1).optional().default("USDT"),
  marginMode: z.enum(["ISOLATION", "CROSS"]),
});

export const ChangePositionModeSchema = BaseRequestSchema.extend({
  type: z.literal("change-position-mode"),
  // Account-wide, not per symbol — the endpoint takes no symbol at all.
  positionMode: z.enum(["ONE_WAY", "HEDGE"]),
});

export const AdjustPositionMarginSchema = BaseRequestSchema.extend({
  type: z.literal("adjust-position-margin"),
  symbol: z.string().min(1),
  marginCoin: z.string().min(1).optional().default("USDT"),
  amount: MarginDelta,
  // The exchange documents "either side or positionId" — without one of them
  // it cannot tell which position to move margin on, and in HEDGE mode the
  // wrong guess moves it on the opposite side. That rule is deliberately NOT
  // a `.refine()` here: a refined object is a ZodEffects, which
  // `z.discriminatedUnion` below cannot take (same reason PlaceOrderSchema
  // states). It lives in `adjustBitunixPositionMargin`, next to the request
  // it guards.
  side: z.enum(["LONG", "SHORT"]).optional(),
  positionId: z.string().min(1).optional(),
});

export const AccountSettingsRequestSchema = z.discriminatedUnion("type", [
  ChangeLeverageSchema,
  ChangeMarginModeSchema,
  ChangePositionModeSchema,
  AdjustPositionMarginSchema,
]);

export type AccountSettingsPayload = z.infer<typeof AccountSettingsRequestSchema>;
export type AccountSettingsAction = AccountSettingsPayload["type"];
