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

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * A `<Tooltip text={…} />` with no children renders an empty 0×0 trigger, so
 * its explanation has no affordance to hover. Commit b6684cc2f removed the
 * default "?" marker and left six chart call sites silently broken until they
 * were migrated to `InfoTip`. This scans the source so the same regression
 * cannot land again unnoticed.
 */

const SRC = join(process.cwd(), "src");

function svelteFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory()
      ? svelteFiles(full)
      : entry.endsWith(".svelte")
        ? [full]
        : [];
  });
}

/** Self-closing `<Tooltip … />` tags (multiline-safe). */
function childlessTooltips(source: string): string[] {
  const found: string[] = [];
  const open = /<Tooltip\b/g;
  let match: RegExpExecArray | null;
  while ((match = open.exec(source)) !== null) {
    const end = source.indexOf(">", match.index);
    if (end === -1) break;
    const tag = source.slice(match.index, end + 1);
    if (tag.trimEnd().endsWith("/>")) {
      found.push(tag.replace(/\s+/g, " ").slice(0, 100));
    }
  }
  return found;
}

describe("Tooltip call sites", () => {
  it("never renders a text-only tooltip without a visible trigger", () => {
    const offenders = svelteFiles(SRC).flatMap((file) =>
      childlessTooltips(readFileSync(file, "utf-8")).map(
        (tag) => `${relative(process.cwd(), file)}: ${tag}`,
      ),
    );

    expect(offenders).toEqual([]);
  });
});
