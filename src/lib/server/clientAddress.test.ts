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

import { describe, it, expect } from "vitest";
import { normalizeClientAddress } from "./clientAddress";

describe("normalizeClientAddress", () => {
  it("leaves IPv4 addresses unchanged", () => {
    expect(normalizeClientAddress("203.0.113.7")).toBe("203.0.113.7");
    expect(normalizeClientAddress(" 203.0.113.7 ")).toBe("203.0.113.7");
  });

  it("unwraps IPv4-mapped IPv6 addresses in every notation", () => {
    expect(normalizeClientAddress("::ffff:203.0.113.7")).toBe("203.0.113.7");
    expect(normalizeClientAddress("0:0:0:0:0:ffff:203.0.113.7")).toBe(
      "203.0.113.7",
    );
    expect(normalizeClientAddress("::ffff:c000:201")).toBe("192.0.2.1");
    expect(normalizeClientAddress("::ffff:203.0.113.007")).toBe("203.0.113.7");
  });

  it("canonicalizes leading-zero octets in plain IPv4", () => {
    expect(normalizeClientAddress("203.0.113.007")).toBe("203.0.113.7");
  });

  it("strips brackets and ports", () => {
    expect(normalizeClientAddress("[2001:db8:1:2::1]:443")).toBe(
      "2001:db8:1:2::/64",
    );
    expect(normalizeClientAddress("203.0.113.7:443")).toBe("203.0.113.7");
  });

  it("folds a NAT64 address to its prefix", () => {
    expect(normalizeClientAddress("64:ff9b::192.0.2.1")).toBe(
      "64:ff9b:0:0::/64",
    );
  });

  it("truncates IPv6 addresses to their /64 prefix", () => {
    expect(normalizeClientAddress("2001:db8:1:2:3:4:5:6")).toBe(
      "2001:db8:1:2::/64",
    );
    expect(normalizeClientAddress("2001:db8:1:2::1")).toBe(
      "2001:db8:1:2::/64",
    );
    expect(normalizeClientAddress("2001:0db8:0001:0002::")).toBe(
      "2001:db8:1:2::/64",
    );
  });

  it("buckets two addresses of one /64 under the same key", () => {
    expect(normalizeClientAddress("2001:db8:1:2::a")).toBe(
      normalizeClientAddress("2001:db8:1:2:ffff:ffff:ffff:ffff"),
    );
  });

  it("keeps addresses from different /64s apart", () => {
    expect(normalizeClientAddress("2001:db8:1:2::1")).not.toBe(
      normalizeClientAddress("2001:db8:1:3::1"),
    );
  });

  it("strips an IPv6 zone id", () => {
    expect(normalizeClientAddress("fe80::1%eth0")).toBe("fe80:0:0:0::/64");
  });

  it("normalizes case", () => {
    expect(normalizeClientAddress("2001:DB8:1:2::1")).toBe(
      "2001:db8:1:2::/64",
    );
  });

  it("returns unparseable values as a stable, bounded key", () => {
    expect(normalizeClientAddress("not-an-ip")).toBe("not-an-ip");
    expect(normalizeClientAddress("2001:db8:::1")).toBe("2001:db8:::1");
    expect(normalizeClientAddress("x".repeat(100))).toBe("x".repeat(64));
  });
});
