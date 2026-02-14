/*
 * Copyright (C) 2026 MYDCT
 *
 * AI Shared Types and Schemas
 */

import { z } from "zod";

export const AiRoleSchema = z.enum(["user", "assistant", "system"]);

export const AiMessageSchema = z.object({
  role: AiRoleSchema,
  content: z.string(),
});

export const AiRequestSchema = z.object({
  messages: z.array(AiMessageSchema),
  model: z.string().optional(),
});

export type AiRole = z.infer<typeof AiRoleSchema>;
export type AiMessage = z.infer<typeof AiMessageSchema>;
export type AiRequest = z.infer<typeof AiRequestSchema>;
