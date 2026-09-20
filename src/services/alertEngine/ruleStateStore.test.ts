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

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("$app/environment", () => ({ browser: true }));

import {
  RULE_STATE_STORAGE_KEY,
  clearBotAnchors,
  clearRuleState,
  pruneRuleStates,
  readBotAnchors,
  readRuleState,
  readRuleStates,
  recordRuleFiring,
  saveBotAnchors,
} from "./ruleStateStore";

beforeEach(() => {
  localStorage.clear();
});

describe("fire state survives a reload", () => {
  it("counts each announcement and remembers the anchor it was on", () => {
    recordRuleFiring("rule-a", 1_000);
    const second = recordRuleFiring("rule-a", 2_000);

    expect(second).toEqual({ fired_count: 2, last_fired_anchor_ms: 2_000 });
    expect(readRuleState("rule-a")).toEqual({ fired_count: 2, last_fired_anchor_ms: 2_000 });
  });

  it("keeps rules apart", () => {
    recordRuleFiring("rule-a", 1_000);
    recordRuleFiring("rule-b", 5_000);

    expect(readRuleState("rule-a").fired_count).toBe(1);
    expect(readRuleState("rule-b").last_fired_anchor_ms).toBe(5_000);
  });
});

describe("an unknown or corrupt rule reads as never-fired", () => {
  it("answers never-fired for a rule nothing recorded", () => {
    expect(readRuleState("nobody")).toEqual({ fired_count: 0, last_fired_anchor_ms: null });
  });

  it("survives a non-object blob", () => {
    localStorage.setItem(RULE_STATE_STORAGE_KEY, '"not an object"');
    expect(readRuleStates()).toEqual({});
  });

  it("survives unparseable JSON", () => {
    localStorage.setItem(RULE_STATE_STORAGE_KEY, "{not json");
    expect(readRuleStates()).toEqual({});
  });

  /*
   * The direction matters: a corrupt counter that read as "already fired" would
   * mute an alarm, which is the failure this whole subsystem exists to prevent.
   */
  it("normalises a nonsense counter down to never-fired rather than up", () => {
    localStorage.setItem(
      RULE_STATE_STORAGE_KEY,
      JSON.stringify({ "rule-a": { fired_count: "lots", last_fired_anchor_ms: "yesterday" } }),
    );
    expect(readRuleState("rule-a")).toEqual({ fired_count: 0, last_fired_anchor_ms: null });
  });

  it("refuses a negative counter", () => {
    localStorage.setItem(RULE_STATE_STORAGE_KEY, JSON.stringify({ "rule-a": { fired_count: -3 } }));
    expect(readRuleState("rule-a").fired_count).toBe(0);
  });
});

describe("state is forgotten with the rule", () => {
  it("clears one rule and leaves the rest", () => {
    recordRuleFiring("rule-a", 1_000);
    recordRuleFiring("rule-b", 1_000);

    clearRuleState("rule-a");

    expect(readRuleState("rule-a").fired_count).toBe(0);
    expect(readRuleState("rule-b").fired_count).toBe(1);
  });

  /*
   * Without the prune, a re-imported rule reusing a deleted id would start life
   * already spent and never announce again.
   */
  it("prunes state for rules that no longer exist", () => {
    recordRuleFiring("gone", 1_000);
    recordRuleFiring("kept", 1_000);

    pruneRuleStates(["kept"]);

    expect(Object.keys(readRuleStates())).toEqual(["kept"]);
  });
});

describe("bot gate anchors survive a reload — BUG-0491", () => {
  it("round-trips all three anchors", () => {
    saveBotAnchors("bot-1", {
      evaluatedAnchorMs: 1_000,
      intrabarAnchorMs: 2_000,
      intrabarFiredAnchorMs: 2_000,
    });

    expect(readBotAnchors("bot-1")).toEqual({
      evaluatedAnchorMs: 1_000,
      intrabarAnchorMs: 2_000,
      intrabarFiredAnchorMs: 2_000,
    });
  });

  it("answers undefined when the entry carries no anchors", () => {
    recordRuleFiring("rule-a", 1_000);

    expect(readBotAnchors("rule-a")).toBeUndefined();
    expect(readBotAnchors("nobody")).toBeUndefined();
  });

  it("keeps the pre-fix entry shape when no anchors were ever saved", () => {
    recordRuleFiring("rule-a", 1_000);

    expect(readRuleState("rule-a")).toEqual({ fired_count: 1, last_fired_anchor_ms: 1_000 });
  });

  it("keeps the fire count when anchors are saved and cleared", () => {
    recordRuleFiring("bot-1", 1_000);
    saveBotAnchors("bot-1", {
      evaluatedAnchorMs: 2_000,
      intrabarAnchorMs: null,
      intrabarFiredAnchorMs: null,
    });

    expect(readRuleState("bot-1")).toEqual({
      fired_count: 1,
      last_fired_anchor_ms: 1_000,
      last_evaluated_anchor_ms: 2_000,
    });

    // Clearing anchors re-arms the dedupe, never a spent `once` rule.
    clearBotAnchors("bot-1");

    expect(readRuleState("bot-1")).toEqual({ fired_count: 1, last_fired_anchor_ms: 1_000 });
    expect(readBotAnchors("bot-1")).toBeUndefined();
  });

  it("skips the write when nothing changed", () => {
    const snapshot = {
      evaluatedAnchorMs: 1_000,
      intrabarAnchorMs: null,
      intrabarFiredAnchorMs: null,
    };
    saveBotAnchors("bot-1", snapshot);

    const before = localStorage.getItem(RULE_STATE_STORAGE_KEY);
    saveBotAnchors("bot-1", { ...snapshot });

    expect(localStorage.getItem(RULE_STATE_STORAGE_KEY)).toBe(before);
  });

  it("normalises corrupt anchors to absent rather than nonsense", () => {
    // `NaN`/`Infinity` serialise to `null`; a string stays a string. All of
    // them must read as "never evaluated", never as anchor zero.
    localStorage.setItem(
      RULE_STATE_STORAGE_KEY,
      JSON.stringify({
        "bot-1": {
          fired_count: 2,
          last_fired_anchor_ms: 1_000,
          last_evaluated_anchor_ms: "soon",
          last_intrabar_anchor_ms: null,
          last_intrabar_fired_anchor_ms: null,
        },
      }),
    );

    expect(readBotAnchors("bot-1")).toBeUndefined();
    expect(readRuleState("bot-1")).toEqual({ fired_count: 2, last_fired_anchor_ms: 1_000 });
  });

  it("clearing anchors of an anchorless rule writes nothing", () => {
    recordRuleFiring("rule-a", 1_000);

    const before = localStorage.getItem(RULE_STATE_STORAGE_KEY);
    clearBotAnchors("rule-a");
    clearBotAnchors("nobody");

    expect(localStorage.getItem(RULE_STATE_STORAGE_KEY)).toBe(before);
  });
});
