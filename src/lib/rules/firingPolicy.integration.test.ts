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
 * FEAT-0822 — the firing policy and the limits, against the real core.
 *
 * Against the real wasm for the same two reasons `exitConditions` is: the
 * hash claims are claims about the canonical form, and the refusal claims
 * are claims about Rust code a fake would be free to invent. The artefact
 * is committed, so this runs on a bare checkout — and it fails loudly if
 * the artefact ever lags the Rust source.
 *
 * The hash constants are the same fixtures, and therefore the same numbers,
 * as `stopDistance` and `exitConditions`: the v4 fields must stay
 * `skip_serializing_if`, or every strategy identity recorded before them
 * silently moves.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

import de from "../../locales/locales/de.json";
import en from "../../locales/locales/en.json";
import { isRuleRefusedError, ruleSchema } from "./ruleSchema";
import type { FiringPolicy, RuleDocument } from "./types";

const WASM_JS = pathToFileURL(resolve(process.cwd(), "static/wasm/technicals_wasm.js")).href;
const WASM_BINARY = resolve(process.cwd(), "static/wasm/technicals_wasm_bg.wasm");

/** Measured before `firing_policy` and the limits existed — the same alarm. */
const HASH_BEFORE_POLICY_EXISTED = {
  alert: "376e83b0491797113b53729e9efbbbe17cde4fbd830484af24ad61cee327b9fd",
  bot: "2080995af5ad63d6f37cb61f04c83a27984ca4cf62dfa72bbcfc6310c3d7a214",
};

function alertDocument(overrides: Partial<RuleDocument> = {}): RuleDocument {
  return {
    schema_version: 2,
    id: "pinned-1",
    name: "pinned",
    symbol: "BTCUSDT",
    trigger_timeframe: "1h",
    conditions: {
      kind: "compare",
      left: { kind: "price", field: "close" },
      op: "gte",
      right: { kind: "constant", value: "50000" },
      timeframe: "1h",
    },
    action: { consequence_level: "notify" },
    enabled: true,
    provenance: { source: "human", created_at_ms: 0 },
    ...overrides,
  };
}

function botDocument(overrides: Partial<RuleDocument> = {}): RuleDocument {
  return {
    ...alertDocument(),
    id: "pinned-2",
    action: {
      consequence_level: "simulate",
      order: {
        side: "buy",
        size_basis: "percent_of_equity",
        size: "1",
      },
    },
    ...overrides,
  };
}

/** Resolves a dotted key against a locale bundle, or undefined. */
function lookup(bundle: unknown, key: string): unknown {
  return key
    .split(".")
    .reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], bundle);
}

/** The first refusal matching a predicate, with a message naming what came back. */
function refusalFrom(
  e: unknown,
  predicate: (r: { code: string; field: string; i18n_key: string }) => boolean,
) {
  if (!isRuleRefusedError(e) || !e.refusals.length) throw e;
  const refusal = e.refusals.find(predicate);
  expect(refusal, `no refusal matched: ${JSON.stringify(e.refusals)}`).toBeDefined();
  return refusal!;
}

beforeAll(async () => {
  const mod = (await import(/* @vite-ignore */ WASM_JS)) as {
    default: (binary: BufferSource) => Promise<unknown>;
  };
  await mod.default(readFileSync(WASM_BINARY));
  ruleSchema.setLoader(async () => mod as never);
  await ruleSchema.load();
});

describe("a bot's firing policy and limits (FEAT-0822)", () => {
  it("validates a document that carries all of them", () => {
    ruleSchema.validate(
      botDocument({
        firing_policy: "multi",
        max_positions: 3,
        max_entries_per_day: 5,
        max_risk_per_position: "100",
        budget_cap: "500",
      }),
    );
  });

  it("keeps the recorded hash of documents that carry none of them", () => {
    expect(ruleSchema.contentHash(alertDocument())).toBe(HASH_BEFORE_POLICY_EXISTED.alert);
    expect(ruleSchema.contentHash(botDocument())).toBe(HASH_BEFORE_POLICY_EXISTED.bot);
  });

  it("counts the policy and the limits as strategy identity", () => {
    const without = ruleSchema.contentHash(botDocument());
    const withPolicy = ruleSchema.contentHash(botDocument({ firing_policy: "multi" }));
    const withLimits = ruleSchema.contentHash(
      botDocument({ max_positions: 2, max_entries_per_day: 4, max_risk_per_position: "50", budget_cap: "250" }),
    );

    expect(withPolicy).not.toBe(without);
    expect(withLimits).not.toBe(without);
    expect(withPolicy).not.toBe(withLimits);
  });

  it("refuses a notify document once per policy field it cannot honour", () => {
    let thrown: unknown;
    try {
      ruleSchema.validate(
        alertDocument({
          firing_policy: "multi",
          max_positions: 3,
          max_entries_per_day: 5,
          max_risk_per_position: "100",
          budget_cap: "500",
        }),
      );
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeDefined();

    const fields = [
      refusalFrom(thrown!, (r) => r.field === "firing_policy"),
      refusalFrom(thrown!, (r) => r.field === "max_positions"),
      refusalFrom(thrown!, (r) => r.field === "max_entries_per_day"),
      refusalFrom(thrown!, (r) => r.field === "max_risk_per_position"),
      refusalFrom(thrown!, (r) => r.field === "budget_cap"),
    ];
    for (const refusal of fields) {
      expect(refusal.code).toBe("field_not_honoured_at_level");
      expect(refusal.i18n_key).toBe("rules.refusal.fieldNotHonouredAtLevel");
    }
  });

  it("refuses zero and negative limits as invalidLimit, in both locales' words", () => {
    let thrown: unknown;
    try {
      ruleSchema.validate(
        botDocument({
          firing_policy: "multi",
          max_positions: 0,
          max_entries_per_day: 0,
          max_risk_per_position: "0",
          budget_cap: "-1",
        }),
      );
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeDefined();

    const fields = ["max_positions", "max_entries_per_day", "max_risk_per_position", "budget_cap"];
    for (const field of fields) {
      const refusal = refusalFrom(thrown!, (r) => r.field === field);
      expect(refusal.code).toBe("invalid_limit");
      expect(refusal.i18n_key).toBe("rules.refusal.invalidLimit");
      expect(lookup(en, refusal.i18n_key)).toBeTypeOf("string");
      expect(lookup(de, refusal.i18n_key)).toBeTypeOf("string");
    }
  });

  it("migrates a v3 document to v4 without touching its hash", () => {
    const v3 = botDocument({ schema_version: 3 });
    const parsed = ruleSchema.validate(v3);
    expect(parsed.schema_version).toBe(4);
    expect(ruleSchema.contentHash(v3)).toBe(HASH_BEFORE_POLICY_EXISTED.bot);
  });

  it("keeps every legal policy value on the wire verbatim", () => {
    for (const policy of ["once", "multi"] as FiringPolicy[]) {
      const doc = botDocument({ firing_policy: policy });
      const roundTripped = ruleSchema.validate(doc);
      expect(roundTripped.firing_policy).toBe(policy);
    }
    // Absent stays absent through a round trip: the default never reaches
    // the wire, so a document that never said it never starts saying it.
    // The Rust default is pinned on the Rust side, where the field lives.
    const plain = ruleSchema.validate(botDocument());
    expect(plain.firing_policy).toBeUndefined();
  });
});
