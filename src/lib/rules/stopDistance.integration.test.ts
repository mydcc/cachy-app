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
 * FEAT-0396 — `OrderIntent.stop`, against the real core.
 *
 * Against the real wasm because two of the four claims here are claims about
 * the *hash*, and a fake `rule_content_hash` agrees with any answer. The other
 * two are claims about a refusal the Rust side raises, which a fake would also
 * be free to invent.
 *
 * The artefact is committed under `static/wasm/`, so this runs on a bare
 * checkout — and it fails loudly if the artefact ever lags the Rust source,
 * which is the one drift `scripts/build_wasm.sh` is silent about.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

import de from "../../locales/locales/de.json";
import en from "../../locales/locales/en.json";
import { isRuleRefusedError, ruleSchema } from "./ruleSchema";
import type { RuleDocument, StopDistance } from "./types";

const WASM_JS = pathToFileURL(resolve(process.cwd(), "static/wasm/technicals_wasm.js")).href;
const WASM_BINARY = resolve(process.cwd(), "static/wasm/technicals_wasm_bg.wasm");

/**
 * Hashes measured against the artefact as it shipped *before* `stop` existed
 * (`git show HEAD:static/wasm/…` at the time this was written), not against the
 * build under test.
 *
 * That is the whole point: a field added inside `action` — which is hashed — is
 * free only while it is absent from the JSON, and only `skip_serializing_if`
 * makes it absent. Drop that attribute and every strategy identity a journal
 * entry already recorded moves, silently. These two numbers are the alarm.
 */
const HASH_BEFORE_STOP_EXISTED = {
  alert: "376e83b0491797113b53729e9efbbbe17cde4fbd830484af24ad61cee327b9fd",
  bot: "2080995af5ad63d6f37cb61f04c83a27984ca4cf62dfa72bbcfc6310c3d7a214",
};

function alertDocument(): RuleDocument {
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
  };
}

function botDocument(
  size_basis: "percent_of_equity" | "percent_risk" = "percent_of_equity",
  stop?: StopDistance,
): RuleDocument {
  return {
    ...alertDocument(),
    id: "pinned-2",
    action: {
      consequence_level: "simulate",
      order: { side: "buy", size_basis, size: "1", ...(stop ? { stop } : {}) },
    },
  };
}

/** Resolves a dotted key against a locale bundle, or undefined. */
function lookup(bundle: unknown, key: string): unknown {
  return key
    .split(".")
    .reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], bundle);
}

beforeAll(async () => {
  const mod = (await import(/* @vite-ignore */ WASM_JS)) as {
    default: (binary: BufferSource) => Promise<unknown>;
  };
  await mod.default(readFileSync(WASM_BINARY));
  ruleSchema.setLoader(async () => mod as never);
  await ruleSchema.load();
});

describe("a bot's protective stop", () => {
  it("leaves every hash recorded before the field existed exactly where it was", () => {
    expect(ruleSchema.contentHash(alertDocument())).toBe(HASH_BEFORE_STOP_EXISTED.alert);
    expect(ruleSchema.contentHash(botDocument())).toBe(HASH_BEFORE_STOP_EXISTED.bot);
  });

  it("is part of the strategy, so adding one is a new identity", () => {
    const without = ruleSchema.contentHash(botDocument());
    const withStop = ruleSchema.contentHash(
      botDocument("percent_of_equity", { basis: "percent_of_entry", distance: "2" }),
    );

    // Not a formality: moving a stop changes what the rule risks, and a journal
    // entry that pointed at the old identity must not silently describe the new
    // one. Compare `enabled`, which is deliberately outside the hash.
    expect(withStop).not.toBe(without);
  });

  it("is required by percent-of-risk sizing, and the refusal says so in both locales", () => {
    try {
      ruleSchema.validate(botDocument("percent_risk"));
      throw new Error("risk sizing without a stop was accepted");
    } catch (e) {
      if (!isRuleRefusedError(e)) throw e;

      const refusal = e.refusals.find((r) => r.field === "action.order.stop");
      expect(refusal, `no refusal named the stop: ${JSON.stringify(e.refusals)}`).toBeDefined();
      expect(refusal?.i18n_key).toBe("rules.refusal.stopRequiredForRiskSizing");

      // A refusal a trader cannot read is a refusal that gets worked around.
      for (const bundle of [de, en]) {
        expect(typeof lookup(bundle, refusal!.i18n_key)).toBe("string");
      }
    }
  });

  it("is accepted by percent-of-risk sizing once it is there", () => {
    expect(() =>
      ruleSchema.validate(
        botDocument("percent_risk", { basis: "percent_of_entry", distance: "1.5" }),
      ),
    ).not.toThrow();
  });
});
