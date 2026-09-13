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
 * FEAT-0395 -- the test that makes the settings-to-core mapping safe.
 *
 * `indicatorSettingsSeed.ts` sits between two lists that drift in opposite
 * directions, so it is pinned against both:
 *
 * - **Downwards, to the core.** Every mapping is turned into a real rule
 *   document and handed to `rule_validate` from the committed WASM artefact.
 *   A core parameter this mapping spells wrong is refused here rather than at
 *   the moment a trader presses arm.
 * - **Upwards, to the panel.** Every settings field the mapping reads is read
 *   off `indicatorState` itself, so a renamed panel key fails too. Without
 *   this half the failure is silent in the worst possible way: the reader
 *   returns `null`, the registry default takes over, and the trader gets an
 *   alarm on RSI 14 while their screen says 21.
 *
 * That second failure mode is why the readers fall back to a default rather
 * than throwing, and why it has to be a test that catches it.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { beforeAll, describe, expect, it } from "vitest";

import { catalogueEntry, registryEntry } from "./indicatorCatalogue";
import {
    alertableIndicatorKeys,
    indicatorRefsFrom,
    isAlertableIndicator,
    mappedIndicatorKeys,
    mappedIndicatorRefs,
    mappingLines,
    seedFromIndicatorSettings,
} from "./indicatorSettingsSeed";
import { indicatorState } from "../../stores/indicator.svelte";

const WASM_JS = pathToFileURL(resolve(process.cwd(), "static/wasm/technicals_wasm.js")).href;
const WASM_BINARY = resolve(process.cwd(), "static/wasm/technicals_wasm_bg.wasm");

interface RuleCore {
    rule_validate(documentJson: string): string;
    rule_from_alert_json(alertJson: string, timeframe: string, createdAtMs: number): string;
}

let core: RuleCore;
let template: Record<string, unknown>;

beforeAll(async () => {
    const mod = (await import(/* @vite-ignore */ WASM_JS)) as {
        default: (binary: BufferSource) => Promise<unknown>;
    } & RuleCore;
    await mod.default(readFileSync(WASM_BINARY));
    core = mod;

    const alert = {
        id: "seed",
        symbol: "BTCUSDT",
        condition: { price_reached: "50000.0" },
        active: true,
    };
    template = JSON.parse(mod.rule_from_alert_json(JSON.stringify(alert), "1h", 1_700_000_000_000));
});

/**
 * The settings card the panel actually holds for a key.
 *
 * Read off the store's own public fields rather than its snapshot, so the
 * test fails when a card is renamed and not when a caching detail changes.
 */
const cardFor = (key: string): Record<string, unknown> =>
    (indicatorState as unknown as Record<string, Record<string, unknown>>)[key];

/** Cards a trader can arm an alert from today. */
const KEYS = alertableIndicatorKeys();
/**
 * Every card the mapping covers. The validity checks run over these, so a
 * mapping for an indicator not yet on the alert path does not rot unchecked.
 */
const MAPPED = mappedIndicatorKeys();

describe("the settings keys the mapping claims", () => {
    it("every mapped key is a real card on the indicator store", () => {
        for (const key of MAPPED) {
            const card = cardFor(key);
            expect(card, `${key} is not a card on indicatorState`).toBeDefined();
            expect(typeof card, `${key} is not an object on indicatorState`).toBe("object");
        }
    });

    it("leaves out the cards the rule core cannot express", () => {
        // Not an oversight list: a rule has no way to name a pivot level, a
        // session VWAP, a volume profile row or the ATR trailing stop, so an
        // action on those cards would open the panel onto nothing.
        for (const key of ["pivots", "vwap", "volumeProfile", "atrTrailingStop"]) {
            expect(isAlertableIndicator(key)).toBe(false);
            expect(indicatorRefsFrom(key, cardFor(key) ?? {})).toEqual([]);
            expect(seedFromIndicatorSettings(key, cardFor(key) ?? {}, "BTCUSDT")).toBeNull();
        }
    });

    it("resolves every mapped id through the registry, and every armable one through the catalogue", () => {
        for (const key of MAPPED) {
            for (const ref of mappedIndicatorRefs(key, cardFor(key))) {
                expect(registryEntry(ref.id), `${key} -> ${ref.id}`).not.toBeNull();
            }
        }
        for (const key of KEYS) {
            for (const ref of indicatorRefsFrom(key, cardFor(key))) {
                expect(catalogueEntry(ref.id), `${key} -> ${ref.id}`).not.toBeNull();
            }
        }
    });
});

describe("a rule built from the panel's own settings", () => {
    it.each(MAPPED.map((key) => [key] as const))(
        "%s: every configured line is accepted by the core",
        (key) => {
            const refs = mappedIndicatorRefs(key, cardFor(key));
            expect(refs.length, `${key} produced no refs`).toBeGreaterThan(0);
            for (const ref of refs) {
                const document = {
                    ...template,
                    name: `seed ${key}`,
                    conditions: {
                        kind: "compare",
                        left: { kind: "indicator", indicator: ref },
                        // Constant is dimensionless, so it is legal against a
                        // price, a percent and a volume alike.
                        op: "gt",
                        right: { kind: "constant", value: "1" },
                        timeframe: "1h",
                    },
                };
                expect(
                    () => core.rule_validate(JSON.stringify(document)),
                    `${key} -> ${ref.id} ${JSON.stringify(ref.params)}`,
                ).not.toThrow();
            }
        },
    );

    it.each(MAPPED.map((key) => [key] as const))(
        "%s: names exactly the parameters the core declares",
        (key) => {
            /*
             * Against the mapping's *declared* names, not against the produced
             * ref. The produced ref always has the right keys by construction
             * -- `refFor` walks the registry -- so asserting on it proves
             * nothing. A mapping key the core does not declare is never read,
             * the default quietly takes over, and `rule_validate` accepts the
             * document. This is the only check that sees that.
             */
            for (const line of mappingLines(key)) {
                const entry = registryEntry(line.id)!;
                expect(
                    [...line.params].sort(),
                    `${key} -> ${line.id} declares parameters the core does not`,
                ).toEqual(entry.params.map((param) => param.name).sort());
            }
        },
    );
});

describe("carrying the configured parameters rather than the defaults", () => {
    it("takes the trader's RSI period, not the registry's 14", () => {
        const [ref] = indicatorRefsFrom("rsi", { length: 21 });
        expect(ref.params.period).toBe(21);
    });

    it("maps MACD's three panel lengths onto the core's three periods", () => {
        const [ref] = indicatorRefsFrom("macd", {
            fastLength: 8,
            slowLength: 21,
            signalLength: 5,
        });
        expect(ref.params).toEqual({
            fast_period: 8,
            slow_period: 21,
            signal_period: 5,
        });
    });

    it("turns one EMA card into one ref per configured line, in panel order", () => {
        const refs = indicatorRefsFrom("ema", {
            ema1: { length: 21 },
            ema2: { length: 50 },
            ema3: { length: 200 },
        });
        expect(refs.map((ref) => ref.params.period)).toEqual([21, 50, 200]);
        expect(refs.every((ref) => ref.id === "ema")).toBe(true);
    });

    it("carries a std-dev as a decimal string rather than a float", () => {
        const [ref] = indicatorRefsFrom("bollingerBands", { length: 20, stdDev: 2.5 });
        // A factor reaches a comparison against a price. The core takes a
        // decimal string for that reason and the panel stores a number, so
        // this seam is where the conversion has to be exact.
        expect(ref.params.std_dev).toBe("2.5");
        expect(typeof ref.params.std_dev).toBe("string");
    });

    // BUG-0451. Parabolic SAR has no JavaScript implementation on the alert
    // path, so its card offers no alert action rather than seeding an alert
    // that would be armed and never fire.
    it("offers no alert action on a card whose indicator an alert cannot fire on", () => {
        const card = { start: 0.02, increment: 0.02, max: 0.2 };
        expect(indicatorRefsFrom("parabolicSar", card)).toEqual([]);
        expect(seedFromIndicatorSettings("parabolicSar", card, "BTCUSDT")).toBeNull();
    });
});

describe("a card that cannot supply a parameter", () => {
    it("falls back to the registry default rather than emitting a bad document", () => {
        // A migrated or hand-edited `localStorage` is a boundary, and a
        // document with a missing period is one the core refuses -- a refusal
        // the trader would meet as "the button does nothing".
        const [ref] = indicatorRefsFrom("rsi", {});
        expect(ref.params.period).toBe(14);
    });

    it.each([
        ["a fraction", 14.5],
        ["zero", 0],
        ["a negative", -5],
        ["text", "not a number"],
        ["null", null],
    ])("refuses %s as a period and defaults instead", (_label, value) => {
        const [ref] = indicatorRefsFrom("rsi", { length: value });
        expect(ref.params.period).toBe(14);
    });

    it("reads a numeric string, because a number input can produce one", () => {
        const [ref] = indicatorRefsFrom("rsi", { length: "21" });
        expect(ref.params.period).toBe(21);
    });
});

describe("the seed the entry point hands to the panel", () => {
    const card = { length: 21 };

    it("opens the Indicators tab on the clicked symbol", () => {
        const seed = seedFromIndicatorSettings("rsi", card, "ETHUSDT")!;
        expect(seed.tab).toBe("indicators");
        expect(seed.symbol).toBe("ETHUSDT");
    });

    it("seeds the configured indicator with the threshold left blank", () => {
        const seed = seedFromIndicatorSettings("rsi", card, "BTCUSDT")!;
        expect(seed.condition).toMatchObject({
            kind: "compare",
            left: { kind: "indicator", indicator: { id: "rsi", params: { period: 21 } } },
            op: "gt",
            // Zero, not 70. The level is the one number that is not on the
            // trader's screen, and a plausible default is what gets armed
            // unread (ADR-0012 decision 5).
            right: { kind: "constant", value: "0" },
        });
    });

    it("seeds the first line of a multi-line card", () => {
        const seed = seedFromIndicatorSettings(
            "ema",
            { ema1: { length: 21 }, ema2: { length: 50 }, ema3: { length: 200 } },
            "BTCUSDT",
        )!;
        expect(seed.condition).toMatchObject({
            left: { kind: "indicator", indicator: { params: { period: 21 } } },
        });
    });

    it("copies the parameters instead of tracking the panel", () => {
        // The invariant on `IndicatorRef.params`: a rule never inherits panel
        // settings. The entry point reads them once; retuning the indicator
        // afterwards must not retune an alert the trader already armed.
        const live: Record<string, unknown> = { length: 21 };
        const seed = seedFromIndicatorSettings("rsi", live, "BTCUSDT")!;
        live.length = 7;
        expect(seed.condition).toMatchObject({
            left: { kind: "indicator", indicator: { params: { period: 21 } } },
        });
    });

    it("agrees with the button about which cards are armable", () => {
        // Over every mapped card, not only the armable ones: a card whose button
        // shows but whose seed is null is a button that does nothing.
        for (const key of MAPPED) {
            const seed = seedFromIndicatorSettings(key, cardFor(key), "BTCUSDT");
            expect(isAlertableIndicator(key), key).toBe(seed !== null);
        }
        expect(KEYS.length).toBeGreaterThan(0);
        expect(KEYS.length).toBeLessThan(MAPPED.length);
    });
});
