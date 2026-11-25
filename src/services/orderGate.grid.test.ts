/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import { Decimal } from "decimal.js";
import { beforeEach, describe, expect, it } from "vitest";
import {
  BOT_PAPER_ONLY_MESSAGE_KEY,
  orderGate,
  registerConfirmationCheck,
  registerKillSwitch,
  registerRiskLimitCheck,
  type OrderIntent,
} from "./orderGate";

function gridIntent(overrides: Partial<OrderIntent> = {}): OrderIntent {
  return {
    kind: "grid",
    endpoint: "/api/orders",
    origin: "bot",
    attribution: {
      botId: "grid-1",
      ruleId: "grid-1",
      strategyHash: "ab".repeat(32),
    },
    payload: {
      type: "place-order",
      symbol: "BTCUSDT",
      side: "BUY",
      orderType: "LIMIT",
      qty: "0.01",
      price: "40000",
      reduceOnly: false,
      tradeSide: "OPEN",
      clientId: "grid:grid-1:s0:open",
      effect: "GTC",
    },
    displayed: {
      provider: "bitunix",
      accountFingerprint: "fp-paper",
      paperMode: true,
      symbol: "BTCUSDT",
      side: "BUY",
      entryPrice: new Decimal("40000"),
      gridQuantity: new Decimal("0.01"),
      availableMargin: new Decimal("1000"),
      stepSize: new Decimal("0.01"),
      minTradeVolume: new Decimal("0.01"),
      maxLimitOrderVolume: new Decimal("100"),
      leverage: new Decimal("1"),
    },
    ...overrides,
  };
}

describe("orderGate — grid intents (FEAT-0819)", () => {
  beforeEach(() => {
    registerKillSwitch(null);
    registerRiskLimitCheck(null);
    registerConfirmationCheck(null);
  });

  it("approves a valid paper bot grid opening intent", () => {
    const verdict = orderGate.verify(gridIntent());
    expect(verdict.approved).toBe(true);
    expect(verdict.checked).toContain("qty");
    expect(verdict.checked).toContain("availableMargin");
  });

  it("refuses grid intents that are not paper + bot origin", () => {
    const manual = gridIntent({ origin: "manual" });
    expect(orderGate.verify(manual)).toMatchObject({
      approved: false,
      refusal: { field: "mode", messageKey: BOT_PAPER_ONLY_MESSAGE_KEY },
    });

    const liveBase = gridIntent();
    const live = {
      ...liveBase,
      displayed: { ...liveBase.displayed, paperMode: false },
    };
    expect(orderGate.verify(live)).toMatchObject({
      approved: false,
      refusal: { field: "mode", messageKey: BOT_PAPER_ONLY_MESSAGE_KEY },
    });
  });

  it("refuses mismatched gridQuantity or unmeasured availableMargin", () => {
    const base = gridIntent();
    const qtyMismatch = orderGate.verify({
      ...base,
      displayed: { ...base.displayed, gridQuantity: new Decimal("0.02") },
    });
    expect(qtyMismatch.approved).toBe(false);
    expect(qtyMismatch.refusal?.field).toBe("qty");

    const noMargin = orderGate.verify({
      ...base,
      displayed: { ...base.displayed, availableMargin: undefined },
    });
    expect(noMargin).toMatchObject({
      approved: false,
      refusal: {
        field: "availableMargin",
        messageKey: "orderGate.availableMarginUnmeasured",
      },
    });
  });

  it("refuses when required margin exceeds availableMargin", () => {
    const base = gridIntent();
    const lowBalance = orderGate.verify({
      ...base,
      displayed: { ...base.displayed, availableMargin: new Decimal("100") },
    });
    expect(lowBalance).toMatchObject({
      approved: false,
      refusal: { field: "availableMargin", messageKey: "orderGate.insufficientMargin" },
    });
  });

  it("forwards cumulative pendingGridNotional and respects kill switch + risk check hooks", () => {
    registerKillSwitch(() => true);
    expect(orderGate.verify(gridIntent())).toMatchObject({
      approved: false,
      refusal: { field: "killSwitch" },
    });

    registerKillSwitch(null);
    let seenPending: Decimal | undefined;
    registerRiskLimitCheck((intent) => {
      seenPending = intent.displayed.pendingGridNotional;
      return {
        field: "maxPositionSize",
        reason: "riskLimit",
        messageKey: "orderGate.riskLimit",
        values: { field: "maxPositionSize" },
      };
    });

    const base = gridIntent();
    const res = orderGate.verify({
      ...base,
      displayed: { ...base.displayed, pendingGridNotional: new Decimal("1600") },
    });
    expect(res.approved).toBe(false);
    expect(res.refusal?.field).toBe("maxPositionSize");
    expect(seenPending?.toString()).toBe("1600");
  });
});
