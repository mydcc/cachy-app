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

import { describe, it, expect, vi } from "vitest";
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
  });
});

