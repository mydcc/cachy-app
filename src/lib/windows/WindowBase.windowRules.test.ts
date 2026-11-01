// @vitest-environment happy-dom
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
 * FEAT-0743 — a rule lands once, on open, before the frame renders. These
 * tests construct real WindowBase subclasses, so they exercise the clamp and
 * snapshot precedence the production path uses rather than a helper copy.
 */

import { describe, expect, it, beforeEach } from "vitest";
import { WindowBase } from "./WindowBase.svelte";
import { setWindowRuleSource } from "./windowRuleSource";
import type { WindowRule } from "../../stores/settings/settingsTypes";

/**
 * The window layer reads rules through the published source, so the test
 * feeds that source directly. This keeps the suite independent of the whole
 * settings store graph and still exercises the production read path.
 */
const activeRules: WindowRule[] = [];
setWindowRuleSource(() => activeRules);

class TestWindow extends WindowBase {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    get component(): any {
        return null;
    }
}

const VIEWPORT_WIDTH = 1200;
const VIEWPORT_HEIGHT = 900;

let nextId = 0;

function makeWindow(windowType: "journal" | "chart" | "settings" = "journal") {
    return new TestWindow({ windowType, id: `rule-test-${nextId++}` });
}

function setRule(rule: WindowRule | null) {
    activeRules.length = 0;
    if (rule) activeRules.push(rule);
}

beforeEach(() => {
    localStorage.clear();
    activeRules.length = 0;
    Object.defineProperty(window, "innerWidth", {
        value: VIEWPORT_WIDTH,
        writable: true,
        configurable: true,
    });
    Object.defineProperty(window, "innerHeight", {
        value: VIEWPORT_HEIGHT,
        writable: true,
        configurable: true,
    });
});

describe("FEAT-0743 — rule application on open", () => {
    it("applies position and size from a matching enabled rule", () => {
        setRule({
            windowType: "journal",
            enabled: true,
            x: 120,
            y: 80,
            width: 700,
            height: 500,
        });

        const win = makeWindow();

        expect({ x: win.x, y: win.y, width: win.width, height: win.height }).toEqual({
            x: 120,
            y: 80,
            width: 700,
            height: 500,
        });
    });

    it("keeps snapshot fields the rule does not set", () => {
        localStorage.setItem(
            "cachy_win_rule-snapshot",
            JSON.stringify({ x: 10, y: 20, width: 400, height: 300 }),
        );
        setRule({
            windowType: "journal",
            enabled: true,
            width: 600,
        });

        const win = new TestWindow({ windowType: "journal", id: "rule-snapshot" });

        expect({ x: win.x, y: win.y, width: win.width, height: win.height }).toEqual({
            x: 10,
            y: 20,
            width: 600,
            height: 300,
        });
    });

    it("leaves the restored geometry alone when the rule is disabled", () => {
        localStorage.setItem(
            "cachy_win_rule-disabled",
            JSON.stringify({ x: 15, y: 25, width: 420, height: 320 }),
        );
        setRule({ windowType: "journal", enabled: false, x: 900, y: 700 });

        const win = new TestWindow({ windowType: "journal", id: "rule-disabled" });

        expect({ x: win.x, y: win.y, width: win.width, height: win.height }).toEqual({
            x: 15,
            y: 25,
            width: 420,
            height: 320,
        });
    });

    it("opens maximized and ignores the rule's own geometry", () => {
        setRule({
            windowType: "journal",
            enabled: true,
            isMaximized: true,
            x: 10,
            y: 10,
            width: 300,
            height: 200,
        });

        const win = makeWindow();

        expect(win.isMaximized).toBe(true);
        expect(win.width).toBe(VIEWPORT_WIDTH);
        expect(win.height).toBe(VIEWPORT_HEIGHT);
    });

    it("applies keep-above on a normal window", () => {
        setRule({ windowType: "journal", enabled: true, isKeepAbove: true });

        expect(makeWindow().isKeepAbove).toBe(true);
    });

    it("refuses keep-above for a close-on-blur target", () => {
        setRule({ windowType: "settings", enabled: true, isKeepAbove: true });

        expect(makeWindow("settings").isKeepAbove).toBe(false);
    });

    it("clamps geometry through the same path as a drag", () => {
        setRule({
            windowType: "journal",
            enabled: true,
            x: -5000,
            y: -5000,
            width: 5000,
            height: 4000,
        });

        const win = makeWindow();

        // Journal opts into clampToViewport, so the size cannot exceed the
        // viewport and the position keeps at least part of the window inside.
        expect(win.width).toBeLessThanOrEqual(VIEWPORT_WIDTH);
        expect(win.height).toBeLessThanOrEqual(VIEWPORT_HEIGHT);
        expect(win.x).toBeGreaterThan(-win.width);
        expect(win.y).toBeGreaterThanOrEqual(0);
    });

    it("gives two instances of a multi-instance type the same rule", () => {
        setRule({ windowType: "chart", enabled: true, x: 200, y: 150, width: 640, height: 480 });

        const first = makeWindow("chart");
        const second = makeWindow("chart");

        expect({ x: first.x, y: first.y }).toEqual({ x: 200, y: 150 });
        expect({ x: second.x, y: second.y }).toEqual({ x: 200, y: 150 });
    });

    it("does not move a window that is already open when the rule changes", () => {
        setRule({ windowType: "journal", enabled: true, x: 100, y: 100 });
        const win = makeWindow();

        setRule({ windowType: "journal", enabled: true, x: 800, y: 700 });

        expect({ x: win.x, y: win.y }).toEqual({ x: 100, y: 100 });
    });
});
