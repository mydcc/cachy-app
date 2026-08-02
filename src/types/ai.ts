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

export const AiMessageSchema = z.object({
  role: AiRoleSchema,
  content: z.string(),
});

export const AiRequestSchema = z.object({
  messages: z.array(AiMessageSchema),
  model: z.string().optional(),
  // Only used by the Ollama proxy — the user's own local (or self-hosted)
  // Ollama instance, never a Cachy-operated server.
  baseUrl: z.string().optional(),
});

export type AiRole = z.infer<typeof AiRoleSchema>;
export type AiMessage = z.infer<typeof AiMessageSchema>;
export type AiRequest = z.infer<typeof AiRequestSchema>;

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
