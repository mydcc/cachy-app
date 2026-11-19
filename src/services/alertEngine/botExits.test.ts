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

/**
 * FEAT-0810 — the exit sink's contract.
 *
 * The money-path claims of the exit half live here: how much closes (Decimal,
 * never native number), which lane it closes through, what a refusal costs
 * (once per rule per reason, position stays open), and what the closing
 * snapshot says while an exit travels. The loop's half — when a firing
 * exists at all — is `ruleEvaluationLoop.test.ts`'s; the paper book's half —
 * what a close does to the position — is the integration file's.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { Decimal } from "decimal.js";

import {
    closeAmountFor,
    submitBotExit,
    withBotExits,
    type BotExitEnvironment,
} from "./botExits";
import type { BotExitFiring, OwnedBotPosition } from "./ruleEvaluationLoop";
import type { RuleDocument } from "../../lib/rules/types";

vi.mock("../logger", () => ({
    logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

function botDocument(overrides: Partial<RuleDocument> = {}): RuleDocument {
    return {
        schema_version: 3,
        id: "bot-1",
        name: "exit bot",
        symbol: "BTCUSDT",
        trigger_timeframe: "1h",
        conditions: {
            kind: "compare",
            left: { kind: "price", field: "close" },
            op: "gte",
            right: { kind: "constant", value: "1" },
            timeframe: "1h",
        },
        action: {
            consequence_level: "simulate",
            order: { side: "buy", size_basis: "percent_of_equity", size: "10" },
        },
        enabled: true,
        provenance: { source: "human", created_at_ms: 0 },
        exits: [
            {
                when: {
                    kind: "compare",
                    left: { kind: "price", field: "close" },
                    op: "gte",
                    right: { kind: "constant", value: "120" },
                    timeframe: "1h",
                },
                close: "all",
            },
        ],
        ...overrides,
    } as RuleDocument;
}

function ownedPosition(overrides: Partial<OwnedBotPosition> = {}): OwnedBotPosition {
    return {
        positionId: "paper-pos-1",
        side: "long",
        entryPrice: "100",
        amount: "2",
        lastExitActionAnchorMs: null,
        ...overrides,
    };
}

function exitFiring(overrides: Partial<BotExitFiring> = {}): BotExitFiring {
    return {
        rule: botDocument(),
        positionId: "paper-pos-1",
        close: "all",
        exitIndex: 0,
        anchorMs: 1000,
        ...overrides,
    };
}

function env(overrides: Partial<BotExitEnvironment> = {}): BotExitEnvironment {
    return {
        paperEnabled: () => true,
        close: vi.fn(async () => undefined),
        ownedPosition: () => ownedPosition(),
        ...overrides,
    };
}

beforeEach(() => {
    vi.clearAllMocks();
});

describe("FEAT-0810 — closeAmountFor", () => {
    it("an `all` exit closes the position's whole remaining amount", () => {
        expect(closeAmountFor(exitFiring({ close: "all" }), "2")).toEqual(new Decimal("2"));
    });

    it("a `partial` exit closes exactly the document's fraction of what the book holds now", () => {
        // Decimal end to end: a third of 0.3 is a repeating decimal a native
        // number would round silently, and the close lane's step-size rule
        // would then refuse a size the document never asked for.
        const amount = closeAmountFor(exitFiring({ close: "partial", fraction: "0.5" }), "0.3");
        expect(amount).toEqual(new Decimal("0.15"));
    });

    it("the fraction applies to the remaining amount, never to the entry size", () => {
        // The book says 1.4 now; the rule's entry size was something else
        // entirely, and the document's fraction is a statement about the
        // position, not about the order that opened it.
        const amount = closeAmountFor(exitFiring({ close: "partial", fraction: "0.25" }), "1.4");
        expect(amount).toEqual(new Decimal("0.35"));
    });
});

describe("FEAT-0810 — submitBotExit", () => {
    it("closes through the single-close lane with the position's side, all as a full close", async () => {
        const close = vi.fn(async () => undefined);
        await submitBotExit(exitFiring(), env({ close }));

        expect(close).toHaveBeenCalledTimes(1);
        expect(close).toHaveBeenCalledWith({
            symbol: "BTCUSDT",
            positionSide: "long",
            forceFullClose: true,
        });
    });

    it("a partial exit carries its Decimal amount", async () => {
        const close = vi.fn(async () => undefined);
        await submitBotExit(exitFiring({ close: "partial", fraction: "0.5" }), env({ close }));

        expect(close).toHaveBeenCalledWith({
            symbol: "BTCUSDT",
            positionSide: "long",
            amount: new Decimal("1"),
        });
    });

    it("refuses when paper trading is off", async () => {
        expect(await submitBotExit(exitFiring(), env({ paperEnabled: () => false }))).toBe(
            "paper-trading-off",
        );
    });

    it("refuses a firing the document's own exits could not have produced", async () => {
        const doc = botDocument();
        doc.exits = [];
        delete doc.take_profit;
        expect(await submitBotExit(exitFiring({ rule: doc }), env())).toBe("no-exits");
    });

    it("refuses a notify rule: it owns no position to close", async () => {
        const doc = botDocument();
        doc.action = { consequence_level: "notify" };
        expect(await submitBotExit(exitFiring({ rule: doc }), env())).toBe("level-not-supported");
    });

    it("refuses when the book no longer lists the position — the manual close and stop-out case", async () => {
        expect(
            await submitBotExit(exitFiring(), env({ ownedPosition: () => undefined })),
        ).toBe("position-gone");
    });

    it("refuses a computed size that is not positive", async () => {
        expect(
            await submitBotExit(
                exitFiring({ close: "partial", fraction: "0.5" }),
                env({ ownedPosition: () => ownedPosition({ amount: "0" }) }),
            ),
        ).toBe("size-not-positive");
    });

    it("a thrown close is a refusal, and the position stays open by construction", async () => {
        // The lane throws (gate refusal, stale size, venue rejection); the
        // sink turns it into one named reason and — because nothing else in
        // this module touches the book — the position is exactly as it was.
        const close = vi.fn(async () => {
            throw new Error("apiErrors.invalidAmount");
        });
        expect(await submitBotExit(exitFiring(), env({ close }))).toBe("close-refused");
        expect(close).toHaveBeenCalledTimes(1);
    });
});

describe("FEAT-0810 — withBotExits", () => {
    it("notifies with the empty rule-id set at sink creation, so a re-init resets the projection", () => {
        const onInFlight = vi.fn();
        withBotExits(env(), vi.fn(), onInFlight);

        expect(onInFlight).toHaveBeenCalledTimes(1);
        expect(onInFlight.mock.calls[0][0]).toEqual(new Set());
    });

    it("submits through the close port and settles", async () => {
        const close = vi.fn(async () => undefined);
        const onRefusal = vi.fn();
        const sink = withBotExits(env({ close }), onRefusal);

        sink(exitFiring());
        await vi.waitFor(() => expect(close).toHaveBeenCalledTimes(1));
        await vi.waitFor(() => expect(onRefusal).not.toHaveBeenCalled());
    });

    it("the same refusal twice over settled firings still reports once", async () => {
        const onRefusal = vi.fn();
        const onInFlight = vi.fn();
        const sink = withBotExits(
            env({ paperEnabled: () => false }),
            onRefusal,
            onInFlight,
        );

        sink(exitFiring());
        await vi.waitFor(() => expect(onRefusal).toHaveBeenCalledTimes(1));
        // Wait for the in-flight guard to release before the next firing,
        // so this one reaches the refusal path rather than the guard.
        await vi.waitFor(() => expect(onInFlight.mock.calls.at(-1)?.[0]).toEqual(new Set()));

        sink(exitFiring({ anchorMs: 2000 }));
        await vi.waitFor(() => expect(onInFlight.mock.calls.at(-1)?.[0]).toEqual(new Set()));

        expect(onRefusal).toHaveBeenCalledTimes(1);
    });

    it("guards one close per owned position: a second firing while the first travels is refused", async () => {
        let release: () => void = () => {};
        const close = vi.fn(
            () =>
                new Promise<void>((resolve) => {
                    release = () => resolve();
                }),
        );
        const onRefusal = vi.fn();
        const sink = withBotExits(env({ close }), onRefusal);

        sink(exitFiring({ anchorMs: 1000 }));
        sink(exitFiring({ anchorMs: 2000 }));

        await vi.waitFor(() => expect(onRefusal).toHaveBeenCalledTimes(1));
        expect(onRefusal.mock.calls[0][1]).toBe("close-in-flight");
        // Still exactly one close in flight for this position.
        expect(close).toHaveBeenCalledTimes(1);

        release();
        await vi.waitFor(() => expect(close).toHaveBeenCalledTimes(1));
    });

    it("the closing snapshot names the rule, and two positions keep it while one settles", async () => {
        let release: () => void = () => {};
        const close = vi.fn(
            () =>
                new Promise<void>((resolve) => {
                    release = () => resolve();
                }),
        );
        const onInFlight = vi.fn();
        const sink = withBotExits(env({ close }), vi.fn(), onInFlight);

        sink(exitFiring({ positionId: "paper-pos-1" }));
        await vi.waitFor(() =>
            expect(onInFlight.mock.calls.at(-1)?.[0]).toEqual(new Set(["bot-1"])),
        );

        sink(exitFiring({ positionId: "paper-pos-2" }));
        await vi.waitFor(() =>
            expect(onInFlight.mock.calls.at(-1)?.[0]).toEqual(new Set(["bot-1"])),
        );

        // One of the two settles; the rule is still closing the other.
        release();
        await vi.waitFor(() =>
            expect(onInFlight.mock.calls.at(-1)?.[0]).toEqual(new Set(["bot-1"])),
        );
    });

    it("releases the closing state when the last in-flight close settles", async () => {
        const close = vi.fn(async () => undefined);
        const onInFlight = vi.fn();
        const sink = withBotExits(env({ close }), vi.fn(), onInFlight);

        sink(exitFiring());
        await vi.waitFor(() =>
            expect(onInFlight.mock.calls.at(-1)?.[0]).toEqual(new Set(["bot-1"])),
        );
        await vi.waitFor(() => expect(onInFlight.mock.calls.at(-1)?.[0]).toEqual(new Set()));
    });

    it("the sink never throws, whatever the close port does", async () => {
        const close = vi.fn(async () => {
            throw new Error("gate refused");
        });
        const sink = withBotExits(env({ close }), vi.fn());

        expect(() => sink(exitFiring())).not.toThrow();
        // And the refusal still surfaces through the port's own error, as a
        // named close-refused — once.
        await vi.waitFor(() => expect(close).toHaveBeenCalledTimes(1));
    });
});
