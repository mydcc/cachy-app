/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

/*
 * Credential redaction for anything written to disk or handed to the user.
 *
 * `src/lib/server/logger.ts` does the same job server-side, but it extends
 * Node's EventEmitter and cannot be imported into the browser bundle, so the
 * key patterns are restated here rather than shared. They must be kept in
 * step; `redact.test.ts` pins the list.
 */

export const REDACTED = "***REDACTED***";

/**
 * Keys that look sensitive but are not, so a real value is not replaced with
 * a placeholder that makes an audit record useless for diagnosis.
 */
const SAFE_KEYS = new Set([
    "max_tokens",
    "total_tokens",
    "completion_tokens",
    "prompt_tokens",
    "token_type",
    "expires_in",
    "created_at",
    "updated_at",
    "author",
    "authority",
    // Cachy's own non-secret account identifier — see accountFingerprint().
    "accountfingerprint",
    "fingerprint",
]);

const SENSITIVE_PATTERNS: RegExp[] = [
    /passw(or)?d/i,
    /passphrase/i,
    /secret/i,
    /token/i,
    /api[-_]?key/i,
    /signature/i,
    /authorization/i,
    /bearer/i,
    /^private[-_]?key$/i,
    /^sign$/i,
];

export function isSensitiveKey(key: string): boolean {
    if (SAFE_KEYS.has(key.toLowerCase())) return false;
    return SENSITIVE_PATTERNS.some((pattern) => pattern.test(key));
}

/**
 * Returns a deep copy with every sensitive value replaced. Never mutates the
 * input — the caller is usually holding the live payload that is about to be
 * transmitted, and redacting it in place would send a redacted order.
 *
 * Cycles become the string "[Circular]" and depth is capped, so a malformed
 * object cannot make this recurse forever on the way to disk.
 */
export function redactDeep(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
    if (depth > 12) return "[Depth limit]";
    if (value === null || value === undefined) return value;

    if (typeof value === "string") return redactString(value);
    if (typeof value !== "object") return value;

    if (seen.has(value as object)) return "[Circular]";
    seen.add(value as object);

    if (Array.isArray(value)) {
        return value.map((item) => redactDeep(item, depth + 1, seen));
    }

    // Decimal and other class instances stringify rather than being walked —
    // their internals are noise in an audit record.
    if (value.constructor && value.constructor !== Object) {
        const asAny = value as { toString?: () => string };
        if (typeof asAny.toString === "function" && asAny.toString !== Object.prototype.toString) {
            return asAny.toString();
        }
    }

    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>)) {
        out[key] = isSensitiveKey(key)
            ? REDACTED
            : redactDeep((value as Record<string, unknown>)[key], depth + 1, seen);
    }
    return out;
}

/**
 * Redacts credentials that appear inside a free-text string — an error
 * message quoting a request URL, for instance. Conservative by design: it
 * only rewrites recognisable `key=value` and `"key": "value"` shapes rather
 * than guessing at bare tokens.
 */
export function redactString(input: string): string {
    let out = input;

    // key=value / key: value in query strings and log lines
    out = out.replace(
        /\b([\w-]*(?:passw(?:or)?d|passphrase|secret|token|api[-_]?key|signature|sign|authorization|bearer)[\w-]*)\s*[=:]\s*([^\s&,;"'}]+)/gi,
        (_match, key: string) => `${key}=${REDACTED}`,
    );

    // "key": "value" in embedded JSON
    out = out.replace(
        /(["'])([\w-]*(?:passw(?:or)?d|passphrase|secret|token|api[-_]?key|signature|sign|authorization|bearer)[\w-]*)\1(\s*:\s*)(["'])(?:[^"'\\]|\\.)*\4/gi,
        (_match, q: string, key: string, sep: string, vq: string) =>
            `${q}${key}${q}${sep}${vq}${REDACTED}${vq}`,
    );

    // Credentials embedded in a URL's authority section
    out = out.replace(/(\/\/[^/\s:@]+):([^/\s@]+)@/g, `$1:${REDACTED}@`);

    return out;
}
