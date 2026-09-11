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

import { z } from "zod";

/**
 * Leverage boundary (BUG-0433): leverage is an integer, but it leaves the
 * schema as a string like every other value on the money boundary
 * (BUG-0424/0425). A raw JSON number is normalized to its shortest
 * round-trip string so a downstream consumer cannot widen it with f64
 * arithmetic.
 */
const LeverageString = z.union([z.string(), z.number()]).transform((v) => String(v));

export const AccountRequestSchema = z.object({
  exchange: z.enum(["bitunix", "bitget"]),
  apiKey: z.string().optional(),
  apiSecret: z.string().optional(),
  passphrase: z.string().optional(),
  // Additional actions if supported later (leverage, margin mode)
  action: z.enum(["fetch", "setLeverage", "setMarginMode"]).optional().default("fetch"),
  // Params for setter actions
  params: z.object({
      symbol: z.string().optional(),
      leverage: LeverageString.optional(),
      marginMode: z.enum(["cross", "isolated"]).optional()
  }).optional()
});

export type AccountRequest = z.infer<typeof AccountRequestSchema>;
