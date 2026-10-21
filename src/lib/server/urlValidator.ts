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
 * Marker carried by every dial refusal from the guard. The producer and the
 * matcher must share this constant: a drift between them would silently disable
 * the rule that a refusal is never retried.
 */
const GUARD_REFUSAL_MARKER = "SSRF guard";

/**
 * Message every "there is no guarded dispatcher to send with" failure carries,
 * so a caller (or a test) can recognise it without matching prose. The two
 * sites that raise it differ only in what was missing.
 */
const GUARD_UNAVAILABLE_MARKER = "SSRF guard unavailable";

/** A refusal from the dial-time guard, tagged so it survives being rewrapped. */
function guardRefusal(): Error {
  return Object.assign(
    new Error(`Blocked target address (${GUARD_REFUSAL_MARKER})`),
    { code: "ERR_SSRF_GUARD" },
  );
}

/** How deep a `cause` chain is followed. */
const MAX_CAUSE_DEPTH = 5;

/** The bounded `cause` chain of an error, outermost first. */
function* causeChain(error: unknown): Generator<Error> {
  let current: unknown = error;
  for (
    let depth = 0;
    current instanceof Error && depth < MAX_CAUSE_DEPTH;
    depth += 1
  ) {
    yield current;
    current = (current as { cause?: unknown }).cause;
  }
}

/** The messages of a `cause` chain, joined, for matching a known shape. */
function causeText(error: unknown): string {
  return Array.from(causeChain(error), (err) => err.message).join(" | ");
}

/** The first `code` in an error's cause chain — for logs, where any code helps. */
function causeCode(error: unknown): string | null {
  for (const err of causeChain(error)) {
    const code = (err as { code?: unknown }).code;
    if (typeof code === "string" && code.length > 0) return code;
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
 * The first code from `NAMED_DIAL_FAILURES` in the chain — the only one a caller
 * is told. An unlisted code nearer the outside must not hide a listed one.
 */
function namedDialCode(error: unknown): string | null {
  for (const err of causeChain(error)) {
    const code = (err as { code?: unknown }).code;
    if (typeof code === "string" && NAMED_DIAL_FAILURES.has(code)) return code;
  }
  return null;
}

/**
 * Dial failures that prove the request never left this process: nothing was
 * written to the origin, so repeating it cannot repeat a side effect.
 */
const PRE_CONNECT_FAILURE_CODES = new Set([
  "ECONNREFUSED",
  "ENOTFOUND",
  "EAI_AGAIN",
  "EAI_FAIL",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "UND_ERR_CONNECT_TIMEOUT",
]);

/** Methods whose repetition cannot cause a second effect upstream. */
const IDEMPOTENT_METHODS = new Set(["GET", "HEAD", "OPTIONS", "TRACE"]);

/**
 * Whether a failed attempt may simply be repeated.
 *
 * Three things stop a repeat: a body that cannot be sent twice (a stream), a
 * request the caller already aborted, and — for anything that is not idempotent
 * — a failure that does not prove the request never reached the upstream. A
 * reset or a hang-up can happen after the bytes left this process, and a
 * non-idempotent request repeated there would be delivered twice.
 */
function isReplayable(init: RequestInit | undefined, error: unknown): boolean {
  if (init?.signal?.aborted) return false;
  const body = init?.body;
  const bodyCanRepeat =
    body === undefined ||
    body === null ||
    typeof body === "string" ||
    body instanceof URLSearchParams ||
    body instanceof ArrayBuffer ||
    ArrayBuffer.isView(body);
  if (!bodyCanRepeat) return false;

  const method = (init?.method ?? "GET").toUpperCase();
  if (IDEMPOTENT_METHODS.has(method)) return true;

  const code = causeCode(error);
  if (code !== null && PRE_CONNECT_FAILURE_CODES.has(code)) return true;
  // A refused CONNECT tunnel: undici reports the proxy's answer as an aborted
  // request, and nothing was forwarded to the origin. `UND_ERR_ABORTED` alone
  // also covers a genuine mid-flight abort, so the message is required too.
  return (
    code === "UND_ERR_ABORTED" && /HTTP Tunneling/i.test(causeText(error))
  );
}

/**
 * Whether the guard itself refused the dial. Such a refusal is never retried on
 * any path: through the proxy the target is resolved by the proxy, so a repeat
 * there would tunnel past the decision the guard just made — and when the guard
 * refused the *proxy hop*, falling back to a direct connection would silently
 * bypass the operator's proxy instead of saying so. The message is checked as
 * well as the tag, so a rewrapping that loses the property still counts as a
 * refusal; the cost of that belt is only a skipped retry.
 */
function isGuardRefusal(error: unknown): boolean {
  for (const err of causeChain(error)) {
    if (
      (err as { code?: unknown }).code === "ERR_SSRF_GUARD" ||
      err.message.includes(GUARD_REFUSAL_MARKER)
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Whether the failure is the *runtime* refusing our dispatcher rather than the
 * network refusing the target.
 *
 * Node bundles its own copy of undici, and the runtime's `fetch` cannot drive a
 * dispatcher built by a different, newer standalone `undici`:
 *
 * | runtime | bundled undici | `fetch(url, { dispatcher })` |
 * |---|---|---|
 * | Node 22 | 6.28 | `fetch failed` (`UND_ERR_INVALID_ARG`) at once |
 * | Node 24 | 7.29 | `fetch failed` (`UND_ERR_INVALID_ARG`) at once |
 * | Node 26 | 8.11 | works |
 *
 * The throw is the package's own handler validation (`assertRequestHandler`),
 * reached from the runtime's client through our dispatcher, and it happens
 * before a socket is opened. The shape is matched narrowly — code *and* message —
 * rather than accepting every `UND_ERR_INVALID_ARG`: undici raises that same
 * code for a proxy answering `407`, and *that* failure did reach the network
 * (BUG-0691).
 */
const DISPATCHER_REJECTION = /invalid on[A-Za-z]+ method/i;

function isDispatcherIncompatibility(error: unknown): boolean {
  for (const err of causeChain(error)) {
    if ((err as { code?: unknown }).code !== "UND_ERR_INVALID_ARG") continue;
    if (DISPATCHER_REJECTION.test(err.message)) return true;
  }
  return false;
}

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
      // An unresolvable proxy host earns no exemption; `buildProxyDispatcher`
      // turns a set that stays empty into "this path is unusable".
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
          return callback(guardRefusal(), "");
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

/** Something worth telling the operator once, not once per request. */
const _warnedMessages = new Set<string>();

function warnOnce(message: string): void {
  if (_warnedMessages.has(message)) return;
  _warnedMessages.add(message);
  console.warn(message);
}

/** The direct path: a plain guarded Agent, no exemption of any kind. */
async function buildDirectDispatcher(): Promise<unknown> {
  const undici = await loadUndiciPackage();
  return new undici.Agent({
    connect: {
      lookup: makeGuardedLookup(new Set<string>(), new Set<string>()),
    },
  });
}

/**
 * The proxy path: undici's environment proxy agent, with the proxy's own pinned
 * addresses exempt.
 *
 * Returns `null` when the path cannot be used at all — no proxy configured, no
 * `EnvHttpProxyAgent` in this runtime, or a proxy whose own address does not
 * resolve (without the exemption every dial to it is a guard refusal, so the
 * path could never carry a request).
 */
async function buildProxyDispatcher(): Promise<unknown | null> {
  if (!isProxyConfigured()) return null;
  const undici = await loadUndiciPackage();

  // Optional exports are read defensively: a partial test double of `undici`
  // (as in urlValidator.test.ts) has no such binding, and an ESM-style
  // namespace throws on an unknown named read.
  let EnvHttpProxyAgent: unknown;
  try {
    EnvHttpProxyAgent = (undici as Record<string, unknown>).EnvHttpProxyAgent;
  } catch {
    EnvHttpProxyAgent = undefined;
  }
  if (typeof EnvHttpProxyAgent !== "function") {
    warnOnce(
      "[urlValidator] this runtime has no EnvHttpProxyAgent; using a direct connection",
    );
    return null;
  }

  const trusted = await getTrustedProxyAddresses();
  if (trusted.size === 0) {
    warnOnce(
      "[urlValidator] the configured egress proxy could not be resolved; using a direct connection",
    );
    return null;
  }

  const { http, https } = configuredProxyUrls();
  // NB: on this path the target hostname is resolved by the proxy, so the
  // pre-flight check is the only SSRF decision made about the target itself;
  // the dial-time guard still covers the hop to the proxy.
  return new (EnvHttpProxyAgent as new (opts: unknown) => unknown)({
    connect: { lookup: makeGuardedLookup(configuredProxyHosts(), trusted) },
    ...(http ? { httpProxy: http.href } : {}),
    ...(https ? { httpsProxy: https.href } : {}),
  });
}

// Egress state, decided once per process. `_dispatcherBuilds[path]` is absent
// until that path is built, `null` once it is known to be unavailable; the
// *promise* is cached, not its result, so two requests arriving together share
// one build instead of constructing two dispatchers and leaking one.
const _dispatcherBuilds: Partial<Record<EgressPath, Promise<unknown | null>>> = {};
// The path the next first attempt uses; `null` until the first request (or a
// successful fallback) decides it.
let _preferProxyPath: boolean | null = null;

function prefersProxyPath(): boolean {
  _preferProxyPath ??= isProxyConfigured();
  return _preferProxyPath;
}

function getDispatcherFor(path: EgressPath): Promise<unknown | null> {
  return (_dispatcherBuilds[path] ??= (async () => {
    try {
      return path === "direct"
        ? await buildDirectDispatcher()
        : await buildProxyDispatcher();
    } catch (error) {
      if (path === "proxy") {
        // Otherwise a proxy that cannot even be constructed disappears from the
        // log while every request silently bypasses it.
        warnOnce(
          `[urlValidator] could not build the egress proxy dispatcher (${causeCode(error) ?? "no code"}); using a direct connection`,
        );
      }
      return null;
    }
  })());
}

/**
 * The path this process starts the next request on, and the dispatcher for it.
 * `null` only when even the direct path could not be built, which is the case
 * `safeFetch` fails closed on.
 */
/** `undici`, imported once instead of on every request. */
let _undiciPackage: Promise<typeof import("undici")> | null = null;

function loadUndiciPackage(): Promise<typeof import("undici")> {
  return (_undiciPackage ??= import("undici"));
}

/**
 * The package's own `fetch`, the one that can drive a dispatcher of its own
 * generation. Throws — fail closed — when the package exposes none: a request
 * must never leave this module without a guarded dispatcher.
 */
async function loadPackageFetch(): Promise<
  (
    input: string | URL,
    init?: RequestInit & { dispatcher?: unknown },
  ) => Promise<Response>
> {
  const undici = await loadUndiciPackage();
  // Read defensively: a partial test double of `undici` has no such binding,
  // and an ESM-style namespace (or vitest's module mock) throws on an unknown
  // named read instead of answering `undefined`.
  let packageFetch: unknown;
  try {
    packageFetch = (undici as { fetch?: unknown }).fetch;
  } catch {
    packageFetch = undefined;
  }
  if (typeof packageFetch !== "function") {
    throw new Error(
      `${GUARD_UNAVAILABLE_MARKER}: undici exports no fetch to drive the guarded dispatcher`,
    );
  }
  return packageFetch as (
    input: string | URL,
    init?: RequestInit & { dispatcher?: unknown },
  ) => Promise<Response>;
}

/**
 * Set once the runtime has shown it cannot drive our dispatcher. From then on a
 * request goes straight to `undici`'s own fetch instead of paying a failed
 * attempt first.
 */
let _runtimeFetchRejectsDispatcher = false;

/**
 * Performs one guarded request.
 *
 * The runtime's own `fetch` goes first, so a runtime that *can* drive the
 * dispatcher behaves exactly as it did before this fallback existed. Only when
 * the runtime proves unable to drive it does the package's own `fetch` take
 * over — permanently for this process. Whichever function carries the request
 * gets the *same* dispatcher instance, so the dial-time guard is identical on
 * both.
 *
 * Repeating the request in the takeover is safe because the shape it reacts to
 * is a local validation throw that happens before a socket is opened (BUG-0691:
 * zero connections), and no other failure reaches this branch. The outer egress
 * fallback keeps its own replay gate.
 */
async function performGuardedFetch(
  url: string | URL,
  init: RequestInit | undefined,
  dispatcher: unknown,
): Promise<Response> {
  if (!_runtimeFetchRejectsDispatcher) {
    try {
      // @ts-expect-error Node fetch supports dispatcher option via undici
      return await fetch(url, { ...init, dispatcher });
    } catch (error) {
      if (!isDispatcherIncompatibility(error)) throw error;
      // Resolved before the flag is set: a package without a `fetch` must not
      // leave the process permanently skipping the runtime's own fetch.
      const packageFetch = await loadPackageFetch();
      _runtimeFetchRejectsDispatcher = true;
      warnOnce(
        `[urlValidator] this runtime's fetch cannot drive the guarded dispatcher (${causeCode(error) ?? "no code"}); using undici's own fetch`,
      );
      return packageFetch(url, { ...init, dispatcher });
    }
  }

  const packageFetch = await loadPackageFetch();
  return packageFetch(url, { ...init, dispatcher });
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
 * The guarded dispatcher for the path a request would start on.
 *
 * Exported as a test seam (`safeFetch` is the supported entry point and the only
 * caller in production code): it deliberately reports the *starting* path
 * without the fallback that `safeFetch` performs.
 */
export async function getSafeDispatcher(): Promise<unknown> {
  return (await resolveEgress())?.dispatcher ?? null;
}

/**
 * undici reports every dial failure as a bare `TypeError("fetch failed")` and
 * keeps the real reason in `cause`. A known dial code — never an address — is
 * the one piece of information that makes a 500 from an AI route diagnosable
 * from outside the server, so it is appended to the message. Errors without one,
 * and non-`Error` values, are passed through untouched.
 */
function describeFetchFailure(error: unknown): unknown {
  if (!(error instanceof Error)) return error;
  const code = namedDialCode(error);
  if (!code) return error;
  return new Error(`${error.message} [${code}]`, { cause: error });
}

/**
 * Maximum number of HTTP redirects `safeFetch` will follow. Every hop is
 * validated like a fresh request, so the cap only bounds the work an attacker
 * can spend on redirect chains, not the trust decision.
 */
const MAX_REDIRECT_HOPS = 5;

/** Statuses that carry a `Location` worth following. */
function isRedirectStatus(status: number): boolean {
  return (
    status === 301 || status === 302 || status === 303 || status === 307 || status === 308
  );
}

/**
 * Whether a request body can be sent a second time.
 *
 * Fetch bodies may be streams, which are consumed by the first request. A
 * redirect that has to preserve the method (307/308) can only be followed when
 * the body is a concrete value.
 */
function canReplayBody(body: RequestInit["body"]): boolean {
  if (body === undefined || body === null) return true;
  if (typeof body === "string") return true;
  if (body instanceof URLSearchParams) return true;
  if (body instanceof ArrayBuffer) return true;
  if (ArrayBuffer.isView(body)) return true;
  if (typeof Blob !== "undefined" && body instanceof Blob) return true;
  if (typeof FormData !== "undefined" && body instanceof FormData) return true;
  return false;
}

/**
 * Headers that authenticate the caller rather than describe the request. A
 * cross-origin redirect must not carry them to the new host: an attacker who
 * controls a public URL could otherwise redirect to their own server and
 * collect the provider key.
 */
const CREDENTIAL_HEADER_NAMES = [
  "authorization",
  "proxy-authorization",
  "cookie",
  "x-api-key",
  "x-goog-api-key",
];

function stripCredentialHeaders(
  headers: HeadersInit | undefined,
): HeadersInit | undefined {
  if (headers === undefined) return undefined;
  const next = new Headers(headers);
  for (const name of CREDENTIAL_HEADER_NAMES) next.delete(name);
  return next;
}

/**
 * One guarded request without redirect handling. `safeFetch` owns the redirect
 * loop so every hop passes through this function — and therefore through
 * `isUrlAllowedAsync` and the dial-time guard.
 */
async function safeFetchOnce(
  url: string | URL,
  init: RequestInit | undefined,
): Promise<Response> {
  const urlStr = typeof url === "string" ? url : url.toString();
  const allowed = await isUrlAllowedAsync(urlStr);
  if (!allowed) {
    throw new Error("Prohibited or invalid URL");
  }

  const egress = await resolveEgress();
  if (!egress) {
    // Fail closed: without the dial-time DNS guard a validated URL can still be
    // re-resolved to an internal address (DNS rebinding/TOCTOU) before connect.
    throw new Error(GUARD_UNAVAILABLE_MARKER);
  }

  try {
    return await performGuardedFetch(url, init, egress.dispatcher);
  } catch (error) {
    if (
      egress.path !== "proxy" ||
      isGuardRefusal(error) ||
      !isReplayable(init, error)
    ) {
      throw describeFetchFailure(error);
    }

    const alternate = await getDispatcherFor("direct");
    if (!alternate) throw describeFetchFailure(error);

    warnOnce(
      `[urlValidator] egress via the proxy path failed (${causeCode(error) ?? "no code"}); using a direct connection`,
    );

    try {
      const response = await performGuardedFetch(url, init, alternate);
      // Remember a path only once it has carried a request: a failure on both
      // paths must not move the preference, or every later request would pay two
      // failed dials in the opposite order.
      _preferProxyPath = false;
      return response;
    } catch (secondError) {
      throw describeFetchFailure(secondError);
    }
  }
}

/**
 * Safe fetch wrapper that enforces both pre-flight URL validation and
 * dial-time DNS verification against private/reserved/internal IP ranges, and
 * that recovers once when the configured egress path turns out to be unusable.
 *
 * Redirects are followed here, never by the runtime: every hop is resolved
 * against the previous URL, re-validated by `isUrlAllowedAsync`, and sent
 * through the same dial-time guard as the first request. A redirect into a
 * private address therefore fails exactly like a direct request would. Method
 * rewriting follows the Fetch standard (303 and POST 301/302 become GET;
 * 307/308 keep method and body and are only followed when the body can be sent
 * again). Credential headers are dropped when a redirect leaves the origin, and
 * a chain longer than `MAX_REDIRECT_HOPS` is refused.
 *
 * The egress recovery is deliberately narrow and one-directional: a failed dial
 * on the proxy path is retried once over the direct path, which applies the
 * dial-time guard to the target itself. The reverse is never offered — the
 * proxy resolves the target, so replaying a request there would tunnel it past
 * the guard the direct attempt just applied. The repeat also never happens
 * after a guard refusal, never for a body that cannot be sent twice, and never
 * for a non-idempotent request whose failure does not prove it never left the
 * process. A path that carried a request becomes the one the next request
 * starts on, so an unusable proxy costs one failed attempt per process —
 * BUG-0690.
 *
 * The trade is deliberate: a request that falls back is no longer filtered or
 * audited by the operator's proxy, while the dial-time guard keeps applying on
 * both paths.
 *
 * One further recovery sits underneath both paths: a runtime whose bundled
 * undici is older than the `undici` package cannot drive a dispatcher at all
 * (Node 22/24 answer every request with `UND_ERR_INVALID_ARG`), so the request
 * goes through `undici`'s own fetch instead — see `performGuardedFetch`.
 */
export async function safeFetch(url: string | URL, init?: RequestInit): Promise<Response> {
  let target = typeof url === "string" ? url : url.toString();
  // `manual` makes the loop the only redirect authority. A caller's own
  // `redirect` setting is deliberately overridden: `follow` would let the
  // runtime resolve the next hop without the guard.
  let requestInit: RequestInit = { ...init, redirect: "manual" };

  for (let hop = 0; ; hop++) {
    const response = await safeFetchOnce(target, requestInit);

    if (!isRedirectStatus(response.status)) return response;

    const location = response.headers.get("location");
    if (!location) return response;

    if (hop >= MAX_REDIRECT_HOPS) {
      await response.body?.cancel();
      throw new Error("Too many redirects");
    }

    let nextUrl: string;
    try {
      nextUrl = new URL(location, target).toString();
    } catch {
      await response.body?.cancel();
      throw new Error("Invalid redirect location");
    }

    const method = (requestInit.method ?? "GET").toUpperCase();
    const becomesGet =
      response.status === 303
        ? method !== "GET" && method !== "HEAD"
        : (response.status === 301 || response.status === 302) && method === "POST";

    const nextInit: RequestInit = { ...requestInit };
    if (becomesGet) {
      nextInit.method = "GET";
      nextInit.body = undefined;
    } else if (!canReplayBody(requestInit.body)) {
      await response.body?.cancel();
      throw new Error("Cannot follow a redirect with a non-replayable body");
    }

    // A redirect may leave the origin; the provider key must not go with it.
    if (new URL(nextUrl).origin !== new URL(target).origin) {
      nextInit.headers = stripCredentialHeaders(requestInit.headers);
    }

    await response.body?.cancel();
    target = nextUrl;
    requestInit = nextInit;
  }
}
