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

/**
 * FEAT-0752 — the chart's drawing bell seeds the panel.
 *
 * The drawing overlay is canvas-rendered, so the bell that hangs off it is not
 * reachable from happy-dom; a DOM test would prove nothing. This pins the one
 * property that matters and cannot be observed there: the function builds a
 * seed, opens the panel with the drawing attached, and never calls the arming
 * service. A regression to the old direct arm has to reintroduce that call and
 * drop the seed, and fails here.
 *
 * The behaviour on the other side of the seed — the Drawing tab, the arm press,
 * the lifecycle fields — is covered by the store, shell and tab tests.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
    new URL("./CandleChartView.svelte", import.meta.url),
    "utf8",
);

function alertOnSelectedDrawing(): string {
    const start = source.indexOf("function alertOnSelectedDrawing");
    expect(start).toBeGreaterThan(-1);
    const end = source.indexOf("function deleteSelectedDrawing", start);
    expect(end).toBeGreaterThan(start);
    return source.slice(start, end);
}

describe("FEAT-0752: the drawing bell seeds the panel", () => {
    it("opens the panel with the drawing instead of arming it", () => {
        const fn = alertOnSelectedDrawing();

        expect(fn).toContain("openAlertPanelWith");
        expect(fn).toContain('tab: "drawing"');
        expect(fn).toContain("drawing: { id: drawing.id, symbol: drawing.symbol }");
        expect(fn).not.toMatch(/armDrawingAlert\s*\(/);
    });
});
