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

/**
 * Normalizes `event.getClientAddress()` into a rate-limit key (BUG-0722).
 *
 * A per-IP limiter is only as strong as its key space. Two properties matter:
 *
 * - **One host must not present thousands of keys.** A routed IPv6 /64 gives a
 *   single host 2^64 addresses; keyed on the full address, every request gets
 *   a fresh bucket and the per-IP ceiling never binds. IPv6 keys are therefore
 *   truncated to their /64 prefix, which is the smallest block a provider
 *   normally routes to one subscriber.
 * - **One address must not present two keys.** IPv4-mapped IPv6
 *   (`::ffff:203.0.113.7`) and zone ids (`fe80::1%eth0`) are normalized.
 *
 * Values that do not parse as an IP address are returned trimmed and
 * lowercased: they are not real client addresses, but they stay a stable key
 * instead of throwing inside a request.
 */
export function normalizeClientAddress(raw: string): string {
  const value = raw.trim().toLowerCase();
  if (!value) return value;

  // Strip an IPv6 zone id: "fe80::1%eth0" -> "fe80::1".
  const withoutZone = value.includes("%")
    ? value.slice(0, value.indexOf("%"))
    : value;

  // Unwrap IPv4-mapped IPv6: "::ffff:203.0.113.7" -> "203.0.113.7".
  const mapped = withoutZone.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (mapped) return mapped[1];

  // Anything without a colon is a plain IPv4 address (or not an IP at all).
  if (!withoutZone.includes(":")) return withoutZone;

  return ipv6Prefix64(withoutZone) ?? withoutZone;
}

/** Returns the canonical /64 prefix of an IPv6 address, or null if unparseable. */
function ipv6Prefix64(address: string): string | null {
  const halves = address.split("::");
  if (halves.length > 2) return null;

  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - head.length - tail.length;

  if (halves.length === 2) {
    // "::" must stand for at least one group; with eight groups already
    // present the notation is invalid.
    if (missing < 1) return null;
  } else if (head.length !== 8) {
    return null;
  }

  const groups = [
    ...head,
    ...Array<string>(Math.max(0, missing)).fill("0"),
    ...tail,
  ];
  if (groups.length !== 8) return null;
  if (!groups.every((group) => /^[0-9a-f]{1,4}$/.test(group))) return null;

  const prefix = groups
    .slice(0, 4)
    .map((group) => group.replace(/^0+(?=.)/, ""));
  return `${prefix.join(":")}::/64`;
}
