/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

/**
 * Transport policy for the user-configurable Global Chat host (BUG-0726).
 *
 * The token is a bearer credential: whoever sees it can speak as that identity.
 * Plain HTTP would put it on the wire in clear text, so remote hosts must use
 * `https://`. Loopback is exempt because a local SpacetimeDB during development
 * has no certificate and never leaves the machine.
 */
export function isLoopbackHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host === "[::1]"
  );
}

/**
 * Returns a human-readable reason the host is refused, or `null` when it is
 * acceptable. Shared by the service (authoritative) and the settings tab
 * (warning shown before the user clicks Connect).
 */
export function cloudHostSecurityIssue(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return "Global Chat server address is not a valid URL.";
  }

  if (url.protocol === "https:") return null;
  if (url.protocol === "http:" && isLoopbackHost(url.hostname)) return null;

  return "Global Chat requires https://; http:// is allowed only for localhost.";
}
