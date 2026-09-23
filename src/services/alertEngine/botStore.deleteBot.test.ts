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
 * BUG-0493 — `deleteBot` must not write `localStorage` directly. It keeps
 * its `isBot` guard and delegates the removal (and its invalidation) to
 * `removeRule`, so there is exactly one removal write path to
 * `cachy_rules_v1`.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { RuleDocument } from "../../lib/rules/types";
import { RULES_STORAGE_KEY } from "./migrateAlertsToRules";

// `safeLocalStorage` is a no-op when `browser` is false (unit project
// default). Mock it to true so these tests exercise the real wrapper path
// (same pattern as `drawings.test.ts`).
vi.mock("$app/environment", () => ({ browser: true, dev: false }));

const { removeRuleMock } = vi.hoisted(() => ({ removeRuleMock: vi.fn() }));

vi.mock("./armRule", async (importOriginal) => {
    const original = await importOriginal<typeof import("./armRule")>();
    return { ...original, removeRule: removeRuleMock };
});

import { deleteBot } from "./botStore";

function botDocument(id: string): RuleDocument {
    return {
        schema_version: 2,
        id,
        name: `bot ${id}`,
        symbol: "BTCUSDT",
        trigger_timeframe: "1h",
        conditions: {
            kind: "compare",
            left: { kind: "price", field: "close" },
            op: "gte",
            right: { kind: "constant", value: "50000" },
            timeframe: "1h",
        },
        action: { consequence_level: "simulate" },
        enabled: true,
        provenance: { source: "human", created_at_ms: 0 },
    };
}

function notifyDocument(id: string): RuleDocument {
    return { ...botDocument(id), action: { consequence_level: "notify" } };
}

describe("deleteBot write path", () => {
    beforeEach(() => {
        localStorage.clear();
        removeRuleMock.mockReset();
        vi.restoreAllMocks();
    });

    it("delegates the removal to removeRule instead of writing directly", () => {
        const setItem = vi.spyOn(localStorage, "setItem");
        localStorage.setItem(RULES_STORAGE_KEY, JSON.stringify([botDocument("bot-1")]));
        setItem.mockClear();

        expect(deleteBot("bot-1")).toBe(true);
        expect(removeRuleMock).toHaveBeenCalledTimes(1);
        expect(removeRuleMock).toHaveBeenCalledWith("bot-1");
        // The guard's own read is a getItem; no direct write may remain.
        expect(setItem).not.toHaveBeenCalled();
    });

    it("refuses a notify rule without touching removeRule or storage", () => {
        const setItem = vi.spyOn(localStorage, "setItem");
        localStorage.setItem(RULES_STORAGE_KEY, JSON.stringify([notifyDocument("alert-1")]));
        setItem.mockClear();

        expect(deleteBot("alert-1")).toBe(false);
        expect(removeRuleMock).not.toHaveBeenCalled();
        expect(setItem).not.toHaveBeenCalled();
    });

    it("reports an unknown id without touching removeRule or storage", () => {
        const setItem = vi.spyOn(localStorage, "setItem");
        localStorage.setItem(RULES_STORAGE_KEY, JSON.stringify([botDocument("bot-1")]));
        setItem.mockClear();

        expect(deleteBot("gone")).toBe(false);
        expect(removeRuleMock).not.toHaveBeenCalled();
        expect(setItem).not.toHaveBeenCalled();
    });
});
