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


import { beforeEach, describe, expect, it } from "vitest";
import { armRule, RuleStoreUnreadableError } from "./armRule";
import { RULES_STORAGE_KEY } from "./migrateAlertsToRules";
import type { RuleDocument } from "../../lib/rules/types";

function rule(id: string, threshold: string): RuleDocument {
    return {
        schema_version: 1,
        id,
        name: `rule ${id}`,
        symbol: "BTCUSDT",
        trigger_timeframe: "1h",
        conditions: {
            kind: "compare",
            left: { kind: "price", field: "close" },
            op: "gte",
            right: { kind: "constant", value: threshold },
            timeframe: "1h",
        },
        action: { consequence_level: "notify" },
        enabled: true,
        provenance: { source: "human", created_at_ms: 0 },
    };
}

function stored(): RuleDocument[] {
    return JSON.parse(localStorage.getItem(RULES_STORAGE_KEY) ?? "[]");
}

describe("armRule", () => {
    beforeEach(() => localStorage.clear());

    it("creates the store when nothing has been armed yet", () => {
        armRule(rule("a", "70000"));
        expect(stored().map((r) => r.id)).toEqual(["a"]);
    });

    it("appends beside a rule the migration already wrote", () => {
        localStorage.setItem(RULES_STORAGE_KEY, JSON.stringify([rule("migrated", "50000")]));
        armRule(rule("hand", "70000"));
        expect(stored().map((r) => r.id)).toEqual(["migrated", "hand"]);
    });

    it("replaces by id so an edited rule does not stay armed twice", () => {
        armRule(rule("a", "70000"));
        armRule(rule("a", "80000"));
        const rules = stored();
        expect(rules).toHaveLength(1);
        expect((rules[0].conditions as { right: { value: string } }).right.value).toBe("80000");
    });

    it("keeps a rule's position when it is replaced", () => {
        localStorage.setItem(
            RULES_STORAGE_KEY,
            JSON.stringify([rule("a", "1"), rule("b", "2"), rule("c", "3")]),
        );
        armRule(rule("b", "99"));
        expect(stored().map((r) => r.id)).toEqual(["a", "b", "c"]);
    });

    it("refuses rather than clobbering a store it cannot parse", () => {
        localStorage.setItem(RULES_STORAGE_KEY, "not json");
        expect(() => armRule(rule("a", "70000"))).toThrow(RuleStoreUnreadableError);
        expect(localStorage.getItem(RULES_STORAGE_KEY)).toBe("not json");
    });

    it("refuses a stored value that is not an array", () => {
        localStorage.setItem(RULES_STORAGE_KEY, JSON.stringify({ rules: [] }));
        expect(() => armRule(rule("a", "70000"))).toThrow(RuleStoreUnreadableError);
    });
});
