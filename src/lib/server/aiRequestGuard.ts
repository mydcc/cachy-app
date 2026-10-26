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
 * is checked twice — from `Content-Length` when the caller declares one, and
 * from the decoded byte length afterwards for chunked bodies — so a missing or
 * lying header cannot buy an unlimited buffer.
 *
 * The schema itself carries the per-field ceilings (message count and length,
 * tool count and shape, model and base-URL length); see `AI_LIMITS`.
 */

import { json } from "@sveltejs/kit";
import { AiRequestSchema, type AiRequest } from "../../types/ai";

export const AI_REQUEST_MAX_BYTES = 1_000_000;

export type AiRequestGuardResult =
  | { ok: true; data: AiRequest }
  | { ok: false; response: Response };

function tooLarge(): Response {
  return json({ error: "Request body too large" }, { status: 413 });
}

export type BoundedJsonResult =
  | { ok: true; data: unknown }
  | { ok: false; response: Response };

/** Reads and caps a JSON body without assuming the AI request shape. */
export async function readBoundedJson(
  request: Request,
  maxBytes: number = AI_REQUEST_MAX_BYTES,
): Promise<BoundedJsonResult> {
  const declared = request.headers.get("content-length");
  if (declared !== null) {
    const bytes = Number(declared);
    if (Number.isFinite(bytes) && bytes > maxBytes) {
      return { ok: false, response: tooLarge() };
    }
  }

  try {
    const text = await request.text();
    if (new TextEncoder().encode(text).byteLength > maxBytes) {
      return { ok: false, response: tooLarge() };
    }
    return { ok: true, data: JSON.parse(text) };
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
