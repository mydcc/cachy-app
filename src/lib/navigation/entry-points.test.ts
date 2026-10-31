/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import { describe, expect, it } from "vitest";
import en from "../../locales/locales/en.json";
import de from "../../locales/locales/de.json";
import {
    ENTRY_POINTS,
    evaluateCondition,
    getSurfaceEntries,
} from "./entry-points";
import type { EntryContext, SurfaceId } from "./entry-points";

function hasKey(dictionary: unknown, key: string): boolean {
    let node = dictionary;
    for (const part of key.split(".")) {
        if (typeof node !== "object" || node === null) return false;
        node = (node as Record<string, unknown>)[part];
    }
    return typeof node === "string" && node.length > 0;
}

function context(overrides: Partial<EntryContext> = {}): EntryContext {
    return {
        settings: { showSidebars: true },
        entitlement: { pro: false },
        accounts: { activeId: null, activeExchange: null, count: 0 },
        windows: {},
        viewportWidth: 1440,
        ui: {},
        derived: {},
        data: {},
        ...overrides,
    };
}

function ids(surface: SurfaceId, ctx = context()): string[] {
    return getSurfaceEntries(surface, ctx).map(({ entry }) => entry.id);
}

describe("entry-point registry data", () => {
    it("contains 23 unique entries", () => {
        expect(ENTRY_POINTS).toHaveLength(23);
        expect(new Set(ENTRY_POINTS.map((entry) => entry.id)).size).toBe(23);
    });

    it("uses translation keys that exist in both locales", () => {
        const missing: string[] = [];
        for (const entry of ENTRY_POINTS) {
            for (const key of [
                entry.labels.label,
                entry.labels.title,
                entry.labels.description,
            ]) {
                if (!key) continue;
                if (!hasKey(en, key)) missing.push(`${entry.id}: en:${key}`);
                if (!hasKey(de, key)) missing.push(`${entry.id}: de:${key}`);
            }
        }
        expect(missing).toEqual([]);
    });

    it("gives every gated rail placement a reason in both locales", () => {
        // BUG-0715: the rail renders `aria-disabled` without saying why when a
        // conditioned placement has no `disabledReason`. Scoped to the rail
        // because only that surface reads `enabled` for the user.
        const missing: string[] = [];
        for (const entry of ENTRY_POINTS) {
            for (const placement of entry.placements) {
                if (placement.surface !== "rail") continue;
                if (!placement.enabledWhen) continue;
                if (placement.enabledWhen.kind === "always") continue;
                const reason = placement.disabledReason;
                if (!reason) {
                    missing.push(`${entry.id}: no disabledReason`);
                    continue;
                }
                if (!hasKey(en, reason)) missing.push(`${entry.id}: en:${reason}`);
                if (!hasKey(de, reason)) missing.push(`${entry.id}: de:${reason}`);
            }
        }
        expect(missing).toEqual([]);
    });

    it("gives every entry an icon, opener and placement", () => {
        for (const entry of ENTRY_POINTS) {
            expect(entry.icon, entry.id).toBeTruthy();
            expect(entry.opener, entry.id).toBeTruthy();
            expect(entry.placements.length, entry.id).toBeGreaterThan(0);
        }
    });

    it("links tab entries to an existing parent", () => {
        const known = new Set(ENTRY_POINTS.map((entry) => entry.id));
        for (const entry of ENTRY_POINTS) {
            if (entry.opener.kind !== "tab") continue;
            expect(entry.parent, entry.id).toBeTruthy();
            expect(known.has(entry.parent!), entry.id).toBe(true);
            expect(entry.opener.tabId, entry.id).toBeTruthy();
        }
    });

    it("keeps surface/group order unique and keyboard routes non-empty", () => {
        const placements = new Set<string>();
        for (const entry of ENTRY_POINTS) {
            for (const placement of entry.placements) {
                const key = `${placement.surface}:${placement.group}:${placement.order}`;
                expect(placements.has(key), key).toBe(false);
                placements.add(key);
                expect(placement.keyboard.kind, entry.id).not.toBe("none");
                if (placement.keyboard.kind === "shortcut") {
                    expect(placement.keyboard.keys).toBeTruthy();
                }
            }
        }
    });

    it("keeps the four surface inventories pinned", () => {
        expect(ids("header")).toEqual(["journal"]);
        expect(ids("journal-tabs")).toHaveLength(5);
        expect(ids("settings-rail")).toHaveLength(8);
        expect(ids("rail")).toHaveLength(9);
        expect(
            ids(
                "rail",
                context({
                    windows: { journal: "minimized" },
                }),
            ),
        ).toHaveLength(10);
    });
});

describe("surface resolver", () => {
    it("keeps the static-context surfaces condition-free", () => {
        // The header, the journal tab strip and the settings rail share
        // `STATIC_ENTRY_CONTEXT` because their placements have no conditions.
        // A condition added to one of them would silently evaluate against
        // zeroed values, so pin the contract here before that can ship.
        const staticSurfaces: SurfaceId[] = [
            "header",
            "journal-tabs",
            "settings-rail",
        ];
        const placements = ENTRY_POINTS.flatMap((entry) =>
            entry.placements.filter((placement) =>
                staticSurfaces.includes(placement.surface),
            ),
        );

        const isContextFree = (condition: { kind: string } | undefined) =>
            condition === undefined || condition.kind === "always";

        expect(placements).toHaveLength(14);
        for (const placement of placements) {
            expect(isContextFree(placement.visibleWhen)).toBe(true);
            expect(isContextFree(placement.enabledWhen)).toBe(true);
            expect(isContextFree(placement.activeWhen)).toBe(true);
        }
    });

    it("hides the rail journal entry until the window is minimized", () => {
        expect(ids("rail")).not.toContain("journal");
        expect(
            ids("rail", context({ windows: { journal: "minimized" } })),
        ).toContain("journal");
    });

    it("tracks the rail's existing selected states", () => {
        const active = (id: string, ctx: EntryContext) =>
            getSurfaceEntries("rail", ctx).find(
                ({ entry }) => entry.id === id,
            )!.active;

        expect(active("assistant", context())).toBe(false);
        expect(
            active(
                "assistant",
                context({ ui: { showAssistant: true } }),
            ),
        ).toBe(true);

        expect(
            active(
                "technicals",
                context({ settings: { showTechnicals: true } }),
            ),
        ).toBe(true);
        expect(
            active(
                "market-overview",
                context({ settings: { showMarketOverview: true } }),
            ),
        ).toBe(true);
        expect(
            active(
                "market-activity",
                context({ derived: { effectiveShowSidebarActivity: true } }),
            ),
        ).toBe(true);
        // The active state carries no viewport token: it means the panel is
        // shown, not that a width is wide enough (BUG-0715).
        expect(
            active(
                "market-activity",
                context({
                    viewportWidth: 1000,
                    derived: { effectiveShowSidebarActivity: true },
                }),
            ),
        ).toBe(true);
        expect(
            active(
                "market-sentiment",
                context({ settings: { showMarketSentiment: true } }),
            ),
        ).toBe(true);
        expect(
            active(
                "journal",
                context({ windows: { journal: "minimized" } }),
            ),
        ).toBe(true);
    });

    it("evaluates the rail panel preconditions", () => {
        const technicals = (ctx: EntryContext) =>
            getSurfaceEntries("rail", ctx).find(
                ({ entry }) => entry.id === "technicals",
            )!.enabled;
        // BUG-0715: the chevron and the rail share one flag; only the column
        // that holds the panel gates the button.
        expect(technicals(context({ settings: { showSidebars: false } }))).toBe(
            false,
        );
        expect(technicals(context())).toBe(true);

        const overview = (ctx: EntryContext) =>
            getSurfaceEntries("rail", ctx).find(
                ({ entry }) => entry.id === "market-overview",
            )!.enabled;
        expect(overview(context({ settings: { showSidebars: false } }))).toBe(
            false,
        );
        // The mobile stack renders the same panel, so width no longer gates it.
        expect(overview(context({ viewportWidth: 1000 }))).toBe(true);
        expect(overview(context())).toBe(true);

        const activity = (ctx: EntryContext) =>
            getSurfaceEntries("rail", ctx).find(
                ({ entry }) => entry.id === "market-activity",
            )!.enabled;
        expect(activity(context())).toBe(false);
        // Availability alone is not enough while the column that holds the
        // panel is off (BUG-0715).
        expect(
            activity(
                context({
                    settings: { showSidebars: false },
                    derived: { sidebarActivityAvailable: true },
                }),
            ),
        ).toBe(false);
        expect(
            activity(
                context({
                    derived: { sidebarActivityAvailable: true },
                }),
            ),
        ).toBe(true);

        const sentiment = (ctx: EntryContext) =>
            getSurfaceEntries("rail", ctx).find(
                ({ entry }) => entry.id === "market-sentiment",
            )!.enabled;
        // The mobile copy honours the same flag, so the toggle works at both
        // widths; the column is the only gate (BUG-0715).
        expect(sentiment(context({ viewportWidth: 1000 }))).toBe(true);
        expect(sentiment(context({ settings: { showSidebars: false } }))).toBe(
            false,
        );
    });
});

describe("evaluateCondition", () => {
    const ctx = context({
        settings: {
            showSidebars: false,
            favoriteSymbols: ["BTCUSDT"],
        },
        entitlement: { pro: true },
        accounts: {
            activeId: "bitunix",
            activeExchange: "bitunix",
            count: 2,
        },
        windows: { journal: "minimized" },
        viewportWidth: 1280,
        ui: {
            selectedPreset: "scalp",
            activeAccountId: "bitunix",
            empty: "",
        },
        derived: {
            sidebarActivityAvailable: true,
            effectiveShowSidebarActivity: false,
        },
        data: { news: true, sentiment: false },
    });

    it("covers the boolean combinators", () => {
        expect(evaluateCondition({ kind: "always" }, ctx)).toBe(true);
        expect(
            evaluateCondition(
                {
                    kind: "all",
                    conditions: [
                        { kind: "always" },
                        { kind: "entitlement", feature: "pro" },
                    ],
                },
                ctx,
            ),
        ).toBe(true);
        expect(
            evaluateCondition(
                {
                    kind: "any",
                    conditions: [
                        { kind: "always" },
                        { kind: "data", key: "sentiment" },
                    ],
                },
                ctx,
            ),
        ).toBe(true);
        expect(
            evaluateCondition(
                {
                    kind: "not",
                    condition: { kind: "data", key: "sentiment" },
                },
                ctx,
            ),
        ).toBe(true);
    });

    it("evaluates settings by truthiness or exact value", () => {
        expect(
            evaluateCondition(
                { kind: "setting", key: "showSidebars" },
                ctx,
            ),
        ).toBe(false);
        expect(
            evaluateCondition(
                { kind: "setting", key: "favoriteSymbols", equals: ["BTCUSDT"] },
                ctx,
            ),
        ).toBe(true);
    });

    it("evaluates entitlement, account and window state", () => {
        expect(
            evaluateCondition(
                { kind: "entitlement", feature: "pro" },
                ctx,
            ),
        ).toBe(true);
        expect(
            evaluateCondition(
                {
                    kind: "account",
                    accountId: "bitunix",
                    exchange: "bitunix",
                    active: true,
                },
                ctx,
            ),
        ).toBe(true);
        expect(
            evaluateCondition(
                { kind: "account", exchange: "bitget", active: false },
                ctx,
            ),
        ).toBe(true);
        expect(
            evaluateCondition(
                { kind: "account", exchange: "bitunix", active: false },
                ctx,
            ),
        ).toBe(false);
        expect(
            evaluateCondition(
                { kind: "window", id: "journal", state: "minimized" },
                ctx,
            ),
        ).toBe(true);
        expect(
            evaluateCondition(
                { kind: "window", id: "journal", state: "open" },
                ctx,
            ),
        ).toBe(false);
    });

    it("evaluates viewport, state, derived and data tokens", () => {
        expect(
            evaluateCondition({ kind: "viewport", minWidth: 1280 }, ctx),
        ).toBe(true);
        expect(
            evaluateCondition({ kind: "viewport", minWidth: 1281 }, ctx),
        ).toBe(false);
        expect(
            evaluateCondition(
                { kind: "state", key: "selectedPreset", nonEmpty: true },
                ctx,
            ),
        ).toBe(true);
        expect(
            evaluateCondition(
                { kind: "state", key: "empty", nonEmpty: true },
                ctx,
            ),
        ).toBe(false);
        expect(
            evaluateCondition(
                {
                    kind: "state",
                    key: "activeAccountId",
                    notEquals: "bitget",
                },
                ctx,
            ),
        ).toBe(true);
        expect(
            evaluateCondition(
                { kind: "derived", key: "sidebarActivityAvailable" },
                ctx,
            ),
        ).toBe(true);
        expect(
            evaluateCondition(
                {
                    kind: "derived",
                    key: "effectiveShowSidebarActivity",
                },
                ctx,
            ),
        ).toBe(false);
        expect(
            evaluateCondition({ kind: "data", key: "news" }, ctx),
        ).toBe(true);
        expect(
            evaluateCondition(
                { kind: "data", key: "sentiment", present: false },
                ctx,
            ),
        ).toBe(true);
    });

    it("covers a non-matching state and a missing window", () => {
        expect(
            evaluateCondition(
                { kind: "state", key: "missing", present: false },
                ctx,
            ),
        ).toBe(true);
        expect(
            evaluateCondition(
                { kind: "window", id: "missing", state: "closed" },
                ctx,
            ),
        ).toBe(true);
    });
});
