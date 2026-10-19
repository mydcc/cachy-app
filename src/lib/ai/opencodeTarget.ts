/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

/**
 * True when a base URL or a full URL points at OpenCode's inference gateway.
 *
 * OpenCode is the one provider Cachy has to reach through the server relay:
 * its gateway sends no CORS headers, so a browser-direct request can never
 * work. The rule lives in one module because the client (the settings UI) and
 * the server (the relay routes) have to agree on it — the client decides what
 * to show, the server decides what to send.
 */
export function isOpenCodeUrl(url: string | null | undefined): boolean {
  const trimmed = url?.trim();
  if (!trimmed) return false;
  try {
    // A base URL may come without a scheme; the host is what matters.
    const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
      ? trimmed
      : `https://${trimmed}`;
    // A trailing dot is DNS-equal to the bare host, so it does not change
    // which provider this is.
    const host = new URL(withScheme).hostname.toLowerCase().replace(/\.$/, "");
    return host === "opencode.ai" || host.endsWith(".opencode.ai");
  } catch {
    return false;
  }
}
