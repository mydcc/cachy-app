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
 * `server/spacetimedb/src/rateLimit.ts`. The parity test in
 * `src/services/cloudService.rateLimit.test.ts` sweeps the BMP and fails if
 * the two implementations drift apart.
 */
export const MAX_CHAT_MESSAGE_LENGTH = 1000;

const ZERO_WIDTH_SPACE = /\u200B/gu;

const INVISIBLE_MARKS =
  /[\p{Cf}\p{Cs}\u034F\u180B-\u180D\u180F\uFE00-\uFE0F\u{E0100}-\u{E01EF}]/gu;

const BLANK_GLYPHS =
  /[\u2800\u115F\u1160\u3164\uFFA0\u{13441}\u{13442}\u{1D159}\uFFFC\u{11C44}\u{11C45}\u{1144E}\u{11945}\u{1ECAC}\uA837]/gu;

// The modifier range is deliberate: a bare skin-tone selector renders blank,
// while the same selector after a base emoji must pass.
const VISIBLE_CHARACTER =
  // eslint-disable-next-line no-misleading-character-class
  /[^\p{Z}\p{C}\p{M}\u2800\u115F\u1160\u3164\uFFA0\u{13441}\u{13442}\u{1D159}\uFFFC\u{1F3FB}-\u{1F3FF}\u{11C44}\u{11C45}\u{1144E}\u{11945}\u{1ECAC}\uA837]/u;

export function sanitizeChatText(text: string): string {
  const collapsed = text
    .replace(ZERO_WIDTH_SPACE, " ")
    .replace(INVISIBLE_MARKS, (ch) =>
      ch === "\u200C" || ch === "\u200D" ? ch : "",
    )
    .replace(BLANK_GLYPHS, " ")
    .replace(/\p{Cc}/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
  return VISIBLE_CHARACTER.test(collapsed) ? collapsed : "";
}

export function hasVisibleChatText(text: string): boolean {
  return sanitizeChatText(text).length > 0;
}
