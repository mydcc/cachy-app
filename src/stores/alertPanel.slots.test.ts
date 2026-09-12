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

/**
 * BUG-0443 — one builder writing into the shared draft.
 *
 * `builderTabHandover.component.test.ts` proves the trader-visible behaviour
 * through the mounted tabs. These cover the store contract underneath it,
 * including the two cases a mounted builder cannot easily produce: a group the
 * builder does not own, and a draft whose slot is ambiguous.
 */

import { beforeEach, describe, expect, it } from "vitest";

import { alertPanelState } from "./alertPanel.svelte";
import type { Condition } from "../lib/rules/types";

const PRICE: Condition = {
  kind: "cross",
  left: { kind: "price", field: "close" },
  direction: "above",
  right: { kind: "constant", value: "60000" },
  timeframe: "1h",
};

const PRICE_HIGHER: Condition = { ...PRICE, right: { kind: "constant", value: "70000" } };

const INDICATOR: Condition = {
  kind: "compare",
  left: { kind: "indicator", indicator: { id: "rsi", params: { period: 14 } } },
  op: "gt",
  right: { kind: "constant", value: "70" },
  timeframe: "1h",
};

const PATTERN: Condition = { kind: "pattern", pattern: "hammer", timeframe: "4h" };

/** The draft's condition members, which is what the core is handed. */
function members(): Condition[] {
  const tree = alertPanelState.draft.conditions;
  if (!tree) return [];
  return tree.kind === "group" ? [...tree.of] : [tree];
}

describe("alertPanelState.setSlotCondition", () => {
  beforeEach(() => {
    alertPanelState.reset("BTCUSDT");
  });

  it("adds one member per slot", () => {
    alertPanelState.setSlotCondition("price", PRICE);
    alertPanelState.setSlotCondition("indicators", INDICATOR);
    alertPanelState.setSlotCondition("candlesticks", PATTERN);

    expect(members()).toEqual([PRICE, INDICATOR, PATTERN]);
  });

  it("replaces a slot in place rather than appending a second member", () => {
    alertPanelState.setSlotCondition("price", PRICE);
    alertPanelState.setSlotCondition("price", PRICE_HIGHER);

    expect(members()).toEqual([PRICE_HIGHER]);
  });

  it("keeps the order stable when an earlier slot is edited", () => {
    // The plain-language sentence renders in document order. Removing and
    // re-appending on every keystroke would reshuffle it while the trader types.
    alertPanelState.setSlotCondition("price", PRICE);
    alertPanelState.setSlotCondition("indicators", INDICATOR);
    alertPanelState.setSlotCondition("price", PRICE_HIGHER);

    expect(members()).toEqual([PRICE_HIGHER, INDICATOR]);
  });

  it("clears only its own slot", () => {
    // The heart of BUG-0443: a builder mounting with nothing configured writes
    // null, and that must not reach anybody else's condition.
    alertPanelState.setSlotCondition("price", PRICE);
    alertPanelState.setSlotCondition("indicators", INDICATOR);

    alertPanelState.setSlotCondition("price", null);

    expect(members()).toEqual([INDICATOR]);
  });

  it("still empties the group when the last slot is cleared", () => {
    // Load-bearing for the arm button: no condition means no trigger, and an
    // armed rule with no trigger is worse than no rule.
    alertPanelState.setSlotCondition("price", PRICE);
    alertPanelState.setSlotCondition("price", null);

    expect(members()).toEqual([]);
  });

  it("is a no-op on an empty slot it is asked to clear", () => {
    alertPanelState.setSlotCondition("indicators", INDICATOR);
    alertPanelState.setSlotCondition("price", null);

    expect(members()).toEqual([INDICATOR]);
  });

  it("leaves an ambiguous slot untouched", () => {
    // Two price legs are a combo (FEAT-0030) no single-condition builder can
    // represent. It hydrates blank for that reason, so its mount-time write
    // must not land — otherwise opening the Price tab on a combo deletes a leg.
    alertPanelState.draft.conditions = {
      kind: "group",
      op: "all",
      of: [PRICE, PRICE_HIGHER],
    };

    alertPanelState.setSlotCondition("price", null);
    expect(members()).toEqual([PRICE, PRICE_HIGHER]);

    alertPanelState.setSlotCondition("price", PRICE);
    expect(members()).toEqual([PRICE, PRICE_HIGHER]);
  });

  it("leaves a condition no builder claims alone", () => {
    // Unknown means keep. A volume comparison belongs to no builder today, so
    // no builder may delete it.
    const volume: Condition = {
      kind: "compare",
      left: { kind: "volume" },
      op: "gt",
      right: { kind: "constant", value: "1000" },
      timeframe: "1h",
    };
    alertPanelState.draft.conditions = { kind: "group", op: "all", of: [volume] };

    alertPanelState.setSlotCondition("price", PRICE);

    expect(members()).toEqual([volume, PRICE]);
  });

  it("adopts a bare seeded condition into its slot instead of duplicating it", () => {
    // `seed()` may leave a condition outside the group wrapper. A builder that
    // then wrote its own copy would arm the same trigger twice.
    alertPanelState.draft.conditions = PRICE;

    alertPanelState.setSlotCondition("price", PRICE_HIGHER);

    expect(members()).toEqual([PRICE_HIGHER]);
  });
});
