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
import { readFileSync } from "node:fs";

/**
 * FEAT-0826 / FEAT-0811 §4 — the manual-vs-bot protection parity matrix.
 *
 * `docs/bot-parity.md` promises that every protection the manual trade form
 * offers has a bot equivalent — shipped, or planned with the backlog item
 * that will ship it. This test is the guard that promise needs: it fails
 * when a manual protection is listed without its bot counterpart, and when
 * a "planned" claim carries no FEAT item, so the parity cannot silently
 * erode while features ship on one path only.
 */

const DOC_PATH = "docs/bot-parity.md";

/** The vocabulary boundary is defined exactly once, in alert-system.md. */
const VOCABULARY_ANCHOR =
  "alert-system.md#bot-vs-order-where-the-trigger-order-metaphor-ends";

/**
 * Every protection the matrix has committed to answer, by row name. The
 * first four are the ones FEAT-0811 §4 names; the rest are rows this
 * document has added and must keep answering. Pinning the full set is what
 * makes "parity cannot silently erode" true: a guard that only checks a
 * minimum of four rows does not even see a deleted row.
 */
const EXPECTED_PROTECTIONS = [
  "auto stop-loss",
  "auto take-profit",
  "size basis",
  "precision limits",
  "pre-flight verification",
  "hard risk limits & kill switch",
  "confirmation before acting",
] as const;

interface MatrixRow {
  protection: string;
  manual: string;
  bot: string;
  status: string;
}

let cachedText: string | null = null;

function readDoc(): string {
  if (cachedText === null) {
    try {
      cachedText = readFileSync(DOC_PATH, "utf8");
    } catch {
      throw new Error(
        `${DOC_PATH} is missing — the parity matrix is FEAT-0826's deliverable ` +
          "and this guard cannot run without it.",
      );
    }
  }
  return cachedText;
}

function parseMatrix(text: string): MatrixRow[] {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) => /^## The matrix\s*$/.test(line));
  expect(
    start,
    `${DOC_PATH} must keep its "## The matrix" section — this guard parses that table.`,
  ).toBeGreaterThanOrEqual(0);

  const rows: MatrixRow[] = [];
  for (const line of lines.slice(start + 1)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|")) continue;
    // Separator rows (| --- | --- |) consist only of pipes, dashes, colons
    // and spaces — a whole-row class test, because a prefix test like
    // /^\|\s*[-: ]+/ backtracks \s* to empty and swallows the space in front
    // of any data cell, silently treating every row as a separator.
    if (/^\|[\s|:-]*$/.test(trimmed)) continue;
    const cells = trimmed
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((cell) => cell.trim());
    // The header row names the columns; it is not a protection.
    if (cells[0].toLowerCase().startsWith("manual trade form protection")) continue;
    rows.push({
      protection: cells[0] ?? "",
      manual: cells[1] ?? "",
      bot: cells[2] ?? "",
      status: cells[3] ?? "",
    });
  }
  return rows;
}

describe("docs/bot-parity.md — the manual-vs-bot protection parity matrix", () => {
  it("answers the full committed protection set, row by row", () => {
    const rows = parseMatrix(readDoc());
    expect(rows.length, `${DOC_PATH} must contain at least the committed rows`).toBeGreaterThanOrEqual(
      EXPECTED_PROTECTIONS.length,
    );
    for (const protection of EXPECTED_PROTECTIONS) {
      const found = rows.some((row) =>
        row.protection.toLowerCase().includes(protection),
      );
      expect(
        found,
        `${DOC_PATH} is missing the "${protection}" row — deleting a protection row is exactly the silent erosion this guard exists to stop.`,
      ).toBe(true);
    }
  });

  it("answers every manual protection with a bot equivalent", () => {
    const rows = parseMatrix(readDoc());
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(
        row.manual,
        `${DOC_PATH}: the "${row.protection}" row must describe the manual form's protection.`,
      ).not.toBe("");
      expect(
        row.bot,
        `${DOC_PATH}: the "${row.protection}" row has no bot equivalent — a manual protection without one is exactly the erosion this guard exists to stop (fill the cell, or mark the planned FEAT item).`,
      ).not.toBe("");
      expect(
        row.status,
        `${DOC_PATH}: the "${row.protection}" row needs a status — Shipped, or Planned with its FEAT item.`,
      ).not.toBe("");
    }
  });

  it("backs every planned claim with the FEAT item that carries it", () => {
    const rows = parseMatrix(readDoc());
    for (const row of rows) {
      const mentionsPlanned = /planned/i.test(`${row.bot} ${row.status}`);
      if (!mentionsPlanned) continue;
      expect(
        /FEAT-\d{4}/.test(`${row.bot} ${row.status}`),
        `${DOC_PATH}: the "${row.protection}" row claims a planned bot equivalent without a FEAT item — an unverifiable promise is worse than an honest gap.`,
      ).toBe(true);
    }
  });

  it("references the vocabulary boundary instead of redefining it", () => {
    const text = readDoc();
    expect(
      text.includes(VOCABULARY_ANCHOR),
      `${DOC_PATH} must link ${VOCABULARY_ANCHOR} — "Bot vs. order" is defined in exactly one place and only referenced elsewhere.`,
    ).toBe(true);
    const definesItOwn = text
      .split(/\r?\n/)
      .some((line) => /^#{1,6}\s+bot vs\b/i.test(line.trim()));
    expect(
      definesItOwn,
      `${DOC_PATH} must not carry its own "Bot vs." heading — that boundary lives in alert-system.md, this document links it.`,
    ).toBe(false);
  });
});
