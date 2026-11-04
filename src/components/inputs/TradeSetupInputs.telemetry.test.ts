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

/**
 * W1-10 / BUG-0791: the trading pair is user data (AGENTS.md, Class C — "what
 * symbols someone watches is user data"). The panel may report *that* a price
 * or ATR fetch, or a suggestion, was used; it must not report *which* pair.
 *
 * The rule is structural, not a pattern for one spelling of the mistake: a
 * `trackCustomEvent` call in this file may carry a third argument only when
 * its `(category, action)` pair is listed as non-identifying. That catches an
 * aliased variable, a template literal, a joined string or a renamed local —
 * shapes a regex over the raw text would miss.
 *
 * Scope is this file. If the symbol input or the ATR button is later extracted
 * into its own component, the guard has to move with it; the behavioural
 * assertions in `TradeSetupInputs.component.test.ts` cover the three call
 * sites end to end and fail if a handler stops firing.
 *
 * Self-verified: the sample below must produce exactly one violation, because
 * a rule that can never match is worse than no rule — surface-scan.test.ts
 * makes the same argument, and the same shape of proof.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parse } from "svelte/compiler";

const SOURCE = readFileSync(
  new URL("./TradeSetupInputs.svelte", import.meta.url),
  "utf8",
);

/** Pairs whose third argument is documented as non-identifying (BUG-0791). */
const NAMED_ARGUMENT_ALLOWED = new Set(["ATR|Toggle", "ATR|ChangeTimeframe"]);

interface TelemetryCall {
  category: string | null;
  action: string | null;
  arity: number;
}

function collectCalls(node: unknown, out: TelemetryCall[]): void {
  if (Array.isArray(node)) {
    for (const child of node) collectCalls(child, out);
    return;
  }
  if (!node || typeof node !== "object") return;
  const candidate = node as Record<string, unknown>;

  if (candidate.type === "CallExpression") {
    const callee = candidate.callee as { type?: string; name?: string } | undefined;
    if (callee?.type === "Identifier" && callee.name === "trackCustomEvent") {
      const args = (candidate.arguments ?? []) as Array<Record<string, unknown>>;
      const literal = (index: number): string | null => {
        const arg = args[index];
        return arg?.type === "Literal" && typeof arg.value === "string"
          ? arg.value
          : null;
      };
      out.push({ category: literal(0), action: literal(1), arity: args.length });
    }
  }

  for (const [key, value] of Object.entries(candidate)) {
    // `parent` would walk back up; `loc`/`start`/`end` carry no calls.
    if (key === "parent" || key === "loc" || key === "start" || key === "end") continue;
    collectCalls(value, out);
  }
}

function telemetryCalls(source: string): TelemetryCall[] {
  const calls: TelemetryCall[] = [];
  collectCalls(parse(source, { modern: true }), calls);
  return calls;
}

/** Every named-argument call whose pair is not on the allowlist. */
function violations(source: string): string[] {
  return telemetryCalls(source)
    .filter((call) => call.arity > 2)
    .filter((call) => !NAMED_ARGUMENT_ALLOWED.has(`${call.category}|${call.action}`))
    .map(
      (call) =>
        `trackCustomEvent("${call.category ?? "?"}", "${call.action ?? "?"}") carries ${call.arity} arguments`,
    );
}

describe("TradeSetupInputs telemetry (W1-10)", () => {
  it("never names the trading pair outside the documented allowlist", () => {
    expect(violations(SOURCE)).toEqual([]);
  });

  it("still reports the five events the panel owns", () => {
    expect(
      telemetryCalls(SOURCE)
        .map((call) => `${call.category}|${call.action}`)
        .sort(),
    ).toEqual([
      "ATR|ChangeTimeframe",
      "ATR|Fetch",
      "ATR|Toggle",
      "Price|Fetch",
      "Symbol|SelectSuggestion",
    ]);
  });

  it("flags a call that carries a pair, so the rule is not vacuous", () => {
    const sample =
      '<button onclick={() => trackCustomEvent("Price", "Fetch", currentSymbol)}>x</button>';
    expect(violations(sample)).toHaveLength(1);
  });

  it("ignores an allowlisted third argument", () => {
    const sample =
      '<button onclick={() => trackCustomEvent("ATR", "Toggle", "On")}>x</button>';
    expect(violations(sample)).toEqual([]);
  });
});
