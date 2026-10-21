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
 * `app.addTakeProfitRow()` returns early at four targets, and `executeAction`
 * then wrote to `targets[targets.length - 1]` — which is TP4, a row the user
 * had configured. The action is named "add", so the write has to land on a row
 * that was actually added, and a refusal has to be visible.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/appAuth", () => ({
  appFetch: vi.fn(),
}));

import { aiState } from "./ai.svelte";
import { settingsState } from "./settings.svelte";
import { tradeState } from "./trade.svelte";
import { AI_ALLOWED_ACTIONS_DEFAULT } from "../lib/ai/actionPolicy";

const FULL_SETUP = [
  { price: "100", percent: "25", isLocked: false },
  { price: "110", percent: "25", isLocked: false },
  { price: "120", percent: "25", isLocked: false },
  { price: "130", percent: "25", isLocked: false },
];

function queueAddTakeProfit(value: string): void {
  aiState.pendingActions.set("tp", {
    id: "tp",
    actions: [{ action: "addTakeProfit", value, percent: "25" }],
    timestamp: Date.now(),
  });
}

function systemNotice(): string {
  return aiState.messages
    .filter((message) => message.role === "system")
    .map((message) => message.content)
    .join("\n");
}

beforeEach(() => {
  aiState.messages = [];
  aiState.pendingActions = new Map();
  aiState.error = null;
  settingsState.aiAllowedActions = [...AI_ALLOWED_ACTIONS_DEFAULT];
  settingsState.aiConfirmActions = false;
  tradeState.targets = structuredClone(FULL_SETUP);
});

describe("AI addTakeProfit at the four-target cap (BUG-0705)", () => {
  it("keeps TP4 and says why when the setup is already full", () => {
    queueAddTakeProfit("999");

    aiState.confirmAction("tp");

    expect(tradeState.targets).toHaveLength(4);
    expect(tradeState.targets[3].price).toBe("130");
    expect(tradeState.targets[3].percent).toBe("25");
    // A refused action must not look like a no-op.
    expect(systemNotice()).toContain("4");
  });

  it("writes the new price to the row that was actually added", () => {
    tradeState.targets = structuredClone(FULL_SETUP.slice(0, 3));
    queueAddTakeProfit("999");

    aiState.confirmAction("tp");

    expect(tradeState.targets).toHaveLength(4);
    expect(tradeState.targets[3].price).toBe("999");
    expect(tradeState.targets[2].price).toBe("120");
  });
});
