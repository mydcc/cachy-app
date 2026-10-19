/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

/**
 * Shape of a conversation id that may travel as a provider header.
 * Deliberately narrow: letters, digits and three separators, bounded length.
 */
const SESSION_ID_RE = /^[A-Za-z0-9._:-]{1,128}$/;

/**
 * The upstream conversation id for a relay request.
 *
 * OpenCode Go rejects a request without `x-opencode-session`, and the value
 * comes from the client, so it is checked before it becomes a header: a value
 * outside the allowed shape would make `fetch` throw and surface as a 500. A
 * value that does not fit is replaced by a fresh id (BUG-0701).
 */
export function resolveSessionId(candidate: string | null | undefined): string {
  return candidate && SESSION_ID_RE.test(candidate)
    ? candidate
    : crypto.randomUUID();
}
