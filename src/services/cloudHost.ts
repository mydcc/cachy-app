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
 * `https://` (or `wss://`, which is the same TLS transport). Loopback is exempt
 * because a local SpacetimeDB during development has no certificate and never
 * leaves the machine.
 */
export type CloudHostIssue = "invalid_url" | "insecure_transport";

export function isLoopbackHost(hostname: string): boolean {
  // URL normalises a trailing dot away in most cases; strip one defensively.
  const host = hostname.toLowerCase().replace(/\.$/, "");
  return (
    host === "localhost" ||
    // URL.hostname brackets IPv6; the bare form is accepted defensively for
    // callers that pass a hostname rather than a parsed URL.
    host === "::1" ||
    host === "[::1]" ||
    /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)
  );
}

/**
 * Returns the reason code, or `null` when the host is acceptable.
 *
 * A code rather than a message so the settings tab can render a translated
 * explanation while the service throws the English one.
 */
export function cloudHostIssue(raw: string): CloudHostIssue | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return "invalid_url";
  }

  if (url.protocol === "https:" || url.protocol === "wss:") return null;
  if (url.protocol === "http:" && isLoopbackHost(url.hostname)) return null;

  return "insecure_transport";
}

export function cloudHostSecurityMessage(issue: CloudHostIssue): string {
  return issue === "invalid_url"
    ? "Global Chat server address is not a valid URL."
    : "Global Chat requires https://; http:// is allowed only for localhost.";
}

/**
 * Human-readable reason the host is refused, or `null` when it is acceptable.
 * Used by `cloudService.connect()`; the settings tab maps `cloudHostIssue`.
 */
export function cloudHostSecurityIssue(raw: string): string | null {
  const issue = cloudHostIssue(raw);
  return issue ? cloudHostSecurityMessage(issue) : null;
}
