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
 * FEAT-0825 / ADR-0028 — a bot's account follows from its consequence level,
 * never from what is active on screen.
 */

import { describe, expect, it } from "vitest";

import type { RuleDocument } from "../../lib/rules/types";
import {
    PAPER_ACCOUNT,
    botAccountOf,
    botAccountUnavailable,
    executingBotAccount,
    isBotAccountExecuting,
} from "./botAccount";

function rule(consequenceLevel: "notify" | "simulate"): RuleDocument {
    return {
        schema_version: 2,
        id: "r-1",
        name: "r",
        symbol: "BTCUSDT",
        trigger_timeframe: "1h",
        conditions: {
            kind: "compare",
            left: { kind: "price", field: "close" },
            op: "gte",
            right: { kind: "constant", value: "1" },
            timeframe: "1h",
        },
        action:
            consequenceLevel === "simulate"
                ? {
                      consequence_level: "simulate",
                      order: { side: "buy", size_basis: "percent_of_equity", size: "1" },
                  }
                : { consequence_level: "notify" },
        enabled: true,
        provenance: { source: "human", created_at_ms: 0 },
    } as RuleDocument;
}

describe("FEAT-0825 — botAccount", () => {
    it("binds a simulate bot to the paper account", () => {
        expect(botAccountOf(rule("simulate"))).toBe(PAPER_ACCOUNT);
    });

    it("gives a notify alert no account at all", () => {
        expect(botAccountOf(rule("notify"))).toBeNull();
    });

    it("executes the paper account only while paper trading is on", () => {
        expect(executingBotAccount(true)).toBe(PAPER_ACCOUNT);
        expect(executingBotAccount(false)).toBeNull();
    });

    it("reads a paper bot executing only while the paper account is", () => {
        expect(isBotAccountExecuting(rule("simulate"), PAPER_ACCOUNT)).toBe(true);
        expect(isBotAccountExecuting(rule("simulate"), null)).toBe(false);
    });

    it("never reads an alert as executing, whatever account is", () => {
        expect(isBotAccountExecuting(rule("notify"), PAPER_ACCOUNT)).toBe(false);
        expect(isBotAccountExecuting(rule("notify"), null)).toBe(false);
    });

    it("refuses a lane when no account executes, bot or not", () => {
        expect(botAccountUnavailable(rule("simulate"), null)).toBe(true);
        expect(botAccountUnavailable(rule("notify"), null)).toBe(true);
    });

    it("lets a bot on the executing account through the lane", () => {
        expect(botAccountUnavailable(rule("simulate"), PAPER_ACCOUNT)).toBe(false);
    });

    it("leaves a non-bot to the lane's own level refusal while an account executes", () => {
        // The lane names the more specific cause (`level-not-supported`);
        // calling a notify rule "paper off" while paper is on would send the
        // reader of the log looking for a switch that is not the problem.
        expect(botAccountUnavailable(rule("notify"), PAPER_ACCOUNT)).toBe(false);
    });
});
