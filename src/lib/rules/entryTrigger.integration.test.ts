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
 * FEAT-0823 — the entry trigger mode, against the real core.
 *
 * Against the real wasm for the same reasons every schema field's test is:
 * the hash claims are claims about the canonical form, and the refusal
 * claims are claims about Rust code a fake would be free to invent. The
 * artefact is committed, so this runs on a bare checkout — and it fails
 * loudly if the artefact ever lags the Rust source.
 *
 * The hash constants are the same fixtures — and therefore the same
 * numbers — as `stopDistance`, `exitConditions` and `firingPolicy`: the
 * v5 field must stay `skip_serializing_if`, or every strategy identity
 * recorded before it silently moves. Three schema versions in a row have
 * now carried these two numbers across; this file is the fourth crossing.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

import de from "../../locales/locales/de.json";
import en from "../../locales/locales/en.json";
import { isRuleRefusedError, ruleSchema } from "./ruleSchema";
import type { RuleDocument } from "./types";

const WASM_JS = pathToFileURL(resolve(process.cwd(), "static/wasm/technicals_wasm.js")).href;
const WASM_BINARY = resolve(process.cwd(), "static/wasm/technicals_wasm_bg.wasm");

/** Measured before `entry_trigger` existed — the same alarm, fourth crossing. */
const HASH_BEFORE_ENTRY_TRIGGER_EXISTED = {
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

describe("a bot's entry trigger mode (FEAT-0823)", () => {
  it("validates a confirmation document and keeps the mode on the wire", () => {
    const roundTripped = ruleSchema.validate(botDocument({ entry_trigger: "confirmation" }));
    expect(roundTripped.entry_trigger).toBe("confirmation");
  });

  it("keeps the recorded hash of documents that carry none", () => {
    expect(ruleSchema.contentHash(alertDocument())).toBe(HASH_BEFORE_ENTRY_TRIGGER_EXISTED.alert);
    expect(ruleSchema.contentHash(botDocument())).toBe(HASH_BEFORE_ENTRY_TRIGGER_EXISTED.bot);
  });

  it("counts waiting for confirmation as strategy identity", () => {
    const without = ruleSchema.contentHash(botDocument());
    const withConfirmation = ruleSchema.contentHash(
      botDocument({ entry_trigger: "confirmation" }),
    );

    expect(withConfirmation).not.toBe(without);
    // The absent field is the default, so a rule written before this field
    // keeps the identity it was recorded under.
    expect(ruleSchema.contentHash(botDocument({ entry_trigger: "immediate" }))).toBe(without);
  });

  it("refuses a notify document for the trigger mode it cannot honour", () => {
    let thrown: unknown;
    try {
      ruleSchema.validate(alertDocument({ entry_trigger: "confirmation" }));
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeDefined();

    const refusal = refusalFrom(thrown!, (r) => r.field === "entry_trigger");
    expect(refusal.code).toBe("field_not_honoured_at_level");
    expect(refusal.i18n_key).toBe("rules.refusal.fieldNotHonouredAtLevel");
  });

  it("refuses confirmation on an intrabar rule, in both locales' words", () => {
    let thrown: unknown;
    try {
      ruleSchema.validate(
        botDocument({ entry_trigger: "confirmation", evaluation_mode: "intrabar" }),
      );
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeDefined();

    const refusal = refusalFrom(thrown!, (r) => r.field === "entry_trigger");
    expect(refusal.code).toBe("confirmation_needs_closes");
    expect(refusal.i18n_key).toBe("rules.refusal.confirmationNeedsCloses");
    expect(lookup(en, refusal.i18n_key)).toBeTypeOf("string");
    expect(lookup(de, refusal.i18n_key)).toBeTypeOf("string");
  });

  it("keeps immediate entries legal everywhere a rule already was", () => {
    // The notify gate and the intrabar combination are about the *wait*;
    // the default mode never waits and so is legal at both levels and on
    // an intrabar rule alike — pinned so the gates cannot over-reach.
    expect(() =>
      ruleSchema.validate(alertDocument({ entry_trigger: "immediate" })),
    ).not.toThrow();
    expect(() =>
      ruleSchema.validate(
        botDocument({ entry_trigger: "immediate", evaluation_mode: "intrabar" }),
      ),
    ).not.toThrow();
  });

  it("migrates a v4 document to current without touching its hash", () => {
    const v4 = botDocument({ schema_version: 4 });
    const parsed = ruleSchema.validate(v4);
    expect(parsed.schema_version).toBe(5);
    expect(ruleSchema.contentHash(v4)).toBe(HASH_BEFORE_ENTRY_TRIGGER_EXISTED.bot);
  });

  it("absent stays absent through a round trip", () => {
    // The default never reaches the wire, so a document that never said
    // it never starts saying it. The Rust default is pinned on the Rust
    // side, where the field lives.
    const plain = ruleSchema.validate(botDocument());
    expect(plain.entry_trigger).toBeUndefined();
  });
});
