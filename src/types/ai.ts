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
 * AI Shared Types and Schemas
 */

import { z } from "zod";

export const AiRoleSchema = z.enum(["user", "assistant", "system"]);

/**
 * Request-shape ceilings (BUG-0724). The AI proxy forwards the body to a
 * metered upstream, so an unbounded message, tool or URL is a cost and memory
 * amplifier before it is anything else. The values are deliberately generous
 * for a full chat prompt with market context; the byte cap in
 * `readAiRequest` is the hard stop.
 */
export const AI_LIMITS = {
  messages: 200,
  messageChars: 100_000,
  tools: 32,
  toolNameChars: 64,
  toolDescriptionChars: 2_000,
  modelChars: 200,
  baseUrlChars: 2_048,
} as const;

/**
 * Model identifiers are forwarded into upstream URLs and log lines. Allow the
 * characters every supported provider uses (`gpt-5.4-mini`, `anthropic/claude`,
 * `llama3:8b`, `google/gemini-2.5-pro:free`) and nothing that can terminate a
 * line. The value is trimmed first so a pasted trailing space is a model, not
 * a validation error. Providers that build a URL from it add their own,
 * stricter alphabet (Gemini does).
 */
export const AiModelSchema = z
  .string()
  .trim()
  .max(AI_LIMITS.modelChars)
  .regex(/^[A-Za-z0-9._:@/-]*$/, "Invalid model identifier");

/**
 * The OpenAI-style function tool every provider route receives. `parameters`
 * is a JSON Schema object whose depth the byte cap bounds; its own shape is the
 * caller's, so it is intentionally passed through.
 */
export const AiToolSchema = z.object({
  type: z.literal("function"),
  // Loose, not stripped: OpenAI's `strict` and vendor extensions such as
  // `cache_control` are part of the caller's contract and used to survive
  // `z.any()`. Validation is about the fields we know must be safe, not about
  // deleting the rest (BUG-0724 review).
  function: z.looseObject({
    name: z
      .string()
      .min(1)
      .max(AI_LIMITS.toolNameChars)
      .regex(/^[A-Za-z0-9_-]+$/, "Invalid tool name"),
    description: z.string().max(AI_LIMITS.toolDescriptionChars).optional(),
    parameters: z.record(z.string(), z.unknown()).optional(),
    strict: z.boolean().optional(),
  }),
});

export const AiMessageSchema = z.object({
  role: AiRoleSchema,
  content: z.string().max(AI_LIMITS.messageChars),
});

export const AiRequestSchema = z.object({
  messages: z.array(AiMessageSchema).max(AI_LIMITS.messages),
  model: AiModelSchema.optional(),
  tools: z.array(AiToolSchema).max(AI_LIMITS.tools).optional(),
  // Optional custom base URL for the provider endpoint (e.g. OmniRoute,
  // LiteLLM, local gateways, self-hosted instances, or custom vendor endpoints).
  baseUrl: z.string().max(AI_LIMITS.baseUrlChars).optional(),
});

export type AiRole = z.infer<typeof AiRoleSchema>;
export type AiMessage = z.infer<typeof AiMessageSchema>;
export type AiRequest = z.infer<typeof AiRequestSchema>;

export type AiAnalysisMode = 'risk' | 'coach' | 'scalper' | 'analyst';

/**
 * Normalized model info returned by the `/api/ai/<provider>/models` routes.
 * Each provider's raw API shape is mapped into this before it reaches the
 * client, so the UI never has to know about provider-specific field names.
 */
export interface AiModelInfo {
  id: string;
  label: string;
  contextWindow?: number;
  inputPrice?: number; // USD per 1M input tokens
  outputPrice?: number; // USD per 1M output tokens
  deprecated?: boolean;
}
