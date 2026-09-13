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

/**
 * FEAT-0028 -- the test that makes a hand-written catalogue safe.
 *
 * `indicatorCatalogue.ts` repeats facts that live in
 * `technicals-wasm/src/rule/indicator.rs`, because the panel needs grouping,
 * defaults and translatable names that the registry has no business carrying.
 * Every one of those repeated facts is checked here against the registry as
 * the real WASM artefact reports it, so the second list cannot drift:
 *
 * - an indicator added in Rust and forgotten here fails, which is the silent
 *   failure a hand-written catalogue otherwise has -- the picker simply never
 *   offers it and nobody finds out
 * - a parameter renamed in Rust fails, rather than shipping a builder that
 *   writes a key the core refuses
 * - an output's dimension changed in Rust fails, rather than the picker
 *   offering a pairing `Condition::validate` will reject at arming time
 *
 * It runs against the committed artefact rather than against the Rust source,
 * so a stale `static/wasm/` is caught too.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import Decimal from "decimal.js";
import { beforeAll, describe, expect, it } from "vitest";

import {
    INDICATOR_CATALOGUE,
    INDICATOR_GROUP_ORDER,
    REGISTRY_CATALOGUE,
    catalogueEntry,
    defaultRef,
    indicatorsInGroup,
    type CatalogueEntry,
} from "./indicatorCatalogue";
import { MAX_WINDOW_LOOKBACK, MIN_WINDOW_LOOKBACK } from "./indicatorConditionForm";
import { ALERT_PATH_INDICATORS } from "../rules/alertPathIndicators";
import { computeIndicatorSeries } from "../rules/indicatorSeries";

const WASM_JS = pathToFileURL(resolve(process.cwd(), "static/wasm/technicals_wasm.js")).href;
const WASM_BINARY = resolve(process.cwd(), "static/wasm/technicals_wasm_bg.wasm");

interface RegistryParam {
    name: string;
    kind: "period" | "factor";
    min: number | string;
    max: number | string;
}
interface RegistryEntry {
    id: string;
    params: RegistryParam[];
    outputs: { name: string; dimension: string }[];
    cumulative: boolean;
}
interface RuleCore {
    rule_indicator_registry(): string;
    rule_validate(documentJson: string): string;
    rule_from_alert_json(alertJson: string, timeframe: string, createdAtMs: number): string;
}

let registry: RegistryEntry[];
let core: RuleCore;
let template: Record<string, unknown>;

beforeAll(async () => {
    const mod = (await import(/* @vite-ignore */ WASM_JS)) as {
        default: (binary: BufferSource) => Promise<unknown>;
    } & RuleCore;
    await mod.default(readFileSync(WASM_BINARY));
    core = mod;
    registry = JSON.parse(mod.rule_indicator_registry()) as RegistryEntry[];

    const alert = {
        id: "catalogue",
        symbol: "BTCUSDT",
        condition: { price_reached: "50000.0" },
        active: true,
    };
    template = JSON.parse(mod.rule_from_alert_json(JSON.stringify(alert), "1h", 1_700_000_000_000));
});

/** The ids the registry marks cumulative — read from it, not copied. */
const cumulativeIds = (): string[] => registry.filter((entry) => entry.cumulative).map((entry) => entry.id);

const registryEntry = (id: string): RegistryEntry | undefined =>
    registry.find((entry) => entry.id === id);

describe("indicator catalogue against the core registry", () => {
    it("names every indicator the core accepts, and no others", () => {
        const inRegistry = registry.map((entry) => entry.id).sort();
        const inCatalogue = REGISTRY_CATALOGUE.map((entry) => entry.id).sort();
        expect(inCatalogue).toEqual(inRegistry);
    });

    it("gives every indicator a group the tab renders", () => {
        for (const entry of REGISTRY_CATALOGUE) {
            expect(INDICATOR_GROUP_ORDER).toContain(entry.group);
        }
    });

    it.each(REGISTRY_CATALOGUE.map((entry) => [entry.id, entry] as const))(
        "%s: parameters match the registry by name, kind and order",
        (id, entry: CatalogueEntry) => {
            const spec = registryEntry(id);
            expect(spec, `${id} is not in the registry`).toBeDefined();
            expect(entry.params.map((param) => [param.name, param.kind])).toEqual(
                spec!.params.map((param) => [param.name, param.kind]),
            );
        },
    );

    it.each(REGISTRY_CATALOGUE.map((entry) => [entry.id, entry] as const))(
        "%s: output lines match the registry by name, dimension and order",
        (id, entry: CatalogueEntry) => {
            const spec = registryEntry(id);
            expect(entry.outputs.map((output) => [output.name, output.dimension])).toEqual(
                spec!.outputs.map((output) => [output.name, output.dimension]),
            );
        },
    );

    it.each(REGISTRY_CATALOGUE.map((entry) => [entry.id, entry] as const))(
        "%s: is cumulative exactly when the registry says so",
        (id, entry: CatalogueEntry) => {
            expect(entry.cumulative === true).toBe(registryEntry(id)!.cumulative);
        },
    );

    it.each(REGISTRY_CATALOGUE.map((entry) => [entry.id, entry] as const))(
        "%s: every default lies inside the registry's bounds",
        (id, entry: CatalogueEntry) => {
            const spec = registryEntry(id)!;
            for (const param of entry.params) {
                const bounds = spec.params.find((candidate) => candidate.name === param.name)!;
                // Compared as decimals in both cases: a factor's bounds are
                // carried as strings precisely so they do not round on the way
                // here, and Number() would undo that at the comparison.
                const actual = new Decimal(String(param.default));
                expect(
                    actual.greaterThanOrEqualTo(new Decimal(String(bounds.min))),
                    `${id}.${param.name} default ${String(param.default)} < min ${bounds.min}`,
                ).toBe(true);
                expect(
                    actual.lessThanOrEqualTo(new Decimal(String(bounds.max))),
                    `${id}.${param.name} default ${String(param.default)} > max ${bounds.max}`,
                ).toBe(true);
            }
        },
    );

    it.each(REGISTRY_CATALOGUE.map((entry) => [entry.id, entry] as const))(
        "%s: a rule built from the defaults is accepted by the core",
        (id, entry: CatalogueEntry) => {
            // The strongest form of the check: not "does the name look right"
            // but "does the core take this document". A parameter this
            // catalogue spells differently from the registry is refused here
            // rather than at the moment a trader presses arm.
            const subject = { kind: "indicator", indicator: defaultRef(entry) };
            const document = {
                ...template,
                name: `catalogue ${id}`,
                conditions: {
                    kind: "compare",
                    left: subject,
                    op: cumulativeIds().includes(id) ? "gte" : "gt",
                    // Constant is dimensionless, so it is the one right-hand
                    // side legal against a percent, a price and a volume alike —
                    // except for a cumulative indicator, which the core accepts
                    // only against a window over itself.
                    right: cumulativeIds().includes(id)
                        ? { kind: "window", of: subject, agg: "max", lookback: 20 }
                        : { kind: "constant", value: "1" },
                    timeframe: "1h",
                },
            };
            expect(() => core.rule_validate(JSON.stringify(document))).not.toThrow();
        },
    );

    /**
     * FEAT-0446 group 4. OBV's level depends on how much history is loaded, so
     * the core refuses it against anything but a window over itself. Checked
     * against the artefact, since that is what arms a trader's rule.
     */
    it("refuses a window span outside exactly the bounds the builder offers", () => {
        // Only the span's own refusal is asserted. A long window over an
        // indicator can also exceed the rule's total warmup, which the core
        // refuses separately and the panel shows as that refusal.
        const rsi = { kind: "indicator", indicator: { id: "rsi", params: { period: 14 } } };
        const valid = (lookback: number): boolean => {
            try {
                core.rule_validate(
                    JSON.stringify({
                        ...template,
                        name: "window span",
                        conditions: {
                            kind: "compare",
                            left: rsi,
                            op: "gte",
                            right: { kind: "window", of: rsi, agg: "max", lookback },
                            timeframe: "1h",
                        },
                    }),
                );
                return true;
            } catch (e) {
                return !JSON.stringify(e).includes("invalid_window_lookback");
            }
        };
        expect(valid(MIN_WINDOW_LOOKBACK)).toBe(true);
        expect(valid(MAX_WINDOW_LOOKBACK)).toBe(true);
        expect(valid(MIN_WINDOW_LOOKBACK - 1)).toBe(false);
        expect(valid(MAX_WINDOW_LOOKBACK + 1)).toBe(false);
    });

    it("refuses a cumulative indicator against a number, and accepts it at its own window extreme", () => {
        expect(cumulativeIds()).toEqual(["obv"]);
        const obv = { kind: "indicator", indicator: { id: "obv", params: {} } };
        const documentWith = (right: unknown) => ({
            ...template,
            name: "obv",
            conditions: { kind: "compare", left: obv, op: "gte", right, timeframe: "1h" },
        });
        const refusalOf = (document: unknown): string | null => {
            try {
                core.rule_validate(JSON.stringify(document));
                return null;
            } catch (e) {
                return JSON.stringify(e);
            }
        };

        expect(refusalOf(documentWith({ kind: "constant", value: "1000000" }))).toContain(
            "cumulative_needs_own_window",
        );
        expect(refusalOf(documentWith({ kind: "window", of: obv, agg: "max", lookback: 20 }))).toBeNull();
    });

    it("resolves every offered id through catalogueEntry", () => {
        for (const entry of INDICATOR_CATALOGUE) {
            expect(catalogueEntry(entry.id)).toBe(entry);
        }
        expect(catalogueEntry("vwap")).toBeNull();
    });
});

/**
 * BUG-0451 — the panel offered all 23 registry indicators, and 14 of them have
 * no JavaScript implementation on the alert path: an alert on one was armed and
 * then reported as "can never fire" on its first close.
 */
describe("what the alert panel offers", () => {
    it("offers exactly the indicators the alert path computes", () => {
        const offered = INDICATOR_CATALOGUE.map((entry) => entry.id).sort();
        expect(offered).toEqual([...ALERT_PATH_INDICATORS].sort());

        // And each one really does compute: a list that claims more than the
        // path can do would reopen the bug under a different name.
        const candles = Array.from({ length: 120 }, (_, i) => {
            const price = String(100 + (i % 11));
            return { open_time_ms: i * 60_000, open: price, high: price, low: price, close: price, volume: "10" };
        });
        for (const entry of INDICATOR_CATALOGUE) {
            const result = computeIndicatorSeries(
                { indicator: defaultRef(entry), timeframe: "1h" },
                candles,
            );
            expect(result.supported, entry.id).toBe(true);
        }
    });

    it("hides the registry indicators an alert cannot fire on, and resolves none of them", () => {
        const hidden = REGISTRY_CATALOGUE.filter((entry) => !ALERT_PATH_INDICATORS.has(entry.id))
            .map((entry) => entry.id)
            .sort();

        // Pinned by name, so wiring one into the alert path is a visible change
        // here, alongside the recorded-history expectation FEAT-0446 requires
        // for it in the same change.
        // Empty since FEAT-0446 group 4: every registry indicator computes.
        expect(hidden).toEqual([]);
        for (const id of hidden) {
            expect(catalogueEntry(id), id).toBeNull();
        }
        for (const group of INDICATOR_GROUP_ORDER) {
            expect(indicatorsInGroup(group).some((entry) => hidden.includes(entry.id)), group).toBe(false);
        }
    });
});
