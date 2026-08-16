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

/*
 * FEAT-0011, first acceptance criterion:
 *
 *   "Every order-placing path in the codebase reaches the exchange only
 *    through the gate — proven by a test that adds a call site bypassing it
 *    and fails."
 *
 * `assertGatePass` already refuses an ungated order at runtime (see
 * orderGate.test.ts). That catches the bypass when the line executes, which
 * for a rarely-taken branch could be in front of a user with money on it.
 * This test catches it in CI instead, by reading the source.
 *
 * The scanner is exercised against a synthetic bypassing call site in the
 * same run, so a scanner that silently stopped matching anything fails here
 * rather than passing vacuously.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const SRC = path.join(REPO_ROOT, "src");

/** The transport, and the only file allowed to call it without a pass. */
const TRANSPORT_METHOD = "signedRequest";
const TRANSPORT_OWNER = path.join("src", "services", "tradeService.ts");

/**
 * Order actions that change exchange state. Kept in step with
 * MUTATING_ORDER_ACTIONS in src/services/orderGate.ts — the assertion at the
 * bottom of this file fails if the two drift apart.
 */
const MUTATING_ACTIONS = [
    "place-order",
    "close-position",
    "close-all-positions",
    "flash-close-position",
    "cancel-order",
    "cancel-all",
    "modify-order",
];

interface Bypass {
    file: string;
    line: number;
    excerpt: string;
}

/**
 * Flags a `signedRequest(...)` call whose payload names a mutating action.
 * Deliberately syntactic: it reads what a reviewer would read, so it cannot
 * be defeated by a branch that never runs in tests.
 */
function findBypasses(source: string, file: string): Bypass[] {
    const found: Bypass[] = [];
    const lines = source.split("\n");

    for (let i = 0; i < lines.length; i++) {
        if (!lines[i].includes(`${TRANSPORT_METHOD}(`)) continue;

        // A call's payload can span many lines; look ahead far enough to
        // cover the longest one in the codebase (modifyOrder's).
        const window = lines.slice(i, i + 30).join("\n");
        const action = MUTATING_ACTIONS.find(
            (a) => window.includes(`"${a}"`) || window.includes(`'${a}'`),
        );
        if (!action) continue;

        // A gated call passes the pass through as the fourth argument.
        if (/signedRequest\s*(<[^>]*>)?\s*\([^)]*\bpass\b/s.test(window)) continue;

        found.push({ file, line: i + 1, excerpt: lines[i].trim() });
    }
    return found;
}

/** Every shipped source file under src/ — tests and benchmarks excluded. */
function sourceFiles(dir = SRC, found: string[] = []): string[] {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name === "tests" || entry.name === "node_modules") continue;
            sourceFiles(full, found);
            continue;
        }
        if (!/\.(ts|svelte)$/.test(entry.name)) continue;
        if (/\.(test|bench|spec)\.ts$/.test(entry.name)) continue;
        found.push(full);
    }
    return found;
}

describe("FEAT-0011 — the order transport is only reachable through the gate", () => {
    it("finds no call site that sends a mutating order without a pass", () => {
        const files = sourceFiles();
        expect(files.length).toBeGreaterThan(100); // the scan actually ran

        const bypasses: Bypass[] = [];
        for (const file of files) {
            const relative = path.relative(REPO_ROOT, file);
            if (relative === TRANSPORT_OWNER) continue;
            bypasses.push(...findBypasses(readFileSync(file, "utf8"), relative));
        }

        expect(
            bypasses,
            `Order(s) reaching the exchange without the gate:\n${bypasses
                .map((b) => `  ${b.file}:${b.line}  ${b.excerpt}`)
                .join("\n")}`,
        ).toEqual([]);
    });

    it("inside tradeService, every mutating call goes through gatedRequest", () => {
        const source = readFileSync(path.join(REPO_ROOT, TRANSPORT_OWNER), "utf8");
        const bypasses = findBypasses(source, TRANSPORT_OWNER);
        expect(
            bypasses,
            `Ungated mutating call(s) in the transport's own file:\n${bypasses
                .map((b) => `  ${b.file}:${b.line}  ${b.excerpt}`)
                .join("\n")}`,
        ).toEqual([]);
    });

    // Without this, the two tests above would keep passing if the scanner
    // stopped recognising a bypass at all.
    it("flags a call site that bypasses the gate", () => {
        const bypassing = `
            async function placeItAnyway() {
                return await this.signedRequest("POST", "/api/orders", {
                    type: "place-order",
                    symbol: "BTCUSDT",
                    side: "BUY",
                    qty: "1",
                });
            }
        `;
        const found = findBypasses(bypassing, "synthetic.ts");
        expect(found).toHaveLength(1);
        expect(found[0].line).toBe(3);
    });

    it("does not flag the gated form of the same call", () => {
        const gated = `
            async function placeItProperly() {
                return await orderGate.submit(intent, (pass) =>
                    this.signedRequest("POST", "/api/orders", {
                        type: "place-order",
                        symbol: "BTCUSDT",
                    }, pass),
                );
            }
        `;
        expect(findBypasses(gated, "synthetic.ts")).toEqual([]);
    });

    it("does not flag a read-only call", () => {
        const readOnly = `
            const detail = await this.signedRequest("POST", "/api/orders", {
                type: "order-detail",
                orderId,
            });
        `;
        expect(findBypasses(readOnly, "synthetic.ts")).toEqual([]);
    });

    it("keeps its action list in step with the gate's", async () => {
        const { MUTATING_ORDER_ACTIONS } = await import("../../services/orderGate");
        for (const action of MUTATING_ACTIONS) {
            expect(MUTATING_ORDER_ACTIONS.has(action)).toBe(true);
        }
        // The gate additionally covers the /api/tpsl verbs ("cancel",
        // "modify"), which are too generic to grep for usefully — the runtime
        // check in assertGatePass is what covers those.
        const extra = [...MUTATING_ORDER_ACTIONS].filter(
            (a) => !MUTATING_ACTIONS.includes(a),
        );
        expect(extra.sort()).toEqual(["cancel", "modify"]);
    });
});
