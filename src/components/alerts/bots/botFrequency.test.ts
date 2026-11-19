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

import { describe, expect, it, vi } from "vitest";

vi.mock("$app/env", () => ({ browser: true, dev: false }));

import { isSpentAfterFiring } from "../../../stores/alerts.svelte";
import type { RuleDocument } from "../../../lib/rules/types";
import { frequencyFor } from "./botFrequency";

/** The seam the derivation exists for: the document the editor would save,
 * asked the one question the notifying sink asks after every firing. */
function spentAfterFiring(frequency: ReturnType<typeof frequencyFor>): boolean {
  return isSpentAfterFiring({ ...(frequency ? { frequency } : {}) } as RuleDocument);
}

describe("frequencyFor", () => {
  it("leaves a `multi` bot armed after its first firing", () => {
    // Without the derivation the document carries no frequency, which is
    // `once`, which is spent — the policy would be unreachable.
    expect(spentAfterFiring(undefined)).toBe(true);
    expect(spentAfterFiring(frequencyFor("multi", undefined))).toBe(false);
  });

  it("opens a one-shot gate only for `multi`", () => {
    expect(frequencyFor("multi", undefined)).toBe("once_per_candle_close");
    expect(frequencyFor("multi", "once")).toBe("once_per_candle_close");
    expect(frequencyFor("once", undefined)).toBeUndefined();
    expect(frequencyFor("once_per_candle", undefined)).toBeUndefined();
    expect(frequencyFor(undefined, undefined)).toBeUndefined();
  });

  it("never narrows or rewrites a gate the trader already opened", () => {
    expect(frequencyFor("multi", "every_time")).toBe("every_time");
    expect(frequencyFor("multi", "once_per_candle_close")).toBe("once_per_candle_close");
    // Back to `once`: the policy itself caps the entries, the gate stays theirs.
    expect(frequencyFor("once", "every_time")).toBe("every_time");
    expect(frequencyFor(undefined, "once_per_candle_close")).toBe("once_per_candle_close");
  });
});
