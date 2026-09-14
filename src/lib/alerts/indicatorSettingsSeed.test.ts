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
    ALERT_PATH_INDICATORS,
    PRICE_FIELDS,
    defaultFieldOf,
    effectiveFieldOf,
} from "../rules/alertPathIndicators";
import type { IndicatorRef } from "../rules/types";
import {
    alertableIndicatorKeys,
    cardAlertAvailability,
    cardAlertSource,
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
                const subject = { kind: "indicator", indicator: ref };
                const cumulative = registryEntry(ref.id)?.cumulative === true;
                const document = {
                    ...template,
                    name: `seed ${key}`,
                    conditions: {
                        kind: "compare",
                        left: subject,
                        // Constant is dimensionless, so it is legal against a
                        // price, a percent and a volume alike. A cumulative
                        // indicator is the exception: the core takes it only
                        // against a window over itself.
                        op: cumulative ? "gte" : "gt",
                        right: cumulative
                            ? { kind: "window", of: subject, agg: "max", lookback: 20 }
                            : { kind: "constant", value: "1" },
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

    // BUG-0451. A card whose indicator the alert path cannot compute offers no
    // alert action rather than seeding an alert that would be armed and never
    // fire. Since FEAT-0446 group 4 every mapped indicator computes, so this is
    // checked as the rule itself rather than on a named card that no longer
    // exists.
    it("offers an alert action exactly on the cards whose indicator the alert path computes", () => {
        for (const key of MAPPED) {
            const computes = mappedIndicatorRefs(key, cardFor(key)).every((ref) => ALERT_PATH_INDICATORS.has(ref.id));
            expect(isAlertableIndicator(key), key).toBe(computes);
        }
    });

    // FEAT-0446 group 4. The core takes OBV only against its own window, so
    // the card seeds the one shape it accepts rather than "OBV > 0".
    it("seeds an OBV card at its own 20-candle high", () => {
        const seed = seedFromIndicatorSettings("obv", { smoothingLength: 0 }, "BTCUSDT");
        const obv = { kind: "indicator", indicator: { id: "obv", params: {}, output: "value" } };
        expect(seed?.condition).toMatchObject({
            kind: "compare",
            left: obv,
            op: "gte",
            right: { kind: "window", of: obv, agg: "max", lookback: 20 },
        });
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
            const availability = cardAlertAvailability(key, cardFor(key));
            expect(isAlertableIndicator(key), key).toBe(availability !== "not-alertable");
            expect(availability === "armable", key).toBe(seed !== null);
        }
        // Every mapped card computes on the alert path since FEAT-0446 group 4,
        // so the armable keys are all of them.
        expect(KEYS.length).toBeGreaterThan(0);
        expect([...KEYS].sort()).toEqual([...MAPPED].sort());
    });
});

/**
 * FEAT-0454, replacing BUG-0453's refusal. The chart computes a card's line over
 * the card's own source. An alert armed from the card now names that price on
 * its reference (`IndicatorRef.field`) wherever the core computes the indicator
 * over one, so it reads the line on screen. Stoch RSI's source is fixed to the
 * close, so a card holding another one — only through a hand-edited store —
 * still seeds nothing, and the button says why.
 */
describe("a card drawn over a price source", () => {
    /** Armable cards that carry a source, read off the store itself. */
    const SOURCED = KEYS.filter((key) => "source" in cardFor(key));
    const indicatorOf = (key: string) => mappingLines(key)[0].id;
    const PRICED = SOURCED.filter((key) => defaultFieldOf(indicatorOf(key)) !== null);
    const FIXED = SOURCED.filter((key) => defaultFieldOf(indicatorOf(key)) === null);
    const leftOf = (seed: ReturnType<typeof seedFromIndicatorSettings>): IndicatorRef =>
        (seed?.condition as unknown as { left: { indicator: IndicatorRef } }).left.indicator;

    it("lets every sourced card carry its price but stoch RSI's, which is fixed", () => {
        expect([...PRICED].sort()).toEqual(["bollingerBands", "cci", "ema", "macd", "momentum", "rsi"]);
        expect(FIXED).toEqual(["stochRsi"]);
    });

    it("computes CCI over the typical price and every other sourced card over the close by default", () => {
        for (const key of SOURCED) {
            expect(cardAlertSource(key), key).toBe(key === "cci" ? "hlc3" : "close");
        }
        expect(cardAlertSource("pivots")).toBeNull();
    });

    it("seeds an alert over every price a card with a price choice is drawn over", () => {
        for (const key of PRICED) {
            for (const source of PRICE_FIELDS) {
                const card = { ...cardFor(key), source };
                const label = `${key} on ${source}`;
                expect(cardAlertAvailability(key, card), label).toBe("armable");
                const refs = indicatorRefsFrom(key, card);
                expect(refs.length, label).toBeGreaterThan(0);
                for (const ref of refs) expect(effectiveFieldOf(ref), label).toBe(source);
                const seed = seedFromIndicatorSettings(key, card, "BTCUSDT");
                expect(effectiveFieldOf(leftOf(seed)), label).toBe(source);
            }
        }
    });

    it("seeds an RSI card on hl2 as RSI over hl2", () => {
        const seed = seedFromIndicatorSettings("rsi", { length: 14, source: "hl2" }, "BTCUSDT");
        expect(leftOf(seed)).toEqual({ id: "rsi", params: { period: 14 }, output: "value", field: "hl2" });
    });

    it("names the price on the reference only when it is not the indicator's default", () => {
        // The core drops a default field on the wire, so writing one here would
        // make the draft a different document from the one the core stores.
        const [rsiClose] = indicatorRefsFrom("rsi", { length: 14, source: "close" });
        expect("field" in rsiClose).toBe(false);
        const [cciTypical] = indicatorRefsFrom("cci", { length: 20, source: "hlc3" });
        expect("field" in cciTypical).toBe(false);
        const [cciClose] = indicatorRefsFrom("cci", { length: 20, source: "close" });
        expect(cciClose.field).toBe("close");
    });

    it("carries the price on every line of a multi-line card", () => {
        const refs = indicatorRefsFrom("ema", {
            ema1: { length: 21 },
            ema2: { length: 50 },
            ema3: { length: 200 },
            source: "hl2",
        });
        expect(refs.map((ref) => ref.field)).toEqual(["hl2", "hl2", "hl2"]);
    });

    it.each(PRICED.map((key) => [key] as const))(
        "%s: the core accepts the seeded condition over every price",
        (key) => {
            for (const source of PRICE_FIELDS) {
                const seed = seedFromIndicatorSettings(key, { ...cardFor(key), source }, "BTCUSDT")!;
                const document = { ...template, name: `seed ${key} ${source}`, conditions: seed.condition };
                expect(() => core.rule_validate(JSON.stringify(document)), `${key} on ${source}`).not.toThrow();
            }
        },
    );

    it("seeds no alert from a card whose indicator is computed over one fixed price, drawn over another", () => {
        for (const key of FIXED) {
            for (const source of PRICE_FIELDS.filter((s) => s !== cardAlertSource(key))) {
                const card = { ...cardFor(key), source };
                const label = `${key} on ${source}`;
                expect(isAlertableIndicator(key), label).toBe(true);
                expect(cardAlertAvailability(key, card), label).toBe("source-mismatch");
                expect(indicatorRefsFrom(key, card), label).toEqual([]);
                expect(seedFromIndicatorSettings(key, card, "BTCUSDT"), label).toBeNull();
            }
            const onClose = { ...cardFor(key), source: "close" };
            expect(cardAlertAvailability(key, onClose), key).toBe("armable");
            expect(leftOf(seedFromIndicatorSettings(key, onClose, "BTCUSDT")).field, key).toBeUndefined();
        }
    });

    it("arms the CCI card on the typical price it defaults to", () => {
        expect(cardFor("cci").source).toBe("hlc3");
        expect(cardAlertAvailability("cci", cardFor("cci"))).toBe("armable");
        expect(indicatorRefsFrom("cci", cardFor("cci"))[0].field).toBeUndefined();
    });

    it.each([
        ["missing", undefined],
        ["null", null],
        ["empty", ""],
        ["zero", 0],
        ["false", false],
    ])("reads a %s source as the close, which is what the chart draws for it", (_label, source) => {
        const card = { length: 21, source };
        expect(cardAlertAvailability("rsi", card)).toBe("armable");
        expect(indicatorRefsFrom("rsi", card)[0].field).toBeUndefined();
        // And therefore not as CCI's typical price: CCI over the close.
        expect(cardAlertAvailability("cci", card)).toBe("armable");
        expect(indicatorRefsFrom("cci", card)[0].field).toBe("close");
        expect(cardAlertAvailability("stochRsi", card)).toBe("armable");
    });

    it("refuses a source it does not recognise rather than assuming a price", () => {
        // Only reachable through a hand-edited store. Withholding the shortcut
        // costs a click; guessing wrong arms an alert on the wrong line.
        const card = { length: 21, source: "ohlc4" };
        expect(cardAlertAvailability("rsi", card)).toBe("source-mismatch");
        expect(cardAlertAvailability("cci", card)).toBe("source-mismatch");
        expect(cardAlertAvailability("stochRsi", card)).toBe("source-mismatch");
        expect(seedFromIndicatorSettings("rsi", card, "BTCUSDT")).toBeNull();
    });

    it("answers not-alertable for a card with no alert action, whatever its source", () => {
        expect(cardAlertAvailability("pivots", { source: "hl2" })).toBe("not-alertable");
    });
});

/**
 * FEAT-0446 group 3. The core's ADX has one period, carried from the card's
 * smoothing. The chart draws the pane over the DI length. A card that sets the
 * two apart would seed an alert on a line nobody is looking at.
 */
describe("an ADX card whose DI length and smoothing differ", () => {
    it("arms the default card, whose two lengths agree", () => {
        expect(cardAlertAvailability("adx", cardFor("adx"))).toBe("armable");
        expect(indicatorRefsFrom("adx", cardFor("adx")).map((r) => [r.id, r.params])).toEqual([["adx", { period: 14 }]]);
    });

    it("seeds no alert when they differ, and says so", () => {
        const card = { ...cardFor("adx"), diLength: 10, adxSmoothing: 14 };
        expect(isAlertableIndicator("adx")).toBe(true);
        expect(cardAlertAvailability("adx", card)).toBe("length-mismatch");
        expect(indicatorRefsFrom("adx", card)).toEqual([]);
        expect(seedFromIndicatorSettings("adx", card, "BTCUSDT")).toBeNull();
    });

    it("reads a missing DI length as the smoothing, which is what the chart draws for it", () => {
        const card = { adxSmoothing: 20 };
        expect(cardAlertAvailability("adx", card)).toBe("armable");
        expect(indicatorRefsFrom("adx", card).map((r) => [r.id, r.params])).toEqual([["adx", { period: 20 }]]);
    });

    it("leaves every other card alone", () => {
        expect(cardAlertAvailability("rsi", { length: 14, diLength: 3 })).toBe("armable");
    });
});

/**
 * FEAT-0446 group 4. The core's Ichimoku has no displacement; the alert path
 * reads the cloud 26 candles forward, where the chart draws it for a card at 26.
 */
describe("an Ichimoku card displaced by another number of candles", () => {
    it("arms the default card, displaced by 26", () => {
        const card = { ...cardFor("ichimoku"), displacement: 26 };
        expect(cardAlertAvailability("ichimoku", card)).toBe("armable");
        expect(indicatorRefsFrom("ichimoku", card).map((r) => r.id)).toContain("ichimoku");
    });

    it("seeds no alert on another displacement, and says so", () => {
        const card = { ...cardFor("ichimoku"), displacement: 30 };
        expect(isAlertableIndicator("ichimoku")).toBe(true);
        expect(cardAlertAvailability("ichimoku", card)).toBe("displacement-mismatch");
        expect(indicatorRefsFrom("ichimoku", card)).toEqual([]);
        expect(seedFromIndicatorSettings("ichimoku", card, "BTCUSDT")).toBeNull();
    });

    it("reads a missing displacement as 26, which is what the chart draws for it", () => {
        const card = { conversionPeriod: 9, basePeriod: 26, spanBPeriod: 52 };
        expect(cardAlertAvailability("ichimoku", card)).toBe("armable");
        expect(cardAlertAvailability("ichimoku", { ...card, displacement: 0 })).toBe("armable");
    });

    it("leaves every other card alone", () => {
        expect(cardAlertAvailability("rsi", { length: 14, displacement: 3 })).toBe("armable");
    });
});
