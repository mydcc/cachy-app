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
 * FEAT-0611 / FEAT-0612 — a new hand-written `<button>` in a migrated surface
 * is a regression: the app has to accept a density mode, and a raw button has
 * no token height.
 *
 * The escape hatch is deliberate and textual: a control that is *not* a button
 * (sub-tab rail, segmented control, selection card, chip trigger) carries a
 * comment directly above it naming what it is instead. Anything else must go
 * through `Button.svelte`.
 *
 * Scope grows with each adoption item, and each item keeps its own token:
 * FEAT-0611 covers the settings window, FEAT-0612 the calculator files listed
 * below. The calculator neighbours that are not migrated yet
 * (`TradeSetupInputs`, `TakeProfitTargets`, `TagInputs`) are deliberately absent
 * rather than escaped, so this guard does not claim coverage it has not earned.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** Each item's escape token is bound to the roots it granted, so a comment
 *  copied from another item cannot excuse a control it never covered. */
const SCOPES = [
  {
    escape: "FEAT-0611 escape:",
    roots: ["src/components/settings"],
  },
  {
    escape: "FEAT-0612 escape:",
    roots: [
      "src/components/inputs/GeneralInputs.svelte",
      "src/components/inputs/PortfolioInputs.svelte",
      "src/components/inputs/ExchangeAccountControls.svelte",
      "src/components/results/SummaryResults.svelte",
      "src/components/results/PlaceOrderPanel.svelte",
    ],
  },
  {
    escape: "FEAT-0613 escape:",
    roots: [
      "src/components/shared/JournalContent.svelte",
      "src/components/shared/JournalEntryTags.svelte",
      "src/components/shared/DashboardNav.svelte",
      "src/components/shared/journal",
      "src/components/shared/windows/WindowFrame.svelte",
    ],
  },
];

/**
 * Escaped controls per file. A migrated control that reverts to a raw button
 * with a copied comment would still satisfy the floor below; the per-file count
 * is what makes the guard fail on that, and it also fails when an escape is
 * silently dropped.
 */
const EXPECTED_ESCAPES: Record<string, number> = {
  "src/components/settings/TabBar.svelte": 1,
  "src/components/inputs/GeneralInputs.svelte": 2,
  "src/components/inputs/ExchangeAccountControls.svelte": 2,
  "src/components/results/PlaceOrderPanel.svelte": 1,
  // FEAT-0613 — journal and window chrome.
  "src/components/shared/JournalContent.svelte": 3,
  "src/components/shared/journal/JournalFilters.svelte": 3,
  "src/components/shared/journal/JournalTable.svelte": 2,
  "src/components/shared/journal/TradeDetailDrawer.svelte": 2,
  "src/components/shared/JournalEntryTags.svelte": 2,
  "src/components/shared/journal/JournalDeepDive.svelte": 1,
  "src/components/shared/DashboardNav.svelte": 1,
  "src/components/shared/windows/WindowFrame.svelte": 2,
};

function svelteFiles(path: string): string[] {
  if (path.endsWith(".svelte")) return [path];

  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
    const child = join(path, entry.name);
    if (entry.isDirectory()) return svelteFiles(child);
    return entry.name.endsWith(".svelte") ? [child] : [];
  });
}

/**
 * The comment block directly above the control. It has to open with `<!--` and
 * close on the line immediately above the button — anything else (a comment
 * over a wrapper element, a comment whose prose mentions the token) does not
 * describe this control and must not excuse it.
 */
function escapeBlockAbove(lines: string[], index: number): string | null {
  const collected: string[] = [];
  for (let i = index - 1; i >= 0; i--) {
    const line = lines[i];
    if (line.trim() === "") return null;
    if (line.includes("<button")) return null;
    collected.unshift(line);
    if (line.trim().startsWith("<!--")) {
      const last = collected[collected.length - 1];
      return last.trimEnd().endsWith("-->") ? collected.join("\n") : null;
    }
  }
  return null;
}

describe("migrated surfaces go through the button primitive", () => {
  it("has no raw <button> without its own escape comment", () => {
    const offenders: string[] = [];
    const counts: Record<string, number> = {};

    for (const scope of SCOPES) {
      for (const root of scope.roots) {
        for (const file of svelteFiles(root)) {
          const lines = readFileSync(file, "utf8").split("\n");
          lines.forEach((line, index) => {
            if (!line.includes("<button")) return;

            const block = escapeBlockAbove(lines, index);
            // The token has to be on the opening comment line: a mention in the
            // prose of a longer comment is not an escape declaration.
            if (block && block.split("\n")[0].includes(scope.escape)) {
              counts[file] = (counts[file] ?? 0) + 1;
            } else {
              offenders.push(`${file}:${index + 1}`);
            }
          });
        }
      }
    }

    expect(
      offenders,
      `raw buttons without an escape comment:\n${offenders.join("\n")}`,
    ).toEqual([]);

    // The guard must not pass because everything was swallowed, nor because an
    // escape went missing: the expected count is pinned per file.
    for (const [file, expected] of Object.entries(EXPECTED_ESCAPES)) {
      expect(counts[file] ?? 0, `escaped controls in ${file}`).toBe(expected);
    }
  });

  it("wires a click handler on every <Button>", () => {
    // The companion hole to the check above: `<Button>` without `onClick` is
    // a control that renders but does nothing, and it would pass every other
    // assertion in this file (FEAT-0611 stage 2 review).
    const offenders: string[] = [];

    for (const scope of SCOPES) {
      for (const root of scope.roots) {
        for (const file of svelteFiles(root)) {
          const lines = readFileSync(file, "utf8").split("\n");
          lines.forEach((line, index) => {
            if (!line.includes("<Button")) return;

            const tag: string[] = [line];
            for (
              let i = index + 1;
              i < lines.length && !tag[tag.length - 1].trim().endsWith(">");
              i++
            ) {
              tag.push(lines[i]);
            }
            if (!tag.join("\n").includes("onClick")) {
              offenders.push(`${file}:${index + 1}`);
            }
          });
        }
      }
    }

    expect(
      offenders,
      `<Button> without onClick:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });
});
