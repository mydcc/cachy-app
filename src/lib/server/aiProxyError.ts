/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

/**
 * The one message an AI proxy may return when the upstream fails (BUG-0724).
 *
 * Upstream text is attacker-influenced and may echo an API key, an internal
 * host name or a file path. The route logs a redacted form and answers this
 * generic string; the status code still tells the client what kind of failure
 * it was (401/429/5xx).
 */
import { json } from "@sveltejs/kit";
import { sanitizeErrorMessage } from "../../types/apiSchemas";

export const AI_PROXY_ERROR_MESSAGE = "AI provider request failed";

const LOG_MAX_CHARS = 500;
const UPSTREAM_BODY_MAX_CHARS = 1_000;

/**
 * Collapses every character a log consumer or a model can read as a line
 * break: C0/C1 controls, DEL, and the Unicode separators `JSON.stringify`
 * leaves raw. ANSI escapes are C0 + `[`, so they disappear with the rest.
 */
export function collapseUnsafeText(text: string): string {
  return text.replace(/[\p{Cc}\u2028\u2029]/gu, " ");
}

/**
 * Redacts a value for a log line.
 *
 * Three layers: exact-value replacement for every known secret (all lengths —
 * the old sentiment code skipped keys shorter than five characters, which is
 * exactly the case where the key is still a key), the labelled-shape scrubber,
 * then a line-break collapse so a crafted upstream message cannot forge a log
 * line.
 */
export function redactForLog(
  text: string,
  secrets: readonly (string | null | undefined)[] = [],
  maxChars: number = LOG_MAX_CHARS,
): string {
  let out = text;
  for (const secret of secrets) {
    if (secret) out = out.split(secret).join("***");
  }
  return sanitizeErrorMessage(collapseUnsafeText(out), maxChars);
}

/** Logs an upstream/proxy failure without the credential that caused it. */
export function logAiProxyError(
  scope: string,
  error: unknown,
  secrets: readonly (string | null | undefined)[] = [],
): void {
  const text =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "unknown error";

  console.error(`[${scope}] ${redactForLog(text, secrets)}`);
}

/**
 * Consumes an upstream error response, logs a redacted detail and returns the
 * one message a client may see.
 *
 * Reading the body matters twice: it releases the socket for reuse (the old
 * code dropped the response unread) and it keeps a 400 distinguishable from a
 * 401 in the log. The body is capped before logging; the status is preserved.
 */
export async function aiUpstreamFailure(
  response: Response,
  scope: string,
  secrets: readonly (string | null | undefined)[] = [],
): Promise<Response> {
  const body = await response.text().catch(() => "");
  const detail = body.slice(0, UPSTREAM_BODY_MAX_CHARS);
  logAiProxyError(
    scope,
    `status ${response.status}${detail ? `: ${detail}` : ""}`,
    secrets,
  );
  return json({ error: AI_PROXY_ERROR_MESSAGE }, { status: response.status });
}
