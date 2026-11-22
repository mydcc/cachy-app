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

// @vitest-environment node

/*
 * FEAT-0817, ADR-0030 decision 6 — reading a model's answer without believing
 * it.
 *
 * The three outcomes have to stay three. Collapsing "could not read the reply"
 * into "the language cannot express this" would send a trader rewriting a
 * description that was fine, and collapsing it the other way would present a
 * broken provider as a product limitation.
 *
 * The other half of this file is the structural guarantee: the answer shape
 * carries four keys, so a model that volunteers `enabled`, `id`, `stop` or an
 * order intent has them dropped by *not being read* rather than by a filter
 * someone has to maintain.
 */

import { describe, expect, it } from "vitest";

import { parseAuthoringAnswer } from "./draftAnswer";

const CONDITION = {
  kind: "compare",
  left: { kind: "indicator", indicator: { id: "rsi", params: { period: 14 } } },
  op: "lt",
  right: { kind: "constant", value: "30" },
  timeframe: "1h",
};

function reply(body: unknown): string {
  return JSON.stringify(body);
}

describe("parseAuthoringAnswer (FEAT-0817)", () => {
  it("reads a draft and hands the condition tree through untouched", () => {
    const answer = parseAuthoringAnswer(
      reply({ ok: true, draft: { name: "RSI oversold", conditions: CONDITION } }),
    );

    expect(answer.kind).toBe("draft");
    if (answer.kind !== "draft") return;
    expect(answer.draft.name).toBe("RSI oversold");
    // Untouched: the next thing that happens to it is `ruleSchema.validate`,
    // and a repair here would be the second validator ADR-0012 forbids.
    expect(answer.draft.conditions).toEqual(CONDITION);
  });

  it("reads a stated inability as its own outcome, with the reason", () => {
    const answer = parseAuthoringAnswer(
      reply({
        ok: false,
        reason:
          "The description asks for a condition on order-book depth, which the language has no operand for.",
      }),
    );

    expect(answer).toEqual({
      kind: "not_expressible",
      reason:
        "The description asks for a condition on order-book depth, which the language has no operand for.",
    });
  });

  it("does not accept a refusal with no reason as a refusal", () => {
    // ADR-0030 decision 6 asks for a stated reason. A bare `ok:false` tells a
    // trader nothing, and presenting it as "not expressible" would put words
    // in the model's mouth.
    const answer = parseAuthoringAnswer(reply({ ok: false }));

    expect(answer.kind).toBe("unreadable");
  });

  it("keeps an unreadable reply apart from a refusal", () => {
    for (const raw of [
      "I'd be happy to help you build that alert!",
      "",
      "{ not json",
      reply({ draft: { conditions: CONDITION } }),
      reply({ ok: "yes", draft: { conditions: CONDITION } }),
    ]) {
      expect(parseAuthoringAnswer(raw).kind).toBe("unreadable");
    }
  });

  it("refuses a draft that carries no conditions rather than inventing one", () => {
    const answer = parseAuthoringAnswer(
      reply({ ok: true, draft: { name: "Something" } }),
    );

    expect(answer.kind).toBe("unreadable");
  });

  it("survives a fenced reply and prose around the object", () => {
    const body = reply({ ok: true, draft: { conditions: CONDITION } });

    for (const raw of [
      "```json\n" + body + "\n```",
      "```\n" + body + "\n```",
      "Here is the draft:\n" + body + "\nLet me know if you want changes.",
    ]) {
      expect(parseAuthoringAnswer(raw).kind).toBe("draft");
    }
  });

  it("never reads a field that decides lifecycle, risk or identity", () => {
    const answer = parseAuthoringAnswer(
      reply({
        ok: true,
        draft: {
          name: "Sneaky",
          conditions: CONDITION,
          // Everything the model is told not to send, sent anyway.
          enabled: true,
          id: "rule-from-the-model",
          schema_version: 99,
          created_at_ms: 1,
          provenance: { source: "human", created_at_ms: 1 },
          action: {
            consequence_level: "send",
            order: {
              side: "buy",
              size_basis: "percent_risk",
              size: "100",
              stop: { basis: "percent_of_entry", distance: "0.1" },
            },
          },
          take_profit: { basis: "percent_of_entry", distance: "5" },
        },
      }),
    );

    expect(answer.kind).toBe("draft");
    if (answer.kind !== "draft") return;

    // The guard that closes the class: the answer carries only these keys, so
    // there is nothing to filter and nothing a later refactor can forget.
    expect(Object.keys(answer.draft).sort()).toEqual(["conditions", "name"]);
  });

  it("carries a veto and exits when the description named them", () => {
    const answer = parseAuthoringAnswer(
      reply({
        ok: true,
        draft: {
          name: "With a way out",
          conditions: CONDITION,
          veto: {
            kind: "external_feed",
            feed: "fear_greed",
            op: "lt",
            value: "20",
          },
          exits: [
            { when: CONDITION, close: "all" },
            { when: CONDITION, close: "partial", fraction: "0.5" },
          ],
          notes: "Assumed the 1h anchor for both legs.",
        },
      }),
    );

    expect(answer.kind).toBe("draft");
    if (answer.kind !== "draft") return;
    expect(answer.draft.veto).toBeDefined();
    expect(answer.draft.exits).toHaveLength(2);
    expect(answer.draft.exits?.[1]).toEqual({
      when: CONDITION,
      close: "partial",
      fraction: "0.5",
    });
    expect(answer.draft.notes).toBe("Assumed the 1h anchor for both legs.");
  });

  it("leaves exits absent rather than empty when there are none", () => {
    // The core refuses an empty exits array outright, so an empty list must
    // not survive as one — absence already means "no exits".
    for (const exits of [[], undefined, "all of them", [{ close: "all" }]]) {
      const answer = parseAuthoringAnswer(
        reply({ ok: true, draft: { conditions: CONDITION, exits } }),
      );
      expect(answer.kind).toBe("draft");
      if (answer.kind !== "draft") continue;
      expect(answer.draft.exits).toBeUndefined();
    }
  });

  it("does not default an exit's fraction", () => {
    // `close: "partial"` without a fraction is refused by the core, naming the
    // field. Filling one in here would answer a question the trader should see
    // asked — and would pick a size on their behalf.
    const answer = parseAuthoringAnswer(
      reply({
        ok: true,
        draft: {
          conditions: CONDITION,
          exits: [{ when: CONDITION, close: "partial" }],
        },
      }),
    );

    expect(answer.kind).toBe("draft");
    if (answer.kind !== "draft") return;
    expect(answer.draft.exits?.[0]).toEqual({ when: CONDITION, close: "partial" });
    expect(answer.draft.exits?.[0]).not.toHaveProperty("fraction");
  });
});
