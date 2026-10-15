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
 * Proxy hostnames from the environment, exempt from the private-range rule.
 *
 * A proxy is operator-configured infrastructure rather than a target chosen by
 * the caller, and it legitimately sits on a private address
 * (`http://proxy.internal:3128`), so its own resolved addresses are exempt —
 * pinned by `getTrustedProxyAddresses`, never the hostname alone. Every target
 * URL still passes `isUrlAllowedAsync` and the guard; the exemption exists only
 * on the proxy path.
 */
function configuredProxyHosts(): Set<string> {
  const hosts = new Set<string>();
  const { http, https } = configuredProxyUrls();
  for (const url of [http, https]) {
    if (url) hosts.add(normalizeHostname(url.hostname));
  }
  return hosts;
}

/** One dial-time lookup, bound to the addresses it may see as private. */
type GuardedLookup = (
  hostname: string,
  options: { all?: boolean } | undefined,
  callback: (
    err: Error | null,
    addresses: string | Array<{ address: string; family: number }>,
    family?: number,
  ) => void,
) => void;

/** The two ways out of this process. Both carry the dial-time guard. */
type EgressPath = "proxy" | "direct";

/**
 * Addresses the configured proxy answers with, pinned once per process. Only
 * these are exempt from the private-range rule, and only on the proxy path.
 */
let _trustedProxyAddresses: ReadonlySet<string> | null = null;

async function getTrustedProxyAddresses(): Promise<ReadonlySet<string>> {
  if (_trustedProxyAddresses) return _trustedProxyAddresses;
  const trusted = new Set<string>();
  for (const proxyHost of configuredProxyHosts()) {
    try {
      // `all: true` yields an address array; the cast also tolerates a test
      // double that answers with the single-record shape.
      const resolved = (await dns.promises.lookup(proxyHost, {
        all: true,
      })) as unknown as Array<{ address?: string } | string>;
      for (const record of resolved ?? []) {
        const address = typeof record === "string" ? record : record?.address;
        if (address) trusted.add(address);
      }
    } catch {
      // An unresolvable proxy host earns no exemption. The guard stays strict,
      // which fails the dial closed instead of opening a hole.
    }
  }
  _trustedProxyAddresses = trusted;
  return trusted;
}

/**
 * The dial-time guard, parameterised by which addresses are allowed to be
 * private: the proxy path exempts the operator-configured proxy's own pinned
 * addresses, the direct path exempts nothing at all.
 */
function makeGuardedLookup(
  proxyHosts: ReadonlySet<string>,
  exempt: ReadonlySet<string>,
): GuardedLookup {
  return (hostname, options, callback) => {
    // undici calls this with `{ all: true }` and forwards the callback straight
    // to Node's dns.lookup, so it must use the `all: true` shape: the older
    // `(err, address, family)` shape leaves undici reading an undefined address
    // and fails every dial with "fetch failed". The flag is read back from the
    // options rather than assumed, so the guard holds under either call
    // convention.
    const isProxyHost = proxyHosts.has(normalizeHostname(hostname));
    dns.lookup(hostname, { ...(options ?? {}), all: true }, (err, addresses) => {
      if (err) return callback(err, "");
      if (!addresses || addresses.length === 0) {
        return callback(new Error("ENOTFOUND"), "");
      }
      for (const addr of addresses) {
        // Exempt only the address(es) the proxy host was pinned to; a rebind to
        // any other address is treated as a normal target.
        if (isProxyHost && exempt.has(addr.address)) {
          continue;
        }
        if (isPrivateOrReservedHost(addr.address)) {
          return callback(new Error("Blocked target address (SSRF guard)"), "");
        }
      }
      if (options?.all) {
        callback(null, addresses);
      } else {
        callback(null, addresses[0].address, addresses[0].family);
      }
    });
  };
}

/** Whether the environment asks this process to egress through a proxy. */
function isProxyConfigured(): boolean {
  const { http, https } = configuredProxyUrls();
  return http !== null || https !== null;
}

// `undefined` means "not built yet", `null` means "not available".
let _dispatchers: Partial<Record<EgressPath, unknown>> | null = null;
let _preferProxyPath: boolean | null = null;

function prefersProxyPath(): boolean {
  _preferProxyPath ??= isProxyConfigured();
  return _preferProxyPath;
}

/**
 * Builds the guarded dispatcher for one egress path, at most once per process.
 * The proxy path only exists when a proxy is configured and `undici` exports
 * the agent for it; the direct path always exists.
 */
async function getDispatcherFor(path: EgressPath): Promise<unknown> {
  if (!_dispatchers) {
    _dispatchers = {};
  }
  const cached = _dispatchers[path];
  if (cached !== undefined) return cached;

  try {
    const undici = await import("undici");
    if (path === "direct") {
      const dispatcher = new undici.Agent({
        connect: {
          lookup: makeGuardedLookup(new Set<string>(), new Set<string>()),
        },
      });
      _dispatchers.direct = dispatcher;
      return dispatcher;
    }

    // Optional exports are read defensively: a partial test double of `undici`
    // (as in urlValidator.test.ts) has no such binding, and an ESM-style
    // namespace throws on an unknown named read.
    let EnvHttpProxyAgent: unknown;
    try {
      EnvHttpProxyAgent = (undici as Record<string, unknown>).EnvHttpProxyAgent;
    } catch {
      EnvHttpProxyAgent = undefined;
    }
    if (!isProxyConfigured() || typeof EnvHttpProxyAgent !== "function") {
      _dispatchers.proxy = null;
      return null;
    }

    const { http, https } = configuredProxyUrls();
    const lookup = makeGuardedLookup(
      configuredProxyHosts(),
      await getTrustedProxyAddresses(),
    );
    // NB: on this path the target hostname is resolved by the proxy, so the
    // pre-flight check is the only SSRF decision made about the target itself;
    // the dial-time guard still covers the hop to the proxy.
    const dispatcher = new (EnvHttpProxyAgent as new (opts: unknown) => unknown)({
      connect: { lookup },
      ...(http ? { httpProxy: http.href } : {}),
      ...(https ? { httpsProxy: https.href } : {}),
    });
    _dispatchers.proxy = dispatcher;
    return dispatcher;
  } catch {
    _dispatchers[path] = null;
    return null;
  }
}

async function resolveEgress(): Promise<{
  dispatcher: unknown;
  path: EgressPath;
} | null> {
  if (prefersProxyPath()) {
    const proxy = await getDispatcherFor("proxy");
    if (proxy) return { dispatcher: proxy, path: "proxy" };
  }
  const direct = await getDispatcherFor("direct");
  return direct ? { dispatcher: direct, path: "direct" } : null;
}

/**
 * Lazily initializes the safe undici dispatcher with an embedded lookup guard at
 * dial time, ensuring no connection can be established to private/reserved
 * targets while avoiding eager module evaluation conflicts in test runners.
 *
 * The environment's proxy is used when it is configured, but never
 * unconditionally: `safeFetch` falls back to the direct, equally guarded path
 * once and remembers which path worked. A proxy variable that is set but
 * unusable — nothing listening, a port that answers but refuses `CONNECT`, a
 * proxy that expects credentials — therefore costs one failed attempt per
 * process instead of breaking every guarded route.
 */
export async function getSafeDispatcher(): Promise<unknown> {
  return (await resolveEgress())?.dispatcher ?? null;
}

/** The first `code` in an error's cause chain, if it carries one. */
function causeCode(error: unknown): string | null {
  let current: unknown = error;
  for (let depth = 0; current instanceof Error && depth < 5; depth += 1) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === "string" && code.length > 0) return code;
    current = (current as { cause?: unknown }).cause;
  }
  return null;
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
  const code = causeCode(error);
  if (!code || !NAMED_DIAL_FAILURES.has(code)) return error;
  return new Error(`${error.message} [${code}]`, { cause: error });
}

/**
 * Whether a failed attempt may simply be repeated. A body that is a stream
 * cannot be sent twice, and an aborted request is a decision rather than a
 * failure.
 */
function isReplayable(init: RequestInit | undefined): boolean {
  if (init?.signal?.aborted) return false;
  const body = init?.body;
  if (body === undefined || body === null) return true;
  if (typeof body === "string") return true;
  if (body instanceof URLSearchParams) return true;
  if (body instanceof ArrayBuffer) return true;
  return ArrayBuffer.isView(body);
}

/**
 * Whether the guard itself refused the dial. Such a refusal is never retried:
 * the proxy path does not resolve the target locally, so repeating the request
 * there would tunnel past the decision the guard just made.
 */
function isGuardRefusal(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; current instanceof Error && depth < 5; depth += 1) {
    if (current.message.includes("SSRF guard")) return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

let _egressSwitchLogged = false;

/**
 * Safe fetch wrapper that enforces both pre-flight URL validation and
 * dial-time DNS verification against private/reserved/internal IP ranges, and
 * that recovers once when the configured egress path turns out to be unusable.
 *
 * The recovery is deliberately narrow: one retry, only for a body that can be
 * sent twice, never after the guard itself refused the dial, and only between
 * two dispatchers that carry the same dial-time guard. The path that worked is
 * remembered, so the cost is one failed attempt per process — BUG-0690.
 */
export async function safeFetch(url: string | URL, init?: RequestInit): Promise<Response> {
  const urlStr = typeof url === "string" ? url : url.toString();
  const allowed = await isUrlAllowedAsync(urlStr);
  if (!allowed) {
    throw new Error("Prohibited or invalid URL");
  }

  const egress = await resolveEgress();
  if (!egress) {
    // Fail closed: without the dial-time DNS guard a validated URL can still be
    // re-resolved to an internal address (DNS rebinding/TOCTOU) before connect.
    throw new Error("SSRF guard unavailable");
  }

  try {
    // @ts-expect-error Node fetch supports dispatcher option via undici
    return await fetch(url, { ...init, dispatcher: egress.dispatcher });
  } catch (error) {
    if (isGuardRefusal(error) || !isReplayable(init)) {
      throw describeFetchFailure(error);
    }

    const other: EgressPath = egress.path === "proxy" ? "direct" : "proxy";
    const alternate = await getDispatcherFor(other);
    if (!alternate) throw describeFetchFailure(error);

    if (!_egressSwitchLogged) {
      _egressSwitchLogged = true;
      console.warn(
        `[urlValidator] egress via the ${egress.path} path failed (${causeCode(error) ?? "no code"}); using the ${other} path`,
      );
    }
    _preferProxyPath = other === "proxy";

    try {
      // @ts-expect-error Node fetch supports dispatcher option via undici
      return await fetch(url, { ...init, dispatcher: alternate });
    } catch (secondError) {
      throw describeFetchFailure(secondError);
    }
  }
}
