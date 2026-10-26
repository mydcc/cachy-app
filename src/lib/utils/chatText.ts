/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

/**
 * Mirror of the SpacetimeDB reducer's text normalization (BUG-0726).
 *
 * The reducer is authoritative. This copy exists so the settings tab and the
 * service refuse an invisible-only message before a round trip, and so the
 * text that leaves the device is already the text the module stores.
 *
 * Keep the character classes in sync with
 * `server/spacetimedb/src/rateLimit.ts`. `chatText.test.ts` compares both
 * implementations over a case table and fails if they drift apart.
 */
const INVISIBLE_OR_CONTROL =
  /[\p{Cc}\u00AD\u061C\u115F\u1160\u180E\u200B\u200E\u200F\u202A-\u202E\u2028\u2029\u2060-\u2064\u2066-\u2069\u2800\u3164\uFEFF\uFFA0\uFFF9-\uFFFB]/gu;

/** At least one glyph a reader can see; combining marks alone do not count. */
const VISIBLE_CHARACTER = /[\p{L}\p{N}\p{P}\p{S}]/u;

export function sanitizeChatText(text: string): string {
  const collapsed = text
    .replace(INVISIBLE_OR_CONTROL, " ")
    .replace(/\s+/gu, " ")
    .trim();
  return VISIBLE_CHARACTER.test(collapsed) ? collapsed : "";
}

export function hasVisibleChatText(text: string): boolean {
  return sanitizeChatText(text).length > 0;
}
