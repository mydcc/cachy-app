import { z } from "zod";

export const AccountRequestSchema = z.object({
  exchange: z.enum(["bitunix", "bitget"]),
  apiKey: z.string().min(1, "Missing API Key"),
  apiSecret: z.string().min(1, "Missing API Secret"),
  passphrase: z.string().optional(),
  // Additional actions if supported later (leverage, margin mode)
  action: z.enum(["fetch", "setLeverage", "setMarginMode"]).optional().default("fetch"),
  // Params for setter actions
  params: z.object({
      symbol: z.string().optional(),
      leverage: z.union([z.string(), z.number()]).optional(),
      marginMode: z.enum(["cross", "isolated"]).optional()
  }).optional()
});

export type AccountRequest = z.infer<typeof AccountRequestSchema>;
