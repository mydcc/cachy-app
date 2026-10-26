/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

/**
 * One entrance for every AI proxy body (BUG-0724).
 *
 * The routes used to call `request.json()` and then `AiRequestSchema`, which
 * meant an unbounded body was buffered before any schema saw it. The cap here
 * is enforced while the body is read: `Content-Length` rejects early when it
 * is present and honest, and the stream reader counts every chunk and cancels
 * the moment the total crosses the cap, so a chunked body (no length header)
 * is bounded too. The decoded text is therefore never larger than the cap.
 *
 * `AI_REQUEST_MAX_BYTES` stays under adapter-node's documented default body
 * limit (512 KB) so the app's 413 is the answer a caller actually sees in the
 * default deployment.
 *
 * The schema itself carries the per-field ceilings (message count and length,
 * tool count and shape, model and base-URL length); see `AI_LIMITS`. They are
 * defence in depth, not the DoS control — the byte cap is.
 */

import { json } from "@sveltejs/kit";
import { AiRequestSchema, type AiRequest } from "../../types/ai";

export const AI_REQUEST_MAX_BYTES = 512_000;

export type AiRequestGuardResult =
  | { ok: true; data: AiRequest }
  | { ok: false; response: Response };

function tooLarge(): Response {
  return json({ error: "Request body too large" }, { status: 413 });
}

export type BoundedJsonResult =
  | { ok: true; data: unknown }
  | { ok: false; response: Response };

type BodyResult =
  | { ok: true; text: string }
  | { ok: false; response: Response };

/**
 * Reads the body chunk by chunk, cancelling as soon as it exceeds the cap.
 *
 * The `Content-Length` check is the cheap path; the counter is the guarantee.
 * A read rejection from the adapter's own limit is a 413, not a parse error.
 */
async function readBodyWithinCap(
  request: Request,
  maxBytes: number,
): Promise<BodyResult> {
  const declared = request.headers.get("content-length");
  if (declared !== null) {
    const bytes = Number(declared);
    if (Number.isFinite(bytes) && bytes > maxBytes) {
      return { ok: false, response: tooLarge() };
    }
  }

  if (!request.body) return { ok: true, text: "" };

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let text = "";

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => {});
        return { ok: false, response: tooLarge() };
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return { ok: true, text };
  } catch (error) {
    if ((error as { status?: unknown })?.status === 413) {
      return { ok: false, response: tooLarge() };
    }
    return {
      ok: false,
      response: json({ error: "Request body unreadable" }, { status: 400 }),
    };
  }
}

/** Reads and caps a JSON body without assuming the AI request shape. */
export async function readBoundedJson(
  request: Request,
  maxBytes: number = AI_REQUEST_MAX_BYTES,
): Promise<BoundedJsonResult> {
  const body = await readBodyWithinCap(request, maxBytes);
  if (!body.ok) return body;

  try {
    return { ok: true, data: JSON.parse(body.text) };
  } catch {
    // A malformed body is the caller's error, not a proxy failure. The old
    // routes let this fall into the generic catch and answered 500.
    return {
      ok: false,
      response: json({ error: "Invalid JSON body" }, { status: 400 }),
    };
  }
}

export async function readAiRequest(request: Request): Promise<AiRequestGuardResult> {
  const bounded = await readBoundedJson(request);
  if (!bounded.ok) return bounded;

  const parsed = AiRequestSchema.safeParse(bounded.data);
  if (!parsed.success) {
    // Keep the specific messages the provider routes already exposed for the
    // two fields a caller can fix without reading the schema dump (BUG-0238,
    // BUG-0724). Everything else stays a generic validation failure.
    if (parsed.error.issues.some((issue) => issue.path[0] === "model")) {
      return {
        ok: false,
        response: json({ error: "Invalid model identifier" }, { status: 400 }),
      };
    }
    if (parsed.error.issues.some((issue) => issue.path[0] === "tools")) {
      return {
        ok: false,
        response: json({ error: "Invalid tool definition" }, { status: 400 }),
      };
    }
    return {
      ok: false,
      response: json(
        { error: "Invalid request body", details: parsed.error.format() },
        { status: 400 },
      ),
    };
  }
  return { ok: true, data: parsed.data };
}
