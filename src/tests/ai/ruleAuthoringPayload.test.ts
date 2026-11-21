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

// @vitest-environment jsdom

/*
 * FEAT-0817, ADR-0030 decision 4 — the authoring payload is a closed list.
 *
 * ## Why this file does not plant Class A data in the stores
 *
 * `academyEgress.test.ts` fills the journal, the account and the trade form
 * before asserting that none of it travels, and there that is the right test:
 * `buildExplanationContext` *reads* those stores, so the assertion is about a
 * real filter doing real work.
 *
 * `buildAuthoringPayload` takes four parameters and reads nothing. Planting a
 * journal entry here would assert that a function does not leak data it has no
 * way to reach — true, and worth nothing. What can actually regress is the
 * *shape*: someone adds a fifth field, or passes a context object through it.
 * So the load-bearing assertion is the key list, which goes red for any fifth
 * field whatever it contains, and the field-name search, which goes red for a
 * payload that merely mentions a Class A concept.
 *
 * The call path that does have store access is the panel, and
 * `AuthoringTab.component.test.ts` plants Class A data against it.
 */

import { describe, expect, it } from "vitest";

import { settingsState } from "../../stores/settings.svelte";
import { buildConditionLanguageDescription } from "../../lib/ai/ruleAuthoring/conditionLanguage";
import {
  buildAuthoringMessages,
  buildAuthoringPayload,
  previewAuthoringPayload,
} from "../../lib/ai/ruleAuthoring/authoringPayload";

const SCHEMA_VERSION = 4;

function payload() {
  return buildAuthoringPayload(
    "buy when RSI is under 30 and ADX above 20",
    "BTCUSDT",
    "1h",
    buildConditionLanguageDescription(SCHEMA_VERSION),
  );
}

describe("authoring payload boundary (FEAT-0817)", () => {
  it("carries exactly the four fields ADR-0030 decision 4 allows", () => {
    // The guard that closes the class: a fifth field fails here no matter what
    // it is called or what it holds.
    expect(Object.keys(payload()).sort()).toEqual([
      "language",
      "prose",
      "symbol",
      "triggerTimeframe",
    ]);
  });

  it("names no journal, balance, position, hash or credential concept", () => {
    const serialized = JSON.stringify(payload());
    // Names rather than values: a field called `derived_from_hash` carrying an
    // empty string is still a field the model was told exists, and a model
    // told a hash exists will ask for one.
    for (const name of [
      "journal",
      "accountSize",
      "available_balance",
      "unrealised_pnl",
      "position_size",
      "openPositions",
      "tradeSetup",
      "derived_from_hash",
      "content_hash",
      "apiKey",
      "api_key",
      "provenance",
      "created_at_ms",
      "userProviders",
      "activeProviderId",
    ]) {
      expect(serialized).not.toContain(name);
    }
  });

  it("offers the model no shape for the stop, the order or the arm state", () => {
    const serialized = JSON.stringify(payload().language);
    // ADR-0030 decision 5. The language description is what the model writes
    // against; naming a field it may not set is an invitation, and the core
    // would refuse what it then proposed.
    expect(serialized).not.toContain('"stop"');
    expect(serialized).not.toContain("size_basis");
    expect(serialized).not.toContain("consequence_level");
    expect(serialized).not.toContain('"enabled"');
  });

  it("keeps the trader's three parts and nothing else in the messages", () => {
    const serialized = JSON.stringify(buildAuthoringMessages(payload()));

    // Present, or every assertion below would pass against an empty payload.
    expect(serialized).toContain("BTCUSDT");
    expect(serialized).toContain("1h");
    expect(serialized).toContain("RSI is under 30");

    expect(serialized).not.toContain("derived_from_hash");
    expect(serialized).not.toContain("apiKey");
  });

  it("is byte-identical whatever aiShareTradeContext says", () => {
    settingsState.aiShareTradeContext = false;
    const off = JSON.stringify(buildAuthoringMessages(payload()));

    settingsState.aiShareTradeContext = true;
    const on = JSON.stringify(buildAuthoringMessages(payload()));

    // ADR-0030 decision 3: independent in both directions. This path never
    // reads the chat's consent, so flipping it may not change a single byte.
    expect(on).toBe(off);
  });

  it("is byte-identical whatever aiRuleAuthoringEgress says", () => {
    // The authoring switch decides *whether* a request leaves, never *what* it
    // carries. A payload that grew under consent would be a second payload
    // nobody reviewed.
    settingsState.aiRuleAuthoringEgress = false;
    const off = JSON.stringify(buildAuthoringMessages(payload()));

    settingsState.aiRuleAuthoringEgress = true;
    const on = JSON.stringify(buildAuthoringMessages(payload()));

    expect(on).toBe(off);
  });

  it("previews the same four parts the request carries", () => {
    const built = payload();
    const preview = previewAuthoringPayload(built);

    // ADR-0030 decision 4 requires the list to be shown before the first
    // request. The preview is derived from the payload object itself, so the
    // two cannot drift; this pins that it still reports all four parts.
    expect(preview.prose).toBe(built.prose);
    expect(preview.symbol).toBe(built.symbol);
    expect(preview.triggerTimeframe).toBe(built.triggerTimeframe);
    expect(preview.indicatorCount).toBe(built.language.indicators.length);
    expect(preview.indicatorCount).toBeGreaterThan(10);
  });

  it("describes indicators the core actually accepts", () => {
    const language = payload().language;
    // Derived from INDICATOR_CATALOGUE, which `indicatorCatalogue.test.ts`
    // holds against the Rust registry. A hand-written list here would drift
    // and the model would be told about an indicator the core refuses.
    const rsi = language.indicators.find((entry) => entry.id === "rsi");
    expect(rsi?.params).toEqual([
      { name: "period", kind: "period", default: 14 },
    ]);
    expect(rsi?.outputs).toEqual([{ name: "value", dimension: "percent" }]);

    // The cumulative flag reaches the model, so it does not propose OBV
    // against a constant — a comparison the core refuses.
    const obv = language.indicators.find((entry) => entry.id === "obv");
    expect(obv?.cumulative).toBe(true);
    expect(rsi).not.toHaveProperty("cumulative");
  });

  it("reports the schema version it was built for", () => {
    expect(payload().language.schemaVersion).toBe(SCHEMA_VERSION);
  });
});
