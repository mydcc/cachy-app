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
 * FEAT-0819 — the grid document, against the real core.
 *
 * Against the committed wasm artefact for the reason `firingPolicy` gives:
 * the refusal claims are claims about Rust code, and the hash is a claim
 * about the canonical form. If the artefact lags the Rust source, the grid
 * exports are missing and this file fails loudly.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

import de from "../../locales/locales/de.json";
import en from "../../locales/locales/en.json";
import { isRuleRefusedError, ruleSchema } from "./ruleSchema";
import type { GridDocument } from "./types";

const WASM_JS = pathToFileURL(resolve(process.cwd(), "static/wasm/technicals_wasm.js")).href;
const WASM_BINARY = resolve(process.cwd(), "static/wasm/technicals_wasm_bg.wasm");

/**
 * The identity of `gridDocument()` as first shipped. A change here means a
 * stored grid's journal entries no longer match their strategy.
 */
const GRID_HASH_AT_INTRODUCTION = "fa2d6e8c11f02e0a18bbb60682045c5f9adee7b63db298041d2ce4a516617faf";

function gridDocument(overrides: Partial<GridDocument> = {}): GridDocument {
  return {
    kind: "grid",
    schema_version: 1,
    id: "grid-1",
    name: "BTC range",
    symbol: "BTCUSDT",
    side: "long",
    evaluation_timeframe: "1h",
    lower_price: "40000",
    upper_price: "50000",
    level_count: 10,
    spacing: "arithmetic",
    sizing: { basis: "quote_budget", amount: "1000" },
    stop_out: [
      {
        kind: "compare",
        left: { kind: "price", field: "close" },
        op: "lt",
        right: { kind: "constant", value: "38000" },
        timeframe: "1h",
      },
    ],
    consequence_level: "simulate",
    enabled: true,
    provenance: { source: "human", created_at_ms: 0 },
    ...overrides,
  };
}

/** Resolves a dotted key against a locale bundle, or undefined. */
function lookup(bundle: unknown, key: string): unknown {
  return key
    .split(".")
    .reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], bundle);
}

/** The refusals a grid draws, as `code@field` pairs plus their i18n keys. */
function refusalsOf(document: GridDocument): { pairs: string[]; keys: string[] } {
  try {
    ruleSchema.validateGrid(document);
  } catch (e) {
    if (!isRuleRefusedError(e)) throw e;
    return {
      pairs: e.refusals.map((r) => `${r.code}@${r.field}`),
      keys: e.refusals.map((r) => r.i18n_key),
    };
  }
  throw new Error("expected the grid to be refused");
}

beforeAll(async () => {
  const mod = (await import(/* @vite-ignore */ WASM_JS)) as {
    default: (binary: BufferSource) => Promise<unknown>;
  };
  await mod.default(readFileSync(WASM_BINARY));
  ruleSchema.setLoader(async () => mod as never);
  await ruleSchema.load();
});

describe("a grid document (FEAT-0819)", () => {
  it.each(["arithmetic", "geometric"] as const)(
    "validates and round-trips with %s spacing",
    (spacing) => {
      const canonical = ruleSchema.validateGrid(gridDocument({ spacing }));

      expect(canonical.spacing).toBe(spacing);
      expect(ruleSchema.validateGrid(canonical)).toEqual(canonical);
      expect(ruleSchema.gridContentHash(canonical)).toBe(
        ruleSchema.gridContentHash(gridDocument({ spacing })),
      );
    },
  );

  it("refuses percent_risk sizing by name", () => {
    const { pairs } = refusalsOf(gridDocument({ sizing: { basis: "percent_risk", amount: "1" } }));
    expect(pairs).toContain("grid_risk_sizing_unsupported@sizing.basis");
  });

  it("refuses an empty stop-out, with no opt-out", () => {
    const { pairs } = refusalsOf(gridDocument({ stop_out: [] }));
    expect(pairs).toContain("grid_stop_out_required@stop_out");
  });

  it("refuses a send-level grid as paper only", () => {
    const { pairs } = refusalsOf(gridDocument({ consequence_level: "send" }));
    expect(pairs).toContain("grid_paper_only@consequence_level");
  });

  it("stores one value for two spellings of a price, so the identity is one", () => {
    const spelled = gridDocument({ lower_price: "40000.00", sizing: { basis: "quote_budget", amount: "1000.0" } });

    const canonical = ruleSchema.validateGrid(spelled);

    expect(canonical.lower_price).toBe("40000");
    expect(canonical.sizing.amount).toBe("1000");
    expect(ruleSchema.gridContentHash(spelled)).toBe(ruleSchema.gridContentHash(gridDocument()));
  });

  it("keeps the identity it shipped with", () => {
    expect(ruleSchema.gridContentHash(gridDocument())).toBe(GRID_HASH_AT_INTRODUCTION);
  });

  it("is never read as a rule", () => {
    expect(() => ruleSchema.validate(gridDocument() as never)).toThrow();
  });

  it("names every grid refusal in both locales", () => {
    const refused = [
      gridDocument({ sizing: { basis: "percent_risk", amount: "0" } }),
      gridDocument({ stop_out: [], consequence_level: "send" }),
      gridDocument({ lower_price: "0", level_count: 1 }),
    ].flatMap((doc) => refusalsOf(doc).keys);

    for (const key of new Set(refused)) {
      expect(lookup(en, key), `en: ${key}`).toEqual(expect.any(String));
      expect(lookup(de, key), `de: ${key}`).toEqual(expect.any(String));
    }
  });
});
