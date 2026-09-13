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
    catalogueEntry,
    defaultRef,
    type CatalogueEntry,
} from "./indicatorCatalogue";

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

const registryEntry = (id: string): RegistryEntry | undefined =>
    registry.find((entry) => entry.id === id);

describe("indicator catalogue against the core registry", () => {
    it("names every indicator the core accepts, and no others", () => {
        const inRegistry = registry.map((entry) => entry.id).sort();
        const inCatalogue = INDICATOR_CATALOGUE.map((entry) => entry.id).sort();
        expect(inCatalogue).toEqual(inRegistry);
    });

    it("gives every indicator a group the tab renders", () => {
        for (const entry of INDICATOR_CATALOGUE) {
            expect(INDICATOR_GROUP_ORDER).toContain(entry.group);
        }
    });

    it.each(INDICATOR_CATALOGUE.map((entry) => [entry.id, entry] as const))(
        "%s: parameters match the registry by name, kind and order",
        (id, entry: CatalogueEntry) => {
            const spec = registryEntry(id);
            expect(spec, `${id} is not in the registry`).toBeDefined();
            expect(entry.params.map((param) => [param.name, param.kind])).toEqual(
                spec!.params.map((param) => [param.name, param.kind]),
            );
        },
    );

    it.each(INDICATOR_CATALOGUE.map((entry) => [entry.id, entry] as const))(
        "%s: output lines match the registry by name, dimension and order",
        (id, entry: CatalogueEntry) => {
            const spec = registryEntry(id);
            expect(entry.outputs.map((output) => [output.name, output.dimension])).toEqual(
                spec!.outputs.map((output) => [output.name, output.dimension]),
            );
        },
    );

    it.each(INDICATOR_CATALOGUE.map((entry) => [entry.id, entry] as const))(
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

    it.each(INDICATOR_CATALOGUE.map((entry) => [entry.id, entry] as const))(
        "%s: a rule built from the defaults is accepted by the core",
        (id, entry: CatalogueEntry) => {
            // The strongest form of the check: not "does the name look right"
            // but "does the core take this document". A parameter this
            // catalogue spells differently from the registry is refused here
            // rather than at the moment a trader presses arm.
            const document = {
                ...template,
                name: `catalogue ${id}`,
                conditions: {
                    kind: "compare",
                    left: { kind: "indicator", indicator: defaultRef(entry) },
                    // Constant is dimensionless, so it is the one right-hand
                    // side legal against a percent, a price and a volume alike.
                    op: "gt",
                    right: { kind: "constant", value: "1" },
                    timeframe: "1h",
                },
            };
            expect(() => core.rule_validate(JSON.stringify(document))).not.toThrow();
        },
    );

    it("resolves every catalogued id through catalogueEntry", () => {
        for (const entry of INDICATOR_CATALOGUE) {
            expect(catalogueEntry(entry.id)).toBe(entry);
        }
        expect(catalogueEntry("vwap")).toBeNull();
    });
});
