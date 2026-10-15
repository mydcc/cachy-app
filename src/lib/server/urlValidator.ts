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
import net from "node:net";

/**
 * Checks whether an IPv4 address (as 4 numeric octets) falls into private,
 * loopback, link-local, carrier-grade NAT, multicast, or reserved ranges.
 */
function isPrivateIpv4Octets(a: number, b: number): boolean {
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
  // 224.0.0.0/4 (Multicast) & 240.0.0.0/4 (Reserved) & 255.255.255.255 (Broadcast)
  if (a >= 224) return true;

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

  // IPv4-mapped IPv6 literals (e.g. ::ffff:127.0.0.1 or normalized ::ffff:7f00:1)
  // Have no legitimate use for public requests and are strictly rejected.
  if (
    cleanHost.startsWith("::ffff:") ||
    cleanHost.startsWith("0:0:0:0:0:ffff:") ||
    cleanHost.includes(":ffff:")
  ) {
    return true;
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
    if (octets.some((o) => o > 255)) return true;

    const [a, b] = octets;
    if (isPrivateIpv4Octets(a, b)) return true;
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

/** First usable proxy URL among the given environment variable names. */
function readProxyUrl(...keys: string[]): URL | null {
  for (const key of keys) {
    const raw = process.env[key];
    if (!raw) continue;
    try {
      const parsed = new URL(raw);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") {
        return parsed;
      }
    } catch {
      // A malformed value is ignored rather than thrown: it must not be able
      // to abort dispatcher construction and take every `safeFetch` route
      // down with it. The next name may still hold a usable value.
    }
  }
  return null;
}

function configuredProxyUrls(): { http: URL | null; https: URL | null } {
  // `ALL_PROXY` (and its lowercase form) is the documented fallback name that
  // undici's `EnvHttpProxyAgent` honors. Sampling only the protocol-specific
  // names would miss a deployment that configures egress exclusively through
  // it, and the dispatcher's own idea of "which host is the proxy" must agree
  // with the agent's.
  const all = readProxyUrl("all_proxy", "ALL_PROXY");
  return {
    http: readProxyUrl("http_proxy", "HTTP_PROXY") ?? all,
    https: readProxyUrl("https_proxy", "HTTPS_PROXY") ?? all,
  };
}

/**
 * Canonical hostname form for comparisons: lower case, no IPv6 brackets, no
 * trailing root dot. `URL.hostname` already lower-cases and IDNA-encodes, but a
 * dial-time hostname and an environment value can still differ in case, carry
 * brackets around an IPv6 literal, or end in `.`.
 */
function normalizeHostname(hostname: string): string {
  return hostname
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .replace(/\.+$/, "");
}

/**
 * Proxy hostnames from the environment. A deployment that reaches the network
 * only through a proxy answers every dial from a bare `Agent` with "fetch
 * failed", while the global `fetch` — which follows the environment's proxy
 * configuration — keeps working. The proxy is operator-configured
 * infrastructure rather than a target chosen by the caller, and it
 * legitimately sits on a private address (`http://proxy.internal:3128`), so
 * its own resolved addresses are exempt. The exemption is pinned to the
 * addresses collected in `getSafeDispatcher`, never applied to the hostname
 * alone. Every target URL still passes `isUrlAllowedAsync` and this guard.
 */
function configuredProxyHosts(): Set<string> {
  const hosts = new Set<string>();
  const { http, https } = configuredProxyUrls();
  for (const url of [http, https]) {
    if (url) hosts.add(normalizeHostname(url.hostname));
  }
  return hosts;
}

/**
 * How long the reachability probe of a configured proxy may take. Short on
 * purpose: the probe runs once, before the first guarded request, and a proxy
 * that does not accept a TCP connection within this window is treated as
 * unusable rather than waited for.
 */
const PROXY_PROBE_TIMEOUT_MS = 1000;

/**
 * Whether the configured proxy accepts a TCP connection right now.
 *
 * A proxy variable that is present but dead is worse than no proxy variable at
 * all: adopting it turns every guarded request into a connection error, while
 * the same deployment reached the network fine through a direct connection
 * (verified in production on a host whose direct egress works). So the value is
 * checked before it is trusted. The probe is a plain TCP connect — it does not
 * speak HTTP, which would be both slower and stricter than needed here.
 */
function probeProxy(proxy: URL): Promise<boolean> {
  const port = proxy.port
    ? Number(proxy.port)
    : proxy.protocol === "https:"
      ? 443
      : 80;
  return new Promise<boolean>((resolve) => {
    let socket: net.Socket;
    let settled = false;
    const settle = (reachable: boolean): void => {
      // A real socket can report more than one of these — a refused connect
      // fires `error` and then `close`, a timed-out one fires `timeout` and
      // then `close` — so the cleanup runs exactly once.
      if (settled) return;
      settled = true;
      socket.removeAllListeners();
      socket.destroy();
      resolve(reachable);
    };
    try {
      socket = net.connect({ host: normalizeHostname(proxy.hostname), port });
    } catch {
      // A host or port the runtime rejects outright is not a usable proxy.
      resolve(false);
      return;
    }
    // The probe waits for at most a second; it must not be what keeps the
    // process alive in that second.
    socket.unref();
    socket.setTimeout(PROXY_PROBE_TIMEOUT_MS, () => settle(false));
    socket.once("connect", () => settle(true));
    socket.once("error", () => settle(false));
    socket.once("close", () => settle(false));
  });
}

let _safeDispatcher: unknown = null;

/**
 * Addresses the configured proxy actually answered with at construction time.
 * Only these are exempt from the private-range rule, and only when the dial
 * hostname is itself a configured proxy host.
 */
let _trustedProxyAddresses: ReadonlySet<string> = new Set<string>();

/**
 * Lazily initializes the safe undici dispatcher with an embedded lookup guard at dial time,
 * ensuring no connection can be established to private/reserved targets while avoiding
 * eager module evaluation conflicts in test runners.
 *
 * Egress is routed through the environment's proxy (`EnvHttpProxyAgent`) only
 * when that proxy is configured *and* answering; see `probeProxy` for why a
 * configured-but-dead value must not be adopted blindly. Falling back to a
 * direct connection means the proxy no longer filters or audits that traffic —
 * a deliberate trade, because the alternative (adopting a dead proxy) broke
 * every guarded route, and the dial-time guard keeps applying either way.
 */
export async function getSafeDispatcher(): Promise<unknown> {
  if (!_safeDispatcher) {
    try {
      const undici = await import("undici");
      const Agent = undici.Agent;
      const proxyHosts = configuredProxyHosts();
      const { http, https } = configuredProxyUrls();

      // Adopt the environment's proxy configuration only as a whole. undici's
      // `EnvHttpProxyAgent` re-reads the environment for every entry it is not
      // given explicitly (`httpsProxy ?? process.env.https_proxy ?? …`), so a
      // half-adopted configuration cannot be expressed through it at all — and
      // a half-answering proxy setup is broken anyway. Any dead entry therefore
      // means "no proxy", named out loud once. The decision holds for the
      // lifetime of the process (the dispatcher is built once), so a proxy that
      // dies later is re-evaluated only at the next start — deliberately:
      // per-request probing would put the probe on the hot path.
      const [httpAnswers, httpsAnswers] = await Promise.all([
        http ? probeProxy(http) : Promise.resolve(false),
        https ? probeProxy(https) : Promise.resolve(false),
      ]);
      const deadEntries = [
        http && !httpAnswers ? http : null,
        https && !httpsAnswers ? https : null,
      ].filter((entry): entry is URL => entry !== null);
      const useProxy =
        (http !== null || https !== null) && deadEntries.length === 0;
      for (const entry of deadEntries) {
        console.warn(
          `[urlValidator] configured egress proxy ${entry.host} is not reachable; using a direct connection`,
        );
      }

      // Pin the proxy's own addresses once, now. Exempting the proxy hostname
      // wholesale would let a DNS rebind of that name aim the exemption at an
      // internal address, so the exemption is scoped to the addresses the
      // operator-configured proxy actually answers with. Any later resolution
      // of the same name to another address falls back under the normal
      // private-range rule instead of being waved through.
      const trustedProxyAddresses = new Set<string>();
      for (const proxyHost of proxyHosts) {
        try {
          // `all: true` yields an address array; the cast also tolerates a
          // test double that answers with the single-record shape.
          const resolved = (await dns.promises.lookup(proxyHost, {
            all: true,
          })) as unknown as Array<{ address?: string } | string>;
          for (const record of resolved ?? []) {
            const address =
              typeof record === "string" ? record : record?.address;
            if (address) trustedProxyAddresses.add(address);
          }
        } catch {
          // An unresolvable proxy host earns no exemption. The guard stays
          // strict, which fails the dial closed instead of opening a hole.
        }
      }
      // The exemption only has a purpose while the proxy is in use; on the
      // direct path the guard stays maximally strict and the set stays empty.
      _trustedProxyAddresses = useProxy
        ? trustedProxyAddresses
        : new Set<string>();
      // Optional exports are read defensively: a partial test double of
      // `undici` (as in urlValidator.test.ts) has no such binding, and an
      // ESM-style namespace throws on an unknown named read. That must not
      // abort dispatcher construction.
      const optionalExport = (name: string): unknown => {
        try {
          return (undici as Record<string, unknown>)[name];
        } catch {
          return undefined;
        }
      };

      const lookup = (
        hostname: string,
        options: { all?: boolean } | undefined,
        callback: (
          err: Error | null,
          addresses: string | Array<{ address: string; family: number }>,
          family?: number,
        ) => void,
      ) => {
        // undici calls this with `{ all: true }` and forwards the callback
        // straight to Node's dns.lookup, so it must use the `all: true` shape:
        // the older `(err, address, family)` shape leaves undici reading an
        // undefined address and fails every dial with "fetch failed". The flag
        // is read back from the options rather than assumed, so the guard holds
        // under either call convention.
        const isProxyHost = proxyHosts.has(normalizeHostname(hostname));
        dns.lookup(hostname, { ...(options ?? {}), all: true }, (err, addresses) => {
          if (err) return callback(err, "");
          if (!addresses || addresses.length === 0) {
            return callback(new Error("ENOTFOUND"), "");
          }
          for (const addr of addresses) {
            // Exempt only the address(es) the proxy host was pinned to; a
            // rebind to any other address is treated as a normal target.
            if (isProxyHost && _trustedProxyAddresses.has(addr.address)) {
              continue;
            }
            if (isPrivateOrReservedHost(addr.address)) {
              return callback(
                new Error("Blocked target address (SSRF guard)"),
                "",
              );
            }
          }
          if (options?.all) {
            callback(null, addresses);
          } else {
            callback(null, addresses[0].address, addresses[0].family);
          }
        });
      };

      const EnvHttpProxyAgent = optionalExport("EnvHttpProxyAgent");
      if (useProxy && typeof EnvHttpProxyAgent === "function") {
        // NB: on this path the target hostname is resolved by the proxy, so the
        // pre-flight check is the only SSRF decision made about the target
        // itself; the dial-time guard still covers the hop to the proxy.
        _safeDispatcher = new (EnvHttpProxyAgent as new (opts: unknown) => unknown)({
          connect: { lookup },
          ...(http ? { httpProxy: http.href } : {}),
          ...(https ? { httpsProxy: https.href } : {}),
        });
      } else {
        _safeDispatcher = new Agent({ connect: { lookup } });
      }
    } catch {
      _safeDispatcher = null;
    }
  }
  return _safeDispatcher;
}

/**
 * Dial-failure codes that may be named in an error message. A closed list on
 * purpose: the body of a 500 from an AI route is visible to whoever sent the
 * request, so only codes that say "your upstream could not be reached" — and
 * nothing else — are allowed through. Anything else, including an arbitrary
 * `cause.name`, passes through unchanged.
 */
const NAMED_DIAL_FAILURES = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "ECONNABORTED",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "ENOTFOUND",
  "EAI_AGAIN",
  "EAI_FAIL",
  "ETIMEDOUT",
  "EPIPE",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_SOCKET",
]);

/**
 * undici reports every dial failure as a bare `TypeError("fetch failed")` and
 * keeps the real reason in `cause`. Its *code* — never an address — is the one
 * piece of information that makes a 500 from an AI route diagnosable from
 * outside the server, so a known code is appended to the message. Errors
 * without one, and non-`Error` values, are passed through untouched.
 */
function describeFetchFailure(error: unknown): unknown {
  if (!(error instanceof Error)) return error;
  const cause = (error as { cause?: { code?: unknown } }).cause;
  const code =
    typeof cause?.code === "string" && NAMED_DIAL_FAILURES.has(cause.code)
      ? cause.code
      : null;
  if (!code) return error;
  return new Error(`${error.message} [${code}]`, { cause: error });
}

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

  const dispatcher = await getSafeDispatcher();
  if (!dispatcher) {
    // Fail closed: without the dial-time DNS guard a validated URL can still be
    // re-resolved to an internal address (DNS rebinding/TOCTOU) before connect.
    throw new Error("SSRF guard unavailable");
  }
  try {
    // @ts-expect-error Node fetch supports dispatcher option via undici
    return await fetch(url, { ...init, dispatcher });
  } catch (error) {
    throw describeFetchFailure(error);
  }
}
