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

/*
 * FEAT-0611 — a new hand-written `<button>` in the settings tabs is a
 * regression: the window has to accept a density mode, and a raw button has no
 * token height.
 *
 * The escape hatch is deliberate and textual: a control that is *not* a button
 * (sub-tab rail, segmented control, selection card, inline chip) carries a
 * comment directly above it naming what it is instead. Anything else must go
 * through `Button.svelte`.
 *
 * Stage 1 covered `settings/tabs/`; stage 2 widened it to the whole settings
 * window, so a new card cannot slip in a raw button either.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOTS = ["src/components/settings"];
const ESCAPE = "FEAT-0611 escape:";

function svelteFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return svelteFiles(path);
    return entry.name.endsWith(".svelte") ? [path] : [];
  });
}


/**
 * The comment block directly above the control, walked back to its `<!--`.
 * A blank line or another control in between means the comment does not
 * belong to this button.
 */
function escapeBlockAbove(lines: string[], index: number): string | null {
  const collected: string[] = [];
  for (let i = index - 1; i >= 0; i--) {
    const line = lines[i];
    if (line.trim() === "") return null;
    if (line.includes("<button")) return null;
    collected.unshift(line);
    if (line.includes("<!--")) return collected.join("\n");
  }
  return null;
}

describe("FEAT-0611 — settings controls go through the button primitive", () => {
  it("has no raw <button> without an escape comment", () => {
    const offenders: string[] = [];
    let escaped = 0;

    for (const root of ROOTS) {
      for (const file of svelteFiles(root)) {
        const lines = readFileSync(file, "utf8").split("\n");
        lines.forEach((line, index) => {
          if (!line.includes("<button")) return;

          if (escapeBlockAbove(lines, index)?.includes(ESCAPE)) {
            escaped += 1;
          } else {
            offenders.push(`${file}:${index + 1}`);
          }
        });
      }
    }

    expect(offenders, `raw buttons without an escape comment:\n${offenders.join("\n")}`).toEqual([]);
    // A check that passes because the escape list swallowed everything is
    // worthless: the migrated controls must be gone from this count.
    expect(escaped).toBeGreaterThan(0);
  });

  it("wires a click handler on every <Button>", () => {
    // The companion hole to the check above: `<Button>` without `onClick` is
    // a control that renders but does nothing, and it would pass every other
    // assertion in this file (FEAT-0611 stage 2 review).
    const offenders: string[] = [];

    for (const root of ROOTS) {
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

    expect(offenders, `<Button> without onClick:\n${offenders.join("\n")}`).toEqual([]);
  });
});
