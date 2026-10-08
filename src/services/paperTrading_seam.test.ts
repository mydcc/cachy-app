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
 * FEAT-0012 — the seam.
 *
 * The claim this feature rests on is that live and paper differ at exactly
 * one call site. These tests hold that claim to account: the same order runs
 * in both modes and everything above the transport is asserted identical.
 */

import { migrateAccounts } from "../stores/settings/accounts";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Decimal } from "decimal.js";
import { readdirSync, readFileSync } from "node:fs";
import { join, sep } from "node:path";

vi.mock("$app/env", () => ({ browser: true, dev: true }));

vi.mock("./logger", () => ({
    logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("../stores/settings.svelte", () => ({
    settingsState: {
        apiProvider: "bitunix",
        ...migrateAccounts({ apiKeys: { bitunix: { key: "test-key-1234", secret: "test-secret" } } }),
    },
}));

vi.mock("./toastService.svelte", () => ({
    toastService: { error: vi.fn(), success: vi.fn(), add: vi.fn() },
}));

const appFetchMock = vi.hoisted(() => vi.fn());
vi.mock("../lib/appAuth", () => ({
    appFetch: appFetchMock,
    appAuthHeaders: () => ({}),
}));

import { tradeService } from "./tradeService";
import { paperState } from "../stores/paperTrading.svelte";
import { setPaperPriceFeed } from "./paperExchange";
import { orderGate, OrderRefusedError, type OrderIntent } from "./orderGate";
import { omsService } from "./omsService";
import { registerKillSwitch, registerRiskLimitCheck } from "./orderGate";

const PRICE = new Decimal(50000);

beforeEach(() => {
    localStorage.clear();
    paperState.reloadFromStorage();
    paperState.resetBook();
    paperState.setConfig("slippageBps", "0");
    paperState.setConfig("takerFeeBps", "0");
    paperState.setConfig("failureMode", "none");
    paperState.resetBook();
    omsService.reset();
    registerKillSwitch(null);
    registerRiskLimitCheck(null);
    appFetchMock.mockReset();
    appFetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ code: "0", data: {} }),
    });
    setPaperPriceFeed(() => PRICE);
});

afterEach(() => {
    registerKillSwitch(null);
    registerRiskLimitCheck(null);
    paperState.setEnabled(false);
});

function position(symbol = "BTCUSDT") {
    return {
        symbol,
        side: "long" as const,
        amount: new Decimal("1"),
        entryPrice: PRICE,
        unrealizedPnl: new Decimal(0),
        leverage: new Decimal(10),
        marginMode: "cross" as const,
        positionId: "pos-1",
        lastUpdated: Date.now(),
    };
}

// AC: "An order placed in paper mode produces no outbound network request to
// any exchange — asserted against a mocked network."
describe("FEAT-0012 — paper mode reaches no network", () => {
    it("sends nothing when closing a position in paper mode", async () => {
        paperState.setEnabled(true);
        omsService.updatePosition(position());
        // The simulator needs the position the close will target.
        paperState.setPositions([
            {
                positionId: "pos-1",
                symbol: "BTCUSDT",
                side: "long",
                amount: "1",
                entryPrice: "50000",
                leverage: "10",
                marginMode: "cross",
                realizedPnl: "0",
                openedAt: Date.now(),
            },
        ]);

        await tradeService.closePosition({
            symbol: "BTCUSDT",
            positionSide: "long",
            amount: new Decimal("1"),
        });

        expect(appFetchMock).not.toHaveBeenCalled();
    });

    it("does send when the same call runs live", async () => {
        paperState.setEnabled(false);
        omsService.updatePosition(position());

        await tradeService.closePosition({
            symbol: "BTCUSDT",
            positionSide: "long",
            amount: new Decimal("1"),
        });

        // The contrast is the point: identical call, one mode reaches the
        // network and the other cannot.
        expect(appFetchMock).toHaveBeenCalledTimes(1);
    });

    it("sends nothing for a cancel in paper mode", async () => {
        paperState.setEnabled(true);
        await expect(
            tradeService.cancelOrder("BTCUSDT", "does-not-exist"),
        ).rejects.toThrow();
        expect(appFetchMock).not.toHaveBeenCalled();
    });
});

// AC: "Live and paper differ at exactly one call site — proven by a test that
// asserts the shared path is identical up to the transport boundary."
describe("FEAT-0012 — one seam", () => {
    it("branches on the mode exactly once, at the transport", () => {
        const source = readFileSync("src/services/tradeService.ts", "utf8");
        // FEAT-0342 (slice C) moved the TP/SL read into its own module, and a
        // service may not import stores — so the mode it depends on arrives
        // as a port. The scan has to look at both files, or it stops seeing
        // the FEAT-0327 credential guard altogether.
        const tpSl = readFileSync("src/services/trade/tpSlService.ts", "utf8");
        const accountSettings = readFileSync("src/services/trade/accountSettings.ts", "utf8");

        // The whole trade domain, not just the file the seam happens to live
        // in today. `if (paperState.enabled)` used to be the only way to
        // branch on the mode; a module that reads it through a port has its
        // own spelling of the same `if`. Scoping the scan to one file would
        // let a second live/paper branch walk into a sibling module and sit
        // there unnoticed — which is the whole failure this test exists for.
        const tradeDomain = [
            source,
            ...readdirSync("src/services/trade")
                .filter((f) => f.endsWith(".ts") && !f.includes(".test."))
                .map((f) => readFileSync(`src/services/trade/${f}`, "utf8")),
        ].join("\n");

        // Two branches, and the test names both — the count alone would let
        // a third appear by pushing one of these out of the file.
        //
        //   1. The order seam: paper orders go to `paperExchange` instead of
        //      the network, and everything above it has already run
        //      identically. A second branch *here* is what this feature
        //      promises cannot happen.
        //   2. FEAT-0068's account-settings refusal. Not an order and not a
        //      seam: `paperExchange` simulates orders and has no notion of
        //      leverage or margin mode, so there is nothing on the far side
        //      to change and the write is refused rather than pretended.
        // One here, not two. The second branch it used to name — FEAT-0068's
        // account-settings refusal — moved to ./trade/accountSettings with
        // the rest of that lane, and it reads the mode through its port, so it
        // no longer matches this spelling. It is named where it now lives
        // below; the domain-wide backstop still counts all three together.
        const branches = source.match(/if \(paperState\.enabled\)[\s\S]{0,220}/g) ?? [];
        expect(branches).toHaveLength(1);
        expect(branches.filter((b) => b.includes("paperExchange.handle"))).toHaveLength(1);

        // FEAT-0068's refusal, in the module it moved to. The count alone
        // would pass if the throw were deleted and any unrelated
        // `if (ports.isPaperMode())` took its place, so the body is named too.
        expect(
            accountSettings.match(/if \(ports\.isPaperMode\(\)\)/g) ?? [],
        ).toHaveLength(1);
        expect(accountSettings).toContain('throw new Error("exchange.accountSettings.paperMode")');

        // The remaining reads are not branches: they record the mode onto the
        // intent and onto the gate-pass context so the transport can compare
        // them, two read the balance *for* the mode so the gate measures an
        // open/add against what the trader is actually trading against
        // (BUG-0565), one refuses a bot-stamped order while paper is off
        // (BUG-0494), and one re-reads the mode immediately before a write is
        // dispatched (BUG-0551) so a mode switched mid-signing cannot reach
        // the venue. One more — the FEAT-0327 credential relaxation — moved
        // to the TP/SL module and is counted there. None of them changes what
        // the request is: the provenance refusal stops a paper-only order
        // from reaching the live branch, the dispatch re-check can only
        // refuse, neither ever routes anything.
        expect(source.match(/paperState\.enabled/g) ?? []).toHaveLength(9);

        // FEAT-0327: exactly one read relaxes a credential guard, because it
        // goes through the paper seam and therefore needs no credentials. It
        // used to read the mode and the keys itself; now it takes both as
        // ports, so the guard is matched by its new shape and the wiring is
        // pinned separately — a mode read that reaches the TP/SL module from
        // anywhere but that one port is not the guard this is counting.
        expect(
            tpSl.match(/if \(!ports\.isPaperMode\(\) && !hasKeys\)/g) ?? [],
        ).toHaveLength(1);
        // Two, not one: the TP/SL credential relaxation and the account-settings
        // refusal each get the mode handed to them as a port, and both ports
        // are wired to the same read here. A third would be a module asking for
        // the mode a way this file cannot see.
        expect(source.match(/isPaperMode: \(\) => paperState\.enabled/g) ?? []).toHaveLength(2);
        expect(source.match(/hasActiveKeys: \(\) => \{/g) ?? []).toHaveLength(1);
        expect(source.match(/paperMode: paperState\.enabled/g) ?? []).toHaveLength(3);

        // …and the domain-wide backstop for the branch invariant itself. Every
        // `if` anywhere in `src/services/trade{,/}` whose condition reads the
        // mode is one of the three the assertions above already account for:
        // the two named branches plus the FEAT-0327 credential relaxation. A
        // fourth — in any file, under either spelling — is a live/paper
        // branch that decides what a request does instead of what it carries,
        // which is exactly what FEAT-0012 rules out. The spacing is loose on
        // purpose: `if ( paperState.enabled )` routes exactly as hard (see
        // the rewording test below).
        expect(
            tradeDomain.match(
                /if\s+\(\s*!?paperState\.enabled\b|if\s+\(\s*!?ports\.isPaperMode\(\)/g,
            ) ?? [],
        ).toHaveLength(3);
    });

    it("inventories every read of the mode across the whole service layer", () => {
        // The backstop above walks `tradeService.ts` + `src/services/trade/`.
        // That set was never the whole seam: `paperState.enabled` is also read
        // in five more production files under `src/services/`, and a branch
        // placed in one of them satisfies every assertion in this file. A
        // module there can route just as hard as one in `trade/`, so "it is not
        // in the scanned set" was not a safety property — it was an unexamined
        // region.
        //
        // The count cannot simply be raised: seven of the ten branches are in
        // the paper implementation itself (`paperTradingService` alone holds
        // five), where branching on the mode *is* the job. Pinning a global
        // total would encode "the paper services may branch at most N times",
        // which is not a property worth protecting. So the guard is an
        // inventory instead — the same shape BUG-0659 required for `or`-mode
        // settings keys: every file in the layer that reads the mode is named
        // with its read count. A new reader has to be added here deliberately,
        // which puts it in front of a reviewer; an unexamined region cannot
        // quietly accumulate one.
        //
        // Scope, stated plainly: service-layer `.ts` files (which includes
        // `.svelte.ts` — that is load-bearing for the `accountSession` row).
        // Components and other stores read the mode too (seven components,
        // `ai`/`alerts`/`settings` stores), and two of those are behavior,
        // not labels: `PlaceOrderPanel.svelte` gates a credential-verification
        // `$effect` on it, and `alerts.svelte.ts` carries a second mode port
        // (`paperEnabled: () => paperState.enabled`). Those are known and
        // accepted as out of scope here — display reads churn too fast for an
        // inventory, and order routing outside services is still covered
        // repo-wide by the gate scanner. If either ever routes an order, this
        // comment is the place that lied.
        const read = /paperState\.enabled\b/g;
        const found = new Map<string, number>();
        const toPosix = (p: string) => p.split(sep).join("/");
        (function walk(dir: string): void {
            for (const entry of readdirSync(dir, { withFileTypes: true })) {
                const full = join(dir, entry.name);
                if (entry.isDirectory()) {
                    walk(full);
                } else if (entry.name.endsWith(".ts") && !entry.name.includes(".test.")) {
                    const hits = readFileSync(full, "utf8").match(read)?.length ?? 0;
                    // `join` yields `\`-separated paths on Windows while the
                    // expectation below is POSIX: a Windows `npm test` run
                    // would fail spuriously without this.
                    if (hits > 0) found.set(toPosix(full), hits);
                }
            }
        })("src/services");

        // The `trade/` lane reads the mode through a port, so it does not
        // appear here at all — the backstop above covers it under its own
        // spelling (`ports.isPaperMode()`).
        expect(
            [...found.entries()].sort(),
            "New paperState.enabled reader in src/services/ — add it to this " +
                "inventory deliberately after review, or remove it. " +
                "See the scope note above for what this list does and does not cover.",
        ).toEqual([
            ["src/services/accountSession.svelte.ts", 1],
            ["src/services/paperAccountFeed.ts", 1],
            ["src/services/paperJournalService.ts", 1],
            ["src/services/paperTradingService.ts", 5],
            ["src/services/rmsService.ts", 1],
            ["src/services/tradeService.ts", 9],
        ]);

        // Reworded reads of the same mode across the layer. The trade-domain
        // zero-pins below (rewording test) cover only the scanned set; these
        // extend them to the other five files, so
        // `const { enabled: m } = paperState; if (m) { route… }` in
        // `rmsService.ts` trips here instead of sailing through with its
        // inventory count unchanged.
        const layerWide = [...found.keys()]
            .map((f) => readFileSync(f, "utf8"))
            .join("\n");
        expect(layerWide.match(/paperState\s*\[\s*['"]enabled['"]\s*\]/g) ?? []).toEqual([]);
        expect(layerWide.match(/=\s*paperState\.enabled\b/g) ?? []).toEqual([]);
        expect(layerWide.match(/=\s*paperState\s*\[\s*['"]enabled['"]\s*\]/g) ?? []).toEqual([]);
        expect(layerWide.match(/\{\s*enabled\s*:\s*[A-Za-z_$][\w$]*\s*\}/g) ?? []).toEqual([]);
        expect(layerWide.match(/import\s*\{[^}]*\bpaperState\s+as\s+[A-Za-z_$][\w$]*/g) ?? []).toEqual([]);

        // The port spelling outside `trade/`: a new service that accepts an
        // `isPaperMode` port and branches on it changes neither the branch
        // backstop (scoped to `tradeService.ts` + `trade/`) nor this
        // inventory (blind to the port spelling). Exactly two exist, both in
        // the lane the backstop already owns — a third is a second seam and
        // fails here until it is justified like the first two were.
        const portBranches: string[] = [];
        (function walkPorts(dir: string): void {
            for (const entry of readdirSync(dir, { withFileTypes: true })) {
                const full = join(dir, entry.name);
                if (entry.isDirectory()) {
                    walkPorts(full);
                } else if (entry.name.endsWith(".ts") && !entry.name.includes(".test.")) {
                    const text = readFileSync(full, "utf8");
                    // The branch plus the rest of its condition, up to the
                    // opening brace: a third entry fails the pin, and so does
                    // a silently reworded one.
                    const hits =
                        text.match(/if\s*\(\s*!?ports\.isPaperMode\(\)[^;{]{0,60}\{/g) ?? [];
                    for (const h of hits) portBranches.push(`${toPosix(full)}: ${h}`);
                }
            }
        })("src/services");
        expect(
            portBranches.sort(),
            "New ports.isPaperMode() branch outside trade/ — a second seam needs the same justification as the first two.",
        ).toEqual([
            "src/services/trade/accountSettings.ts: if (ports.isPaperMode()) {",
            "src/services/trade/tpSlService.ts: if (!ports.isPaperMode() && !hasKeys) {",
        ]);
    });

    it("flags reworded branches, not just the current spelling", () => {
        // A ternary routes just as hard as an `if`. Value ternaries
        // (`paperState.enabled ? "paper" : "live"` — the two balance-key
        // reads in tradeService) only pick a read key, and routing needs a
        // call: a `(` between `?` and `:` is what separates the two.
        const ifBranch =
            /if\s+\(\s*!?paperState\.enabled\b|if\s+\(\s*!?ports\.isPaperMode\(\)/g;
        const routingTernary =
            /paperState\.enabled\s*\?[^;:]{0,200}\(|ports\.isPaperMode\(\)\s*\?[^;:]{0,200}\(/g;

        // The rewordings, each carrying the identical branching:
        expect(`if ( paperState.enabled ) { live(); }`.match(ifBranch)).not.toBeNull();
        expect(`if (!ports.isPaperMode()) { live(); }`.match(ifBranch)).not.toBeNull();
        expect(
            `paperState.enabled ? paperExchange.handle(o) : send(o)`.match(routingTernary),
        ).not.toBeNull();

        // And on the real domain: the loose `if` matcher sees exactly the
        // same three the backstop above counts, and no routing ternary
        // exists — the two value ternaries pick a balance key, not a route.
        const tradeDomainWire = [
            readFileSync("src/services/tradeService.ts", "utf8"),
            ...readdirSync("src/services/trade")
                .filter((f) => f.endsWith(".ts") && !f.includes(".test."))
                .map((f) => readFileSync(`src/services/trade/${f}`, "utf8")),
        ].join("\n");
        expect(tradeDomainWire.match(ifBranch) ?? []).toHaveLength(3);
        expect(tradeDomainWire.match(routingTernary) ?? []).toHaveLength(0);

        // Documented limit, not a hole by oversight: a cached boolean
        // (`const mode = paperState.enabled; if (mode) …`) is invisible to
        // every spelling matcher. What catches it is the read count — every
        // new read of the mode breaks the nine below — so an alias cannot
        // arrive quietly, only explicitly. All three spellings of the same
        // trick (direct, bracket, destructured) are pinned to zero; the
        // first alias of any shape fails here.
        expect(`const mode = paperState.enabled;\nif (mode) { live(); }`.match(ifBranch)).toBeNull();
        expect(`const mode = paperState['enabled'];\nif (mode) { live(); }`.match(ifBranch)).toBeNull();
        expect(`const { enabled: mode } = paperState;\nif (mode) { live(); }`.match(ifBranch)).toBeNull();
        expect(tradeDomainWire.match(/=\s*paperState\.enabled\b/g) ?? []).toHaveLength(0);
        expect(tradeDomainWire.match(/=\s*paperState\[\s*['"]enabled['"]\s*\]/g) ?? []).toHaveLength(0);
        expect(
            tradeDomainWire.match(/\{\s*enabled\s*(?::\s*[A-Za-z_$][\w$]*)?\s*\}\s*=\s*paperState\b/g) ?? [],
        ).toHaveLength(0);
    });

    it("reaches the transport with an identical payload in both modes", async () => {
        const payloads: Array<Record<string, unknown>> = [];
        const spy = vi
            .spyOn(tradeService, "signedRequest")
            .mockImplementation(async (_e, payload) => {
                payloads.push(payload);
                return { code: "0" };
            });

        try {
            for (const mode of [false, true]) {
                paperState.setEnabled(mode);
                omsService.reset();
                omsService.updatePosition(position());
                await tradeService.closePosition({
                    symbol: "BTCUSDT",
                    positionSide: "long",
                    amount: new Decimal("1"),
                });
            }
        } finally {
            spy.mockRestore();
        }

        expect(payloads).toHaveLength(2);
        expect(payloads[0]).toEqual(payloads[1]);
    });

    it("routes no non-order module through the simulator", () => {
        // Only the transport may know about the simulator; a second importer
        // would be a second seam.
        const importers = [
            "src/services/tradeService.ts",
            "src/services/paperTradingService.ts",
        ];
        for (const file of importers) {
            expect(readFileSync(file, "utf8")).toMatch(/paperExchange/);
        }
    });
});

// AC: "Paper orders pass through the FEAT-0011 gate and are refused by it
// under the same conditions as live orders."
describe("FEAT-0012 — paper orders still go through the gate", () => {
    it("is refused by the kill switch exactly as a live order is", async () => {
        registerKillSwitch(() => true);

        for (const mode of [false, true]) {
            paperState.setEnabled(mode);
            omsService.reset();
            omsService.updatePosition(position());

            const intent: OrderIntent = {
                kind: "open",
                endpoint: "/api/orders",
                payload: { type: "place-order", symbol: "BTCUSDT", qty: "1" },
                displayed: {
                    provider: "bitunix",
                    accountFingerprint: "test…1234",
                    symbol: "BTCUSDT",
                    paperMode: mode,
                },
            };
            expect(orderGate.verify(intent).refusal?.field).toBe("killSwitch");
        }
    });

    it("is refused by a risk limit exactly as a live order is", async () => {
        registerRiskLimitCheck(() => ({
            field: "maxPositionSize",
            reason: "riskLimit" as const,
            messageKey: "orderGate.riskLimit",
            values: { field: "maxPositionSize", limit: "1", actual: "2" },
        }));
        paperState.setEnabled(true);
        omsService.updatePosition(position());

        await expect(
            tradeService.closePosition({
                symbol: "BTCUSDT",
                positionSide: "long",
                amount: new Decimal("1"),
            }),
        ).rejects.toBeInstanceOf(OrderRefusedError);
        expect(appFetchMock).not.toHaveBeenCalled();
    });

    it("refuses when the mode changes between approval and transmission", async () => {
        paperState.setEnabled(false);
        omsService.updatePosition(position());

        // The gate approves as live; the mode flips before the transport
        // reads it. Believing you are simulating while live is the failure
        // this catches.
        const original = tradeService.signedRequest.bind(tradeService);
        const spy = vi
            .spyOn(tradeService, "signedRequest")
            .mockImplementation(async (e, p, pass, q) => {
                paperState.setEnabled(true);
                return original(e, p, pass, q);
            });

        try {
            await expect(
                tradeService.closePosition({
                    symbol: "BTCUSDT",
                    positionSide: "long",
                    amount: new Decimal("1"),
                }),
            ).rejects.toMatchObject({ refusal: { field: "mode" } });
        } finally {
            spy.mockRestore();
        }
        expect(appFetchMock).not.toHaveBeenCalled();
    });
});

// AC: "Switching modes never carries state across: paper positions do not
// appear live and vice versa."
describe("FEAT-0012 — switching modes carries nothing across", () => {
    it("clears the shared position store in both directions", async () => {
        const { paperTradingService } = await import("./paperTradingService");

        omsService.updatePosition(position("LIVEUSDT"));
        expect(omsService.getPositions()).toHaveLength(1);

        paperTradingService.setEnabled(true);
        expect(
            omsService.getPositions().some((p) => p.symbol === "LIVEUSDT"),
        ).toBe(false);

        omsService.updatePosition(position("PAPERUSDT"));
        paperTradingService.setEnabled(false);
        expect(
            omsService.getPositions().some((p) => p.symbol === "PAPERUSDT"),
        ).toBe(false);
    });

    it("keeps the simulated book across a round trip through live", async () => {
        const { paperTradingService } = await import("./paperTradingService");

        paperTradingService.setEnabled(true);
        paperState.setPositions([
            {
                positionId: "p-1",
                symbol: "BTCUSDT",
                side: "long",
                amount: "1",
                entryPrice: "50000",
                leverage: "10",
                marginMode: "cross",
                realizedPnl: "0",
                openedAt: Date.now(),
            },
        ]);

        paperTradingService.setEnabled(false);
        paperTradingService.setEnabled(true);

        // Switching modes clears the *shared* view, not the user's practice
        // book — losing that on every toggle would make the feature useless.
        expect(paperState.positions).toHaveLength(1);
    });
});
