/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import { describe, expect, it } from "vitest";
import {
  AI_ACTION_CATALOG,
  AI_ALLOWED_ACTIONS_DEFAULT,
  filterPermittedActions,
  isKnownAiAction,
  requiresConfirmation,
  sanitizeAllowedActions,
  shouldForceConfirm,
} from "./actionPolicy";

describe("AI action policy", () => {
  it("keeps the risk-posture group out of the default permission set", () => {
    expect(AI_ALLOWED_ACTIONS_DEFAULT).toContain("setEntryPrice");
    expect(AI_ALLOWED_ACTIONS_DEFAULT).toContain("setNotes");
    expect(AI_ALLOWED_ACTIONS_DEFAULT).not.toContain("setLeverage");
    expect(AI_ALLOWED_ACTIONS_DEFAULT).not.toContain("setRisk");
    expect(AI_ALLOWED_ACTIONS_DEFAULT).not.toContain("removeTakeProfit");
  });

  it("refuses actions the catalog never offered", () => {
    for (const denied of [
      "setSymbol",
      "resetSetup",
      "setAccountSize",
      "setAtrMode",
      "setAtrTimeframe",
      "setAnalysisTimeframe",
      "setAutoPrice",
    ]) {
      expect(isKnownAiAction(denied)).toBe(false);
      expect(requiresConfirmation(denied)).toBe(false);
    }
  });

  it("asks before every trade-changing action but not before notes and tags", () => {
    expect(requiresConfirmation("setEntryPrice")).toBe(true);
    expect(requiresConfirmation("setLeverage")).toBe(true);
    expect(requiresConfirmation("setRisk")).toBe(true);
    expect(requiresConfirmation("setNotes")).toBe(false);
    expect(requiresConfirmation("setTags")).toBe(false);
  });

  it("forces a confirmation when any permitted action is non-benign", () => {
    expect(shouldForceConfirm([{ action: "setNotes" }])).toBe(false);
    expect(
      shouldForceConfirm([{ action: "setNotes" }, { action: "setLeverage" }]),
    ).toBe(true);
    expect(shouldForceConfirm([{ action: "setSymbol" }])).toBe(false);
  });

  it("blocks unknown and user-disabled actions while keeping permitted ones", () => {
    const { permitted, blocked } = filterPermittedActions(
      [
        { action: "setEntryPrice", value: 100 },
        { action: "setLeverage", value: 50 },
        { action: "setSymbol", value: "ETHUSDT" },
      ],
      AI_ALLOWED_ACTIONS_DEFAULT,
    );

    expect(permitted.map((action) => action.action)).toEqual(["setEntryPrice"]);
    expect(blocked.map((action) => action.action)).toEqual([
      "setLeverage",
      "setSymbol",
    ]);
  });

  it("passes a risky action through the filter once the user allows it", () => {
    const allowed = [...AI_ALLOWED_ACTIONS_DEFAULT, "setLeverage"];
    const { permitted, blocked } = filterPermittedActions(
      [{ action: "setLeverage", value: 50 }],
      allowed,
    );

    expect(permitted).toHaveLength(1);
    expect(blocked).toHaveLength(0);
    expect(shouldForceConfirm(permitted)).toBe(true);
  });

  it("falls back to the defaults when stored permissions are missing", () => {
    expect(sanitizeAllowedActions(undefined)).toEqual([
      ...AI_ALLOWED_ACTIONS_DEFAULT,
    ]);
    expect(sanitizeAllowedActions("setLeverage")).toEqual([
      ...AI_ALLOWED_ACTIONS_DEFAULT,
    ]);
  });

  it("drops unknown ids, collapses duplicates and keeps an empty opt-out", () => {
    expect(
      sanitizeAllowedActions(["setLeverage", "setLeverage", "setSymbol"]),
    ).toEqual(["setLeverage"]);
    expect(sanitizeAllowedActions([])).toEqual([]);
  });

  it("orders the sanitized set by the catalog, not by storage order", () => {
    expect(sanitizeAllowedActions(["setNotes", "setEntryPrice"])).toEqual([
      "setEntryPrice",
      "setNotes",
    ]);
  });

  it("keeps every catalog id unique", () => {
    const ids = AI_ACTION_CATALOG.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
