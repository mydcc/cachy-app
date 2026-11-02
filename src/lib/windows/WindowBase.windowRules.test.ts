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

type RuleWindowType =
    | "journal"
    | "chart"
    | "news"
    | "alertpanel"
    | "academy";

function makeWindow(windowType: RuleWindowType = "journal") {
    return new TestWindow({ windowType, id: `rule-test-${nextId++}` });
}

function setRule(rule: WindowRule | null) {
    activeRules.length = 0;
    if (rule) activeRules.push(rule);
}

function setRules(rules: WindowRule[]) {
    activeRules.length = 0;
    activeRules.push(...rules);
}

/** A chart rule scoped to one symbol (FEAT-0769). */
function symbolRule(
    value: string,
    geometry: Partial<WindowRule> = {},
): WindowRule {
    return {
        windowType: "chart",
        match: { kind: "symbol", value },
        enabled: true,
        ...geometry,
    };
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

    it("leaves the restored geometry alone when the rule is disabled, and moves it when enabled", () => {
        localStorage.setItem(
            "cachy_win_rule-disabled",
            JSON.stringify({ x: 15, y: 25, width: 420, height: 320 }),
        );
        localStorage.setItem(
            "cachy_win_rule-enabled",
            JSON.stringify({ x: 15, y: 25, width: 420, height: 320 }),
        );
        setRule({ windowType: "journal", enabled: false, x: 900, y: 700 });

        const disabled = new TestWindow({
            windowType: "journal",
            id: "rule-disabled",
        });
        expect({
            x: disabled.x,
            y: disabled.y,
            width: disabled.width,
            height: disabled.height,
        }).toEqual({ x: 15, y: 25, width: 420, height: 320 });

        // The positive counterpart: the same rule, enabled, must be visible.
        setRule({ windowType: "journal", enabled: true, x: 900, y: 700 });
        const enabled = new TestWindow({
            windowType: "journal",
            id: "rule-enabled",
        });
        expect({ x: enabled.x, y: enabled.y }).toEqual({ x: 900, y: 700 });
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

    it("keeps keep-above when the rule maximizes", () => {
        setRule({
            windowType: "journal",
            enabled: true,
            isMaximized: true,
            isKeepAbove: true,
        });

        const win = makeWindow();

        expect(win.isMaximized).toBe(true);
        expect(win.isKeepAbove).toBe(true);
    });

    it("applies keep-above on a normal window", () => {
        setRule({ windowType: "journal", enabled: true, isKeepAbove: true });

        expect(makeWindow().isKeepAbove).toBe(true);
    });

    it("refuses keep-above for a close-on-blur target", () => {
        // No rule type is close-on-blur today, but the guard lives in
        // WindowBase for any future type that joins the list.
        setRule({ windowType: "journal", enabled: true, isKeepAbove: true });
        const win = new TestWindow({
            windowType: "journal",
            id: `rule-test-close-on-blur-${nextId++}`,
            closeOnBlur: true,
        });

        expect(win.isKeepAbove).toBe(false);
    });

    it("clamps rule geometry through the drag path", () => {
        setRule({
            windowType: "journal",
            enabled: true,
            x: -5000,
            y: -5000,
            width: 5000,
            height: 4000,
        });

        const win = makeWindow();

        // Journal opts into clampToViewport, so the size is capped at the
        // viewport and the position keeps 38% of the window visible:
        // minX = -(1200 - 1200*0.38) = -744.
        expect(win.width).toBe(VIEWPORT_WIDTH);
        expect(win.height).toBe(VIEWPORT_HEIGHT);
        expect(win.x).toBe(-744);
        expect(win.y).toBe(0);
    });

    it("clamps a rule size to the viewport even for types that do not opt in", () => {
        setRule({
            windowType: "news",
            enabled: true,
            width: 5000,
            height: 4000,
        });

        const win = makeWindow("news");

        expect(win.width).toBe(VIEWPORT_WIDTH);
        expect(win.height).toBe(VIEWPORT_HEIGHT);
    });

    it("lets the fixed aspect ratio decide the height of an aspect-locked type", () => {
        setRule({
            windowType: "chart",
            enabled: true,
            width: 640,
            height: 480,
        });

        const win = makeWindow("chart");

        // chart: aspectRatio 1.6 and a 44px header => 640 / 1.6 + 44 = 444.
        expect(win.width).toBe(640);
        expect(win.height).toBe(444);
    });

    it("opens a maximized snapshot as a floating window when the rule says not maximized", () => {
        localStorage.setItem(
            "cachy_win_rule-unmaximize",
            JSON.stringify({
                x: 0,
                y: 0,
                width: VIEWPORT_WIDTH,
                height: VIEWPORT_HEIGHT,
                isMaximized: true,
            }),
        );
        setRule({
            windowType: "journal",
            enabled: true,
            isMaximized: false,
        });

        const win = new TestWindow({
            windowType: "journal",
            id: "rule-unmaximize",
        });

        // The snapshot rect was the maximized one; dimensions fall back to the
        // registry layout and the placement branch centres them.
        expect(win.isMaximized).toBe(false);
        expect(win.width).toBe(1000);
        expect(win.height).toBe(800);
        expect(win.x).toBe(100);
        expect(win.y).toBe(50);
    });

    it("treats geometry on a maximized snapshot as a request to float", () => {
        localStorage.setItem(
            "cachy_win_rule-float",
            JSON.stringify({
                x: 0,
                y: 0,
                width: VIEWPORT_WIDTH,
                height: VIEWPORT_HEIGHT,
                isMaximized: true,
            }),
        );
        setRule({
            windowType: "journal",
            enabled: true,
            width: 700,
        });

        const win = new TestWindow({ windowType: "journal", id: "rule-float" });

        expect(win.isMaximized).toBe(false);
        expect(win.width).toBe(700);
        expect(win.height).toBe(800);
        expect(win.x).toBe(250);
        expect(win.y).toBe(50);
    });

    it("keeps the placed axis when the rule sets only one coordinate", () => {
        setRule({ windowType: "journal", enabled: true, x: 200 });

        const win = makeWindow();

        // Placement centres journal (1000x800) at 100/50; only X is overridden.
        expect(win.x).toBe(200);
        expect(win.y).toBe(50);
    });

    it("falls back to geometry when a maximized rule targets a type that cannot maximize", () => {
        setRule({
            windowType: "alertpanel",
            enabled: true,
            isMaximized: true,
            x: 100,
            y: 80,
        });

        const win = makeWindow("alertpanel");

        expect(win.isMaximized).toBe(false);
        expect({ x: win.x, y: win.y }).toEqual({ x: 100, y: 80 });
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

describe("FEAT-0769 — per-instance rules on open", () => {
    it("prefers the rule for the chart's own symbol over the general chart rule", () => {
        setRules([
            { windowType: "chart", enabled: true, x: 100, y: 100 },
            symbolRule("BTCUSDT", { x: 400, y: 300, width: 640 }),
        ]);

        const btc = new TestWindow({
            windowType: "chart",
            id: "rule-scoped-btc",
            symbol: "BTCUSDT",
        });
        const eth = new TestWindow({
            windowType: "chart",
            id: "rule-scoped-eth",
            symbol: "ETHUSDT",
        });

        expect({ x: btc.x, y: btc.y, width: btc.width }).toEqual({
            x: 400,
            y: 300,
            width: 640,
        });
        expect({ x: eth.x, y: eth.y }).toEqual({ x: 100, y: 100 });
    });

    it("applies a symbol rule even when no general chart rule exists", () => {
        localStorage.setItem(
            "cachy_win_rule-only-symbol-other",
            JSON.stringify({ x: 31, y: 41 }),
        );
        setRule(symbolRule("BTCUSDT", { x: 220, y: 180 }));

        const win = new TestWindow({
            windowType: "chart",
            id: "rule-only-symbol",
            symbol: "BTCUSDT",
        });
        // Without the scope, the only chart rule would land on every chart.
        const other = new TestWindow({
            windowType: "chart",
            id: "rule-only-symbol-other",
            symbol: "ETHUSDT",
        });

        expect({ x: win.x, y: win.y }).toEqual({ x: 220, y: 180 });
        expect({ x: other.x, y: other.y }).toEqual({ x: 31, y: 41 });
    });

    it("survives a non-string symbol from a hand-edited snapshot", () => {
        // The symbol reaches matching straight from the constructor option, and
        // a restored session can carry anything. It must not throw.
        setRule(symbolRule("BTCUSDT", { x: 400, y: 300 }));

        const win = new TestWindow({
            windowType: "chart",
            id: "rule-bad-symbol",
            symbol: 42 as unknown as string,
        });

        expect(Number.isFinite(win.x)).toBe(true);
        expect(Number.isFinite(win.y)).toBe(true);
    });

    it("leaves a chart whose symbol has no rule at its snapshot", () => {
        localStorage.setItem(
            "cachy_win_rule-foreign-symbol",
            JSON.stringify({ x: 15, y: 25, width: 620 }),
        );
        setRule(symbolRule("BTCUSDT", { x: 400, y: 300, width: 700 }));

        const win = new TestWindow({
            windowType: "chart",
            id: "rule-foreign-symbol",
            symbol: "ETHUSDT",
        });

        expect({ x: win.x, y: win.y, width: win.width }).toEqual({
            x: 15,
            y: 25,
            width: 620,
        });
    });

    it("matches the symbol the window was opened with, not one a snapshot restores", () => {
        // The snapshot carries a symbol nobody asked for; the rule is chosen
        // from the constructor argument, so this must stay ETH's snapshot.
        localStorage.setItem(
            "cachy_win_rule-snapshot-symbol",
            JSON.stringify({ x: 15, y: 25, symbol: "BTCUSDT" }),
        );
        setRule(symbolRule("BTCUSDT", { x: 400, y: 300 }));

        const win = new TestWindow({
            windowType: "chart",
            id: "rule-snapshot-symbol",
            symbol: "ETHUSDT",
        });

        expect({ x: win.x, y: win.y }).toEqual({ x: 15, y: 25 });
    });
});

describe("FEAT-0770 — Apply now on a live window", () => {
    const liveWindow = (id: string) =>
        new TestWindow({ windowType: "journal", id });

    it("moves and resizes an open window through the clamp path", () => {
        const win = liveWindow("apply-live-geometry");

        expect(
            win.applyRuleNow({
                windowType: "journal",
                enabled: true,
                x: 200,
                y: 150,
                width: 500,
                height: 400,
            }),
        ).toBe(true);

        expect({ x: win.x, y: win.y, width: win.width, height: win.height }).toEqual({
            x: 200,
            y: 150,
            width: 500,
            height: 400,
        });
    });

    it("never grows a window past the viewport", () => {
        // `journal` opts into applyViewportClamp, which would cap the size even
        // without the guard under test. Turn it off so only the rule clamp can
        // answer, otherwise this test is green on the broken code.
        const win = new TestWindow({
            windowType: "academy",
            id: "apply-live-clamp",
        });
        win.clampToViewport = false;

        win.applyRuleNow({
            windowType: "academy",
            enabled: true,
            width: VIEWPORT_WIDTH * 4,
            height: VIEWPORT_HEIGHT * 4,
        });

        expect(win.width).toBe(VIEWPORT_WIDTH);
        expect(win.height).toBe(VIEWPORT_HEIGHT);
    });

    it("keeps an aspect-locked window inside the viewport height", () => {
        // updateSize derives the height from the width for chart windows and
        // discards the value passed in, so a clamped height alone does not
        // bound the rendered window.
        Object.defineProperty(window, "innerHeight", {
            value: 400,
            writable: true,
            configurable: true,
        });
        const win = new TestWindow({
            windowType: "chart",
            id: "apply-live-aspect",
        });

        win.applyRuleNow({
            windowType: "chart",
            enabled: true,
            width: VIEWPORT_WIDTH,
            height: 400,
        });

        expect(win.height).toBeLessThanOrEqual(400);
        expect(win.width).toBeLessThanOrEqual(VIEWPORT_WIDTH);
    });

    it("leaves a window alone when the rule has nothing to apply yet", () => {
        // A freshly added rule is `{ windowType, enabled }`: pressing Apply now
        // on that card must not un-maximize the window or rewrite its snapshot.
        localStorage.setItem(
            "cachy_win_apply-live-empty",
            JSON.stringify({ x: 10, y: 20, width: 400, height: 300 }),
        );
        const win = liveWindow("apply-live-empty");
        win.maximize();
        const stored = localStorage.getItem("cachy_win_apply-live-empty");
        const before = {
            x: win.x,
            y: win.y,
            width: win.width,
            height: win.height,
            isMaximized: win.isMaximized,
        };

        expect(win.applyRuleNow({ windowType: "journal", enabled: true })).toBe(
            true,
        );

        expect({
            x: win.x,
            y: win.y,
            width: win.width,
            height: win.height,
            isMaximized: win.isMaximized,
        }).toEqual(before);
        expect(localStorage.getItem("cachy_win_apply-live-empty")).toBe(stored);
    });

    it("re-clamps the anchor when the rule only changes the size", () => {
        // Growing a window that sits near the right edge must not leave less
        // than the 38 % visibility updatePosition guarantees.
        const win = liveWindow("apply-live-size-only");
        win.x = 1000;
        win.width = 400;
        win.height = 300;

        win.applyRuleNow({
            windowType: "journal",
            enabled: true,
            width: VIEWPORT_WIDTH,
        });

        const visible =
            Math.min(VIEWPORT_WIDTH, win.x + win.width) - Math.max(0, win.x);
        expect(visible).toBeGreaterThanOrEqual(win.width * 0.38);
    });

    it("leaves an already unmaximized window minimized when the rule only declines maximize", () => {
        const win = liveWindow("apply-live-minimized-keep");
        win.isMinimized = true;

        win.applyRuleNow({
            windowType: "journal",
            enabled: true,
            isMaximized: false,
        });

        // The rule asked that the window not be maximized; it already was not.
        expect(win.isMinimized).toBe(true);
    });

    it("leaves the fields the rule does not set alone", () => {
        localStorage.setItem(
            "cachy_win_apply-live-partial",
            JSON.stringify({ x: 10, y: 20, width: 400, height: 300 }),
        );
        const win = liveWindow("apply-live-partial");

        win.applyRuleNow({ windowType: "journal", enabled: true, x: 250 });

        expect({ x: win.x, y: win.y, width: win.width, height: win.height }).toEqual({
            x: 250,
            y: 20,
            width: 400,
            height: 300,
        });
    });

    it("maximizes, and a later rule brings the window back to floating", () => {
        const win = liveWindow("apply-live-maximize");

        win.applyRuleNow({ windowType: "journal", enabled: true, isMaximized: true });
        expect(win.isMaximized).toBe(true);
        expect({ width: win.width, height: win.height }).toEqual({
            width: VIEWPORT_WIDTH,
            height: VIEWPORT_HEIGHT,
        });

        win.applyRuleNow({
            windowType: "journal",
            enabled: true,
            isMaximized: false,
            width: 600,
            height: 420,
        });

        expect(win.isMaximized).toBe(false);
        expect({ width: win.width, height: win.height }).toEqual({
            width: 600,
            height: 420,
        });
    });

    it("sets and clears the keep-above flag", () => {
        const win = liveWindow("apply-live-keepabowe");

        win.applyRuleNow({ windowType: "journal", enabled: true, isKeepAbove: true });
        expect(win.isKeepAbove).toBe(true);

        win.applyRuleNow({ windowType: "journal", enabled: true, isKeepAbove: false });
        expect(win.isKeepAbove).toBe(false);
    });

    it("never lifts a close-on-blur window above everything", () => {
        const win = liveWindow("apply-live-closeonblur");
        win.closeOnBlur = true;

        win.applyRuleNow({ windowType: "journal", enabled: true, isKeepAbove: true });

        expect(win.isKeepAbove).toBe(false);
    });

    it("refuses a rule for another window type and moves nothing", () => {
        const win = liveWindow("apply-live-wrong-type");
        const before = { x: win.x, y: win.y };

        expect(
            win.applyRuleNow({ windowType: "chart", enabled: true, x: 400, y: 400 }),
        ).toBe(false);
        expect({ x: win.x, y: win.y }).toEqual(before);
    });

    it("writes the applied geometry to the snapshot immediately", () => {
        const win = liveWindow("apply-live-snapshot");

        win.applyRuleNow({
            windowType: "journal",
            enabled: true,
            x: 210,
            y: 160,
            width: 520,
            height: 360,
        });

        const saved = JSON.parse(
            localStorage.getItem("cachy_win_apply-live-snapshot") ?? "{}",
        );
        expect({
            x: saved.x,
            y: saved.y,
            width: saved.width,
            height: saved.height,
        }).toEqual({ x: 210, y: 160, width: 520, height: 360 });
    });

    it("brings a minimized window back before applying", () => {
        const win = liveWindow("apply-live-minimized");
        win.isMinimized = true;

        win.applyRuleNow({ windowType: "journal", enabled: true, x: 220, y: 170 });

        expect(win.isMinimized).toBe(false);
        expect({ x: win.x, y: win.y }).toEqual({ x: 220, y: 170 });
    });
});
