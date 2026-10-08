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
import { ROUTE_SIGNING_PLAN } from "../../utils/exchange/restSigningPlan";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const SRC = path.join(REPO_ROOT, "src");

/** The transport, and the only file allowed to call it without a pass. */
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
    "place",
    "place-position",
];

interface Bypass {
    file: string;
    line: number;
    excerpt: string;
}

/**
 * Every identifier that can put a request on the wire.
 *
 * `signedRequest` is the transport the gate fronts. `exchangeSignedFetch` is
 * the signing primitive beneath it, and `appFetch` the authenticated fetch —
 * a module that reaches either one directly has left the gate behind, and
 * before this list existed nothing here noticed. `appFetch` sits on a great
 * many read paths, so what keeps the scan quiet is the mutating-action filter
 * below, not the size of this list.
 */
const DISPATCH_PRIMITIVES = ["signedRequest", "exchangeSignedFetch", "appFetch"];

/**
 * The primitives plus any local binding of one.
 *
 * `const send = ports.signedRequest;` reaches the same method without naming
 * it at the call site, and a per-line scan cannot see through that. Resolving
 * the alias is what lets this keep the property its own comment claims.
 */
function transportNames(source: string): string[] {
    const names = new Set(DISPATCH_PRIMITIVES);
    const alias =
        /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:this\.|[A-Za-z_$][\w$]*\.)*(?:signedRequest|exchangeSignedFetch|appFetch)\b/g;
    for (const match of source.matchAll(alias)) {
        // A self-assignment is not an alias.
        if (!DISPATCH_PRIMITIVES.includes(match[1])) names.add(match[1]);
    }
    return [...names];
}

/**
 * Flags a request on the wire whose payload names a mutating action.
 * Deliberately syntactic: it reads what a reviewer would read, so it cannot
 * be defeated by a branch that never runs in tests.
 */
function findBypasses(source: string, file: string): Bypass[] {
    const found: Bypass[] = [];
    const lines = source.split("\n");
    const names = transportNames(source)
        .map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
        .sort((a, b) => b.length - a.length)
        .join("|");
    // Longest name first, so `signedRequest` is not shadowed by a shorter
    // alias that happens to be a prefix of it.
    const callSite = new RegExp(`\\b(?:${names})\\s*(?:<[^>]*>)?\\s*\\(`);

    for (let i = 0; i < lines.length; i++) {
        const call = callSite.exec(lines[i]);
        if (!call) continue;
        const name = call[0].replace(/[<(\s].*$/, "");

        // A call's payload can span many lines; look ahead far enough to
        // cover the longest one in the codebase (modifyOrder's).
        const window = lines.slice(i, i + 30).join("\n");
        const action = MUTATING_ACTIONS.find(
            (a) => window.includes(`"${a}"`) || window.includes(`'${a}'`),
        );
        if (!action) continue;

        // A gated call passes the pass through alongside the payload.
        const gated = new RegExp(
            `${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*(?:<[^>]*>)?\\s*\\([^)]*\\bpass\\b`,
            "s",
        );
        if (gated.test(window)) continue;

        found.push({ file, line: i + 1, excerpt: lines[i].trim() });
    }
    return found;
}

function routeWriteActions(): string[] {
    const source = readFileSync(
        path.join(REPO_ROOT, "src", "routes", "api", "tpsl", "+server.ts"),
        "utf8",
    );
    const block = source.match(/const WRITE_PATHS: Record<string, string> = \{([\s\S]*?)\n\};/);
    if (!block) throw new Error("TP/SL WRITE_PATHS block not found");
    return [...block[1].matchAll(/^\s*"?([\w-]+)"?:\s*"/gm)].map((match) => match[1]);
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

    // A module that reaches past the transport has left the gate behind just
    // as surely as one that skips it. Both of these passed before the scan
    // knew the primitives existed.
    it("flags a mutating order sent through the signing primitive directly", () => {
        const bypassing = `
            export async function sendIt(cachyPath, body, keys) {
                return exchangeSignedFetch({
                    cachyPath,
                    keys,
                    method: "POST",
                    payload: { action: "place-order", symbol: "BTCUSDT" },
                });
            }
        `;
        expect(findBypasses(bypassing, "synthetic.ts")).toHaveLength(1);
    });

    it("flags a mutating order sent through the raw authenticated fetch", () => {
        const bypassing = `
            export async function sendIt(payload) {
                return appFetch("/api/orders", {
                    method: "POST",
                    body: JSON.stringify({ action: "close-position", symbol: "BTCUSDT" }),
                });
            }
        `;
        expect(findBypasses(bypassing, "synthetic.ts")).toHaveLength(1);
    });

    // `const send = ports.signedRequest` names the method nowhere near the
    // call, which is why this form is worth a test of its own rather than
    // trusting the alias resolution to be obvious.
    it("flags a mutating order sent through an alias of a transport", () => {
        const bypassing = `
            export async function sendIt(ports) {
                const send = ports.signedRequest;
                return send("/api/orders", { action: "place-order", symbol: "BTCUSDT" });
            }
        `;
        expect(findBypasses(bypassing, "synthetic.ts")).toHaveLength(1);
    });

    it("still leaves a read through any primitive alone", () => {
        const reads = `
            const rows = await appFetch("/api/orders", { method: "POST" });
            const info = await exchangeSignedFetch({ cachyPath: "/api/orders", payload: { type: "order-detail" } });
            const plans = await appFetch("/api/tpsl", { method: "POST", body: JSON.stringify({ action: "list" }) });
        `;
        expect(findBypasses(reads, "synthetic.ts")).toEqual([]);
    });

    it("keeps its action list in step with the gate's", async () => {
        const { MUTATING_ORDER_ACTIONS } = await import("../../services/orderGate");
        for (const action of MUTATING_ACTIONS) {
            expect(MUTATING_ORDER_ACTIONS.has(action)).toBe(true);
        }
        const tpslWriteActions = Object.keys(
            ROUTE_SIGNING_PLAN["/api/tpsl"].signedByAction ?? {},
        );
        expect(new Set(routeWriteActions())).toEqual(new Set(tpslWriteActions));
        for (const action of tpslWriteActions) {
            expect(MUTATING_ORDER_ACTIONS.has(action)).toBe(true);
            if (action !== "cancel" && action !== "modify") {
                expect(MUTATING_ACTIONS).toContain(action);
            }
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
