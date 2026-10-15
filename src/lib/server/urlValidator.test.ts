// @vitest-environment node
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

import { describe, it, expect, vi, afterEach } from "vitest";
import { isPrivateOrReservedHost, isUrlAllowed } from "./urlValidator";

describe("urlValidator", () => {
  describe("isPrivateOrReservedHost", () => {
    it("should detect localhost and internal domains", () => {
      expect(isPrivateOrReservedHost("localhost")).toBe(true);
      expect(isPrivateOrReservedHost("app.localhost")).toBe(true);
      expect(isPrivateOrReservedHost("my-nas.local")).toBe(true);
      expect(isPrivateOrReservedHost("service.internal")).toBe(true);
      expect(isPrivateOrReservedHost("router.lan")).toBe(true);
      expect(isPrivateOrReservedHost("host.home")).toBe(true);
      expect(isPrivateOrReservedHost("1.0.0.127.in-addr.arpa")).toBe(true);
      expect(isPrivateOrReservedHost("singlewordhost")).toBe(true);
    });

    it("should detect IPv6 loopback and private ranges", () => {
      expect(isPrivateOrReservedHost("::1")).toBe(true);
      expect(isPrivateOrReservedHost("[::1]")).toBe(true);
      expect(isPrivateOrReservedHost("::")).toBe(true);
      expect(isPrivateOrReservedHost("[::]")).toBe(true);
      expect(isPrivateOrReservedHost("fe80::1")).toBe(true);
      expect(isPrivateOrReservedHost("fc00::1")).toBe(true);
      expect(isPrivateOrReservedHost("fd00::1")).toBe(true);
      expect(isPrivateOrReservedHost("::ffff:127.0.0.1")).toBe(true);
    });

    it("should detect IPv4 loopback, private, and reserved ranges", () => {
      // Loopback
      expect(isPrivateOrReservedHost("127.0.0.1")).toBe(true);
      expect(isPrivateOrReservedHost("127.255.255.255")).toBe(true);
      // 0.0.0.0/8
      expect(isPrivateOrReservedHost("0.0.0.0")).toBe(true);
      // RFC1918 Class A
      expect(isPrivateOrReservedHost("10.0.0.1")).toBe(true);
      expect(isPrivateOrReservedHost("10.254.0.1")).toBe(true);
      // RFC1918 Class B
      expect(isPrivateOrReservedHost("172.16.0.1")).toBe(true);
      expect(isPrivateOrReservedHost("172.31.255.255")).toBe(true);
      expect(isPrivateOrReservedHost("172.32.0.1")).toBe(false);
      // RFC1918 Class C
      expect(isPrivateOrReservedHost("192.168.1.1")).toBe(true);
      expect(isPrivateOrReservedHost("192.168.254.254")).toBe(true);
      // Link-Local / AWS IMDS
      expect(isPrivateOrReservedHost("169.254.169.254")).toBe(true);
      // Carrier-grade NAT
      expect(isPrivateOrReservedHost("100.64.0.1")).toBe(true);
      expect(isPrivateOrReservedHost("100.127.255.255")).toBe(true);
      expect(isPrivateOrReservedHost("100.128.0.1")).toBe(false);
      // Multicast / Reserved
      expect(isPrivateOrReservedHost("224.0.0.1")).toBe(true);
      expect(isPrivateOrReservedHost("240.0.0.1")).toBe(true);
      expect(isPrivateOrReservedHost("255.255.255.255")).toBe(true);
      // Invalid octets (>255)
      expect(isPrivateOrReservedHost("999.999.999.999")).toBe(true);
    });

    it("should allow public hostnames", () => {
      expect(isPrivateOrReservedHost("example.com")).toBe(false);
      expect(isPrivateOrReservedHost("bitcoin-kurier.de")).toBe(false);
      expect(isPrivateOrReservedHost("api.binance.com")).toBe(false);
      expect(isPrivateOrReservedHost("8.8.8.8")).toBe(false);
      expect(isPrivateOrReservedHost("1.1.1.1")).toBe(false);
    });
  });

  describe("isUrlAllowed", () => {
    it("should accept valid public HTTP/HTTPS URLs", () => {
      expect(isUrlAllowed("https://example.com")).toBe(true);
      expect(isUrlAllowed("http://example.com/article?id=123")).toBe(true);
      expect(isUrlAllowed("https://bitcoin-kurier.de/feed")).toBe(true);
      expect(isUrlAllowed("https://8.8.8.8/dns-query")).toBe(true);
    });

    it("should reject invalid protocols", () => {
      expect(isUrlAllowed("ftp://example.com/file")).toBe(false);
      expect(isUrlAllowed("file:///etc/passwd")).toBe(false);
      expect(isUrlAllowed("gopher://example.com")).toBe(false);
      expect(isUrlAllowed("javascript:alert(1)")).toBe(false);
      expect(isUrlAllowed("data:text/plain;base64,SGVsbG8=")).toBe(false);
    });

    it("should reject invalid URL strings", () => {
      expect(isUrlAllowed("not-a-valid-url")).toBe(false);
      expect(isUrlAllowed("")).toBe(false);
      expect(isUrlAllowed("http://")).toBe(false);
    });

    it("should reject private and loopback destinations", () => {
      expect(isUrlAllowed("http://localhost:3000")).toBe(false);
      expect(isUrlAllowed("http://127.0.0.1:8080/admin")).toBe(false);
      expect(isUrlAllowed("http://169.254.169.254/latest/meta-data/")).toBe(false);
      expect(isUrlAllowed("http://10.0.0.1/status")).toBe(false);
      expect(isUrlAllowed("http://172.16.1.10/internal")).toBe(false);
      expect(isUrlAllowed("http://192.168.1.1/router")).toBe(false);
      expect(isUrlAllowed("http://[::1]:8080/")).toBe(false);
      expect(isUrlAllowed("http://intranet/dashboard")).toBe(false);
    });

    it("should reject octal-encoded host bypasses (BUG-0271)", () => {
      expect(isPrivateOrReservedHost("0177.0.0.1")).toBe(true);
      expect(isUrlAllowed("http://0177.0.0.1")).toBe(false);
      expect(isUrlAllowed("http://0177.0.0.01")).toBe(false);
      expect(isUrlAllowed("http://017700000001")).toBe(false);
      expect(isUrlAllowed("http://127.000.000.001")).toBe(false);
      expect(isUrlAllowed("http://012.0.0.1")).toBe(false); // 012 octal is 10 (10.0.0.1)
    });

    it("should reject hex-encoded and integer DWORD host bypasses (BUG-0271)", () => {
      expect(isPrivateOrReservedHost("0x7f.0.0.1")).toBe(true);
      expect(isPrivateOrReservedHost("0x7f000001")).toBe(true);
      expect(isUrlAllowed("http://0x7f.0.0.1")).toBe(false);
      expect(isUrlAllowed("http://0x7f000001")).toBe(false);
      expect(isUrlAllowed("http://0x7f.0x0.0x0.0x1")).toBe(false);
      expect(isUrlAllowed("http://2130706433")).toBe(false); // 127.0.0.1 as dword
      expect(isUrlAllowed("http://2852039166")).toBe(false); // 169.254.169.254 as dword
      expect(isUrlAllowed("http://0xa9fea9fe")).toBe(false); // 169.254.169.254 as hex
    });

    it("should reject IPv4-mapped IPv6 literals across all representations (BUG-0271)", () => {
      expect(isPrivateOrReservedHost("::ffff:127.0.0.1")).toBe(true);
      expect(isPrivateOrReservedHost("::ffff:7f00:1")).toBe(true);
      expect(isPrivateOrReservedHost("0:0:0:0:0:ffff:127.0.0.1")).toBe(true);
      expect(isUrlAllowed("http://[::ffff:127.0.0.1]/")).toBe(false);
      expect(isUrlAllowed("http://[::ffff:7f00:1]/")).toBe(false);
      expect(isUrlAllowed("http://[::ffff:169.254.169.254]/")).toBe(false);
      expect(isUrlAllowed("http://[::ffff:a9fe:a9fe]/")).toBe(false);
    });
  });

  describe("isUrlAllowedAsync & DNS rebinding checks (BUG-0271)", () => {
    it("should reject URLs whose DNS resolution returns a private IP", async () => {
      const { isUrlAllowedAsync } = await import("./urlValidator");

      // Localhost / loopback domains
      const resultLocal = await isUrlAllowedAsync("http://localhost:3000");
      expect(resultLocal).toBe(false);

      const resultOctal = await isUrlAllowedAsync("http://0177.0.0.1:80");
      expect(resultOctal).toBe(false);

      const resultMapped = await isUrlAllowedAsync("http://[::ffff:127.0.0.1]/");
      expect(resultMapped).toBe(false);
    });

    it("should allow valid public URLs with public DNS records", async () => {
      const { isUrlAllowedAsync } = await import("./urlValidator");

      const resultPublic = await isUrlAllowedAsync("https://example.com");
      expect(resultPublic).toBe(true);
    });
  });

  describe("safeFetch fail-closed behavior (BUG-0298)", () => {
    it("rejects instead of performing an unguarded fetch when the dispatcher cannot initialize", async () => {
      vi.resetModules();
      vi.doMock("undici", () => {
        throw new Error("simulated undici import failure");
      });
      const fetchSpy = vi.fn();
      vi.stubGlobal("fetch", fetchSpy);
      try {
        const { safeFetch } = await import("./urlValidator");
        // Public IP literal: dns.lookup() resolves it without network access,
        // keeping this test hermetic (no live-DNS dependency).
        await expect(safeFetch("https://93.184.216.34/")).rejects.toThrow("SSRF guard unavailable");
        expect(fetchSpy).not.toHaveBeenCalled();
      } finally {
        vi.unstubAllGlobals();
        vi.doUnmock("undici");
        vi.resetModules();
      }
    });

    /**
     * Runs `safeFetch` against a fetch stub that rejects with `error` and
     * returns the message it threw with. The target is a public IP literal, so
     * `dns.lookup` resolves it without touching the network.
     */
    async function messageOfFailedFetch(error: unknown): Promise<string> {
      vi.resetModules();
      vi.doMock("undici", () => ({
        Agent: class {
          close(): Promise<void> {
            return Promise.resolve();
          }
        },
      }));
      vi.doMock("node:dns", () => {
        const lookupFn = (
          _hostname: string,
          _options: unknown,
          callback: (err: null, addresses: unknown) => void,
        ) => callback(null, [{ address: "93.184.216.34", family: 4 }]);
        const promises = {
          lookup: async () => [{ address: "93.184.216.34", family: 4 }],
        };
        return { default: { lookup: lookupFn, promises }, lookup: lookupFn, promises };
      });
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(error));
      try {
        const { safeFetch } = await import("./urlValidator");
        await safeFetch("https://93.184.216.34/");
        return "";
      } catch (thrown) {
        return thrown instanceof Error ? thrown.message : String(thrown);
      } finally {
        vi.unstubAllGlobals();
        vi.doUnmock("undici");
        vi.doUnmock("node:dns");
        vi.resetModules();
      }
    }

    it("names a known dial failure code and leaves everything else alone", async () => {
      const withCode = (code: unknown): TypeError =>
        new TypeError("fetch failed", {
          cause: Object.assign(new Error("dial failed"), { code }),
        });

      expect(await messageOfFailedFetch(withCode("ECONNREFUSED"))).toBe(
        "fetch failed [ECONNREFUSED]",
      );
      // Only the closed list is named. Everything else — an unrecognised code,
      // a numeric errno, a bare name, no cause at all — stays as it was.
      expect(await messageOfFailedFetch(withCode("SOMETHING_ELSE"))).toBe(
        "fetch failed",
      );
      expect(await messageOfFailedFetch(withCode(111))).toBe("fetch failed");
      expect(
        await messageOfFailedFetch(
          new TypeError("fetch failed", {
            cause: Object.assign(new Error("timed out"), {
              name: "ConnectTimeoutError",
            }),
          }),
        ),
      ).toBe("fetch failed");
      expect(await messageOfFailedFetch(new TypeError("fetch failed"))).toBe(
        "fetch failed",
      );
    });
  });

  describe("getSafeDispatcher undici lookup contract", () => {
    type LookupCallback = (
      err: Error | null,
      addresses: string | Array<{ address: string; family: number }>,
    ) => void;
    type DispatcherLookup = (
      hostname: string,
      options: unknown,
      callback: LookupCallback,
    ) => void;

    async function lookupWith(
      resolved: Array<{ address: string; family: number }>,
    ): Promise<DispatcherLookup> {
      vi.resetModules();
      let lookup: DispatcherLookup | undefined;
      vi.doMock("undici", () => ({
        Agent: class {
          constructor(options: { connect?: { lookup?: DispatcherLookup } }) {
            lookup = options?.connect?.lookup;
          }
          close(): Promise<void> {
            return Promise.resolve();
          }
        },
      }));
      vi.doMock("node:dns", () => {
        const lookupFn = (
          _hostname: string,
          _options: unknown,
          callback: LookupCallback,
        ) => callback(null, resolved);
        const promises = { lookup: async () => resolved };
        return {
          default: { lookup: lookupFn, promises },
          lookup: lookupFn,
          promises,
        };
      });

      const { getSafeDispatcher } = await import("./urlValidator");
      await getSafeDispatcher();
      if (!lookup) throw new Error("lookup was not wired into the Agent");
      return lookup;
    }

    afterEach(() => {
      vi.doUnmock("undici");
      vi.doUnmock("node:dns");
      vi.resetModules();
    });

    it("hands undici the resolved address array, not an (address, family) pair", async () => {
      // Regression: undici 8 forwards the callback to dns.lookup with
      // `all: true`. Returning `(null, address, family)` left undici reading
      // an undefined address and failed every dial with "fetch failed".
      const lookup = await lookupWith([{ address: "93.184.216.34", family: 4 }]);

      const result = await new Promise<{
        err: Error | null;
        addresses?: unknown;
      }>((resolve) => {
        lookup("example.com", { hints: 32, all: true }, (err, addresses) =>
          resolve({ err, addresses }),
        );
      });

      expect(result.err).toBeNull();
      expect(result.addresses).toEqual([
        { address: "93.184.216.34", family: 4 },
      ]);
    });

    it("still fails closed when any resolved address is private", async () => {
      const lookup = await lookupWith([{ address: "127.0.0.1", family: 4 }]);

      const err = await new Promise<Error | null>((resolve) => {
        lookup("rebind.example", { all: true }, (e) => resolve(e));
      });

      expect(err?.message).toContain("SSRF guard");
    });

    it("still fails closed when DNS returns no records", async () => {
      const lookup = await lookupWith([]);

      const err = await new Promise<Error | null>((resolve) => {
        lookup("empty.example", { all: true }, (e) => resolve(e));
      });

      expect(err?.message).toContain("ENOTFOUND");
    });
  });

  describe("getSafeDispatcher follows the environment's egress path", () => {
    // The environment's proxy variables. Saved and restored so the suite never
    // leaks a proxy setting into an unrelated test file.
    const PROXY_ENV_KEYS = [
      "http_proxy",
      "HTTP_PROXY",
      "https_proxy",
      "HTTPS_PROXY",
      "all_proxy",
      "ALL_PROXY",
      "no_proxy",
      "NO_PROXY",
    ] as const;
    const savedEnv: Record<string, string | undefined> = {};

    function clearProxyEnv(): void {
      for (const key of PROXY_ENV_KEYS) {
        savedEnv[key] = process.env[key];
        delete process.env[key];
      }
    }

    function restoreProxyEnv(): void {
      for (const key of PROXY_ENV_KEYS) {
        if (savedEnv[key] === undefined) delete process.env[key];
        else process.env[key] = savedEnv[key];
      }
    }

    type LookupCallback = (
      err: Error | null,
      addresses: string | Array<{ address: string; family: number }>,
    ) => void;
    type DispatcherLookup = (
      hostname: string,
      options: { all?: boolean } | undefined,
      callback: LookupCallback,
    ) => void;

    interface BuiltDispatcher {
      kind: "agent" | "env-proxy";
      opts: { connect?: { lookup?: DispatcherLookup }; httpsProxy?: string; httpProxy?: string };
    }

    // Answers the dial-time `dns.lookup` mock and stays mutable so a test can
    // simulate the proxy hostname rebinding after construction.
    let dialTable: Record<string, Array<{ address: string; family: number }>> = {};

    // Answers the reachability probe of a configured proxy, so a test can
    // simulate a proxy that is configured but not listening.
    let proxyProbeReachable = true;
    let proxyProbeCalls = 0;
    type ProbeOutcome = "connect" | "error" | "timeout" | "close" | "hang";
    const proxyProbeOutcomes: Record<string, ProbeOutcome> = {};

    interface FakeSocket {
      once(event: string, callback: () => void): FakeSocket;
      setTimeout(ms: number, callback: () => void): FakeSocket;
      removeAllListeners(): FakeSocket;
      unref(): FakeSocket;
      destroy(): void;
      fire(event: string): void;
    }

    function makeSocket(): FakeSocket {
      const listeners: Record<string, (() => void) | undefined> = {};
      const socket: FakeSocket = {
        once(event, callback) {
          listeners[event] = callback;
          return socket;
        },
        setTimeout(_ms, callback) {
          listeners.timeout = callback;
          return socket;
        },
        removeAllListeners() {
          for (const key of Object.keys(listeners)) delete listeners[key];
          return socket;
        },
        unref() {
          return socket;
        },
        destroy() {},
        fire(event) {
          listeners[event]?.();
        },
      };
      return socket;
    }

    const isIpLiteral = (host: string): boolean =>
      host.includes(":") || /^\d{1,3}(\.\d{1,3}){3}$/.test(host);

    const ipLiteralRecord = (
      host: string,
    ): Array<{ address: string; family: number }> => [
      { address: host, family: host.includes(":") ? 6 : 4 },
    ];

    const resolveMock = (
      host: string,
    ): Array<{ address: string; family: number }> =>
      dialTable[host] ?? (isIpLiteral(host) ? ipLiteralRecord(host) : []);

    /**
     * Builds the dispatcher with `undici` and `node:dns` replaced by doubles, and
     * returns what was constructed. `dns` answers from a fixed table so the
     * private-range guard can be exercised without a live lookup; an IP literal
     * resolves to itself.
     */
    async function buildDispatcher(
      proxyEnv: Record<string, string>,
    ): Promise<BuiltDispatcher[]> {
      const built: BuiltDispatcher[] = [];
      vi.resetModules();
      for (const [key, value] of Object.entries(proxyEnv)) {
        process.env[key] = value;
      }

      vi.doMock("undici", () => ({
        Agent: class {
          constructor(opts: BuiltDispatcher["opts"]) {
            built.push({ kind: "agent", opts });
          }
          close(): Promise<void> {
            return Promise.resolve();
          }
        },
        EnvHttpProxyAgent: class {
          constructor(opts: BuiltDispatcher["opts"]) {
            built.push({ kind: "env-proxy", opts });
          }
          close(): Promise<void> {
            return Promise.resolve();
          }
        },
      }));
      vi.doMock("node:dns", () => {
        dialTable = {
          "proxy.internal": [{ address: "10.0.0.5", family: 4 }],
          "internal.example": [{ address: "10.0.0.6", family: 4 }],
          "public.example": [{ address: "93.184.216.34", family: 4 }],
        };
        const lookupFn = (
          hostname: string,
          _options: unknown,
          callback: (err: Error | null, addresses: unknown) => void,
        ) => callback(null, resolveMock(hostname));
        const promises = {
          lookup: async (hostname: string) => resolveMock(hostname),
        };
        return {
          default: { lookup: lookupFn, promises },
          lookup: lookupFn,
          promises,
        };
      });

      vi.doMock("node:net", () => ({
        default: {
          connect: (options: { host: string }) => {
            proxyProbeCalls += 1;
            const socket = makeSocket();
            const outcome: ProbeOutcome =
              proxyProbeOutcomes[options.host] ??
              (proxyProbeReachable ? "connect" : "error");
            if (outcome !== "hang") {
              queueMicrotask(() => socket.fire(outcome));
            }
            return socket;
          },
        },
      }));

      const { getSafeDispatcher } = await import("./urlValidator");
      await getSafeDispatcher();
      return built;
    }

    function invoke(
      lookup: DispatcherLookup,
      hostname: string,
    ): Promise<{ err: Error | null; addresses?: unknown }> {
      return new Promise((resolve) => {
        lookup(hostname, { all: true }, (err, addresses) =>
          resolve({ err, addresses }),
        );
      });
    }

    afterEach(() => {
      restoreProxyEnv();
      proxyProbeReachable = true;
      proxyProbeCalls = 0;
      for (const key of Object.keys(proxyProbeOutcomes)) {
        delete proxyProbeOutcomes[key];
      }
      vi.doUnmock("undici");
      vi.doUnmock("node:dns");
      vi.doUnmock("node:net");
      vi.resetModules();
    });

    it("builds an EnvHttpProxyAgent from the environment proxy so egress is not bypassed", async () => {
      clearProxyEnv();
      const built = await buildDispatcher({
        HTTPS_PROXY: "http://proxy.internal:3128",
      });

      expect(built).toHaveLength(1);
      expect(built[0].kind).toBe("env-proxy");
      expect(built[0].opts.httpsProxy).toBe("http://proxy.internal:3128/");
    });

    it("builds a plain Agent when no proxy is configured", async () => {
      clearProxyEnv();
      const built = await buildDispatcher({});

      expect(built).toHaveLength(1);
      expect(built[0].kind).toBe("agent");
    });

    it("falls back to a direct Agent when the configured proxy does not answer", async () => {
      clearProxyEnv();
      proxyProbeReachable = false;
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      try {
        const built = await buildDispatcher({
          HTTPS_PROXY: "http://proxy.internal:3128",
        });

        expect(built).toHaveLength(1);
        expect(built[0].kind).toBe("agent");
        expect(warn).toHaveBeenCalledWith(
          expect.stringContaining("proxy.internal"),
        );
      } finally {
        warn.mockRestore();
      }
    });

    it("probes a configured proxy and stays quiet without one", async () => {
      clearProxyEnv();
      await buildDispatcher({});
      expect(proxyProbeCalls).toBe(0);

      await buildDispatcher({ HTTPS_PROXY: "http://proxy.internal:3128" });
      expect(proxyProbeCalls).toBe(1);
    });

    it.each(["timeout", "close"] as const)(
      "falls back to a direct Agent when the probe socket reports %s",
      async (outcome) => {
        clearProxyEnv();
        proxyProbeOutcomes["proxy.internal"] = outcome;
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        try {
          const built = await buildDispatcher({
            HTTPS_PROXY: "http://proxy.internal:3128",
          });

          expect(built).toHaveLength(1);
          expect(built[0].kind).toBe("agent");
          expect(warn).toHaveBeenCalledWith(
            expect.stringContaining("proxy.internal"),
          );
        } finally {
          warn.mockRestore();
        }
      },
    );

    it("ignores the whole proxy configuration when one entry does not answer", async () => {
      clearProxyEnv();
      proxyProbeOutcomes["dead.internal"] = "error";
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      try {
        const built = await buildDispatcher({
          HTTP_PROXY: "http://alive.internal:3128",
          HTTPS_PROXY: "http://dead.internal:3128",
        });

        // undici re-reads the environment for entries it is not given, so a
        // partially dead configuration is not expressible: it is all or none.
        expect(built).toHaveLength(1);
        expect(built[0].kind).toBe("agent");
        expect(warn).toHaveBeenCalledWith(
          expect.stringContaining("dead.internal"),
        );
      } finally {
        warn.mockRestore();
      }
    });

    it("keeps no proxy exemption once the proxy is out of use", async () => {
      clearProxyEnv();
      proxyProbeReachable = false;
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      try {
        const built = await buildDispatcher({
          HTTPS_PROXY: "http://proxy.internal:3128",
        });
        const lookup = built[0].opts.connect?.lookup;
        if (!lookup) throw new Error("lookup was not wired into the dispatcher");

        // `proxy.internal` resolves to a private address. With the direct path
        // in use nothing is exempt any more, so the strict rule applies.
        const viaDeadProxy = await invoke(lookup, "proxy.internal");
        expect(viaDeadProxy.err?.message).toContain("SSRF guard");
      } finally {
        warn.mockRestore();
      }
    });

    it("exempts the configured proxy host but still blocks a private target", async () => {
      clearProxyEnv();
      const built = await buildDispatcher({
        HTTPS_PROXY: "http://proxy.internal:3128",
      });
      const lookup = built[0].opts.connect?.lookup;
      if (!lookup) throw new Error("lookup was not wired into the dispatcher");

      // The proxy host is operator-configured and legitimately private.
      const viaProxy = await invoke(lookup, "proxy.internal");
      expect(viaProxy.err).toBeNull();

      // A target that resolves to a private address is still refused.
      const privateTarget = await invoke(lookup, "internal.example");
      expect(privateTarget.err?.message).toContain("SSRF guard");

      // A public target passes and keeps the `all: true` array shape.
      const publicTarget = await invoke(lookup, "public.example");
      expect(publicTarget.err).toBeNull();
      expect(publicTarget.addresses).toEqual([
        { address: "93.184.216.34", family: 4 },
      ]);
    });

    it("treats ALL_PROXY as the fallback for both schemes", async () => {
      clearProxyEnv();
      const built = await buildDispatcher({
        ALL_PROXY: "http://proxy.internal:3128",
      });

      expect(built).toHaveLength(1);
      expect(built[0].kind).toBe("env-proxy");
      expect(built[0].opts.httpsProxy).toBe("http://proxy.internal:3128/");
      expect(built[0].opts.httpProxy).toBe("http://proxy.internal:3128/");
    });

    it("normalizes case and a trailing root dot on the proxy host", async () => {
      clearProxyEnv();
      const built = await buildDispatcher({
        HTTPS_PROXY: "http://Proxy.Internal.:3128",
      });
      const lookup = built[0].opts.connect?.lookup;
      if (!lookup) throw new Error("lookup was not wired into the dispatcher");

      const viaProxy = await invoke(lookup, "proxy.internal");
      expect(viaProxy.err).toBeNull();
    });

    it("exempts an IPv6 proxy host regardless of its bracket form", async () => {
      clearProxyEnv();
      const built = await buildDispatcher({
        HTTPS_PROXY: "http://[2001:db8::1]:3128",
      });
      const lookup = built[0].opts.connect?.lookup;
      if (!lookup) throw new Error("lookup was not wired into the dispatcher");

      // `URL.hostname` keeps the brackets; undici dials with the bare literal.
      const viaProxy = await invoke(lookup, "2001:db8::1");
      expect(viaProxy.err).toBeNull();
    });

    it("refuses a proxy host that rebinds to an unpinned private address", async () => {
      clearProxyEnv();
      const built = await buildDispatcher({
        HTTPS_PROXY: "http://proxy.internal:3128",
      });
      const lookup = built[0].opts.connect?.lookup;
      if (!lookup) throw new Error("lookup was not wired into the dispatcher");

      // The proxy was pinned to 10.0.0.5 at construction; a later rebind to
      // another private address must fall back under the normal guard.
      dialTable["proxy.internal"] = [{ address: "10.0.0.6", family: 4 }];

      const rebinding = await invoke(lookup, "proxy.internal");
      expect(rebinding.err?.message).toContain("SSRF guard");
    });
  });
});

