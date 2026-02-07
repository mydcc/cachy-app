/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import { z } from "zod";

const ExchangeEnum = z.enum(["bitunix", "bitget"]);

/**
 * Common regex for validating numeric strings
 * Allows integers and decimals, positive or negative
 */
const numericStringRegex = /^-?\d+(\.\d+)?$/;

const NumericString = z.union([z.number(), z.string()])
  .refine((val) => {
    if (typeof val === "number") return !isNaN(val) && isFinite(val);
    return numericStringRegex.test(val);
  }, { message: "Must be a valid number" })
  .transform((val) => String(val));

// --- Base Request ---
export const BaseRequestSchema = z.object({
  exchange: ExchangeEnum,
  apiKey: z.string().min(1),
  apiSecret: z.string().min(1),
});

// --- Params Schemas ---

const PendingParamsSchema = z.object({
    symbol: z.string().optional(),
    planType: z.string().optional()
});

const HistoryParamsSchema = z.object({
    symbol: z.string().optional(),
    planType: z.string().optional(),
    startTime: z.string().optional(),
    endTime: z.string().optional(),
    limit: z.union([z.string(), z.number()]).optional()
});

const CancelParamsSchema = z.object({
    orderId: z.string().min(1),
    symbol: z.string().min(1),
    planType: z.string().optional()
});

const ModifyParamsSchema = z.object({
    orderId: z.string().min(1),
    symbol: z.string().min(1),
    planType: z.string().optional(),
    triggerPrice: NumericString,
    qty: NumericString.optional()
});

// --- Action Schemas ---

export const PendingSchema = BaseRequestSchema.extend({
  action: z.literal("pending"),
  params: PendingParamsSchema.optional().default({})
});

export const HistorySchema = BaseRequestSchema.extend({
  action: z.literal("history"),
  params: HistoryParamsSchema.optional().default({})
});

export const CancelSchema = BaseRequestSchema.extend({
  action: z.literal("cancel"),
  params: CancelParamsSchema
});

export const ModifySchema = BaseRequestSchema.extend({
  action: z.literal("modify"),
  params: ModifyParamsSchema
});

// --- Main Union Schema ---
export const TpSlRequestSchema = z.discriminatedUnion("action", [
  PendingSchema,
  HistorySchema,
  CancelSchema,
  ModifySchema
]);

export type TpSlRequestPayload = z.infer<typeof TpSlRequestSchema>;
