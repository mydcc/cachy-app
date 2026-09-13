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
 * Browser-direct request builder — FEAT-0467, ADR-0019.
 *
 * The default transport talks straight from the page to the provider, so a
 * Class A key never reaches Cachy infrastructure. One builder per wire format,
 * mirroring the shape each server relay route sends.
 */

import type { AiApiFlavor } from "../../stores/settings/aiProviders";

const DEFAULT_MAX_TOKENS = 2000;

/**
 * Joins a provider base URL with a relative endpoint path.
 *
 * Mirrors `resolveProviderEndpoint`'s version de-duplication so a base URL
 * that already ends in `/v1` or `/api/v1` (OpenCode Zen, command gateways)
 * does not double the segment. Unlike the server helper this requires an
 * explicit http(s) scheme — a browser `fetch` cannot guess one.
 */
export function resolveDirectUrl(baseUrl: string, relativePath: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(trimmed)) {
    throw new Error(
      `Base URL must start with http:// or https:// (got "${baseUrl}").`,
    );
  }

  const rel = relativePath.replace(/^\/+/, "");
  if (rel.startsWith("v1/") && trimmed.endsWith("/v1")) {
    return `${trimmed}/${rel.slice(3)}`;
  }
  if (rel.startsWith("api/v1/") && trimmed.endsWith("/api/v1")) {
    return `${trimmed}/${rel.slice(7)}`;
  }
  return `${trimmed}/${rel}`;
}

export interface DirectChatParams {
  baseUrl: string;
  apiKey: string;
  model: string;
  /** OpenAI-shaped messages; the system prompt is the first entry. */
  messages: Array<{ role: string; content: string }>;
}

export interface DirectRequest {
  url: string;
  headers: Record<string, string>;
  body: string;
}

/** The system prompt plus the turns, without the system entry. */
function splitSystem(params: DirectChatParams): {
  system: string;
  turns: Array<{ role: string; content: string }>;
} {
  return {
    system: params.messages
      .filter((m) => m.role === "system")
      .map((m) => m.content)
      .join("\n\n"),
    turns: params.messages.filter((m) => m.role !== "system"),
  };
}

function jsonHeaders(apiKey: string): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (apiKey.trim()) headers.Authorization = `Bearer ${apiKey}`;
  return headers;
}

function buildOpenAiChat(params: DirectChatParams): DirectRequest {
  return {
    url: resolveDirectUrl(params.baseUrl, "v1/chat/completions"),
    headers: jsonHeaders(params.apiKey),
    body: JSON.stringify({
      model: params.model,
      messages: params.messages,
      max_tokens: DEFAULT_MAX_TOKENS,
      stream: true,
    }),
  };
}

function buildOpenAiResponses(params: DirectChatParams): DirectRequest {
  const { system, turns } = splitSystem(params);
  return {
    url: resolveDirectUrl(params.baseUrl, "v1/responses"),
    headers: jsonHeaders(params.apiKey),
    body: JSON.stringify({
      model: params.model,
      instructions: system || undefined,
      input: turns.map((m) => ({ role: m.role, content: m.content })),
      max_output_tokens: DEFAULT_MAX_TOKENS,
      stream: true,
    }),
  };
}

/**
 * Anthropic accepts the system prompt as a string or as text blocks. The send
 * path hands it the structured JSON, which becomes two cached blocks — the
 * same shape the relay route builds.
 */
function anthropicSystemBlocks(
  content: string,
): Array<{ type: "text"; text: string; cache_control?: { type: "ephemeral" } }> {
  try {
    const parsed = JSON.parse(content);
    if (parsed.staticInstruction && parsed.dynamicContext) {
      return [
        {
          type: "text",
          text: parsed.staticInstruction,
          cache_control: { type: "ephemeral" },
        },
        { type: "text", text: "\n\n" + parsed.dynamicContext },
      ];
    }
  } catch {
    // Not our structured prompt; send it as plain text below.
  }
  return content ? [{ type: "text", text: content }] : [];
}

function buildAnthropic(params: DirectChatParams): DirectRequest {
  const { system, turns } = splitSystem(params);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "anthropic-version": "2023-06-01",
  };
  if (params.apiKey.trim()) headers["x-api-key"] = params.apiKey;

  return {
    url: resolveDirectUrl(params.baseUrl, "v1/messages"),
    headers,
    body: JSON.stringify({
      model: params.model,
      max_tokens: DEFAULT_MAX_TOKENS,
      system: anthropicSystemBlocks(system),
      messages: turns.map((m) => ({ role: m.role, content: m.content })),
      stream: true,
    }),
  };
}

function buildGoogle(params: DirectChatParams): DirectRequest {
  const { system, turns } = splitSystem(params);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (params.apiKey.trim()) headers["x-goog-api-key"] = params.apiKey;

  const body: Record<string, unknown> = {
    contents: turns.map((m) => ({
      role: m.role === "user" ? "user" : "model",
      parts: [{ text: m.content }],
    })),
  };
  if (system) body.systemInstruction = { parts: [{ text: system }] };

  return {
    url: resolveDirectUrl(
      params.baseUrl,
      `v1beta/models/${encodeURIComponent(params.model)}:streamGenerateContent?alt=sse`,
    ),
    headers,
    body: JSON.stringify(body),
  };
}

/** Builds a browser-direct request for the given wire format. */
export function buildDirectRequest(
  flavor: AiApiFlavor,
  params: DirectChatParams,
): DirectRequest {
  switch (flavor) {
    case "openai-chat":
      return buildOpenAiChat(params);
    case "openai-responses":
      return buildOpenAiResponses(params);
    case "anthropic-messages":
      return buildAnthropic(params);
    case "google-generate":
      return buildGoogle(params);
  }
}
