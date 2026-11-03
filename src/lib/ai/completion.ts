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
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

/*
 * FEAT-0678 — one request path for every AI consumer.
 *
 * The chat and the Academy both need a provider answer. Before this module the
 * whole transport lived inside `sendMessage`, welded to the chat transcript:
 * retry policy, direct-versus-relay choice, the Ollama fail-closed rule and the
 * stream parser were only reachable by writing into `messages`. A second caller
 * therefore had two options, both wrong — duplicate the transport, or pretend a
 * chat turn happened. This module is the transported part on its own.
 *
 * The rule that makes it safe for two callers: **it writes no store state.** No
 * `error`, no `isStreaming`, no transcript. Failures are thrown, and the caller
 * decides how to show them — otherwise an Academy request would blank the
 * assistant's error box and vice versa.
 */

import { appFetch } from "../appAuth";
import {
  BUILTIN_ENTRY_IDS,
  flavorOf,
  isBuiltinEntryId,
  modelProviderForFlavor,
  resolveActiveProvider,
  type AiApiFlavor,
  type ProviderConfig,
} from "../../stores/settings/aiProviders";
import type { AiProvider } from "../../stores/settings.svelte";
import { buildDirectRequest } from "./directRequest";
import { isOpenCodeUrl } from "./opencodeTarget";
import { SESSION_ID_HEADER } from "./sessionId";
import {
  appendToolCallFragment,
  parseStreamChunk,
  type StreamUsage,
} from "./streamAdapters";

/** Server route per wire format. Built-ins keep their own route. */
const ROUTE_BY_FLAVOR: Record<AiApiFlavor, string> = {
  "openai-chat": "/api/ai/openai",
  "openai-responses": "/api/ai/openai-responses",
  "anthropic-messages": "/api/ai/anthropic",
  "google-generate": "/api/ai/gemini",
};

/** The input `resolveActiveProvider` already takes, plus the relay session id. */
type ResolveInput = Parameters<typeof resolveActiveProvider>[0];

export interface ResolveChatInput extends ResolveInput {
  /** Sent as a header to the relay only; omitted when empty. */
  sessionId?: string;
}

/**
 * Where a request goes and what it carries. Resolved once per call so the caller
 * does not have to know the provider registry.
 */
export type ChatTarget =
  | {
      kind: "local";
      label: string;
      flavor: AiApiFlavor;
      baseUrl: string;
      model: string;
      provider: AiProvider;
    }
  | {
      kind: "direct";
      label: string;
      flavor: AiApiFlavor;
      baseUrl: string;
      model: string;
      apiKey: string;
      provider: AiProvider;
    }
  | {
      kind: "relay";
      label: string;
      endpoint: string;
      flavor: AiApiFlavor;
      model: string;
      apiKey: string;
      baseUrl: string;
      provider: AiProvider;
      sessionId?: string;
    };

/**
 * Provider answers a retry cannot improve: a rejected key (401), a billing
 * problem (402), a missing permission or region block (403). Retrying those
 * spends quota and buries the real message under two more failures, so they
 * leave the send loop on the first answer.
 */
export function isRetryableProviderStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

/**
 * How much of a provider's own wording reaches the UI. A broken or hostile
 * provider can answer with megabytes; the message is escaped, but it should
 * still not decide how large the error box gets (BUG-0694).
 */
const MAX_PROVIDER_DETAIL = 300;

/**
 * The message shown for a provider answer. The status is part of it on purpose:
 * it is what the console shows, and matching the two is how a reader gets from
 * "the chat says no" to "which request failed". The detail is collapsed to one
 * line and capped, because it is provider-controlled text.
 */
export function providerFailureMessage(status: number, body: unknown): string {
  const record = (body ?? {}) as { error?: unknown; message?: unknown };
  const nested =
    record.error && typeof record.error === "object"
      ? (record.error as { message?: unknown }).message
      : undefined;
  const raw =
    (typeof nested === "string" && nested) ||
    (typeof record.error === "string" && record.error) ||
    (typeof record.message === "string" && record.message) ||
    "no details in the response";
  const detail = raw.replace(/\s+/g, " ").trim();
  const capped =
    detail.length > MAX_PROVIDER_DETAIL
      ? `${detail.slice(0, MAX_PROVIDER_DETAIL)}…`
      : detail;
  return `HTTP ${status}: ${capped}`;
}

/** Thrown for a provider answer the send loop must not retry. */
export class ProviderRequestError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ProviderRequestError";
    this.status = status;
  }
}

/** An abort is a user decision, not a provider failure. */
export function isAbortError(error: unknown): boolean {
  return (
    !!error &&
    typeof error === "object" &&
    (error as { name?: unknown }).name === "AbortError"
  );
}

/**
 * Resolve which provider answers, and through which transport.
 *
 * Rethrows the same configuration errors the assistant shows today ("API Key
 * for X is missing in Settings", "No model selected"), so a caller that renders
 * them is not inventing a second vocabulary for the same defect.
 */
export function resolveChatTarget(input: ResolveChatInput): ChatTarget {
  const settings = input;
  const resolved = resolveActiveProvider({
    userProviders: settings.userProviders,
    activeProviderId: settings.activeProviderId,
    aiProvider: settings.aiProvider,
    legacy: settings.legacy,
  });
  const entry = resolved.entry;

  const streamFlavor: AiApiFlavor = entry
    ? entry.flavor
    : (flavorOf(settings.aiProvider) ?? "openai-chat");

  const isOllamaEntry = entry?.id === BUILTIN_ENTRY_IDS.ollama;
  const provider: AiProvider = entry
    ? isOllamaEntry
      ? "ollama"
      : modelProviderForFlavor(entry.flavor)
    : settings.aiProvider || "gemini";

  const userProvider = entry && !isOllamaEntry ? entry : undefined;

  let apiKey = "";
  let model = "";
  let baseUrl = "";

  if (entry && !isOllamaEntry) {
    apiKey = entry.apiKey;
    model = entry.model;
    baseUrl = entry.baseUrl;
    if (isBuiltinEntryId(entry.id)) {
      if (!apiKey.trim() && !baseUrl.trim()) {
        throw new Error(`API Key for ${entry.label} is missing in Settings.`);
      }
    } else {
      if (!baseUrl.trim()) {
        throw new Error(
          `"${entry.label}" has no base URL configured. Add one in Settings.`,
        );
      }
      if (!apiKey.trim()) {
        throw new Error(
          `"${entry.label}" has no API key configured. Add one in Settings.`,
        );
      }
    }
  } else if (entry && isOllamaEntry) {
    // Local (or self-hosted) instance — no API key required.
    model = entry.model;
    baseUrl = entry.baseUrl;
  } else if (provider === "openai") {
    apiKey = settings.legacy.openai.apiKey;
    model = settings.legacy.openai.model;
    baseUrl = settings.legacy.openai.baseUrl;
  } else if (provider === "gemini") {
    apiKey = settings.legacy.gemini.apiKey;
    model = settings.legacy.gemini.model;
    baseUrl = settings.legacy.gemini.baseUrl;
  } else if (provider === "anthropic") {
    apiKey = settings.legacy.anthropic.apiKey;
    model = settings.legacy.anthropic.model;
    baseUrl = settings.legacy.anthropic.baseUrl;
  } else if (provider === "openrouter") {
    apiKey = settings.legacy.openrouter.apiKey;
    model = settings.legacy.openrouter.model;
    baseUrl = settings.legacy.openrouter.baseUrl;
  } else if (provider === "ollama") {
    // Local (or self-hosted) instance — no API key required.
    model = settings.legacy.ollama.model;
    baseUrl = settings.legacy.ollama.baseUrl;
  }

  if (!apiKey && provider !== "ollama" && !baseUrl?.trim()) {
    throw new Error(`API Key for ${provider} is missing in Settings.`);
  }
  if (!model) {
    throw new Error(
      `No model selected for ${provider}. Please choose one in Settings.`,
    );
  }

  const label = resolved.label;

  if (provider === "ollama") {
    return { kind: "local", label, flavor: streamFlavor, baseUrl, model, provider };
  }

  if (
    userProvider &&
    !userProvider.allowServerRelay &&
    !isOpenCodeUrl(userProvider.baseUrl)
  ) {
    return {
      kind: "direct",
      label,
      flavor: streamFlavor,
      baseUrl,
      model,
      apiKey,
      provider,
    };
  }

  const endpoint =
    entry && !isOllamaEntry
      ? ROUTE_BY_FLAVOR[entry.flavor]
      : `/api/ai/${provider}`;

  return {
    kind: "relay",
    label,
    endpoint,
    flavor: streamFlavor,
    model,
    apiKey,
    baseUrl,
    provider,
    sessionId: settings.sessionId,
  };
}

export interface ChatMessage {
  role: string;
  content: string;
}

export interface CompletionOptions {
  messages: readonly ChatMessage[];
  /** Called with the whole answer so far, not with the delta. */
  onDelta?: (content: string) => void;
  /** Raw tool-call fragments, for callers that parse trade actions. */
  onToolCall?: (buffer: string) => void;
  /** Retry notices a caller may want to show ("Rate limited. Retrying in 2s..."). */
  onRetryNotice?: (message: string, status?: number) => void;
  /** Tool schema; omitted by callers that must not change the trade form. */
  tools?: unknown;
  signal?: AbortSignal;
}

export interface CompletionResult {
  content: string;
  usage: StreamUsage;
  toolCallBuffer: string;
}

/** Attempts, not retries: three attempts means two re-sends (BUG-0694). */
const MAX_ATTEMPTS = 3;

/**
 * Send `messages` to `target` and stream the answer back.
 *
 * Throws on every failure — configuration, transport or provider status — and
 * rethrows an abort as-is so a caller can tell "cancelled" from "broken". The
 * local path fails closed: a failed direct connection is an error and never a
 * silent fallback to the relay (ADR-0011).
 */
export async function streamCompletion(
  target: ChatTarget,
  options: CompletionOptions,
): Promise<CompletionResult> {
  const { messages, onDelta, onToolCall, onRetryNotice, tools, signal } = options;
  const payloadMessages = messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  let res: Response | null = null;

  if (target.kind === "direct") {
    const direct = buildDirectRequest(target.flavor, {
      baseUrl: target.baseUrl,
      apiKey: target.apiKey,
      model: target.model,
      messages: payloadMessages,
    });
    try {
      const directRes = await fetch(direct.url, {
        method: "POST",
        headers: direct.headers,
        body: direct.body,
        signal,
      });
      if (!directRes.ok) {
        const err = await directRes.json().catch(() => ({}));
        throw new ProviderRequestError(
          providerFailureMessage(directRes.status, err),
          directRes.status,
        );
      }
      res = directRes;
    } catch (err) {
      if (isAbortError(err)) throw err;
      if (err instanceof ProviderRequestError) throw err;
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(
        `Direct request to "${target.label}" failed: ${message}. If the provider blocks browser requests (CORS), enable "Allow server relay" in Settings → AI.`,
        { cause: err },
      );
    }
  }

  if (target.kind === "local") {
    const targetUrl = (target.baseUrl.trim() || "http://localhost:11434").replace(
      /\/$/,
      "",
    );
    try {
      const directRes = await fetch(`${targetUrl}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: target.model,
          messages: payloadMessages,
          ...(tools ? { tools: [tools] } : {}),
          stream: true,
        }),
        signal,
      });
      if (!directRes.ok) {
        const err = await directRes.json().catch(() => ({}));
        throw new Error(providerFailureMessage(directRes.status, err));
      }
      res = directRes;
    } catch (err) {
      // Direct browser fetch failed — fail closed! ADR-0011 forbids falling
      // back to the server proxy in local mode.
      if (isAbortError(err)) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(
        `Ollama connection failed: ${msg}. Please ensure Ollama is running locally at ${targetUrl} and CORS is configured (OLLAMA_ORIGINS="*").`,
        { cause: err },
      );
    }
  }

  if (!res && target.kind === "relay") {
    // Up to MAX_ATTEMPTS provider attempts per send: a rate limit backs off,
    // a server fault gets one more try, and an answer a retry cannot improve
    // (rejected key, billing, permission) leaves at once — each keeping the
    // provider's own message with its status. A 5xx can have been accepted
    // upstream before its answer was lost, so a re-send can repeat a paid
    // request; the window is bounded by MAX_ATTEMPTS (BUG-0694).
    let lastFailure = "";

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      let candidate: Response;
      try {
        candidate = await appFetch(target.endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": target.apiKey,
            // Omitted when the platform has no CSPRNG; the relay then fills
            // a session id in server-side (BUG-0701).
            ...(target.sessionId
              ? { [SESSION_ID_HEADER]: target.sessionId }
              : {}),
          },
          body: JSON.stringify({
            messages: payloadMessages,
            model: target.model,
            ...(target.baseUrl?.trim() ? { baseUrl: target.baseUrl.trim() } : {}),
          }),
          signal,
        });
      } catch (networkError) {
        if (isAbortError(networkError)) throw networkError;
        // No answer at all: a transport failure, retried like a server fault.
        const message =
          networkError instanceof Error
            ? networkError.message
            : String(networkError);
        lastFailure = `Failed to connect to ${target.label} after ${MAX_ATTEMPTS} attempts: ${message}`;
        if (attempt === MAX_ATTEMPTS) {
          throw new Error(lastFailure, { cause: networkError });
        }
        if (import.meta.env.DEV) {
          console.warn(`API Error: ${message}. Retrying...`);
        }
        await new Promise((r) => setTimeout(r, 1000));
        continue;
      }

      if (candidate.ok) {
        res = candidate;
        break; // Success!
      }

      const body = await candidate.json().catch(() => ({}));
      const failure = providerFailureMessage(candidate.status, body);
      lastFailure = failure;

      if (
        !isRetryableProviderStatus(candidate.status) ||
        attempt === MAX_ATTEMPTS
      ) {
        throw new ProviderRequestError(failure, candidate.status);
      }

      const delay =
        candidate.status === 429 ? Math.pow(2, attempt) * 1000 : 1000;
      onRetryNotice?.(
        candidate.status === 429
          ? `Rate limited. Retrying in ${delay / 1000}s...`
          : failure,
        candidate.status,
      );
      if (import.meta.env.DEV) {
        console.warn(`API Error: ${failure}. Retrying in ${delay / 1000}s...`);
      }
      await new Promise((r) => setTimeout(r, delay));
    }

    // The loop only leaves on a response or a throw — this narrowing is for
    // the type checker, not a user-facing failure path.
    if (!res) throw new Error(lastFailure || "AI provider returned no response");
  }

  if (!res) throw new Error("AI provider returned no response");
  if (!res.body) throw new Error("No response body");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let fullContent = "";
  let toolCallBuffer = "";
  const usage: StreamUsage = {};

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    const lines = chunk.split("\n");

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed === "data: [DONE]") continue;
      if (trimmed.startsWith("data: ")) {
        const dataStr = trimmed.slice(6);
        try {
          const data = JSON.parse(dataStr);
          const {
            text: delta,
            toolCallFragment: toolCallData,
            usage: chunkUsage,
          } = parseStreamChunk(target.flavor, data);

          if (chunkUsage) {
            if (chunkUsage.inputTokens != null) {
              usage.inputTokens = chunkUsage.inputTokens;
            }
            if (chunkUsage.outputTokens != null) {
              usage.outputTokens = chunkUsage.outputTokens;
            }
          }

          if (toolCallData) {
            // Buffer tool call chunks (delta flavors append, the Google
            // snapshot flavor keeps the latest — see appendToolCallFragment).
            toolCallBuffer = appendToolCallFragment(
              target.flavor,
              toolCallBuffer,
              toolCallData,
            );
            onToolCall?.(toolCallBuffer);
          }

          if (delta) {
            fullContent += delta;
            onDelta?.(fullContent);
          }
        } catch {
          // Ignore parse errors
        }
      }
    }
  }

  return { content: fullContent, usage, toolCallBuffer };
}

/** Convenience for callers that only need the provider name and readiness. */
export function describeTarget(input: ResolveChatInput): {
  ready: boolean;
  label: string;
} {
  const resolved = resolveActiveProvider({
    userProviders: input.userProviders,
    activeProviderId: input.activeProviderId,
    aiProvider: input.aiProvider,
    legacy: input.legacy,
  });
  return { ready: resolved.ready, label: resolved.label };
}

/** Re-exported so a caller can name the config without importing the registry. */
export type { ProviderConfig };
