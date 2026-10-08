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

// Hoisted to module scope so the per-line scan does not recompile them per
// call (hundreds of thousands of constructions over a whole-`src/` run).
// They MUST stay `/g`-free: the block matcher below clones them into global
// copies for `matchAll`, and a shared global regex would carry `lastIndex`
// state across calls.
const PRIMITIVE_ALTERNATION = "(?:signedRequest|exchangeSignedFetch|appFetch)";
const IDENT = "[A-Za-z_$][\\w$]*";
// Module-scope global copies for `matchAll` (the per-line scan must not
// recompile them per call). Sharing a `/g` regex is safe here: `matchAll`
// never advances the *passed* object's `lastIndex` (it clones internally),
// and nothing in this file `.exec`s or `.test`s them.
const PLAIN_ALIAS_G = new RegExp(
    `(?:const|let|var)\\s+(${IDENT})\\s*=\\s*([\\w$\\s?.\\[\\]"']{0,120}?)\\b${PRIMITIVE_ALTERNATION}\\b`,
    "g",
);
const DESTRUCTURE_PAIR_G = new RegExp(
    `${PRIMITIVE_ALTERNATION}\\s*:\\s*(${IDENT})`,
    "g",
);
const PARAM_FUNCTION_G = /function\s+[A-Za-z_$][\w$]*\s*\(([^()]*)\)/g;
const PARAM_ARROW_G = /\(\s*\{([^}]*)\}\s*\)\s*=>/g;

/**
 * Every `{…}` group in the text that is followed by `=`, with the index just
 * past its closing brace (the binding takes effect on that line). Brace-
 * balanced in code (linear), not by regex: a lazy `\{.*?\}=` re-scans from
 * every payload object in the block (quadratic), and a bounded `[^}]*` cannot
 * see a Prettier-split destructure. Only `{…} =` positions can be
 * destructuring bindings — an object literal passed as a call argument is
 * followed by `)` or `,`, never `=`.
 */
function destructureGroups(text: string): { content: string; end: number }[] {
    const groups: { content: string; end: number }[] = [];
    for (let i = 0; i < text.length; i++) {
        if (text[i] !== "{") continue;
        let depth = 0;
        let j = i;
        for (; j < text.length; j++) {
            if (text[j] === "{") depth++;
            else if (text[j] === "}") {
                depth--;
                if (depth === 0) break;
            }
        }
        // Unbalanced tail: a later `{` may still form a valid group, so skip
        // this one instead of aborting the whole scan. Note there is
        // deliberately no `i = j` jump past a balanced group: on a whole
        // file the first `{` is the outer scope, and jumping would skip every
        // binding inside it. Groups nest rarely and files are kilobytes, so
        // the re-scan costs nothing; correctness first.
        if (depth !== 0) continue;
        let k = j + 1;
        while (k < text.length && /\s/.test(text[k])) k++;
        if (text[k] === "=") groups.push({ content: text.slice(i + 1, j), end: j });
    }
    return groups;
}

interface FileBindings {
    /** `lineOf` maps a match index to its 0-based line. */
    lineOf: (index: number) => number;
    plain: { name: string; line: number }[];
    destructurePairs: { name: string; line: number }[];
    params: { name: string; line: number }[];
    hops: { name: string; rhs: string; line: number }[];
}

/**
 * All alias bindings of one file, computed once. Per-line resolution then
 * filters by the call's enclosing block instead of re-scanning text — the
 * whole-`src/` scan stays in seconds. Semantics match the old per-line
 * matcher exactly: a binding counts for a call iff its line lies inside the
 * call's enclosing block slice.
 */
function collectBindings(source: string): FileBindings {
    const lineStarts: number[] = [0];
    for (let i = 0; i < source.length; i++) {
        if (source[i] === "\n") lineStarts.push(i + 1);
    }
    const lineOf = (index: number): number => {
        let lo = 0;
        let hi = lineStarts.length - 1;
        while (lo < hi) {
            const mid = (lo + hi + 1) >> 1;
            if (lineStarts[mid] <= index) lo = mid;
            else hi = mid - 1;
        }
        return lo;
    };
    const plain: FileBindings["plain"] = [];
    const destructurePairs: FileBindings["destructurePairs"] = [];
    const params: FileBindings["params"] = [];
    const hops: FileBindings["hops"] = [];

    for (const match of source.matchAll(PLAIN_ALIAS_G)) {
        // See `transportNamesIn`: the text between `=` and the primitive must
        // end in an access (`.`, `?.`, `[`, `["`, `['`), otherwise it is data
        // that happens to name a primitive (string literal, call result).
        const prefix = (match[2] ?? "").trimEnd();
        if (
            prefix === "" ||
            prefix.endsWith(".") ||
            prefix.endsWith("?.") ||
            prefix.endsWith("[") ||
            prefix.endsWith('["') ||
            prefix.endsWith("['")
        ) {
            if (match[1] && !DISPATCH_PRIMITIVES.includes(match[1])) {
                plain.push({ name: match[1], line: lineOf(match.index ?? 0) });
            }
        }
    }
    for (const group of destructureGroups(source)) {
        const line = lineOf(group.end);
        for (const pair of group.content.matchAll(DESTRUCTURE_PAIR_G)) {
            if (pair[1] && !DISPATCH_PRIMITIVES.includes(pair[1])) {
                destructurePairs.push({ name: pair[1], line });
            }
        }
    }
    const collectParams = (text: string, baseIndex: number) => {
        for (const pair of text.matchAll(DESTRUCTURE_PAIR_G)) {
            if (pair[1] && !DISPATCH_PRIMITIVES.includes(pair[1])) {
                params.push({ name: pair[1], line: lineOf(baseIndex) });
            }
        }
    };
    for (const m of source.matchAll(PARAM_FUNCTION_G)) {
        collectParams(m[1], m.index ?? 0);
    }
    for (const m of source.matchAll(PARAM_ARROW_G)) {
        collectParams(m[1], m.index ?? 0);
    }
    // Transitive hops (`const s2 = s1`) are resolved per call against the
    // names known there (fixpoint); collection only records candidates.
    // The right-hand side must be a bare identifier — a longer access would
    // be its own (non-)binding, and the negative lookahead keeps
    // `= known.prop` (a value, not the transport) out.
    const hopPattern = new RegExp(
        `(?:const|let|var|,)\\s+(${IDENT})\\s*=\\s*(${IDENT})\\b(?!\\s*[\\w$]*\\s*\\.)`,
        "g",
    );
    for (const m of source.matchAll(hopPattern)) {
        if (m[1]) hops.push({ name: m[1], rhs: m[2], line: lineOf(m.index ?? 0) });
    }
    return { lineOf, plain, destructurePairs, params, hops };
}

/**
 * Local `exchangeSignedFetch` bindings of one file, for the envelope
 * allowlist scan below. File-scoped (not block-scoped like the gate scan):
 * alias names are rare enough that overreach is the smaller risk here.
 * Every spelling the gate scanner resolves has its mirror here — a hole in
 * one scanner and not the other is how the same bypass class survived twice.
 */
function envelopeAliases(text: string): string[] {
    const ESEF = "(?:exchangeSignedFetch)";
    const names = new Set<string>();
    const plain = new RegExp(
        `(?:const|let|var)\\s+(${IDENT})\\s*=\\s*([\\w$\\s?.\\[\\]"']{0,120}?)\\b${ESEF}\\b`,
        "g",
    );
    for (const match of text.matchAll(plain)) {
        const prefix = (match[2] ?? "").trimEnd();
        if (
            prefix === "" ||
            prefix.endsWith(".") ||
            prefix.endsWith("?.") ||
            prefix.endsWith("[") ||
            prefix.endsWith('["') ||
            prefix.endsWith("['")
        ) {
            if (match[1] !== "exchangeSignedFetch") names.add(match[1]);
        }
    }
    const pair = new RegExp(`${ESEF}\\s*:\\s*(${IDENT})`, "g");
    for (const group of destructureGroups(text)) {
        for (const m of group.content.matchAll(pair)) {
            if (m[1] !== "exchangeSignedFetch") names.add(m[1]);
        }
    }
    for (const m of text.matchAll(/import\s*\{([^}]*)\}\s*from/g)) {
        const asPair = new RegExp(`${ESEF}\\s+as\\s+(${IDENT})`, "g");
        for (const p of m[1].matchAll(asPair)) {
            if (p[1] !== "exchangeSignedFetch") names.add(p[1]);
        }
    }
    for (const m of text.matchAll(PARAM_FUNCTION_G)) {
        for (const p of m[1].matchAll(pair)) {
            if (p[1] !== "exchangeSignedFetch") names.add(p[1]);
        }
    }
    for (const m of text.matchAll(PARAM_ARROW_G)) {
        for (const p of m[1].matchAll(pair)) {
            if (p[1] !== "exchangeSignedFetch") names.add(p[1]);
        }
    }
    const hop = new RegExp(
        `(?:const|let|var|,)\\s+(${IDENT})\\s*=\\s*(${IDENT})\\b(?!\\s*[\\w$]*\\s*\\.)`,
        "g",
    );
    const candidates: { name: string; rhs: string }[] = [];
    for (const m of text.matchAll(hop)) {
        candidates.push({ name: m[1], rhs: m[2] });
    }
    for (let pass = 0; pass < 10; pass++) {
        const size = names.size;
        for (const c of candidates) {
            if (c.rhs === "exchangeSignedFetch" || names.has(c.rhs)) {
                if (c.name !== "exchangeSignedFetch") names.add(c.name);
            }
        }
        if (names.size === size) break;
    }
    return [...names];
}

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
function transportNamesIn(
    lines: string[],
    line: number,
    importAliases: string[] = [],
    bindings?: FileBindings,
    blockStart?: number,
): string[] {
    const names = new Set<string>([...DISPATCH_PRIMITIVES, ...importAliases]);

    // Start of the enclosing block: precomputed per file by `findBypasses`
    // (forward brace scan, linear). The fallback below is the same scan
    // backwards, kept for direct unit use.
    let start = blockStart ?? -1;
    if (start < 0) {
        let depth = 0;
        start = 0;
        for (let i = line - 1; i >= 0; i--) {
            const text = lines[i];
            for (let k = text.length - 1; k >= 0; k--) {
                const ch = text[k];
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
        }
    }

    // Bindings come from the file-level collection (`collectBindings`, run
    // once per file): a binding counts iff its line lies inside this call's
    // enclosing slice. The transitive fixpoint runs over the same slice, so
    // an alias bound in an *outer* block stays invisible here, exactly as the
    // old per-line matcher behaved.
    if (bindings) {
        const inSlice = (bindingLine: number) =>
            bindingLine >= start && bindingLine <= line;
        for (const b of bindings.plain) {
            if (inSlice(b.line)) names.add(b.name);
        }
        for (const b of bindings.destructurePairs) {
            if (inSlice(b.line)) names.add(b.name);
        }
        for (const b of bindings.params) {
            if (inSlice(b.line)) names.add(b.name);
        }
        for (let pass = 0; pass < 10; pass++) {
            const size = names.size;
            for (const hop of bindings.hops) {
                if (inSlice(hop.line) && names.has(hop.rhs)) names.add(hop.name);
            }
            if (names.size === size) break;
        }
        return [...names];
    }

    // Fallback without a collection (kept for direct unit use): match over
    // the joined slice. Slower per call; the repo-wide scan always passes
    // `bindings`.
    const block = lines.slice(start, line + 1).join("\n");
    const paramLists: string[] = [];
    for (const m of block.matchAll(PARAM_FUNCTION_G)) {
        paramLists.push(m[1]);
    }
    for (const m of block.matchAll(PARAM_ARROW_G)) {
        paramLists.push(m[1]);
    }

    const addAll = (matches: IterableIterator<RegExpMatchArray>) => {
        for (const match of matches) {
            if (match[1] && !DISPATCH_PRIMITIVES.includes(match[1])) names.add(match[1]);
        }
    };
    for (const match of block.matchAll(PLAIN_ALIAS_G)) {
        // The text between `=` and the primitive must end in an access —
        // nothing (bare `= signedRequest`), `.`, `?.`, `[`, `["`, `['`.
        // Anything else is data that happens to name a primitive: a string
        // literal (`= "signedRequest"`), a call result (`= make("…")`), a
        // comment. The bracket form (`x["signedRequest"]`) ends in `["` and
        // passes here, so it needs no second pattern.
        const prefix = match[2].trimEnd();
        if (
            prefix === "" ||
            prefix.endsWith(".") ||
            prefix.endsWith("?.") ||
            prefix.endsWith("[") ||
            prefix.endsWith('["') ||
            prefix.endsWith("['")
        ) {
            if (!DISPATCH_PRIMITIVES.includes(match[1])) names.add(match[1]);
        }
    }
    for (const group of destructureGroups(block)) {
        // Every `{…} =` outside parameter lists is a declaration or an
        // assignment destructure (`f({a: b} = c)` is not valid syntax), so
        // both bind — and params are searched separately below.
        addAll(group.content.matchAll(DESTRUCTURE_PAIR_G));
    }
    for (const params of paramLists) {
        addAll(params.matchAll(DESTRUCTURE_PAIR_G));
    }

    // Transitive aliases: `const s2 = s1` where `s1` is already known. One
    // more hop outruns every literal-based pattern, so resolve to a fixpoint
    // (bounded: each pass must add at least one name, and names are finite).
    const knownAlternation = () =>
        `(?:${[...names].map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`;
    for (let pass = 0; pass < 10; pass++) {
        const size = names.size;
        const hop = new RegExp(
            `(?:const|let|var|,)\\s+(${IDENT})\\s*=\\s*${knownAlternation()}\\b(?!\\s*[\\w$]*\\s*\\.)`,
            "g",
        );
        addAll(block.matchAll(hop));
        if (names.size === size) break;
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

    // Import renames bind a transport with no `=` and no `key:` at all
    // (`import { appFetch as relay } from "…"`), and imports are file-scoped
    // by nature — so the alias is too. Collected once per file, not per line.
    const importAliases: string[] = [];
    for (const m of source.matchAll(/import\s*\{([^}]*)\}\s*from/g)) {
        const pairPattern = new RegExp(
            `${PRIMITIVE_ALTERNATION}\\s+as\\s+(${IDENT})`,
            "g",
        );
        for (const pair of m[1].matchAll(pairPattern)) {
            if (!DISPATCH_PRIMITIVES.includes(pair[1])) importAliases.push(pair[1]);
        }
    }
    // All other bindings likewise once per file (`collectBindings`); per-line
    // resolution only filters by the call's enclosing slice.
    const bindings = collectBindings(source);
    // Enclosing-block start per line, forward brace scan (linear for the
    // file). `starts[i]` is the innermost block open before line `i` — the
    // same line the backwards walk-back finds, since balanced pairs on older
    // lines cancel in both directions.
    const starts: number[] = new Array(lines.length);
    const openStack: number[] = [];
    for (let i = 0; i < lines.length; i++) {
        starts[i] = openStack.length > 0 ? openStack[openStack.length - 1] : 0;
        for (let k = 0; k < lines[i].length; k++) {
            const ch = lines[i][k];
            if (ch === "{") openStack.push(i);
            else if (ch === "}" && openStack.length > 0) openStack.pop();
        }
    }

    for (let i = 0; i < lines.length; i++) {
        const names = transportNamesIn(lines, i, importAliases, bindings, starts[i])
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

    // The same hole in the other spelling. `const { signedRequest: send } = ports`
    // never writes `= <primitive>`, so the alias pattern alone cannot bind
    // `send` to the transport, and the mutating order below reaches the wire
    // ungated with every other assertion in this file still green.
    it("flags a mutating order sent through a destructured transport alias", () => {
        const bypassing = `
            export async function sendIt(ports) {
                const { signedRequest: send } = ports;
                return send("/api/orders", { action: "place-order", symbol: "BTCUSDT" });
            }
        `;
        expect(findBypasses(bypassing, "synthetic.ts")).toHaveLength(1);
    });

    it("flags a mutating order through a destructured appFetch alias", () => {
        const bypassing = `
            export async function sendIt(ports) {
                const { appFetch: relay } = ports;
                return relay("/api/orders", { method: "POST", body: JSON.stringify({ action: "place-order" }) });
            }
        `;
        expect(findBypasses(bypassing, "synthetic.ts")).toHaveLength(1);
    });

    // Prettier splits long destructures across lines as a matter of course,
    // and the project's own flow mandates `prettier --write` — so this shape
    // can be produced by the project's own tooling, not by an adversary. A
    // per-line scan never sees `{...primitive: name}` whole.
    it("flags a mutating order through a multi-line destructured alias", () => {
        const bypassing = `
            export async function sendIt(ports) {
                const {
                    signedRequest: send,
                } = ports;
                return send("/api/orders", { action: "place-order", symbol: "BTCUSDT" });
            }
        `;
        expect(findBypasses(bypassing, "synthetic.ts")).toHaveLength(1);
    });

    // One `exec` per line binds at most one name; the second transport on the
    // same line stays an ordinary identifier and its mutating call walks
    // through. Two renames on one line are formatting, not obfuscation.
    it("flags mutating orders through both bindings of a two-rename line", () => {
        const bypassing = `
            export async function sendIt(ports) {
                const { signedRequest: a, appFetch: b } = ports;
                await a("/api/orders", { action: "place-order", symbol: "BTCUSDT" });
                return b("/api/orders", { method: "POST", body: JSON.stringify({ action: "place-order" }) });
            }
        `;
        expect(findBypasses(bypassing, "synthetic.ts")).toHaveLength(2);
    });

    // Parameters bind without `const/let/var`, so the declaration patterns
    // never fire — yet this is the first shape a ports-object refactor
    // produces.
    it("flags a mutating order through a destructured parameter", () => {
        const bypassing = `
            export async function sendIt({ signedRequest: send }) {
                return send("/api/orders", { action: "place-order", symbol: "BTCUSDT" });
            }
        `;
        expect(findBypasses(bypassing, "synthetic.ts")).toHaveLength(1);
    });

    // `appFetch` and `exchangeSignedFetch` are directly importable, so a
    // rename at the import binds a transport with no `=` and no `key:` at
    // all. Imports are file-scoped by nature, so the alias is too.
    it("flags a mutating order through an import alias", () => {
        const bypassing = `
            import { appFetch as relay } from "../lib/appAuth";
            export async function sendIt() {
                return relay("/api/orders", { method: "POST", body: JSON.stringify({ action: "place-order" }) });
            }
        `;
        expect(findBypasses(bypassing, "synthetic.ts")).toHaveLength(1);
    });

    // `?.` is idiomatic defensive access and `["…"]` a standard rewording;
    // the dotted-chain pattern sees neither.
    it("flags a mutating order through bracket and optional-chaining access", () => {
        const bypassing = `
            export async function sendIt(ports) {
                const a = ports["signedRequest"];
                const b = ports?.signedRequest;
                await a("/api/orders", { action: "place-order", symbol: "BTCUSDT" });
                return b("/api/orders", { action: "place-order", symbol: "BTCUSDT" });
            }
        `;
        expect(findBypasses(bypassing, "synthetic.ts")).toHaveLength(2);
    });

    // Both patterns require the primitive literal on the right-hand side, so
    // one more hop outruns them: the tested single hop extended by one line.
    it("flags a mutating order through an alias of an alias", () => {
        const bypassing = `
            export async function sendIt(ports) {
                const s1 = ports.signedRequest;
                const s2 = s1;
                return s2("/api/orders", { action: "place-order", symbol: "BTCUSDT" });
            }
        `;
        expect(findBypasses(bypassing, "synthetic.ts")).toHaveLength(1);
    });

    // The third primitive in renamed form — the file tests the other two,
    // and untested cells rot first.
    it("flags a mutating order through a destructured exchangeSignedFetch alias", () => {
        const bypassing = `
            export async function sendIt(cfg) {
                const { exchangeSignedFetch: send } = cfg;
                return send({ cachyPath: "/api/orders", payload: { action: "place-order" } });
            }
        `;
        expect(findBypasses(bypassing, "synthetic.ts")).toHaveLength(1);
    });

    // No rename needs no alias handling: the bare name is already in
    // `DISPATCH_PRIMITIVES`. Pinned explicitly so a future "tightening" of
    // that set cannot silently drop the shorthand form.
    it("still flags the shorthand destructure with no rename", () => {
        const bypassing = `
            export async function sendIt(ports) {
                const { signedRequest } = ports;
                return signedRequest("/api/orders", { action: "place-order", symbol: "BTCUSDT" });
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

    // Unit tests for `envelopeAliases` (defined above, next to
    // `transportNamesIn`): the repo-wide scan below cannot take synthetic
    // input, so its alias resolution is pinned here instead — every spelling
    // the gate scanner learned gets its envelope mirror.
    describe("envelopeAliases", () => {
        it("resolves the plain, destructured, import and transitive forms", () => {
            expect(
                envelopeAliases(`const send = exchangeSignedFetch;`),
            ).toEqual(["send"]);
            expect(
                envelopeAliases(`const { exchangeSignedFetch: send } = m;`),
            ).toEqual(["send"]);
            expect(
                envelopeAliases(
                    `import { exchangeSignedFetch as send } from "../utils/exchange/browserSigning";`,
                ),
            ).toEqual(["send"]);
            expect(
                envelopeAliases(
                    `const s1 = exchangeSignedFetch;\nconst s2 = s1;`,
                ).sort(),
            ).toEqual(["s1", "s2"]);
            expect(
                envelopeAliases(
                    `function f({ exchangeSignedFetch: send }) { return send; }`,
                ),
            ).toEqual(["send"]);
        });

        it("ignores other primitives and benign bindings", () => {
            // Envelope-scoped: a `signedRequest` alias is the *gate* scan's
            // property, not this one's.
            expect(envelopeAliases(`const { signedRequest: send } = p;`)).toEqual([]);
            expect(envelopeAliases(`const send = fetch;`)).toEqual([]);
            expect(envelopeAliases(`const send = "exchangeSignedFetch";`)).toEqual([]);
            expect(envelopeAliases(`no bindings here`)).toEqual([]);
        });
    });

    it("sends no ungated envelope call to a path nobody justified", () => {        const unlisted: Bypass[] = [];
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
            // Local aliases of the primitive (`const send = exchangeSignedFetch`
            // and every rewording `envelopeAliases` resolves) reach the same
            // envelope without naming it at the call site.
            const aliases = envelopeAliases(text);
            const sitePattern = new RegExp(
                `\\b(?:exchangeSignedFetch${aliases.map((a) => `|${a}`).join("")})\\s*(?:<[^>]*>)?\\s*\\(`,
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
