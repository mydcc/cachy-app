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
 * FEAT-0015 — acceptance criteria for the order audit trail.
 *
 * Attempts are driven through `orderGate.submit` rather than by calling the
 * recorder directly, because the criterion is that *every* attempt is
 * recorded — which is a property of the seam, not of the writer.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Decimal } from "decimal.js";
import { readFileSync } from "node:fs";

vi.mock("$app/environment", () => ({ browser: true, dev: true }));
vi.mock("./logger", () => ({
    logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
    orderAuditService,
    MAX_AUDIT_ENTRIES,
    MAX_AUDIT_BYTES,
} from "./orderAuditService";
import {
    orderGate,
    registerKillSwitch,
    registerAuditRecorder,
    OrderRefusedError,
    type OrderIntent,
} from "./orderGate";
import { CONSTANTS } from "../lib/constants";
import { REDACTED } from "../utils/redact";

const ACCOUNT = { provider: "bitunix", accountFingerprint: "abcd…wxyz" };

function reduceIntent(): OrderIntent {
    return {
        kind: "reduce",
        endpoint: "/api/orders",
        payload: {
            type: "place-order",
            symbol: "BTCUSDT",
            side: "BUY",
            orderType: "MARKET",
            qty: "0.5",
            reduceOnly: true,
            tradeSide: "CLOSE",
            positionId: "pos-1",
        },
        displayed: {
            ...ACCOUNT,
            symbol: "BTCUSDT",
            side: "BUY",
            positionAmount: new Decimal("0.5"),
            fullClose: true,
            positionId: "pos-1",
            paperMode: false,
        },
    };
}

beforeEach(() => {
    localStorage.clear();
    registerKillSwitch(null);
    orderAuditService.install();
    orderAuditService.clear();
    orderAuditService.reloadFromStorage();
});

afterEach(() => {
    registerKillSwitch(null);
    orderAuditService.uninstall();
    localStorage.clear();
});

// AC: "Every attempt is recorded, including refused ones, with the refusal
// reason."
describe("FEAT-0015 — every attempt is recorded", () => {
    it("records a successful submission", async () => {
        await orderGate.submit(reduceIntent(), async () => ({ code: "0", orderId: "x-1" }));

        const entries = orderAuditService.getEntries();
        expect(entries).toHaveLength(1);
        expect(entries[0]).toMatchObject({
            outcome: "sent",
            action: "place-order",
            endpoint: "/api/orders",
            kind: "reduce",
            mode: "live",
            account: { provider: "bitunix", fingerprint: "abcd…wxyz" },
        });
        expect(entries[0].response).toMatchObject({ orderId: "x-1" });
    });

    it("records a refusal, with the field that caused it", async () => {
        const intent = reduceIntent();
        intent.payload.symbol = "ETHUSDT";

        await expect(orderGate.submit(intent, vi.fn())).rejects.toBeInstanceOf(
            OrderRefusedError,
        );

        const entries = orderAuditService.getEntries();
        expect(entries).toHaveLength(1);
        expect(entries[0].outcome).toBe("refused");
        expect(entries[0].refusal).toMatchObject({
            field: "symbol",
            reason: "mismatch",
            values: { expected: "BTCUSDT", actual: "ETHUSDT" },
        });
        // A refused attempt is exactly the one a console would never have
        // shown, because nothing was sent.
        expect(entries[0].response).toBeUndefined();
    });

    it("records a kill-switch refusal", async () => {
        registerKillSwitch(() => true);
        await expect(orderGate.submit(reduceIntent(), vi.fn())).rejects.toThrow();
        expect(orderAuditService.getEntries()[0].refusal?.field).toBe("killSwitch");
    });

    it("records a transport failure and rethrows", async () => {
        await expect(
            orderGate.submit(reduceIntent(), async () => {
                throw new Error("ENETDOWN");
            }),
        ).rejects.toThrow("ENETDOWN");

        const entry = orderAuditService.getEntries()[0];
        expect(entry.outcome).toBe("failed");
        expect(entry.error).toMatchObject({ name: "Error", message: "ENETDOWN" });
    });

    it("records which fields the gate compared", async () => {
        await orderGate.submit(reduceIntent(), async () => ({}));
        expect(orderAuditService.getEntries()[0].checked).toEqual(
            expect.arrayContaining(["killSwitch", "account", "symbol", "side", "qty"]),
        );
    });

    it("records the mode", async () => {
        const intent = reduceIntent();
        intent.displayed.paperMode = true;
        await orderGate.submit(intent, async () => ({}));
        expect(orderAuditService.getEntries()[0].mode).toBe("paper");
    });

    it("keeps attempts in the order they happened", async () => {
        for (const id of ["a", "b", "c"]) {
            const intent = reduceIntent();
            intent.payload.clientOrderId = id;
            await orderGate.submit(intent, async () => ({}));
        }
        const payloads = orderAuditService
            .getEntries()
            .map((e) => (e.payload as { clientOrderId: string }).clientOrderId);
        expect(payloads).toEqual(["a", "b", "c"]);
    });
});

// AC: "Credentials and signatures are redacted before writing, asserted by a
// test."
describe("FEAT-0015 — redaction", () => {
    it("redacts credentials out of the payload before it is written", async () => {
        const intent = reduceIntent();
        Object.assign(intent.payload, {
            apiKey: "AKIAREALKEY123456",
            apiSecret: "s3cr3t-value",
            passphrase: "hunter2",
            signature: "deadbeefcafe",
            nested: { authorization: "Bearer abc.def.ghi" },
        });

        await orderGate.submit(intent, async () => ({ ok: true }));

        const raw = localStorage.getItem(CONSTANTS.LOCAL_STORAGE_ORDER_AUDIT_KEY) ?? "";
        for (const secret of [
            "AKIAREALKEY123456",
            "s3cr3t-value",
            "hunter2",
            "deadbeefcafe",
            "abc.def.ghi",
        ]) {
            expect(raw).not.toContain(secret);
        }

        const payload = orderAuditService.getEntries()[0].payload as Record<string, unknown>;
        expect(payload.apiKey).toBe(REDACTED);
        expect(payload.apiSecret).toBe(REDACTED);
        expect(payload.passphrase).toBe(REDACTED);
        expect(payload.signature).toBe(REDACTED);
        expect((payload.nested as Record<string, unknown>).authorization).toBe(REDACTED);
        // Non-secret fields survive, or the record would be useless.
        expect(payload.symbol).toBe("BTCUSDT");
        expect(payload.qty).toBe("0.5");
    });

    it("redacts credentials out of the exchange response", async () => {
        await orderGate.submit(reduceIntent(), async () => ({
            code: "0",
            echo: { apiSecret: "leaked-secret" },
        }));
        const raw = localStorage.getItem(CONSTANTS.LOCAL_STORAGE_ORDER_AUDIT_KEY) ?? "";
        expect(raw).not.toContain("leaked-secret");
    });

    it("redacts credentials quoted inside an error message", async () => {
        await expect(
            orderGate.submit(reduceIntent(), async () => {
                throw new Error("request failed: apiKey=AKIAREALKEY123456&symbol=BTCUSDT");
            }),
        ).rejects.toThrow();

        const entry = orderAuditService.getEntries()[0];
        expect(entry.error?.message).not.toContain("AKIAREALKEY123456");
        expect(entry.error?.message).toContain(REDACTED);
        // The useful half of the message is kept.
        expect(entry.error?.message).toContain("symbol=BTCUSDT");
    });

    it("never mutates the payload it was handed", async () => {
        const intent = reduceIntent();
        intent.payload.apiSecret = "still-here";
        await orderGate.submit(intent, async () => ({}));
        // Redacting in place would mean the transport sent a redacted order.
        expect(intent.payload.apiSecret).toBe("still-here");
    });

    it("keeps the non-secret account fingerprint readable", async () => {
        await orderGate.submit(reduceIntent(), async () => ({}));
        expect(orderAuditService.getEntries()[0].account.fingerprint).toBe("abcd…wxyz");
    });
});

// AC: "The log is bounded and its eviction rule is stated in this item."
describe("FEAT-0015 — bounds", () => {
    it("keeps only the most recent MAX_AUDIT_ENTRIES attempts", async () => {
        for (let i = 0; i < MAX_AUDIT_ENTRIES + 25; i++) {
            const intent = reduceIntent();
            intent.payload.clientOrderId = `o-${i}`;
            await orderGate.submit(intent, async () => ({}));
        }

        const entries = orderAuditService.getEntries();
        expect(entries).toHaveLength(MAX_AUDIT_ENTRIES);
        // Oldest dropped, newest kept.
        expect((entries[0].payload as { clientOrderId: string }).clientOrderId).toBe("o-25");
        expect(
            (entries[entries.length - 1].payload as { clientOrderId: string }).clientOrderId,
        ).toBe(`o-${MAX_AUDIT_ENTRIES + 24}`);
    }, 15000);

    it("drops the oldest until the serialised log fits the byte bound", async () => {
        // One pathological payload must not be able to eat the whole
        // localStorage budget and take the journal down with it.
        const big = "x".repeat(200 * 1024);
        for (let i = 0; i < 6; i++) {
            const intent = reduceIntent();
            intent.payload.note = big;
            await orderGate.submit(intent, async () => ({}));
        }

        const size = JSON.stringify(orderAuditService.getEntries()).length;
        expect(size).toBeLessThanOrEqual(MAX_AUDIT_BYTES);
        expect(orderAuditService.getEntries().length).toBeGreaterThan(0);
    });
});

// AC: "Export produces a file the user can read."
describe("FEAT-0015 — export", () => {
    it("produces readable JSON with the entries in it", async () => {
        await orderGate.submit(reduceIntent(), async () => ({ orderId: "e-1" }));

        const exported = JSON.parse(orderAuditService.exportJson());
        expect(exported).toMatchObject({
            format: "cachy-order-audit",
            version: 1,
            entryCount: 1,
        });
        expect(typeof exported.exportedAt).toBe("string");
        expect(exported.entries).toHaveLength(1);
        expect(exported.entries[0].action).toBe("place-order");
    });

    it("exports already-redacted content", async () => {
        const intent = reduceIntent();
        intent.payload.apiSecret = "must-not-appear";
        await orderGate.submit(intent, async () => ({}));
        expect(orderAuditService.exportJson()).not.toContain("must-not-appear");
    });

    it("exports an empty but valid document when nothing has happened", () => {
        const exported = JSON.parse(orderAuditService.exportJson());
        expect(exported.entryCount).toBe(0);
        expect(exported.entries).toEqual([]);
    });
});

// AC: "Nothing in the log reaches any network endpoint, asserted by a test."
describe("FEAT-0015 — Class A", () => {
    it("makes no network call while recording or exporting", async () => {
        const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}"));
        const beacon = vi.fn();
        // sendBeacon is the other way data leaves a page.
        Object.defineProperty(navigator, "sendBeacon", {
            value: beacon,
            configurable: true,
        });

        try {
            await orderGate.submit(reduceIntent(), async () => ({}));
            orderAuditService.exportJson();

            expect(fetchSpy).not.toHaveBeenCalled();
            expect(beacon).not.toHaveBeenCalled();
        } finally {
            fetchSpy.mockRestore();
        }
    });

    it("writes only to its own localStorage key", async () => {
        await orderGate.submit(reduceIntent(), async () => ({}));
        expect(Object.keys(localStorage)).toEqual([
            CONSTANTS.LOCAL_STORAGE_ORDER_AUDIT_KEY,
        ]);
    });

    it("has no network call in its own source", () => {
        const source = readFileSync("src/services/orderAuditService.ts", "utf8");
        expect(source).not.toMatch(/\bfetch\s*\(|appFetch|sendBeacon|XMLHttpRequest|WebSocket/);
    });
});

// AC: "Survives reload."
describe("FEAT-0015 — persistence", () => {
    it("comes back after a reload", async () => {
        await orderGate.submit(reduceIntent(), async () => ({ orderId: "r-1" }));

        orderAuditService.reloadFromStorage();
        const entries = orderAuditService.getEntries();
        expect(entries).toHaveLength(1);
        expect(entries[0].outcome).toBe("sent");
        expect(entries[0].action).toBe("place-order");
    });

    it("appends to the restored log rather than replacing it", async () => {
        await orderGate.submit(reduceIntent(), async () => ({}));
        orderAuditService.reloadFromStorage();
        await orderGate.submit(reduceIntent(), async () => ({}));
        expect(orderAuditService.getEntries()).toHaveLength(2);
    });

    it("starts empty rather than throwing on a corrupt log", () => {
        localStorage.setItem(CONSTANTS.LOCAL_STORAGE_ORDER_AUDIT_KEY, "{not json");
        expect(() => orderAuditService.reloadFromStorage()).not.toThrow();
        expect(orderAuditService.getEntries()).toEqual([]);
    });

    it("clears on request", async () => {
        await orderGate.submit(reduceIntent(), async () => ({}));
        orderAuditService.clear();
        expect(orderAuditService.getEntries()).toEqual([]);
        orderAuditService.reloadFromStorage();
        expect(orderAuditService.getEntries()).toEqual([]);
    });
});

describe("FEAT-0015 — the recorder cannot break an order", () => {
    it("still submits when the recorder throws", async () => {
        registerAuditRecorder(() => {
            throw new Error("recorder exploded");
        });
        try {
            // An audit trail that can refuse an order is a second gate, and a
            // broken recorder must never be able to stop a close.
            await expect(
                orderGate.submit(reduceIntent(), async () => "sent"),
            ).resolves.toBe("sent");
        } finally {
            registerAuditRecorder(null);
        }
    });

    it("records nothing when no recorder is attached", async () => {
        orderAuditService.uninstall();
        await orderGate.submit(reduceIntent(), async () => ({}));
        expect(orderAuditService.getEntries()).toEqual([]);
    });

    it("is installed during app startup", () => {
        // Without this line the whole feature is inert in the shipped app
        // while every test above still passes.
        const source = readFileSync("src/services/app.ts", "utf8");
        expect(source).toMatch(/orderAuditService\.install\(\)/);
    });
});
