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
 * W1-10 / BUG-0794: the trading pair is user data (AGENTS.md, Class C — "what
 * symbols someone watches is user data"). A click in the market overview may
 * report *which control* was pressed, never *which market* it was pressed on.
 *
 * Structural, like BUG-0791's guard: the component is parsed, and any
 * identifier or object key that mentions a symbol inside a
 * `data-track-context` attribute or a `trackInteraction` / `trackCustomEvent`
 * argument is a violation. That catches `{ symbol }`, `{ pair: symbol }`,
 * `{ s: displaySymbol }` and template literals alike.
 *
 * Scope is this file. Other components need their own change and tests.
 *
 * Self-verified: the samples below must be flagged, because a rule that can
 * never match is worse than no rule.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parse } from "svelte/compiler";

const SOURCE = readFileSync(
  new URL("./MarketOverview.svelte", import.meta.url),
  "utf8",
);

const TRACKING_CALLS = new Set(["trackInteraction", "trackCustomEvent"]);
const SYMBOLISH = /symbol/i;
const SKIPPED_KEYS = new Set(["parent", "loc", "start", "end"]);

type Node = Record<string, unknown>;

/** Every identifier name or object key below `node` that mentions a symbol. */
function symbolNames(node: unknown, out: string[]): void {
  if (Array.isArray(node)) {
    for (const child of node) symbolNames(child, out);
    return;
  }
  if (!node || typeof node !== "object") return;
  const candidate = node as Node;
  if (
    candidate.type === "Identifier" &&
    typeof candidate.name === "string" &&
    SYMBOLISH.test(candidate.name)
  ) {
    out.push(candidate.name);
  }
  for (const [key, value] of Object.entries(candidate)) {
    if (!SKIPPED_KEYS.has(key)) symbolNames(value, out);
  }
}

function walk(node: unknown, found: string[]): void {
  if (Array.isArray(node)) {
    for (const child of node) walk(child, found);
    return;
  }
  if (!node || typeof node !== "object") return;
  const candidate = node as Node;

  if (candidate.type === "Attribute" && candidate.name === "data-track-context") {
    const names: string[] = [];
    symbolNames(candidate.value, names);
    for (const name of names) found.push(`data-track-context mentions "${name}"`);
  }

  if (candidate.type === "CallExpression") {
    const callee = candidate.callee as { type?: string; name?: string } | undefined;
    if (callee?.type === "Identifier" && callee.name && TRACKING_CALLS.has(callee.name)) {
      const names: string[] = [];
      symbolNames(candidate.arguments, names);
      for (const name of names) found.push(`${callee.name}() mentions "${name}"`);
    }
  }

  for (const [key, value] of Object.entries(candidate)) {
    if (!SKIPPED_KEYS.has(key)) walk(value, found);
  }
}

function violations(source: string): string[] {
  const found: string[] = [];
  walk(parse(source, { modern: true }), found);
  return found;
}

describe("MarketOverview telemetry (W1-10 / BUG-0794)", () => {
  it("never puts the trading pair into a tracking context", () => {
    expect(violations(SOURCE)).toEqual([]);
  });

  it("still tracks the four buttons by their own id", () => {
    const ids = [...SOURCE.matchAll(/trackInteraction\(\s*"([^"]+)"/g)].map(
      (match) => match[1],
    );
    expect(ids.sort()).toEqual([
      "btn-open-chart",
      "btn-refresh-stats",
      "btn-toggle-favorite",
      "btn-toggle-technicals",
    ]);
  });

  it("flags a context attribute that carries the pair", () => {
    const sample =
      "<div data-track-context={JSON.stringify({ symbol: displaySymbol })}></div>";
    expect(violations(sample).length).toBeGreaterThan(0);
  });

  it("flags a tracking call that carries the pair, under any key", () => {
    const sample =
      '<button onclick={() => trackInteraction("x", "click", { pair: symbol })}>x</button>';
    expect(violations(sample)).toEqual(['trackInteraction() mentions "symbol"']);
  });

  it("ignores a call that names only the control", () => {
    const sample =
      '<button onclick={() => trackInteraction("btn-x", "click")}>x</button>';
    expect(violations(sample)).toEqual([]);
  });
});
