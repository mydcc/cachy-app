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
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

/*
 * FEAT-0678 — the payload boundary as a test.
 *
 * Every case here fails if the Academy request grows a field it must not have.
 * That is the point: AC 3 and AC 4 are not meant to be re-checked by reading a
 * caller, they are meant to break here.
 */

import { describe, it, expect } from "vitest";
import {
  EXPLANATION_CONTEXT_FIELDS,
  EXPLANATION_VALUE_WINDOW,
  buildExplanationContext,
  buildExplanationMessages,
  buildExplanationPrompt,
  type ExplanationContext,
} from "./liveExplanation";
import type { CatalogueEntry } from "../alerts/indicatorCatalogue";
import type { LessonSeries } from "./indicatorLessonSeries";

const entry = {
  id: "rsi",
  group: "oscillators",
  params: [{ name: "period", kind: "period", default: 14 }],
  outputs: [{ name: "value", dimension: "oscillator" }],
  placement: "pane",
} as unknown as CatalogueEntry;

function series(valueCount: number, name = "value"): LessonSeries {
  return {
    lines: [
      {
        name,
        values: Array.from({ length: valueCount }, (_, i) => String(i + 1)),
      },
    ],
    refused: [],
  };
}

const params = { period: 14 };

function context(overrides: Partial<Parameters<typeof buildExplanationContext>[0]> = {}) {
  return buildExplanationContext({
    entry,
    params,
    field: "close",
    symbol: "BTCUSDT",
    timeframe: "1h",
    series: series(120),
    generatedAt: "2026-11-03T12:00:00.000Z",
    ...overrides,
  });
}

describe("Academy explanation payload (FEAT-0678)", () => {
  it("carries exactly the allowlisted fields and nothing else", () => {
    const payload = context();

    expect(Object.keys(payload).sort()).toEqual(
      [...EXPLANATION_CONTEXT_FIELDS].sort(),
    );
    // Named explicitly: these are the Class A fields the chat context carries.
    for (const forbidden of [
      "portfolioStats",
      "openPositions",
      "recentHistory",
      "tradeSetup",
      "accountSize",
    ]) {
      expect(payload).not.toHaveProperty(forbidden);
    }
  });

  it("sends the last fifty values of each line, in order", () => {
    const payload = context();

    expect(payload.lines[0].values).toHaveLength(EXPLANATION_VALUE_WINDOW);
    expect(payload.lines[0].values[0]).toBe("71");
    expect(payload.lines[0].values.at(-1)).toBe("120");
  });

  it("keeps an indeterminate value as null instead of turning it into zero", () => {
    const payload = context({
      series: {
        lines: [{ name: "value", values: [null, null, "42.5"] }],
        refused: [],
      },
    });

    expect(payload.lines[0].values).toEqual([null, null, "42.5"]);
  });

  it("copies rather than references the series and the parameters it is handed", () => {
    const values = ["1", "2", "3"];
    const live = {
      lines: [{ name: "value", values }],
      refused: [],
    } as unknown as LessonSeries;
    const mutableParams = { period: 14 };

    const payload = buildExplanationContext({
      entry,
      params: mutableParams,
      field: "close",
      symbol: "BTCUSDT",
      timeframe: "1h",
      series: live,
      generatedAt: "2026-11-03T12:00:00.000Z",
    });

    values.push("4");
    mutableParams.period = 99;

    expect(payload.lines[0].values).toEqual(["1", "2", "3"]);
    expect(payload.params.period).toBe(14);
  });

  it("serializes the context once and adds no second data source", () => {
    const payload = context();
    const messages = buildExplanationMessages(payload, "en");
    const serialized = JSON.stringify(payload, null, 2);

    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe("system");
    expect(messages[0].content).toContain(serialized);
    expect(messages[1].role).toBe("user");
    expect(messages[1].content).toContain("BTCUSDT");
    expect(messages[1].content).toContain("rsi");
  });

  it("asks for an explanation, not for a trade, and names the answer language", () => {
    const payload = context();
    const de = buildExplanationPrompt(payload, "de").staticInstruction;
    const en = buildExplanationPrompt(payload, "en").staticInstruction;

    expect(de).toContain("German");
    expect(en).toContain("English");
    expect(de).not.toBe(en);
    expect(en.toLowerCase()).toContain("no trade recommendation");
    expect(en.toLowerCase()).toContain("never read it as zero");
  });

  it("renders the same payload regardless of how often it is built", () => {
    const first: ExplanationContext = context();
    const second: ExplanationContext = context();

    expect(first).toEqual(second);
  });
});
