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

/** The transport, and the only file allowed to call it without a pass.
 * Move-with-me: if the transport or this check ever leaves this file, the
 * pairing (and the TRANSPORT_OWNER skip in the allowlist describe below)
 * moves with it. */
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
 *
 * Scoped to the enclosing block, not to the file. A file-global alias would
 * promote every `send`/`fetch`/`request` in it to "transport", and those
 * names are common enough that the scan would start reporting calls that
 * never touch the wire. The brace count is crude, but this file is a guard:
 * a crude scope that cannot over-reach beats a precise one nobody reads.
 */
function transportNamesIn(lines: string[], line: number): string[] {
    const names = new Set(DISPATCH_PRIMITIVES);
    // `this.signedRequest` is covered by the general form — `this` is an
    // ordinary identifier — so there is no `this\.` alternative to pair with
    // it. Two ways to match the same text is what makes a repeated group
    // backtrack, and this one runs over every source file in `src/`.
    const alias =
        /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:[A-Za-z_$][\w$]*\.)*(?:signedRequest|exchangeSignedFetch|appFetch)\b/;

    // Walk back to the start of the enclosing block, counting braces. A
    // binding cannot reach past the block it was declared in, so neither may
    // the name it introduces.
    let depth = 0;
    let start = 0;
    for (let i = line - 1; i >= 0; i--) {
        for (const ch of lines[i]) {
            if (ch === "}") depth++;
            else if (ch === "{") {
                if (depth === 0) {
                    start = i;
                    break;
                }
                depth--;
            }
        }
        if (depth === 0 && start > 0) break;
        if (depth > 0) continue;
        start = i;
    }

    for (let i = start; i <= line; i++) {
        const match = alias.exec(lines[i]);
        if (match && !DISPATCH_PRIMITIVES.includes(match[1])) names.add(match[1]);
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

    for (let i = 0; i < lines.length; i++) {
        const names = transportNamesIn(lines, i)
            .map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
            // Longest first, so `signedRequest` is not shadowed by a shorter
            // alias that happens to be a prefix of it.
            .sort((a, b) => b.length - a.length)
            .join("|");
        const callSite = new RegExp(`\\b(?:${names})\\s*(?:<[^>]*>)?\\s*\\(`);
        const call = callSite.exec(lines[i]);
        if (!call) continue;

        // A call's payload can span many lines; look ahead far enough to
        // cover the longest one in the codebase (modifyOrder's).
        const window = lines.slice(i, i + 30).join("\n");
        const action = MUTATING_ACTIONS.find(
            (a) => window.includes(`"${a}"`) || window.includes(`'${a}'`),
        );
        if (!action) continue;

        // A gated call passes the pass through alongside the payload. The
        // search is anchored at this call and stops at its closing paren,
        // because a `pass` belonging to some other call further down the
        // window says nothing about this one — and with the primitive list
        // this broad, "somewhere in 30 lines" matched 10% of all call sites.
        const tail = lines.slice(i, i + 30).join("\n");
        const args = argumentText(tail);
        if (/(?:^|[^A-Za-z0-9_$])pass(?:[^A-Za-z0-9_$]|$)/.test(args)) continue;

        found.push({ file, line: i + 1, excerpt: lines[i].trim() });
    }
    return found;
}

/**
 * The argument text of the call opening on the first line of `source`,
 * closing paren included.
 *
 * String and template literals are copied through with their contents
 * skipped, so a `)` inside a payload does not end the argument list early.
 */
function argumentText(source: string): string {
    let depth = 0;
    let quote: string | null = null;
    for (let i = 0; i < source.length; i++) {
        const ch = source[i];
        if (quote) {
            if (ch === "\\") i++;
            else if (ch === quote) quote = null;
            continue;
        }
        if (ch === '"' || ch === "'" || ch === "`") quote = ch;
        else if (ch === "(") depth++;
        else if (ch === ")" && --depth === 0) return source.slice(0, i + 1);
    }
    return source;
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
            // Compared as a path, not as a directory name. Skipping by name
            // means any future `src/services/foo/tests/` holding a production
            // file would be skipped silently — the same unexamined-region
            // shape the seam inventory was closed for.
            if (
                entry.name === "node_modules" ||
                full === path.join(SRC, "tests")
            ) {
                continue;
            }
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

    // A file-global alias would promote every `send` in the file. These two
    // functions share a name and share nothing else, which is exactly the
    // shape that made a file-wide scope unusable: the second call mentions a
    // mutating action and must still be left alone, because that block's
    // `send` is an analytics serialiser.
    it("does not carry an alias out of the block that declared it", () => {
        const source = `
            function bypass(ports) {
                const send = ports.signedRequest;
                return send("/api/orders", { action: "place-order", symbol: "BTCUSDT" });
            }
            function unrelated(analytics) {
                const send = analytics.serialize;
                return send({ action: "place-order", note: "an analytics label, not an order" });
            }
        `;
        const found = findBypasses(source, "synthetic.ts");
        expect(found).toHaveLength(1);
        expect(found[0].line).toBe(4);
    });

    it("still catches the alias inside its own block", () => {
        const source = `
            function sneaky(ports) {
                const send = ports.signedRequest;
                return send("/api/orders", { action: "place-order", symbol: "BTCUSDT" });
            }
        `;
        expect(findBypasses(source, "synthetic.ts")).toHaveLength(1);
    });

    // A `pass` belonging to a different call says nothing about this one. With
    // three primitives this window matched 10% of all call sites, and each of
    // those was a bypass the scan would have silently skipped — the gate below
    // is what the window-based check mistook for an approval.
    it("does not accept a later call's pass as a gate on an earlier one", () => {
        const source = `
            async function bypass(ports) {
                await ports.signedRequest("/api/orders", { action: "close-position" });
            }
            async function gated(intent, ports) {
                return orderGate.submit(intent, (pass) =>
                    ports.signedRequest("/api/orders", { action: "place-order" }, pass),
                );
            }
        `;
        const found = findBypasses(source, "synthetic.ts");
        expect(found).toHaveLength(1);
        expect(found[0].line).toBe(3);
    });

    it("reads a pass past a closing paren inside a payload", () => {
        // The payload's own parentheses must not end the argument list, or a
        // trailing `pass` would fall outside it and look ungated.
        const gated = `
            return orderGate.submit(intent, (pass) =>
                appFetch("/api/orders", {
                    method: "POST",
                    body: JSON.stringify({ action: "place-order" }),
                }, pass),
            );
        `;
        expect(findBypasses(gated, "synthetic.ts")).toEqual([]);
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

describe("FEAT-0068 — ungated envelope paths are allowlisted, not invisible", () => {
    /**
     * Every `cachyPath` that may reach `exchangeSignedFetch` without a gate
     * pass, with the reason. Reads need no pass; the one write lane
     * (`/api/account-settings`) carries none by construction — no orders, so
     * no pass exists — and refuses in paper mode at the port instead (see
     * the module doc in `trade/accountSettings.ts`).
     *
     * The gate scanner above still flags known mutating actions on ANY path,
     * including these — this list only closes the other direction: a path
     * nobody justified fails here until it is. Documented rest gap: an
     * ungated write with a previously unknown action string over an
     * allowlisted path stays dark, because the scanner cannot know an action
     * it has never seen mutates.
     */
    const UNGATED_ENVELOPE_ALLOWLIST: Record<string, string> = {
        "/api/account-settings":
            "FEAT-0068 account writes (leverage, margin mode, position mode). No orders by construction.",
        "/api/leverage-margin-mode": "Read: live leverage/margin-mode for the account chip.",
        "/api/account": "Read: account snapshot, position mode, verification claim.",
        "/api/balance": "Read: balance snapshot.",
        "/api/positions": "Read: open-positions snapshot.",
        "/api/orders":
            "Read: pending-order list and order detail (type: pending / order-detail). Placements go through the transport with a pass.",
        "/api/sync": "Read: fills sample for the sync backend. Not exchange state.",
        "/api/sync/orders": "Write to the sync backend (order import), not exchange state. No gate pass by design.",
        "/api/sync/positions-pending": "Sync-backend pending-positions import, not exchange state.",
        "/api/sync/positions-history": "Read: positions-history import.",
    };

    it("sends no ungated envelope call to a path nobody justified", () => {
        const unlisted: Bypass[] = [];
        for (const file of sourceFiles()) {
            const relative = path.relative(REPO_ROOT, file);
            // The transport fans every gated call out through one
            // variable-path call (`cachyPath: routeUrl`) that carries no
            // literal and no pass token — the pass is checked by
            // assertGatePass before, not sent alongside. The gatedRequest
            // assertion above owns that file; a new ungated direct call
            // inside it with a known action still fails there.
            if (relative === TRANSPORT_OWNER) continue;
            const text = readFileSync(file, "utf8");
            const lines = text.split("\n");
            // Local aliases of the primitive (`const send = exchangeSignedFetch`)
            // reach the same envelope without naming it at the call site.
            // File-scoped (not block-scoped like the gate scan above): alias
            // names are rare enough that overreach is the smaller risk here.
            const aliases = new Set<string>();
            for (const line of lines) {
                const binding = line.match(
                    /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:[A-Za-z_$][\w$]*\.)*exchangeSignedFetch\b/,
                );
                if (binding && binding[1] !== "exchangeSignedFetch") aliases.add(binding[1]);
            }
            const sitePattern = new RegExp(
                `\\b(?:exchangeSignedFetch${[...aliases].map((a) => `|${a}`).join("")})\\s*(?:<[^>]*>)?\\s*\\(`,
            );
            for (let i = 0; i < lines.length; i++) {
                if (!sitePattern.test(lines[i])) continue;
                // The primitive's own definition, not a call site.
                if (/function\s+exchangeSignedFetch/.test(lines[i])) continue;
                const tail = lines.slice(i, i + 30).join("\n");
                const args = argumentText(tail);
                if (/(?:^|[^A-Za-z0-9_$])pass(?:[^A-Za-z0-9_$]|$)/.test(args)) continue;
                // Either quote style; a query suffix addresses the same
                // route, so it looks up by its bare path.
                const rawPath = tail.match(/cachyPath:\s*["']([^"']+)["']/)?.[1];
                const cachyPath = rawPath?.split("?")[0];
                if (!cachyPath || !(cachyPath in UNGATED_ENVELOPE_ALLOWLIST)) {
                    unlisted.push({ file: relative, line: i + 1, excerpt: lines[i].trim() });
                }
            }
        }
        expect(
            unlisted,
            `Ungated envelope call(s) to unjustified path(s) — allowlist with rationale or gate:\n${unlisted
                .map((b) => `  ${b.file}:${b.line}  ${b.excerpt}`)
                .join("\n")}`,
        ).toEqual([]);
    });

    it("closes the write lane to exactly the four declared account actions", async () => {
        // The path test above cannot see *what* travels an allowlisted path:
        // an order-like write under a previously unknown action string would
        // pass it. This pins the other half — the payload contract is a
        // closed enum, validated before dispatch on the client
        // (`accountSettingRequest`) and again on the route, so a smuggled
        // action fails closed instead of travelling.
        const { AccountSettingsRequestSchema } = await import(
            "../../types/accountSettingsSchemas"
        );

        // Exact inventory: a fifth action fails here until it is justified.
        // Reads `.def` (public in Zod 4); a Zod major bump that moves it
        // fails loudly here rather than silently.
        const declared = AccountSettingsRequestSchema.options
            .map(
                (option) =>
                    (
                        (option as unknown as { shape: { type: unknown } })
                            .shape.type as unknown as { def: { values: string[] } }
                    ).def.values,
            )
            .flat()
            .sort();
        expect(declared).toEqual([
            "adjust-position-margin",
            "change-leverage",
            "change-margin-mode",
            "change-position-mode",
        ]);

        // The four declared actions validate; everything else — including
        // order actions routed through the write lane — does not.
        const valid = [
            { type: "change-leverage", exchange: "bitunix", symbol: "BTCUSDT", leverage: 10 },
            { type: "change-margin-mode", exchange: "bitunix", symbol: "BTCUSDT", marginMode: "CROSS" },
            { type: "change-position-mode", exchange: "bitunix", positionMode: "HEDGE" },
            { type: "adjust-position-margin", exchange: "bitunix", symbol: "BTCUSDT", amount: "10" },
        ];
        for (const payload of valid) {
            expect(
                AccountSettingsRequestSchema.safeParse(payload).success,
                `${payload.type} must stay accepted`,
            ).toBe(true);
        }
        for (const type of ["place-order", "close-position", "set-leverage", "change-leverage-2", ""]) {
            expect(
                AccountSettingsRequestSchema.safeParse({ type, exchange: "bitunix" }).success,
                `${type || "(empty)"} must stay rejected`,
            ).toBe(false);
        }
    });
});
