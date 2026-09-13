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

/** Token counts a provider reports for a request, when it reports any. */
export interface StreamUsage {
  inputTokens?: number;
  outputTokens?: number;
}

export interface StreamDelta {
  /** Assistant text in this chunk, "" when the chunk carries none. */
  text: string;
  /** A fragment of tool-call JSON arguments, or null. Concatenate across chunks. */
  toolCallFragment: string | null;
  /** Usage counters, present only on the chunk that carries them. */
  usage?: StreamUsage;
}

const EMPTY: StreamDelta = { text: "", toolCallFragment: null };

/** Builds a usage delta, or undefined when both counts are absent. */
function usageOf(
  inputTokens: number | undefined,
  outputTokens: number | undefined,
): StreamUsage | undefined {
  if (inputTokens == null && outputTokens == null) return undefined;
  return {
    inputTokens: inputTokens ?? undefined,
    outputTokens: outputTokens ?? undefined,
  };
}
// Frozen so a caller that mutates the returned object cannot corrupt every
// future empty delta (the same reference is returned for all empty chunks).
Object.freeze(EMPTY);

/**
 * Merge a tool-call fragment into the running buffer.
 *
 * Delta-based flavors (`openai-chat`, `openai-responses`,
 * `anthropic-messages`) stream argument JSON in pieces, so fragments
 * concatenate. `google-generate` instead sends the complete `args` object per
 * chunk — concatenating those snapshots would yield `{...}{...}`, which no
 * JSON parser accepts — so the latest snapshot wins.
 */
export function appendToolCallFragment(
  flavor: AiApiFlavor,
  buffer: string,
  fragment: string | null,
): string {
  if (!fragment) return buffer;
  if (flavor === "google-generate") return fragment;
  return buffer + fragment;
}

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
      // Newer models may send content-part arrays instead of a plain string.
      content?: string | null | Array<{ type?: string; text?: string }>;
      tool_calls?: Array<{ function?: { arguments?: string } }>;
    };
  }>;
  // Present on the final chunk when the request asked for usage
  // (`stream_options: { include_usage: true }`).
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

function parseOpenAiChat(data: OpenAiChatChunk): StreamDelta {
  const delta = data.choices?.[0]?.delta;
  const usage = usageOf(
    data.usage?.prompt_tokens,
    data.usage?.completion_tokens,
  );
  if (!delta) {
    // Some providers send a final usage-only chunk with an empty `choices`.
    return usage ? { text: "", toolCallFragment: null, usage } : EMPTY;
  }
  return {
    text: normalizeChatContent(delta.content),
    toolCallFragment: delta.tool_calls?.[0]?.function?.arguments ?? null,
    ...(usage ? { usage } : {}),
  };
}

/** Plain strings pass through; content-part arrays contribute their text parts. */
function normalizeChatContent(
  content: string | null | undefined | Array<{ type?: string; text?: string }>,
): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((part) => part && (part.type === "text" || typeof part.text === "string"))
      .map((part) => part.text ?? "")
      .join("");
  }
  return "";
}

// --- OpenAI Responses -------------------------------------------------------
// https://platform.openai.com/docs/api-reference/responses-streaming

interface OpenAiResponsesChunk {
  type?: string;
  delta?: string;
  response?: {
    usage?: { input_tokens?: number; output_tokens?: number };
  };
}

function parseOpenAiResponses(data: OpenAiResponsesChunk): StreamDelta {
  if (data.type === "response.output_text.delta") {
    return { text: data.delta ?? "", toolCallFragment: null };
  }
  if (data.type === "response.function_call_arguments.delta") {
    return { text: "", toolCallFragment: data.delta ?? null };
  }
  if (data.type === "response.completed") {
    const usage = usageOf(
      data.response?.usage?.input_tokens,
      data.response?.usage?.output_tokens,
    );
    return usage ? { text: "", toolCallFragment: null, usage } : EMPTY;
  }
  return EMPTY;
}

// --- Anthropic Messages -----------------------------------------------------

interface AnthropicChunk {
  type?: string;
  delta?: { type?: string; text?: string; partial_json?: string };
  // `message_start` carries input tokens, `message_delta` the running output.
  message?: { usage?: { input_tokens?: number; output_tokens?: number } };
  usage?: { input_tokens?: number; output_tokens?: number };
}

function parseAnthropic(data: AnthropicChunk): StreamDelta {
  if (data.type === "message_start") {
    const usage = usageOf(
      data.message?.usage?.input_tokens,
      data.message?.usage?.output_tokens,
    );
    return usage ? { text: "", toolCallFragment: null, usage } : EMPTY;
  }
  if (data.type === "message_delta") {
    const usage = usageOf(data.usage?.input_tokens, data.usage?.output_tokens);
    return usage ? { text: "", toolCallFragment: null, usage } : EMPTY;
  }
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
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
}

function parseGoogle(data: GoogleChunk): StreamDelta {
  const usage = usageOf(
    data.usageMetadata?.promptTokenCount,
    data.usageMetadata?.candidatesTokenCount,
  );
  const part = data.candidates?.[0]?.content?.parts?.[0];
  if (!part) {
    return usage ? { text: "", toolCallFragment: null, usage } : EMPTY;
  }

  // A complete `args` snapshot per chunk, not a delta: merge with
  // appendToolCallFragment (last wins), never with `+=`.
  const args = part.functionCall?.args;
  const toolCallFragment = args?.actions ? JSON.stringify(args) : null;

  return {
    text: part.text ?? "",
    toolCallFragment,
    ...(usage ? { usage } : {}),
  };
}
