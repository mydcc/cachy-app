/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

/**
 * Inbound WebSocket frame size guard (BUG-0725).
 *
 * Both transports hand `event.data` straight to `safeJsonParse`. A frame from a
 * compromised or spoofed upstream can be arbitrarily large, and the parse (plus
 * the store updates it drives) runs on the main thread. The cap is checked
 * before parsing so an oversized frame costs one length read, not an allocation
 * proportional to the attacker's payload.
 *
 * 1 MB is far above the largest legitimate frame — a full depth snapshot is a
 * few KB, a kline is smaller — and low enough to bound the damage.
 */
export const MAX_WS_FRAME_BYTES = 1_000_000;

/**
 * Best-effort size of a WebSocket `data` value.
 *
 * Strings are measured in UTF-16 code units. That is a lower bound on their
 * UTF-8 byte length, which is the safe direction for a cap: a string above the
 * limit is certainly above the byte limit, and a non-ASCII string just below it
 * is still bounded by 2 bytes per unit in memory.
 */
export function frameByteLength(data: unknown): number {
  if (typeof data === "string") return data.length;
  if (data instanceof ArrayBuffer) return data.byteLength;
  if (ArrayBuffer.isView(data)) return data.byteLength;
  if (typeof Blob !== "undefined" && data instanceof Blob) return data.size;
  return 0;
}

export function isOversizedFrame(
  data: unknown,
  maxBytes: number = MAX_WS_FRAME_BYTES,
): boolean {
  return frameByteLength(data) > maxBytes;
}
