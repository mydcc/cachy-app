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

import { describe, expect, it, beforeEach, vi } from "vitest";

import {
  ruleSchema,
  RuleRefusedError,
  RuleCoreUnavailableError,
  isRuleRefusedError,
} from "./ruleSchema";
import type { RuleDocument } from "./types";

vi.mock("../../services/logger", () => ({
  logger: { log: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

const DOCUMENT: RuleDocument = {
  schema_version: 1,
  id: "rule-1",
  name: "RSI dip",
  symbol: "BTCUSDT",
  trigger_timeframe: "4h",
  conditions: {
    kind: "compare",
    left: { kind: "indicator", indicator: { id: "rsi", params: { period: 14 } } },
    op: "lt",
    right: { kind: "constant", value: "30" },
    timeframe: "4h",
  },
  action: { consequence_level: "notify" },
  enabled: true,
  provenance: { source: "human", created_at_ms: 1700000000000 },
};

/** A stand-in for the compiled core, so these tests need no WASM runtime. */
function fakeCore(overrides: Record<string, unknown> = {}) {
  return {
    default: vi.fn().mockResolvedValue(undefined),
    rule_schema_version: () => 1,
    rule_validate: (json: string) => json,
    rule_content_hash: () => "a".repeat(64),
    rule_authorise: () => undefined,
    rule_warmup_candles: () => 15,
    rule_timeframes: () => ["4h"],
    rule_from_alert_json: (json: string) => json,
    ...overrides,
  };
}

describe("ruleSchema", () => {
  beforeEach(() => {
    ruleSchema.setLoader(async () => fakeCore() as never);
  });

  /**
   * The lesson from the shipped alert engine, which guards every method with
   * `if (!this.instance) return;` and is never loaded — so it silently does
   * nothing forever. A validator that did the same would report "no refusals"
   * for a rule nothing had checked, and the trader would arm it.
   */
  it("throws rather than silently passing when the core is not loaded", () => {
    ruleSchema.setLoader(async () => fakeCore() as never); // resets the loaded core
    expect(ruleSchema.isReady()).toBe(false);

    expect(() => ruleSchema.validate(DOCUMENT)).toThrow(RuleCoreUnavailableError);
    expect(() => ruleSchema.contentHash(DOCUMENT)).toThrow(RuleCoreUnavailableError);
    expect(() => ruleSchema.authorise(DOCUMENT, "send")).toThrow(RuleCoreUnavailableError);
    expect(() => ruleSchema.warmupCandles(DOCUMENT)).toThrow(RuleCoreUnavailableError);
    expect(() => ruleSchema.timeframes(DOCUMENT)).toThrow(RuleCoreUnavailableError);
  });

  it("reports readiness only after a successful load", async () => {
    expect(ruleSchema.isReady()).toBe(false);
    await ruleSchema.load();
    expect(ruleSchema.isReady()).toBe(true);
    expect(ruleSchema.schemaVersion()).toBe(1);
  });

  it("loads once even when several callers ask at the same time", async () => {
    const loader = vi.fn(async () => fakeCore() as never);
    ruleSchema.setLoader(loader);
    await Promise.all([ruleSchema.load(), ruleSchema.load(), ruleSchema.load()]);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("lets a caller retry after a failed load instead of latching the failure", async () => {
    let attempt = 0;
    ruleSchema.setLoader(async () => {
      attempt += 1;
      if (attempt === 1) throw new Error("network blip");
      return fakeCore() as never;
    });

    await expect(ruleSchema.load()).rejects.toBeInstanceOf(RuleCoreUnavailableError);
    await expect(ruleSchema.load()).resolves.toBeUndefined();
    expect(ruleSchema.isReady()).toBe(true);
  });

  describe("refusals", () => {
    const refusal = {
      code: "consequence_level_too_low",
      field: "action.consequence_level",
      i18n_key: "rules.refusal.consequenceLevelTooLow",
      detail: "this rule authorises `notify`, but the caller asked it to `send`",
    };

    beforeEach(() => {
      ruleSchema.setLoader(
        async () =>
          fakeCore({
            rule_authorise: () => {
              throw { refusals: [refusal] };
            },
          }) as never,
      );
    });

    it("turns a core refusal into an error carrying the field and the i18n key", async () => {
      await ruleSchema.load();

      try {
        ruleSchema.authorise(DOCUMENT, "send");
        expect.unreachable("authorise should have refused");
      } catch (e) {
        expect(isRuleRefusedError(e)).toBe(true);
        const err = e as RuleRefusedError;
        expect(err.translationKey).toBe("rules.refusal.consequenceLevelTooLow");
        expect(err.refusals[0].field).toBe("action.consequence_level");
        // Developer English on `message`, never the trader-facing channel.
        expect(err.message).toContain("action.consequence_level");
      }
    });

    it("does not dress a genuine crash up as a refusal", async () => {
      ruleSchema.setLoader(
        async () =>
          fakeCore({
            rule_validate: () => {
              throw new RangeError("out of memory");
            },
          }) as never,
      );
      await ruleSchema.load();

      expect(() => ruleSchema.validate(DOCUMENT)).toThrow(RangeError);
      try {
        ruleSchema.validate(DOCUMENT);
      } catch (e) {
        expect(isRuleRefusedError(e)).toBe(false);
      }
    });
  });

  it("returns the canonical document the core hands back, not the input", async () => {
    ruleSchema.setLoader(
      async () =>
        fakeCore({
          // The real core normalises `240m` to `4h`; the fake stands in for that.
          rule_validate: () => JSON.stringify({ ...DOCUMENT, trigger_timeframe: "4h" }),
        }) as never,
    );
    await ruleSchema.load();

    const input = { ...DOCUMENT, trigger_timeframe: "240m" };
    expect(ruleSchema.validate(input).trigger_timeframe).toBe("4h");
  });
});
