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
 * BUG-0705 — an AI `addTakeProfit` on a full setup overwrote the last target.
 *
 * `app.addTakeProfitRow()` returned early at four targets, and `executeAction`
 * then wrote to `targets[targets.length - 1]` — which is TP4, a row the user
 * had configured. The action is named "add", so the write has to land on a row
 * that was actually added, and a refusal has to be visible.
 */

import { get } from "svelte/store";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/appAuth", () => ({
  appFetch: vi.fn(),
}));

import { aiState } from "./ai.svelte";
import { settingsState } from "./settings.svelte";
import { tradeState } from "./trade.svelte";
import { AI_ALLOWED_ACTIONS_DEFAULT } from "../lib/ai/actionPolicy";
import { _ } from "../locales/i18n";

const FULL_SETUP = [
  { price: "100", percent: "20", isLocked: false },
  { price: "110", percent: "25", isLocked: false },
  { price: "120", percent: "30", isLocked: false },
  { price: "130", percent: "40", isLocked: false },
];

function queue(actions: Array<Record<string, unknown>>): void {
  aiState.pendingActions.set("tp", {
    id: "tp",
    actions,
    timestamp: Date.now(),
  });
}

function systemNotices(): string[] {
  return aiState.messages
    .filter((message) => message.role === "system")
    .map((message) => message.content);
}

const CAP_NOTICE = `⛔ ${get(_)("settings.ai.permissions.tpCapNotice")}`;

beforeEach(() => {
  aiState.messages = [];
  aiState.pendingActions = new Map();
  aiState.error = null;
  settingsState.aiAllowedActions = [...AI_ALLOWED_ACTIONS_DEFAULT];
  settingsState.aiConfirmActions = false;
  tradeState.targets = structuredClone(FULL_SETUP);
});

describe("AI addTakeProfit at the four-target cap (BUG-0705)", () => {
  it("keeps TP4 intact and says why when the setup is already full", () => {
    queue([{ action: "addTakeProfit", value: "999", percent: "25" }]);

    aiState.confirmAction("tp");

    expect(tradeState.targets).toEqual(FULL_SETUP);
    expect(systemNotices()).toContain(CAP_NOTICE);
  });

  it("does not let a second add overwrite the row the first one added", () => {
    tradeState.targets = structuredClone(FULL_SETUP.slice(0, 3));
    queue([
      { action: "addTakeProfit", value: "998", percent: "25" },
      { action: "addTakeProfit", value: "999", percent: "25" },
    ]);

    aiState.confirmAction("tp");

    // The old code wrote both values to `length - 1`, so the second add
    // replaced the row the first had just created.
    expect(tradeState.targets).toHaveLength(4);
    expect(tradeState.targets[3].price).toBe("998");
    expect(systemNotices()).toContain(CAP_NOTICE);
  });

  it("labels the confirmation as refused at the cap and as an addition below it", () => {
    const action = { action: "addTakeProfit", value: "999", percent: "25" };

    expect(aiState.describeAction(action)).toBe(
      `⛔ ${get(_)("settings.ai.permissions.tpCapBadge")}`,
    );

    tradeState.targets = structuredClone(FULL_SETUP.slice(0, 3));
    expect(aiState.describeAction(action)).toContain("TP Hinzufügen");

    // A batch whose only action is refused must not render as confirmed.
    tradeState.targets = structuredClone(FULL_SETUP);
    aiState.messages = [
      {
        id: "pending-message",
        role: "system",
        content: "[PENDING:tp]",
        timestamp: Date.now(),
      },
    ];
    queue([action]);
    aiState.confirmAction("tp");

    const status = aiState.messages.find((m) => m.id === "pending-message")?.content ?? "";
    expect(status).toContain("❌");
    expect(status).not.toContain("✅");
  });
});
