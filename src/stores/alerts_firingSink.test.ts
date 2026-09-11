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
const { mockNotify, mockDisarmRule, mockOriginAlertIdOf } = vi.hoisted(() => ({
  mockNotify: vi.fn(() => ["in-app"]),
  mockDisarmRule: vi.fn(() => true),
  mockOriginAlertIdOf: vi.fn((): string | undefined => undefined),
}));

vi.mock("../services/notificationService.svelte", () => ({
  notificationService: { notify: mockNotify },
}));

vi.mock("../services/alertEngine/ruleCoverage", () => ({
  disarmRule: mockDisarmRule,
  originAlertIdOf: mockOriginAlertIdOf,
  readCoveredAlertIds: vi.fn(() => new Set<string>()),
  alertsForLegacyEngine: vi.fn((alerts: unknown[]) => alerts),
  computeCoveredAlertIds: vi.fn(() => new Set<string>()),
  writeCoveredAlertIds: vi.fn(),
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
    conditions: { price_reached: "72000" } as unknown as RuleDocument["conditions"],
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
  mockOriginAlertIdOf.mockReturnValue(undefined);
});

describe("frequency decides whether the rule is retired", () => {
  it("retires a rule with no frequency, like the engine it replaces", () => {
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
