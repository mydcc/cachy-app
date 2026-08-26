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
 * FEAT-0016, first acceptance criterion:
 *
 *   "No component, store or calculation file imports an exchange-specific
 *    module — asserted by a lint rule or an import test."
 *
 * This is that test. It reads imports rather than behaviour, because the
 * point is not that today's code happens to call the right thing: it is that
 * the next component cannot quietly reach past the adapter. A venue named in
 * a component is how BUG-0001 got written — one shared function reading one
 * exchange's field names while both exchanges called it.
 *
 * The scanner is exercised against synthetic violating and compliant sources
 * in the same run, so a scanner that stopped matching fails here instead of
 * passing vacuously.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const SRC = path.join(REPO_ROOT, "src");

/**
 * The layers that must not know which exchange they are talking to.
 *
 * `src/services` is deliberately absent: the adapters live there, and so do
 * the venue implementations they wrap. The boundary is between those services
 * and everything that consumes them.
 */
const GUARDED_ROOTS = ["components", "stores", "lib"];

/**
 * Server-side code under `src/lib` speaks venue dialects by definition — it is
 * the gateway half of the split (see `services/exchange/types.ts`). SpacetimeDB
 * bindings are generated.
 */
const EXEMPT_PREFIXES = [
    path.join("src", "lib", "server"),
    path.join("src", "lib", "spacetimedb"),
];

/** Module specifiers that name one venue. Matched on the import path's tail. */
const VENUE_MODULES = [
    "services/bitunixWs",
    "services/bitgetWs",
    "services/tradeService",
    "types/bitunix",
    "types/bitget",
    "utils/server/bitunix",
    "utils/server/bitget",
];

/**
 * Venue-named functions on otherwise shared services. An import of
 * `apiService` is not itself a boundary breach — `fetchBitunixKlines` is,
 * because it hardcodes the venue at the call site the way
 * `stores/ai.svelte.ts` did before FEAT-0016.
 */
const VENUE_CALLS = /\.fetch(Bitunix|Bitget)[A-Za-z]*\s*\(/;

interface Breach {
    file: string;
    line: number;
    excerpt: string;
}

/** Reads the tail of every `import ... from "<specifier>"` in a source file. */
function findBreaches(source: string, file: string): Breach[] {
    const found: Breach[] = [];
    const lines = source.split("\n");

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        const specifier = line.match(/\bfrom\s+["']([^"']+)["']/);
        if (specifier) {
            // Normalise "../../services/bitunixWs" to "services/bitunixWs".
            const tail = specifier[1].replace(/^[./]+/, "").replace(/\.(ts|js|svelte)$/, "");
            if (VENUE_MODULES.some((m) => tail === m || tail.startsWith(`${m}/`))) {
                found.push({ file, line: i + 1, excerpt: line.trim() });
                continue;
            }
        }

        if (VENUE_CALLS.test(line)) {
            found.push({ file, line: i + 1, excerpt: line.trim() });
        }
    }
    return found;
}

/** Every shipped source file in the guarded layers — tests and benchmarks excluded. */
function guardedFiles(): string[] {
    const found: string[] = [];

    const walk = (dir: string) => {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name);
            const relative = path.relative(REPO_ROOT, full);
            if (EXEMPT_PREFIXES.some((p) => relative.startsWith(p))) continue;
            if (entry.isDirectory()) {
                walk(full);
                continue;
            }
            if (!/\.(ts|svelte)$/.test(entry.name)) continue;
            if (/\.(test|bench|spec)\.ts$/.test(entry.name)) continue;
            found.push(full);
        }
    };

    for (const root of GUARDED_ROOTS) {
        const dir = path.join(SRC, root);
        if (existsSync(dir)) walk(dir);
    }
    return found;
}

describe("FEAT-0016 — components, stores and calculations go through the adapter", () => {
    it("finds no exchange-specific import or call in the guarded layers", () => {
        const files = guardedFiles();
        expect(files.length).toBeGreaterThan(100); // the scan actually ran

        const breaches: Breach[] = [];
        for (const file of files) {
            breaches.push(...findBreaches(readFileSync(file, "utf8"), path.relative(REPO_ROOT, file)));
        }

        expect(
            breaches,
            `Exchange-specific reference(s) outside the adapter:\n${breaches
                .map((b) => `  ${b.file}:${b.line}  ${b.excerpt}`)
                .join("\n")}\n\nImport from "services/exchange" instead.`,
        ).toEqual([]);
    });

    it("flags a component importing a venue's WebSocket service", () => {
        const violating = `
            import { tradeState } from "../../stores/trade.svelte";
            import { bitunixWs } from "../../services/bitunixWs";
        `;
        const found = findBreaches(violating, "synthetic.svelte");
        expect(found).toHaveLength(1);
        expect(found[0].line).toBe(3);
    });

    it("flags a venue-named fetch on a shared service", () => {
        const violating = `const klines = await apiService.fetchBitunixKlines(symbol, "1h", 200);`;
        expect(findBreaches(violating, "synthetic.ts")).toHaveLength(1);
    });

    it("flags a venue type import even when it is type-only", () => {
        const violating = `import type { NormalizedOrder } from "../../types/bitunix";`;
        expect(findBreaches(violating, "synthetic.svelte")).toHaveLength(1);
    });

    it("does not flag the adapter-shaped equivalents", () => {
        const compliant = `
            import { activeExchange, type TpSlOrder } from "../../services/exchange";
            import type { NormalizedOrder } from "../../types/exchange";
            const klines = await activeExchange().marketData.fetchKlines(symbol, "1h", 200);
            const orders = await activeExchange().trading.fetchTpSlOrders("pending");
        `;
        expect(findBreaches(compliant, "synthetic.svelte")).toEqual([]);
    });

    it("keeps its venue-module list in step with what the adapters wrap", async () => {
        // Every module the list names must exist; a rename that left the list
        // behind would silently stop guarding that module.
        for (const module of VENUE_MODULES) {
            const candidates = [`${module}.ts`, module];
            expect(
                candidates.some((c) => existsSync(path.join(SRC, c))),
                `${module} is guarded but no longer exists — update VENUE_MODULES`,
            ).toBe(true);
        }
    });
});

/*
 * FEAT-0227, first acceptance criterion:
 *
 *   "Each adapter opens, holds and closes its own socket; no consumer and no
 *    shared file references `bitunixWs` or `bitgetWs`."
 *
 * The scan above exempts `src/services` wholesale, because the adapters and
 * the venue implementations both live there. This narrows that exemption to
 * what it should be: inside services, only a venue's own adapter may name its
 * socket. `subscriptionRegistry` naming `bitunixWs` is how the registry came
 * to know Bitunix was the special one, and nothing stopped it.
 */

/** The only files allowed to import a venue's WebSocket service. */
const SOCKET_OWNERS = [
    path.join("src", "services", "exchange", "bitunixAdapter.ts"),
    path.join("src", "services", "exchange", "bitgetAdapter.ts"),
    // FEAT-0018's harness drives the transport directly, on purpose and with
    // `@ts-expect-error` at each visibility bypass, so the conformance suite
    // can open and close real sockets without branching on `adapter.id`.
    path.join("src", "services", "exchange", "adapterConformance.harness.ts"),
];

/*
 * Matched as a path *segment*, not as a prefix. A file inside `src/services`
 * imports its sibling as "../bitunixWs", which normalises to a bare
 * "bitunixWs" — a list of "services/bitunixWs" would have missed exactly the
 * import this guard exists to catch, which is what the scanner self-tests
 * below are for.
 */
const SOCKET_MODULES = ["bitunixWs", "bitgetWs"];

/** Every shipped file under `src/services`, tests and benchmarks excluded. */
function serviceFiles(): string[] {
    const found: string[] = [];
    const walk = (dir: string) => {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                walk(full);
                continue;
            }
            if (!/\.ts$/.test(entry.name)) continue;
            if (/\.(test|bench|spec)\.ts$/.test(entry.name)) continue;
            found.push(full);
        }
    };
    walk(path.join(SRC, "services"));
    return found;
}

/** Imports of a venue socket module, ignoring the venue's own service files. */
function findSocketImports(source: string, file: string): Breach[] {
    const found: Breach[] = [];
    const lines = source.split("\n");
    for (let i = 0; i < lines.length; i++) {
        const specifier = lines[i].match(/\bfrom\s+["']([^"']+)["']/);
        if (!specifier) continue;
        const tail = specifier[1].replace(/^[./]+/, "").replace(/\.(ts|js)$/, "");
        const segments = tail.split("/");
        if (SOCKET_MODULES.some((m) => segments.includes(m))) {
            found.push({ file, line: i + 1, excerpt: lines[i].trim() });
        }
    }
    return found;
}

describe("FEAT-0227 — the adapter owns its socket", () => {
    it("lets nothing but a venue's own adapter import its WebSocket service", () => {
        const files = serviceFiles();
        expect(files.length).toBeGreaterThan(20); // the scan actually ran

        const breaches: Breach[] = [];
        for (const file of files) {
            const relative = path.relative(REPO_ROOT, file);
            // A venue's own service files may of course name themselves.
            if (relative.includes(`${path.sep}bitunixWs`) || relative.includes(`${path.sep}bitgetWs`)) {
                continue;
            }
            if (SOCKET_OWNERS.includes(relative)) continue;
            breaches.push(...findSocketImports(readFileSync(file, "utf8"), relative));
        }

        expect(
            breaches,
            `Venue WebSocket service imported outside its adapter:\n${breaches
                .map((b) => `  ${b.file}:${b.line}  ${b.excerpt}`)
                .join("\n")}\n\nGo through "services/exchange" — the adapter owns the socket (FEAT-0227).`,
        ).toEqual([]);
    });

    it("flags the import subscriptionRegistry used to have", () => {
        // The exact line that was in subscriptionRegistry.ts before FEAT-0227.
        const violating = `import { bitunixWs } from "../bitunixWs";`;
        expect(findSocketImports(violating, "synthetic.ts")).toHaveLength(1);
    });

    it("flags a venue socket import however it is spelled", () => {
        for (const specifier of [
            "../bitunixWs",
            "./bitgetWs",
            "../../services/bitunixWs",
            "../bitunixWs/channelDispatch",
            "$lib/../services/bitgetWs.ts",
        ]) {
            expect(
                findSocketImports(`import { x } from "${specifier}";`, "synthetic.ts"),
                `${specifier} was not flagged`,
            ).toHaveLength(1);
        }
    });

    it("does not flag the adapter-shaped equivalent", () => {
        const compliant = `
            import { activeExchange } from "../exchange";
            import { SubscriptionLedger } from "../exchange/subscriptionLedger";
        `;
        expect(findSocketImports(compliant, "synthetic.ts")).toEqual([]);
    });

    it("keeps its owner list honest", () => {
        // A renamed or deleted owner must fail here rather than silently
        // widening the exemption to nothing.
        for (const owner of SOCKET_OWNERS) {
            expect(
                existsSync(path.join(REPO_ROOT, owner)),
                `${owner} is exempted but no longer exists — update SOCKET_OWNERS`,
            ).toBe(true);
        }
    });
});
