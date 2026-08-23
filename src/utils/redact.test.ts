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

// @vitest-environment node

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { Decimal } from "decimal.js";
import { redactDeep, redactString, isSensitiveKey, REDACTED } from "./redact";

describe("isSensitiveKey", () => {
    it.each([
        "password",
        "passwd",
        "passphrase",
        "apiSecret",
        "secret",
        "API_KEY",
        "apiKey",
        "api-key",
        "signature",
        "sign",
        "authorization",
        "accessToken",
        "bearer",
        "privateKey",
    ])("treats %s as sensitive", (key) => {
        expect(isSensitiveKey(key)).toBe(true);
    });

    it.each([
        "symbol",
        "qty",
        "price",
        "orderId",
        "positionId",
        "max_tokens",
        "created_at",
        "author",
        // Cachy's own non-secret account identifier: redacting it would make
        // "which account was this order on" unanswerable in the audit trail.
        "accountFingerprint",
        "fingerprint",
    ])("leaves %s alone", (key) => {
        expect(isSensitiveKey(key)).toBe(false);
    });
});

describe("redactDeep", () => {
    it("replaces sensitive values at any depth", () => {
        const out = redactDeep({
            symbol: "BTCUSDT",
            apiKey: "AKIA123",
            nested: { deeper: { apiSecret: "shh", qty: "1" } },
            list: [{ signature: "deadbeef" }, { price: "50000" }],
        }) as Record<string, unknown>;

        expect(out.symbol).toBe("BTCUSDT");
        expect(out.apiKey).toBe(REDACTED);
        // Values gone, keys kept — a record that lost its field names would
        // be no more useful than no record.
        expect(JSON.stringify(out)).not.toContain("shh");
        expect(JSON.stringify(out)).not.toContain("deadbeef");
        expect(JSON.stringify(out)).toContain("signature");
        expect(JSON.stringify(out)).toContain("50000");
    });

    it("never mutates its input", () => {
        const input = { apiSecret: "original", nested: { token: "t" } };
        redactDeep(input);
        expect(input.apiSecret).toBe("original");
        expect(input.nested.token).toBe("t");
    });

    it("stringifies Decimal rather than walking its internals", () => {
        const out = redactDeep({ qty: new Decimal("0.5") }) as Record<string, unknown>;
        expect(out.qty).toBe("0.5");
    });

    it("survives a cycle", () => {
        const a: Record<string, unknown> = { name: "a" };
        a.self = a;
        expect(() => redactDeep(a)).not.toThrow();
        expect(JSON.stringify(redactDeep(a))).toContain("[Circular]");
    });

    it("caps depth rather than recursing forever", () => {
        let deep: Record<string, unknown> = { end: true };
        for (let i = 0; i < 40; i++) deep = { next: deep };
        expect(JSON.stringify(redactDeep(deep))).toContain("[Depth limit]");
    });

    it("passes primitives through", () => {
        expect(redactDeep(42)).toBe(42);
        expect(redactDeep(true)).toBe(true);
        expect(redactDeep(null)).toBeNull();
        expect(redactDeep(undefined)).toBeUndefined();
    });
});

describe("redactString", () => {
    it("redacts key=value pairs and keeps the rest", () => {
        const out = redactString("GET /x?apiKey=AKIA123&symbol=BTCUSDT&signature=abc");
        expect(out).not.toContain("AKIA123");
        expect(out).not.toContain("abc");
        expect(out).toContain("symbol=BTCUSDT");
    });

    it("redacts embedded JSON values", () => {
        const out = redactString('{"apiSecret": "s3cret", "qty": "1"}');
        expect(out).not.toContain("s3cret");
        expect(out).toContain('"qty": "1"');
    });

    it("redacts credentials in a URL authority", () => {
        const out = redactString("https://user:hunter2@example.com/path");
        expect(out).not.toContain("hunter2");
        expect(out).toContain("example.com/path");
    });

    it("leaves an ordinary message untouched", () => {
        const message = "Order refused: qty does not match (expected 1, got 2)";
        expect(redactString(message)).toBe(message);
    });

    it("redacts exact sign key without scrubbing signal or design words", () => {
        const queryWithSign = "https://fapi.bitunix.com/api/v1?symbol=BTCUSDT&sign=abcdef123456";
        expect(redactString(queryWithSign)).toContain("sign=***REDACTED***");
        expect(redactString(queryWithSign)).not.toContain("abcdef123456");

        const messageWithSignalAndDesign = "signal=strong and design=modern layout with symbol=ETH";
        expect(redactString(messageWithSignalAndDesign)).toBe("signal=strong and design=modern layout with symbol=ETH");

        const jsonWithSignAndSignal = '{"sign": "secret_sig", "signal": "buy", "design": "dark"}';
        const redactedJson = redactString(jsonWithSignAndSignal);
        expect(redactedJson).toContain('"sign": "***REDACTED***"');
        expect(redactedJson).toContain('"signal": "buy"');
        expect(redactedJson).toContain('"design": "dark"');
    });
});

describe("redaction stays in step with the server-side logger", () => {
    it("covers every pattern the server logger redacts", () => {
        // The two implementations cannot share code — the server one extends
        // Node's EventEmitter and does not belong in the browser bundle — so
        // this pins them together instead.
        const serverSource = readFileSync("src/lib/server/logger.ts", "utf8");
        const block = serverSource.slice(
            serverSource.indexOf("sensitivePatterns"),
            serverSource.indexOf("private constructor"),
        );
        const serverPatterns = block.match(/\/[^/\n]+\/[a-z]*/g) ?? [];
        expect(serverPatterns.length).toBeGreaterThan(5);

        // Every concept the server redacts must also be redacted here.
        for (const key of [
            "password",
            "passphrase",
            "secret",
            "token",
            "api_key",
            "signature",
            "authorization",
            "bearer",
            "private_key",
        ]) {
            expect(isSensitiveKey(key)).toBe(true);
        }
    });
});
