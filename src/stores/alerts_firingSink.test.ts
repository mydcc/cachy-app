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
 * FEAT-0440 — the real firing sink.
 *
 * These are the criteria a trader can feel: they hear the alarm, their note is
 * on it, and a rule set to repeat is still armed afterwards. The frequency
 * assertions are the load-bearing ones — before this, every rule was retired
 * after one announcement regardless of what the builder's footer said.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("$app/environment", () => ({ browser: true }));

vi.mock("../services/logger", () => ({
  logger: { log: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

vi.mock("../services/toastService.svelte", () => ({
  toastService: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

// Renders `key::{"a":1}` so an assertion can name the string that reached the
// trader without depending on the German or English wording.
vi.mock("../locales/i18n", () => ({
  _: {
    subscribe: (run: (v: unknown) => void) => {
      run((key: string, options?: { values?: Record<string, unknown> }) =>
        options?.values ? `${key}::${JSON.stringify(options.values)}` : key,
      );
      return () => {};
    },
  },
}));

/*
 * Hoisted: `vi.mock` factories run before the module body, so a spy declared
 * with a plain `const` is still in its temporal dead zone when the factory
 * reaches for it.
 */
const { mockNotify, mockDisarmRule } = vi.hoisted(() => ({
  mockNotify: vi.fn(() => ["in-app"]),
  mockDisarmRule: vi.fn(() => true),
}));

vi.mock("../services/notificationService.svelte", () => ({
  notificationService: { notify: mockNotify },
}));

// FEAT-0399: `disarmRule` moved here from `ruleCoverage`, which existed only
// to split alerts between two engines. `originAlertIdOf` is gone with it — the
// sink used it to flag the legacy alert behind a fired rule inactive, and
// there is no longer a legacy alert to flag.
vi.mock("../services/alertEngine/armRule", () => ({
  disarmRule: mockDisarmRule,
}));

vi.mock("../lib/rules/ruleSchema", () => ({
  ruleSchema: { load: vi.fn(async () => {}), isReady: vi.fn(() => false) },
}));

import type { RuleDocument } from "../lib/rules/types";
import { firingMessage, isSpentAfterFiring, notifyingRuleSink } from "./alerts.svelte";
import { readRuleState } from "../services/alertEngine/ruleStateStore";

const ANCHOR = 1_800_000_000_000;

function ruleDoc(overrides: Partial<RuleDocument> = {}): RuleDocument {
  return {
    schema_version: 2,
    id: "rule-a",
    name: "Support retest",
    symbol: "BTCUSDT",
    trigger_timeframe: "1m",
    // A real price-against-a-constant compare, which is what the panel and the
    // FEAT-0388 migration both write. It used to be the legacy alert's
    // `{ price_reached }` blob cast through `unknown` — a shape
    // `RuleDocument.conditions` never actually holds, which meant every
    // assertion below ran against a document the core would refuse (BUG-0481).
    conditions: {
      kind: "compare",
      left: { kind: "price", field: "close" },
      op: "gte",
      right: { kind: "constant", value: "72000" },
      timeframe: "1m",
    },
    action: { consequence_level: "notify" } as RuleDocument["action"],
    provenance: { source: "human", created_at_ms: ANCHOR - 1_000 },
    ...overrides,
  };
}

function fire(rule: RuleDocument) {
  notifyingRuleSink({ rule, verdict: { verdict: "fires" }, anchorMs: ANCHOR });
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  mockNotify.mockReturnValue(["in-app"]);
});

describe("frequency decides whether the rule is retired", () => {
  it("retires a rule with no frequency, which the core reads as `once`", () => {
    fire(ruleDoc());
    expect(mockDisarmRule).toHaveBeenCalledWith("rule-a");
  });

  it("retires an explicit `once` rule", () => {
    fire(ruleDoc({ frequency: "once" }));
    expect(mockDisarmRule).toHaveBeenCalledWith("rule-a");
  });

  /*
   * The bug this feature closes: before the state store existed the sink
   * disarmed unconditionally, so a support level a trader wanted to hear on
   * every touch went quiet after the first one.
   */
  it("leaves an `every_time` rule armed", () => {
    fire(ruleDoc({ frequency: "every_time" }));
    expect(mockDisarmRule).not.toHaveBeenCalled();
  });

  it("leaves a `once_per_candle_close` rule armed", () => {
    fire(ruleDoc({ frequency: "once_per_candle_close" }));
    expect(mockDisarmRule).not.toHaveBeenCalled();
  });

  it("agrees with `isSpentAfterFiring` on every frequency", () => {
    expect(isSpentAfterFiring(ruleDoc())).toBe(true);
    expect(isSpentAfterFiring(ruleDoc({ frequency: "once" }))).toBe(true);
    expect(isSpentAfterFiring(ruleDoc({ frequency: "every_time" }))).toBe(false);
    expect(isSpentAfterFiring(ruleDoc({ frequency: "once_per_candle_close" }))).toBe(false);
  });
});

describe("the trader hears it, and the state is counted", () => {
  it("announces on the alert-fired category, keyed per candle", () => {
    fire(ruleDoc({ frequency: "every_time" }));

    expect(mockNotify).toHaveBeenCalledTimes(1);
    const request = mockNotify.mock.calls[0][0] as unknown as Record<string, unknown>;
    expect(request.category).toBe("alert-fired");
    // Per candle, not per rule: the service's 60s duplicate window is exactly
    // one 1m candle, so a per-rule key would mute every second announcement.
    expect(request.eventId).toBe(`rule-a@${ANCHOR}`);
  });

  it("counts the announcement and remembers the anchor", () => {
    fire(ruleDoc({ frequency: "every_time" }));
    expect(readRuleState("rule-a")).toEqual({ fired_count: 1, last_fired_anchor_ms: ANCHOR });
  });

  /*
   * Counting must not depend on the disarm: a `once` rule has to be recorded as
   * fired so Manage can tell "fired" from "expired" (FEAT-0393 AC 2).
   */
  it("counts a retired rule too", () => {
    fire(ruleDoc({ frequency: "once" }));
    expect(readRuleState("rule-a").fired_count).toBe(1);
  });
});

describe("the note rides along — FEAT-0393 AC 6", () => {
  it("appends the trader's note to the message", () => {
    const message = firingMessage(ruleDoc({ note: "Entry long, invalidation 71.4k" }));
    expect(message).toContain("firedWithNote");
    expect(message).toContain("Entry long, invalidation 71.4k");
  });

  it("leaves the message alone when there is no note", () => {
    expect(firingMessage(ruleDoc())).not.toContain("firedWithNote");
  });

  it("treats a whitespace-only note as no note", () => {
    expect(firingMessage(ruleDoc({ note: "   " }))).not.toContain("firedWithNote");
  });

  it("puts the note on the announcement the trader actually receives", () => {
    fire(ruleDoc({ note: "Invalidation" }));
    const request = mockNotify.mock.calls[0][0] as unknown as Record<string, unknown>;
    expect(String(request.message)).toContain("Invalidation");
  });
});

describe("a failure in one step does not take the alarm down", () => {
  it("still announces when the disarm throws", () => {
    mockDisarmRule.mockImplementationOnce(() => {
      throw new Error("quota");
    });
    fire(ruleDoc({ frequency: "once" }));
    expect(mockNotify).toHaveBeenCalledTimes(1);
  });
});

/**
 * FEAT-0477 AC 5 — an intra-candle rule fires on a value the candle can still
 * take back, and the announcement says so.
 *
 * The caveat rides on the notification and not only on the arming screen,
 * because the two are read at different moments: the trader armed this hours
 * ago and is reading the alarm now, with a decision in front of them. "This
 * might revert" is only actionable while there is still a candle left to wait
 * for, which is exactly here.
 */
describe("an intra-candle alarm announces itself as provisional", () => {
  it("marks the message as provisional without losing the original", () => {
    const message = firingMessage(ruleDoc({ evaluation_mode: "intrabar" }));
    expect(message).toContain("firedIntrabar");
    expect(message).toContain("priceReached");
  });

  it("says nothing on a closed-candle rule, spelled out or absent", () => {
    expect(firingMessage(ruleDoc())).not.toContain("firedIntrabar");
    expect(firingMessage(ruleDoc({ evaluation_mode: "close" }))).not.toContain("firedIntrabar");
    // The default path has to stay exactly what it was before the field
    // existed -- every rule armed until now arrives here with it absent.
    expect(firingMessage(ruleDoc({ evaluation_mode: "close" }))).toBe(firingMessage(ruleDoc()));
  });

  it("keeps the trader's own note outside our caveat", () => {
    // The note is the one fragment the trader wrote themselves; the caveat is
    // ours. Nesting them the other way round would bury their invalidation
    // level inside our parenthesis.
    const message = firingMessage(
      ruleDoc({ evaluation_mode: "intrabar", note: "Invalidation 71.4k" }),
    );
    expect(message.indexOf("firedWithNote")).toBeLessThan(message.indexOf("firedIntrabar"));
    expect(message).toContain("Invalidation 71.4k");
  });

  it("puts the caveat on the announcement the trader actually receives", () => {
    fire(ruleDoc({ evaluation_mode: "intrabar", frequency: "every_time" }));
    const request = mockNotify.mock.calls[0][0] as unknown as Record<string, unknown>;
    expect(String(request.message)).toContain("firedIntrabar");
  });
});

/**
 * BUG-0481 — the announcement names what actually fired.
 *
 * `firingMessage` built every line from `ruleThresholdOf`, which answers only
 * for a condition carrying `right.value`. An indicator, a pattern and a combo
 * all fell through it, so the alarm read "BTCUSDT reached " with a blank where
 * the number belongs — and a `cross` against a constant fell through the other
 * way, announcing an RSI level as if it were a price.
 *
 * The assertions name the i18n *key* rather than a wording, for the same
 * reason the mock renders `key::{json}`: the message a trader reads is a
 * translation decision, and which line was chosen is the behaviour.
 */
describe("the announcement names what actually fired — BUG-0481", () => {
  const rsiBelow30: RuleDocument["conditions"] = {
    kind: "cross",
    left: { kind: "indicator", indicator: { id: "rsi", params: { length: 14 } } },
    direction: "below",
    right: { kind: "constant", value: "30" },
    timeframe: "4h",
  };

  function on4h(conditions: RuleDocument["conditions"]): RuleDocument {
    return ruleDoc({ conditions, trigger_timeframe: "4h" });
  }

  it("names the indicator and its level instead of a blank price", () => {
    const message = firingMessage(on4h(rsiBelow30));

    expect(message).toContain("ruleTriggered");
    expect(message).toContain("RSI(14)");
    expect(message).not.toContain("priceReached");
  });

  it("does not announce an indicator level as if it were a price", () => {
    const message = firingMessage(
      on4h({
        ...rsiBelow30,
        direction: "above",
        right: { kind: "constant", value: "70" },
      } as RuleDocument["conditions"]),
    );

    // The old line read "BTCUSDT reached 70" — 70 is an RSI reading, and the
    // trader would have looked for it on the price axis.
    expect(message).not.toContain("priceReached");
    expect(message).toContain("RSI(14)");
  });

  it("describes a candlestick rule", () => {
    const message = firingMessage(
      on4h({ kind: "pattern", pattern: "bullish_engulfing", timeframe: "4h" }),
    );

    expect(message).toContain("ruleTriggered");
    expect(message).toContain("bullish_engulfing");
    expect(message).not.toContain("priceReached");
  });

  it("describes a combo rule rather than blanking it", () => {
    const message = firingMessage(
      on4h({
        kind: "group",
        op: "all",
        of: [
          rsiBelow30,
          {
            kind: "compare",
            left: { kind: "price", field: "close" },
            op: "gt",
            right: { kind: "constant", value: "72000" },
            timeframe: "4h",
          },
        ],
      }),
    );

    expect(message).toContain("ruleTriggered");
    expect(message).toContain("RSI(14)");
    expect(message).toContain("72000");
  });

  it("describes a window rule, whose right-hand side carries no constant at all", () => {
    const message = firingMessage(
      on4h({
        kind: "compare",
        left: { kind: "price", field: "close" },
        op: "gte",
        right: {
          kind: "window",
          of: { kind: "price", field: "high" },
          agg: "max",
          lookback: 20,
        },
        timeframe: "4h",
      }),
    );

    expect(message).toContain("ruleTriggered");
    expect(message).not.toContain("priceReached");
  });

  it("keeps the short price line for a rule that really is a price rule", () => {
    const message = firingMessage(ruleDoc());

    expect(message).toContain("priceReached");
    expect(message).toContain("72000");
    expect(message).not.toContain("ruleTriggered");
  });

  it("still carries the note and the provisional caveat on the new line", () => {
    const message = firingMessage(
      ruleDoc({
        conditions: rsiBelow30,
        trigger_timeframe: "4h",
        evaluation_mode: "intrabar",
        note: "Invalidation 71.4k",
      }),
    );

    expect(message).toContain("ruleTriggered");
    expect(message).toContain("firedIntrabar");
    expect(message).toContain("Invalidation 71.4k");
    expect(message.indexOf("firedWithNote")).toBeLessThan(message.indexOf("firedIntrabar"));
  });
});
