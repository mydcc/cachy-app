/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import dns from "node:dns";
import { Agent } from "undici";

/**
 * Checks whether an IPv4 address (as 4 numeric octets) falls into private,
 * loopback, link-local, carrier-grade NAT, multicast, or reserved ranges.
 */
function isPrivateIpv4Octets(a: number, b: number, c: number, d: number): boolean {
  // 0.0.0.0/8 (Current network)
  if (a === 0) return true;
  // 10.0.0.0/8 (Private Class A)
  if (a === 10) return true;
  // 127.0.0.0/8 (Loopback)
  if (a === 127) return true;
  // 100.64.0.0/10 (Carrier-grade NAT)
  if (a === 100 && b >= 64 && b <= 127) return true;
  // 169.254.0.0/16 (Link-Local & Cloud Metadata / AWS IMDS)
  if (a === 169 && b === 254) return true;
  // 172.16.0.0/12 (Private Class B)
  if (a === 172 && b >= 16 && b <= 31) return true;
  // 192.168.0.0/16 (Private Class C)
  if (a === 192 && b === 168) return true;
  // 198.18.0.0/15 (Benchmarking)
  if (a === 198 && (b === 18 || b === 19)) return true;
  // 224.0.0.0/4 (Multicast) & 240.0.0.0/4 (Reserved)
  if (a >= 224) return true;
  // Broadcast
  if (a === 255 && b === 255 && c === 255 && d === 255) return true;

  return false;
}

/**
 * Validates whether a hostname corresponds to a private, loopback, link-local,
 * cloud metadata, non-decimal encoded, or reserved IP/host to prevent
 * Server-Side Request Forgery (SSRF).
 */
export function isPrivateOrReservedHost(hostname: string): boolean {
  const lower = hostname.toLowerCase().trim();
  const cleanHost = lower.replace(/^\[|\]$/g, "");

  // Localhost, metadata and internal TLDs
  if (
    cleanHost === "localhost" ||
    cleanHost.endsWith(".localhost") ||
    cleanHost.endsWith(".local") ||
    cleanHost.endsWith(".internal") ||
    cleanHost.endsWith(".lan") ||
    cleanHost.endsWith(".home") ||
    cleanHost.endsWith(".arpa") ||
    cleanHost.endsWith(".corp")
  ) {
    return true;
  }

  // IPv6 loopback / private / link-local / unique-local / documentation
  if (
    cleanHost === "::1" ||
    cleanHost === "::" ||
    cleanHost.startsWith("fe80:") ||
    cleanHost.startsWith("fc00:") ||
    cleanHost.startsWith("fd00:") ||
    cleanHost.startsWith("2001:db8:") ||
    cleanHost.startsWith("64:ff9b:")
  ) {
    return true;
  }

  // IPv4-mapped IPv6 (::ffff:127.0.0.1 or ::ffff:7f00:1)
  if (cleanHost.startsWith("::ffff:")) {
    const mappedPart = cleanHost.slice(7);
    if (isPrivateOrReservedHost(mappedPart)) {
      return true;
    }
  }

  // Detect hex representations (e.g. 0x7f.0.0.1, 0x7f000001, 0xa9fea9fe)
  if (/0x[0-9a-f]+/i.test(cleanHost)) {
    return true;
  }

  // Detect integer / DWORD host forms (e.g. 2130706433, 2852039166)
  if (/^\d+$/.test(cleanHost)) {
    return true;
  }

  // Detect octal / leading zero notations in dotted parts (e.g. 0177.0.0.1, 127.000.000.001)
  const dottedParts = cleanHost.split(".");
  if (dottedParts.some((p) => /^0\d+/.test(p))) {
    return true;
  }

  // Check standard IPv4 dotted-decimal address
  const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
  const match = cleanHost.match(ipv4Regex);
  if (match) {
    const octets = match.slice(1).map(Number);
    if (octets.some((o) => o > 255 || o < 0)) return true;

    const [a, b, c, d] = octets;
    if (isPrivateIpv4Octets(a, b, c, d)) return true;
  }

  // Single-label hostnames without dots or colons (e.g. intranet, router, metadata)
  if (!cleanHost.includes(".") && !cleanHost.includes(":")) {
    return true;
  }

  return false;
}

/**
 * Validates that a URL is a valid public HTTP/HTTPS URL and does not target
 * internal/private/reserved networks (synchronous fast check).
 */
export function isUrlAllowed(urlStr: string): boolean {
  try {
    const u = new URL(urlStr);
    // 1. Only http and https
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;

    // 2. Reject credentials in URL
    if (u.username || u.password) return false;

    // 3. Reject private, loopback, or metadata addresses
    if (isPrivateOrReservedHost(u.hostname)) return false;

    // 4. Must have a valid dot or colon in hostname (e.g. bitcoin-kurier.de or public IPv6)
    if (!u.hostname.includes(".") && !u.hostname.includes(":")) return false;

    // 5. Hostname must not start or end with a dot
    if (u.hostname.startsWith(".") || u.hostname.endsWith(".")) return false;

    return true;
  } catch {
    return false;
  }
}

/**
 * Asynchronously resolves the hostname via DNS and validates that ALL returned
 * IP addresses (IPv4 & IPv6) are non-private/non-reserved public addresses,
 * mitigating DNS-rebinding and TOCTOU bypasses.
 */
export async function isUrlAllowedAsync(urlStr: string): Promise<boolean> {
  if (!isUrlAllowed(urlStr)) {
    return false;
  }

  try {
    const u = new URL(urlStr);
    const cleanHost = u.hostname.replace(/^\[|\]$/g, "");

    // Resolve all DNS records
    const addresses = await dns.promises.lookup(cleanHost, { all: true });
    if (!addresses || addresses.length === 0) {
      return false;
    }

    for (const record of addresses) {
      if (isPrivateOrReservedHost(record.address)) {
        return false;
      }
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Safe undici dispatcher with an embedded lookup guard at dial time,
 * ensuring no connection can be established to private/reserved targets.
 */
export const safeDispatcher = new Agent({
  connect: {
    lookup: (hostname, _options, callback) => {
      dns.lookup(hostname, { all: true }, (err, addresses) => {
        if (err) return callback(err, "", 4);
        if (!addresses || addresses.length === 0) {
          return callback(new Error("ENOTFOUND"), "", 4);
        }
        for (const addr of addresses) {
          if (isPrivateOrReservedHost(addr.address)) {
            return callback(new Error("Blocked target address (SSRF guard)"), "", 4);
          }
        }
        const chosen = addresses[0];
        callback(null, chosen.address, chosen.family);
      });
    },
  },
});

/**
 * Safe fetch wrapper that enforces both pre-flight URL validation and
 * dial-time DNS verification against private/reserved/internal IP ranges.
 */
export async function safeFetch(url: string | URL, init?: RequestInit): Promise<Response> {
  const urlStr = typeof url === "string" ? url : url.toString();
  const allowed = await isUrlAllowedAsync(urlStr);
  if (!allowed) {
    throw new Error("Prohibited or invalid URL");
  }

  // @ts-expect-error Node fetch supports dispatcher option via undici
  return fetch(url, { ...init, dispatcher: safeDispatcher });
}
