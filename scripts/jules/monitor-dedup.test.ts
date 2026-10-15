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
import { checkDedup, normalizeIssue, sessionMatches, signature } from "./monitor-dedup.mjs";

/** Importing the CLI module must not run the pipeline (main() is guarded). */
describe("monitor-dedup normalizeIssue", () => {
  it("collapses the volatile Lighthouse score", () => {
    expect(normalizeIssue("Lighthouse Performance-Score 32 liegt unter Schwelle 70")).toBe(
      normalizeIssue("Lighthouse Performance-Score 29 liegt unter Schwelle 70"),
    );
  });

  it("leaves header findings untouched", () => {
    expect(normalizeIssue("Fehlender Security-Header: Strict-Transport-Security")).toBe(
      "Fehlender Security-Header: Strict-Transport-Security",
    );
  });
});

describe("monitor-dedup signature", () => {
  it("is stable across re-measurements and order changes", () => {
    const a = ["Fehlender Security-Header: HSTS", "Lighthouse Performance-Score 32 liegt unter Schwelle 70"];
    const b = ["Lighthouse Performance-Score 33 liegt unter Schwelle 70", "Fehlender Security-Header: HSTS"];
    expect(signature(a)).toBe(signature(b));
    expect(signature(a)).toMatch(/^[0-9a-f]{16}$/);
  });

  it("changes when the finding set changes", () => {
    expect(signature(["Fehlender Security-Header: HSTS"])).not.toBe(
      signature(["Fehlender Security-Header: CSP"]),
    );
  });
});

const ISSUES = [
  "Fehlender Security-Header: Strict-Transport-Security",
  "Fehlender Security-Header: Content-Security-Policy",
  "Lighthouse Performance-Score 29 liegt unter Schwelle 70",
];

/** Shape of the real Jules sessions API entries (see production-monitor logs). */
function legacySession(id, createTime) {
  return {
    name: `sessions/${id}`,
    id,
    createTime,
    sourceContext: { source: "sources/github/mydcc/cachy-app" },
    prompt:
      "Der tägliche Production-Monitor für https://cachy.app hat 6 Auffälligkeit(en) gefunden:\n\n" +
      "- Fehlender Security-Header: Strict-Transport-Security\n" +
      "- Fehlender Security-Header: Content-Security-Policy\n" +
      "- Lighthouse Performance-Score 32 liegt unter Schwelle 70\n\nAnalysiere die Ursache im Code …",
    automationMode: "AUTO_CREATE_PR",
  };
}

describe("monitor-dedup checkDedup", () => {
  const now = Date.parse("2026-10-15T12:00:00Z");

  it("skips when the same finding was handled yesterday", () => {
    const result = checkDedup({
      sessions: [legacySession("551535745611907176", "2026-10-14T11:28:43Z")],
      title: "Production-Monitor: abc123",
      issues: ISSUES,
      maxAgeDays: 7,
      now,
    });
    expect(result.decision).toBe("SKIP");
    expect(result.last?.name).toBe("sessions/551535745611907176");
  });

  it("proceeds when the last handling is beyond the cooldown, naming it", () => {
    const result = checkDedup({
      sessions: [legacySession("old", "2026-10-01T11:00:00Z")],
      title: "Production-Monitor: abc123",
      issues: ISSUES,
      maxAgeDays: 7,
      now,
    });
    expect(result.decision).toBe("PROCEED");
    expect(result.last?.name).toBe("sessions/old");
  });

  it("proceeds when no past session covers the finding", () => {
    const result = checkDedup({
      sessions: [legacySession("other", "2026-10-14T11:28:43Z")],
      title: "Production-Monitor: abc123",
      issues: ["Health-Check: HTTP 500 statt 200"],
      maxAgeDays: 7,
      now,
    });
    expect(result.decision).toBe("PROCEED");
    expect(result.last).toBeNull();
  });

  it("fails closed on an unparseable session list", () => {
    for (const bad of [null, undefined, {}, "garbage"]) {
      const result = checkDedup({ sessions: bad, title: "t", issues: ISSUES, maxAgeDays: 7, now });
      expect(result.decision).toBe("ERROR");
    }
  });
});

describe("monitor-dedup sessionMatches", () => {
  it("matches the stable title of newer sessions", () => {
    expect(
      sessionMatches(
        { title: "Production-Monitor: abc123", prompt: "unrelated" },
        { title: "Production-Monitor: abc123", normalizedIssues: ["x"] },
      ),
    ).toBe(true);
  });
});
