// @vitest-environment node
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

import { describe, expect, it } from "vitest";
import { parseArgs, selectDispatchable } from "./dispatch-backlog.mjs";
import { updateFrontMatter } from "../lib/backlog-frontmatter.mjs";

/** Importing the CLI module must not run the pipeline (main() is guarded). */
describe("dispatch-backlog parseArgs", () => {
  it("defaults to legacy one-shot mode when no flags are given", () => {
    expect(parseArgs([])).toEqual({ phase: null, ids: [], reportFile: null, unknown: [] });
  });

  it("parses phase, comma-separated ids and report file", () => {
    const args = parseArgs(["--phase=sessions", "--ids=BUG-0042, FEAT-0017,", "--report-file=/tmp/r.json"]);
    expect(args.phase).toBe("sessions");
    expect(args.ids).toEqual(["BUG-0042", "FEAT-0017"]);
    expect(args.reportFile).toBe("/tmp/r.json");
    expect(args.unknown).toEqual([]);
  });

  it("ignores --dry-run as a flag and collects unknown arguments for rejection", () => {
    const args = parseArgs(["--dry-run", "--phase=status", "--phases=status"]);
    expect(args.phase).toBe("status");
    expect(args.unknown).toEqual(["--phases=status"]);
  });
});

describe("dispatch-backlog selectDispatchable", () => {
  const item = (overrides = {}) => ({ id: "BUG-0001", status: "ready", area: "ui", priority: "P1", ...overrides });

  it("keeps plain ready items", () => {
    expect(selectDispatchable([item()])).toHaveLength(1);
  });

  it("drops non-ready items, excluded areas and P0", () => {
    const items = [
      item({ id: "BUG-0001", status: "specced" }),
      item({ id: "BUG-0002", area: "execution" }),
      item({ id: "BUG-0003", area: "security" }),
      item({ id: "BUG-0004", area: "exchange" }),
      item({ id: "BUG-0005", priority: "P0" }),
      item({ id: "BUG-0006" }),
    ];
    expect(selectDispatchable(items).map((i) => i.id)).toEqual(["BUG-0006"]);
  });

  it("drops items with unresolved depends_on but keeps done and dropped dependencies", () => {
    const items = [
      item({ id: "FEAT-0017", depends_on: ["FEAT-0018"] }),
      item({ id: "FEAT-0019", depends_on: ["FEAT-0020", "FEAT-0021"] }),
      item({ id: "FEAT-0022" }),
      item({ id: "FEAT-0018", status: "in-progress" }),
      item({ id: "FEAT-0020", status: "done" }),
      item({ id: "FEAT-0021", status: "dropped" }),
    ];
    // FEAT-0019 stays eligible: both dependencies count as resolved.
    expect(selectDispatchable(items).map((i) => i.id)).toEqual(["FEAT-0019", "FEAT-0022"]);
  });
});

describe("updateFrontMatter null removal", () => {
  const doc = `---
id: BUG-0042
status: in-progress
assignee: jules
---

Body stays untouched.`;

  it("replaces existing keys and appends missing ones", () => {
    const out = updateFrontMatter(doc, { status: "ready" });
    expect(out).toContain("status: ready");
    expect(out).toContain("assignee: jules");
  });

  it("removes a key when the update value is null", () => {
    const out = updateFrontMatter(doc, { status: "ready", assignee: null });
    expect(out).toContain("status: ready");
    expect(out).not.toContain("assignee");
    expect(out.trim().endsWith("Body stays untouched.")).toBe(true);
  });

  it("does not append a key that was set to null but never existed", () => {
    const out = updateFrontMatter("---\nid: BUG-0001\n---\n\nBody.", { status: "ready", assignee: null });
    expect(out).toContain("status: ready");
    expect(out).not.toContain("assignee");
  });
});
