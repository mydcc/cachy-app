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
 *
 * Streaming adapters — FEAT-0467, ADR-0019.
 *
 * One function per wire format, so the send path does not grow a branch per
 * provider. Each adapter receives one already-JSON-parsed SSE `data:` payload
 * and returns the normalized delta: assistant text, and/or a fragment of a
 * tool call's JSON arguments (which the caller concatenates across chunks).
 *
 * Pure and dependency-free, so every format is testable from fixtures without
 * a network or a DOM.
 */

import type { AiApiFlavor } from "../../stores/settings/aiProviders";

export interface StreamDelta {
  /** Assistant text in this chunk, "" when the chunk carries none. */
  text: string;
  /** A fragment of tool-call JSON arguments, or null. Concatenate across chunks. */
  toolCallFragment: string | null;
}

const EMPTY: StreamDelta = { text: "", toolCallFragment: null };

/**
 * Normalize one SSE payload for `flavor`. Unknown events and malformed shapes
 * yield the empty delta rather than throwing — a provider is free to send
 * keep-alives and metadata events we do not model.
 */
export function parseStreamChunk(
  flavor: AiApiFlavor,
  data: unknown,
): StreamDelta {
  if (data === null || typeof data !== "object") return EMPTY;

  switch (flavor) {
    case "openai-chat":
      return parseOpenAiChat(data as OpenAiChatChunk);
    case "openai-responses":
      return parseOpenAiResponses(data as OpenAiResponsesChunk);
    case "anthropic-messages":
      return parseAnthropic(data as AnthropicChunk);
    case "google-generate":
      return parseGoogle(data as GoogleChunk);
    default:
      return EMPTY;
  }
}

// --- OpenAI Chat Completions ------------------------------------------------

interface OpenAiChatChunk {
  choices?: Array<{
    delta?: {
      content?: string | null;
      tool_calls?: Array<{ function?: { arguments?: string } }>;
    };
  }>;
}

function parseOpenAiChat(data: OpenAiChatChunk): StreamDelta {
  const delta = data.choices?.[0]?.delta;
  if (!delta) return EMPTY;
  return {
    text: delta.content ?? "",
    toolCallFragment: delta.tool_calls?.[0]?.function?.arguments ?? null,
  };
}

// --- OpenAI Responses -------------------------------------------------------
// https://platform.openai.com/docs/api-reference/responses-streaming

interface OpenAiResponsesChunk {
  type?: string;
  delta?: string;
}

function parseOpenAiResponses(data: OpenAiResponsesChunk): StreamDelta {
  if (data.type === "response.output_text.delta") {
    return { text: data.delta ?? "", toolCallFragment: null };
  }
  if (data.type === "response.function_call_arguments.delta") {
    return { text: "", toolCallFragment: data.delta ?? null };
  }
  return EMPTY;
}

// --- Anthropic Messages -----------------------------------------------------

interface AnthropicChunk {
  type?: string;
  delta?: { type?: string; text?: string; partial_json?: string };
}

function parseAnthropic(data: AnthropicChunk): StreamDelta {
  if (data.type !== "content_block_delta") return EMPTY;
  if (data.delta?.type === "text_delta") {
    return { text: data.delta.text ?? "", toolCallFragment: null };
  }
  if (data.delta?.type === "input_json_delta") {
    return { text: "", toolCallFragment: data.delta.partial_json ?? null };
  }
  return EMPTY;
}

// --- Google generateContent -------------------------------------------------

interface GoogleChunk {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
        functionCall?: { args?: { actions?: unknown } };
      }>;
    };
  }>;
}

function parseGoogle(data: GoogleChunk): StreamDelta {
  const part = data.candidates?.[0]?.content?.parts?.[0];
  if (!part) return EMPTY;

  const args = part.functionCall?.args;
  const toolCallFragment = args?.actions ? JSON.stringify(args) : null;

  return { text: part.text ?? "", toolCallFragment };
}
