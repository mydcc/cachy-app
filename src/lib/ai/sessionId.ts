/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

/**
 * The header Cachy uses to carry a conversation id to its own relay. The relay
 * decides which vendor header that becomes — the client must not name a
 * vendor header itself.
 */
export const SESSION_ID_HEADER = "x-session-id";

/**
 * Shape of a conversation id that may travel as a provider header.
 * Deliberately narrow: letters, digits and three separators, bounded length.
 */
const SESSION_ID_RE = /^[A-Za-z0-9._:-]{1,128}$/;

/** True when a value may be used as a provider header value unchanged. */
export function isSessionId(value: unknown): value is string {
  return typeof value === "string" && SESSION_ID_RE.test(value);
}

/**
 * A fresh conversation id.
 *
 * `crypto.randomUUID` is SecureContext-gated and throws outside a secure
 * context, so fall back to `crypto.getRandomValues`, which is available
 * everywhere — an id that stays stable per conversation matters more than a
 * v4 shape. The randomness is always the platform CSPRNG: a header-bound
 * value must never come from `Math.random` (BUG-0701).
 */
export function newSessionId(): string {
  if (typeof crypto === "undefined") return "";
  try {
    if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  } catch {
    // Outside a secure context `randomUUID` throws — fall through.
  }
  try {
    if (typeof crypto.getRandomValues !== "function") return "";
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    // Shape it like a v4 UUID so client and server agree on the format.
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  } catch {
    return "";
  }
}

/**
 * The upstream conversation id for a relay request.
 *
 * OpenCode Go rejects a request without `x-opencode-session`, and the value
 * comes from the client, so it is checked before it becomes a header: a value
 * outside the allowed shape would make `fetch` throw and surface as a 500. A
 * value that does not fit is replaced by a fresh id (BUG-0701).
 */
export function resolveSessionId(candidate: string | null | undefined): string {
  return isSessionId(candidate) ? candidate : newSessionId();
}
