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
 * A per-IP limiter is only as strong as its key space. Three properties
 * matter:
 *
 * - **One host must not present thousands of keys.** A routed IPv6 /64 gives
 *   a single host 2^64 addresses; keyed on the full address, every request
 *   gets a fresh bucket and the per-IP ceiling never binds. IPv6 keys are
 *   therefore truncated to their /64 prefix, the block normally routed to one
 *   subscriber. (A host holding a /56 or /48 can still present several /64s;
 *   closing that needs a coarser tier or an admission mechanism, not a
 *   different string.)
 * - **One address must not present two keys.** Brackets and ports, zone ids,
 *   IPv4-mapped IPv6 in dotted or hex notation, embedded dotted quads, and
 *   leading-zero octets are all folded into one canonical form.
 * - **The key must stay bounded.** Values that do not parse as an IP address
 *   are returned trimmed, lowercased and length-capped, so a forged header
 *   cannot turn every request into a multi-kilobyte Map key.
 */
/**
 * Tracked-key cap for limiters keyed on a client address.
 *
 * Sized well above the limiter's old default (1 000) because the key space is
 * distinct client networks, not user-supplied strings: an address spray must
 * not throttle honest newcomers for the rest of the window. IPv6 keys are
 * aggregated to /64, so this counts networks.
 */
export const CLIENT_ADDRESS_KEY_CAP = 20_000;

export function normalizeClientAddress(raw: string): string {
  const value = raw.trim().toLowerCase();
  if (!value) return value;

  // Strip brackets and a port: "[2001:db8::1]:443" -> "2001:db8::1".
  const bracketed = value.match(/^\[([^\]]+)\](?::\d+)?$/);
  const withoutBrackets = bracketed ? bracketed[1] : value;

  // Strip an IPv6 zone id: "fe80::1%eth0" -> "fe80::1".
  const withoutZone = withoutBrackets.includes("%")
    ? withoutBrackets.slice(0, withoutBrackets.indexOf("%"))
    : withoutBrackets;

  // A dotted IPv4, optionally with a port: "203.0.113.7" / "203.0.113.7:443".
  const ipv4 = withoutZone.match(/^(\d{1,3}(?:\.\d{1,3}){3})(?::\d+)?$/);
  if (ipv4) {
    const octets = parseIpv4(ipv4[1]);
    return octets ? octets.join(".") : capLength(withoutZone);
  }

  if (!withoutZone.includes(":")) return capLength(withoutZone);

  return ipv6Key(withoutZone) ?? capLength(withoutZone);
}

/**
 * Returns the canonical rate-limit key for an IPv6 address: the embedded
 * IPv4 for IPv4-mapped addresses, otherwise the /64 prefix.
 */
function ipv6Key(address: string): string | null {
  const groups = expandIpv6(address);
  if (!groups) return null;

  // IPv4-mapped (::ffff:0:0/96), in either dotted or hex notation: the host
  // is the embedded IPv4 address, so fold to it.
  if (groups[5] === "ffff" && groups.slice(0, 5).every((g) => g === "0")) {
    return [
      (parseInt(groups[6], 16) >> 8) & 0xff,
      parseInt(groups[6], 16) & 0xff,
      (parseInt(groups[7], 16) >> 8) & 0xff,
      parseInt(groups[7], 16) & 0xff,
    ].join(".");
  }

  return `${groups.slice(0, 4).join(":")}::/64`;
}

/** Expands an IPv6 address into eight normalized 16-bit hex groups, or null. */
function expandIpv6(address: string): string[] | null {
  const halves = address.split("::");
  if (halves.length > 2) return null;

  const head = normalizeGroups(halves[0] ? halves[0].split(":") : []);
  const tail = normalizeGroups(
    halves.length === 2 && halves[1] ? halves[1].split(":") : [],
  );
  if (!head || !tail) return null;

  const missing = 8 - head.length - tail.length;
  if (halves.length === 2) {
    // "::" must stand for at least one group.
    if (missing < 1) return null;
  } else if (missing !== 0) {
    return null;
  }

  return [...head, ...Array<string>(missing).fill("0"), ...tail];
}

/**
 * Normalizes a list of IPv6 groups, allowing one trailing dotted IPv4 (which
 * stands for its two 16-bit groups). Returns null on any invalid part.
 */
function normalizeGroups(parts: string[]): string[] | null {
  const groups: string[] = [];

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];

    if (part.includes(".")) {
      if (i !== parts.length - 1) return null;
      const octets = parseIpv4(part);
      if (!octets) return null;
      groups.push(((octets[0] << 8) | octets[1]).toString(16));
      groups.push(((octets[2] << 8) | octets[3]).toString(16));
      continue;
    }

    if (!/^[0-9a-f]{1,4}$/.test(part)) return null;
    groups.push(part.replace(/^0+(?=.)/, ""));
  }

  return groups;
}

/** Parses a dotted IPv4 address into four octets, or null. */
function parseIpv4(value: string): number[] | null {
  const parts = value.split(".");
  if (parts.length !== 4) return null;
  if (parts.some((part) => !/^\d{1,3}$/.test(part))) return null;

  const octets = parts.map(Number);
  if (octets.some((octet) => octet > 255)) return null;
  return octets;
}

/** Keeps a non-IP fallback key bounded: real addresses are far shorter. */
function capLength(value: string): string {
  return value.length > 64 ? value.slice(0, 64) : value;
}
